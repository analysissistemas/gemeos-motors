import "server-only";
import { autonomiaMinima, lerParametrosEconomia, textoEconomia } from "./economia";
import { and, asc, desc, eq, inArray, max } from "drizzle-orm";
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
  /* o catálogo oficial também é fonte: nome, preço de tabela, ficha e cores podem ser ditos ao cliente */
  const catalogo = await catalogoParaIa();
  return [...(await conhecimentoAtivo()).map((k) => `${k.titulo}\n${k.conteudo}`), ...(catalogo.texto ? [catalogo.texto] : [])];
}

const ROTULO_FICHA: Record<string, string> = { motor: "motor", autonomia: "autonomia", velocidade: "velocidade máxima", bateria: "bateria", pneu: "pneu", peso: "peso", recarga: "recarga" };

/* Catálogo oficial (Estoque → Catálogo, o mesmo do site) + o que há no estoque agora. Regras do dono
   (27/09/2026): só moto ELÉTRICA (nunca combustão nem carro) e acessório; a IA mostra opções, ficha,
   cores e preço, e só diz "tem"/"pronta entrega" para modelo com unidade disponível no estoque.
   `incluirTeste`: conversa simulada enxerga os veículos de teste. */
export async function catalogoParaIa(opcoes: { incluirTeste?: boolean } = {}) {
  const m = schema.modelos;
  const v = schema.veiculos;
  const [linhas, cores, unidades, base] = await Promise.all([
    db
      .select({ id: m.id, nome: m.nome, marca: m.marca, tipo: m.tipo, preco: m.precoTabela, ficha: m.ficha, disponibilidade: m.disponibilidade })
      .from(m)
      .where(and(eq(m.ativo, true), eq(m.mostrarNoSite, true), inArray(m.tipo, ["moto_eletrica", "acessorio"])))
      .orderBy(asc(m.ordem), asc(m.nome)),
    db.select({ modeloId: schema.modeloCores.modeloId, nome: schema.modeloCores.nome }).from(schema.modeloCores).where(eq(schema.modeloCores.ativo, true)).orderBy(asc(schema.modeloCores.ordem)),
    db
      .select({ modeloId: v.modeloId, modelo: v.modelo, cor: v.cor })
      .from(v)
      .where(and(eq(v.status, "disponivel"), eq(v.tipo, "moto_eletrica"), opcoes.incluirTeste ? undefined : eq(v.teste, false))),
    db.select({ conteudo: schema.iaConhecimento.conteudo }).from(schema.iaConhecimento).where(eq(schema.iaConhecimento.ativo, true)),
  ]);
  /* conta de economia × gasolina com os números da base (preço da gasolina, km/l, custo da carga) */
  const economia = lerParametrosEconomia(base.map((b) => b.conteudo));
  if (!linhas.length) return { texto: "", nomes: [] as string[], comEstoque: [] as string[] };
  const brl = (x: number | null) => (x ? `R$ ${Number(x).toLocaleString("pt-BR", { maximumFractionDigits: 0 })}` : "preço sob consulta");
  const comEstoque: string[] = [];
  const itens = linhas.map((l) => {
    const nome = [l.marca, l.nome].filter(Boolean).join(" ");
    if (l.tipo === "acessorio") return `• ${nome} (acessório): ${brl(l.preco as number | null)}`;
    const f = (l.ficha ?? {}) as Record<string, string>;
    const ficha = Object.entries(ROTULO_FICHA).filter(([k]) => f[k]).map(([k, r]) => `${r} ${f[k]}`).join("; ");
    const coresDoModelo = cores.filter((c) => c.modeloId === l.id).map((c) => c.nome);
    /* unidade ligada ao modelo, ou com o mesmo nome digitado na entrada */
    const minhas = unidades.filter((u) => u.modeloId === l.id || (!u.modeloId && u.modelo.trim().toLowerCase() === l.nome.trim().toLowerCase()));
    if (minhas.length) comEstoque.push(l.nome, ...(l.marca ? [l.marca] : []));
    const coresEstoque = Array.from(new Set(minhas.map((u) => u.cor).filter((c): c is string => !!c)));
    const estoque = minhas.length
      ? `EM ESTOQUE: ${minhas.length} unidade(s)${coresEstoque.length ? ` (${coresEstoque.join(", ")})` : ""} — pode dizer que tem a pronta entrega`
      : `sem unidade no estoque agora — ${l.disponibilidade === "sob_encomenda" ? "sob encomenda" : "a equipe confirma o prazo"}`;
    const autonomia = autonomiaMinima(f.autonomia);
    const conta = economia && autonomia ? ` | ${textoEconomia(autonomia, economia)}` : "";
    return `• ${nome}: ${brl(l.preco as number | null)}${ficha ? ` | ${ficha}` : ""}${coresDoModelo.length ? ` | cores: ${coresDoModelo.join(", ")}` : ""} | ${estoque}${conta}`;
  });
  const texto = `# CATÁLOGO DA LOJA (o mesmo do site) E ESTOQUE AGORA
Só motos ELÉTRICAS e acessórios. NUNCA ofereça moto a combustão nem carro, nem se o cliente perguntar (diga que a loja trabalha com moto elétrica).
Pode apresentar nome, preço de tabela, ficha e cores. "Tem", "disponível" e "pronta entrega" SÓ para modelo marcado EM ESTOQUE; para os outros, diga que a equipe confirma o prazo.
${economia ? `ECONOMIA × GASOLINA: a conta de cada modelo já está pronta ("economia"), com gasolina a ${`R$ ${economia.gasolina.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`} o litro e moto a gasolina fazendo ${economia.kmPorLitro} km por litro. Use SÓ esses valores, sem refazer conta; escolha o cenário de km/dia mais perto do uso do cliente.
` : ""}${itens.join("\n")}`;
  return { texto, nomes: Array.from(new Set(linhas.flatMap((l) => [l.nome, l.marca]).filter((x): x is string => !!x))), comEstoque: Array.from(new Set(comEstoque)) };
}

