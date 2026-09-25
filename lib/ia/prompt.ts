import "server-only";
import { asc, desc, eq, max } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { SECOES_PROMPT } from "./secoes";

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

/** Texto final que vai para a IA: setores publicados (ou o padrão) + conhecimento ativo. */
export async function montarPromptSistema() {
  const publicadas = await db
    .select({ secao: schema.iaPromptVersoes.secao, conteudo: schema.iaPromptVersoes.conteudo })
    .from(schema.iaPromptVersoes)
    .where(eq(schema.iaPromptVersoes.status, "publicada"));
  const partes = SECOES_PROMPT.map((s) => `# ${s.titulo.toUpperCase()}\n${publicadas.find((p) => p.secao === s.chave)?.conteudo ?? s.padrao}`);
  const conhecimento = await db.select().from(schema.iaConhecimento).where(eq(schema.iaConhecimento.ativo, true)).orderBy(asc(schema.iaConhecimento.categoria), asc(schema.iaConhecimento.titulo));
  const base = conhecimento.length
    ? conhecimento.map((k) => `## ${k.categoria} — ${k.titulo}\n${k.conteudo}`).join("\n\n")
    : "(base de conhecimento vazia: não afirme nada sobre a loja além do que está nas regras acima)";
  return `${partes.join("\n\n")}\n\n# BASE DE CONHECIMENTO (única fonte para afirmar dados da loja)\n${base}`;
}

