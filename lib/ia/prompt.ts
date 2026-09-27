import "server-only";
import { asc, desc, eq, max } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { compilarPrompt, SECOES_PROMPT } from "./secoes";
import { normalizarHorario, textoHorario, type HorarioLoja } from "./horario";

export type VersaoPrompt = { id: number; versao: number; conteudo: string; status: string; nota: string | null; criadoEm: Date; publicadoEm: Date | null };

/** Tudo que a tela precisa: por setor, a versão em uso, o rascunho e o histórico. */
export async function carregarPrompts() {
  const linhas = await db
    .select({
      id: schema.iaPromptVersoes.id,
      secao: schema.iaPromptVersoes.secao,
      versao: schema.iaPromptVersoes.versao,
      conteudo: schema.iaPromptVersoes.conteudo,
      status: schema.iaPromptVersoes.status,
      nota: schema.iaPromptVersoes.nota,
      criadoEm: schema.iaPromptVersoes.criadoEm,
      publicadoEm: schema.iaPromptVersoes.publicadoEm,
    })
    .from(schema.iaPromptVersoes)
    .orderBy(desc(schema.iaPromptVersoes.versao));
  return SECOES_PROMPT.map((s) => {
    const dele = linhas.filter((l) => l.secao === s.chave);
    return {
      chave: s.chave,
      titulo: s.titulo,
      ajuda: s.ajuda,
      padrao: s.padrao,
      publicada: dele.find((l) => l.status === "publicada") ?? null,
      rascunho: dele.find((l) => l.status === "rascunho") ?? null,
      historico: dele.filter((l) => l.status !== "rascunho").slice(0, 15),
    };
  });
}

export async function proximaVersao(secao: string, tx: Pick<typeof db, "select"> = db) {
  const [r] = await tx.select({ m: max(schema.iaPromptVersoes.versao) }).from(schema.iaPromptVersoes).where(eq(schema.iaPromptVersoes.secao, secao));
  return (r?.m ?? 0) + 1;
}

/** Versão publicada de cada setor (null = texto padrão), para gravar no registro de cada execução. */
export async function versoesEmUso(): Promise<Record<string, number | null>> {
  const pub = await db.select({ secao: schema.iaPromptVersoes.secao, versao: schema.iaPromptVersoes.versao }).from(schema.iaPromptVersoes).where(eq(schema.iaPromptVersoes.status, "publicada"));
  return Object.fromEntries(SECOES_PROMPT.map((s) => [s.chave, pub.find((p) => p.secao === s.chave)?.versao ?? null]));
}

/** Texto final que vai para a IA: setores publicados (ou o padrão) + conhecimento ativo. */
export async function montarPromptSistema() {
  const publicadas = await db
    .select({ secao: schema.iaPromptVersoes.secao, conteudo: schema.iaPromptVersoes.conteudo })
    .from(schema.iaPromptVersoes)
    .where(eq(schema.iaPromptVersoes.status, "publicada"));
  return compilarPrompt(publicadas, await conhecimentoAtivo());
}

/* ---------------- horário de funcionamento (ajustável na tela) ---------------- */
const CHAVE_HORARIO = "loja.horario";

export async function lerHorario(): Promise<HorarioLoja> {
  const [l] = await db.select({ valor: schema.configuracoes.valor }).from(schema.configuracoes).where(eq(schema.configuracoes.chave, CHAVE_HORARIO)).limit(1);
  return normalizarHorario(l?.valor);
}

export async function salvarHorario(h: HorarioLoja, usuarioId: number) {
  const valor = normalizarHorario(h);
  await db
    .insert(schema.configuracoes)
    .values({ chave: CHAVE_HORARIO, valor, atualizadoPor: usuarioId })
    .onConflictDoUpdate({ target: schema.configuracoes.chave, set: { valor, atualizadoEm: new Date(), atualizadoPor: usuarioId } });
}

/** Base de conhecimento ativa + o horário de funcionamento, que entra como um item da categoria Loja. */
export async function conhecimentoAtivo() {
  const [itens, horario] = await Promise.all([
    db.select().from(schema.iaConhecimento).where(eq(schema.iaConhecimento.ativo, true)).orderBy(asc(schema.iaConhecimento.categoria), asc(schema.iaConhecimento.titulo)),
    lerHorario(),
  ]);
  return [{ categoria: "Loja", titulo: "Horário de funcionamento", conteudo: textoHorario(horario) }, ...itens];
}

/** Textos que autorizam fatos (horário, endereço, valores, parcelas) na trava de fatos e no validador. */
export async function fontesAutorizadas() {
  return (await conhecimentoAtivo()).map((k) => `${k.titulo}\n${k.conteudo}`);
}

