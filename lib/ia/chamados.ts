import "server-only";
import { and, asc, desc, eq, gt, gte, inArray, lte, sql } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/lib/db";
import { ErroRegra } from "@/lib/acao";
import { registrarLog } from "@/lib/logs";
import { gerarObjeto } from "./cliente";
import { proximaVersao } from "./prompt";
import { SECOES_PROMPT, secaoPorChave } from "./secoes";
import { AREAS_SUGESTAO, anonimizar, diaDaLoja, type FichaConversa, type MetricasConversa } from "./analista-regras";
import {
  aplicaSozinho,
  comRegra,
  faltaParaAprovar,
  juntarEvidencias,
  montarRelatorio,
  numerosSemProva,
  semRegra,
  TIPOS_CHAMADO,
  type EvidenciaChamado,
  type PropostaChamado,
  type StatusChamado,
  type TipoChamado,
} from "./chamados-regras";

/* ============================================================
   CHAMADOS DE MELHORIA
   Uma vez por dia (depois que as fichas do dia ficam prontas, antes do
   resumo das 19h), o Analista junta as sugestões, as perguntas sem resposta
   e os erros da IA em chamados. Parecidos viram um chamado só; o que já tem
   chamado aberto só ganha mais provas. As provas vêm das fichas, nunca do
   modelo: ele só aponta o número do achado.
   ============================================================ */

type Quem = { id: number; nome: string };
const C = schema.chamadosMelhoria;
const SECAO_REGRAS = "regras";
const CHAVE_GERADO = "analista.chamados_gerados";
/** depois das 18:30 (fichas do dia) e antes das 19h (resumo do dono) */
export const HORA_CHAMADOS = "18:45";

type Achado = { n: number; tipo: "sugestao" | "pergunta" | "erro_ia"; area: string; texto: string; contexto: string; ev: EvidenciaChamado };

const fHora = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Recife", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

/** Achados das fichas de um dia, com a prova e (para pergunta sem resposta) o que a loja respondeu depois. */
async function achadosDoDia(dia: string): Promise<Achado[]> {
  const A = schema.analisesConversa;
  const fichas = await db
    .select({ conversaId: A.conversaId, ficha: A.ficha, contato: schema.conversas.contatoNome })
    .from(A)
    .innerJoin(schema.conversas, eq(schema.conversas.id, A.conversaId))
    .where(eq(A.dia, dia));
  const achados: Achado[] = [];
  const add = (a: Omit<Achado, "n" | "contexto">) => achados.push({ ...a, n: achados.length + 1, contexto: "" });
  for (const f of fichas) {
    if (f.ficha.assunto === "nao_cliente") continue;
    const ev = (mensagemId: number | null, trecho: string): EvidenciaChamado => ({ conversaId: f.conversaId, dia, mensagemId, trecho: trecho.slice(0, 240), contato: f.contato?.split(" ")[0] ?? null });
    for (const s of f.ficha.sugestoes) add({ tipo: "sugestao", area: s.area, texto: s.sugestao, ev: ev(s.mensagemId, s.sugestao) });
    for (const p of f.ficha.perguntasSemResposta) add({ tipo: "pergunta", area: "ia", texto: p.pergunta, ev: ev(p.mensagemId, p.pergunta) });
    for (const e of f.ficha.errosIa) add({ tipo: "erro_ia", area: "ia", texto: e.descricao, ev: ev(e.mensagemId, e.descricao) });
  }
  /* a prova é o que foi dito de verdade (cliente, IA ou equipe), não a frase do Analista (dono, 15/10/2026) */
  const ids = [...new Set(achados.map((a) => a.ev.mensagemId).filter((x): x is number => x != null))];
  if (ids.length) {
    const ditas = await db.select({ id: schema.mensagens.id, autor: schema.mensagens.autor, tipo: schema.mensagens.tipo, conteudo: schema.mensagens.conteudo }).from(schema.mensagens).where(inArray(schema.mensagens.id, ids));
    const porId = new Map(ditas.map((m) => [m.id, m]));
    for (const a of achados) {
      const m = a.ev.mensagemId != null ? porId.get(a.ev.mensagemId) : null;
      if (!m) continue;
      const quem = m.autor === "cliente" ? "Cliente" : m.autor === "ia" ? "IA" : m.autor === "sistema" ? "Sistema" : "Equipe";
      const texto = m.tipo === "texto" || m.tipo === "sistema" ? anonimizar(m.conteudo ?? "") : `[${m.tipo}]`;
      a.ev.trecho = `${quem}: "${texto.replace(/\s+/g, " ").trim().slice(0, 220)}"`;
    }
  }
  /* pergunta sem resposta: as 4 mensagens seguintes mostram se alguém da equipe respondeu (é de onde sai a
     resposta certa para a base de conhecimento, sem o modelo inventar) */
  const M = schema.mensagens;
  for (const a of achados) {
    if (a.tipo !== "pergunta" || a.ev.mensagemId == null) continue;
    const depois = await db
      .select({ autor: M.autor, conteudo: M.conteudo, criadoEm: M.criadoEm })
      .from(M)
      .where(and(eq(M.conversaId, a.ev.conversaId), gte(M.id, a.ev.mensagemId), inArray(M.tipo, ["texto"])))
      .orderBy(asc(M.id))
      .limit(5);
    a.contexto = depois.map((m) => `${fHora.format(m.criadoEm)} ${m.autor === "cliente" ? "CLIENTE" : m.autor === "ia" ? "IA" : "EQUIPE"}: ${anonimizar(m.conteudo ?? "").slice(0, 300)}`).join(" | ");
  }
  return achados;
}

const esquemaAgrupamento = z.object({
  reforcos: z.array(z.object({ chamadoId: z.number(), achados: z.array(z.number()) })),
  novos: z.array(
    z.object({
      tipo: z.enum(["base_conhecimento", "regra_ia", "plano_acao"]),
      area: z.enum(Object.keys(AREAS_SUGESTAO) as [keyof typeof AREAS_SUGESTAO, ...(keyof typeof AREAS_SUGESTAO)[]]),
      titulo: z.string(),
      problema: z.string(),
      achados: z.array(z.number()),
      categoria: z.string().nullable(),
      tituloResposta: z.string().nullable(),
      resposta: z.string().nullable(),
      regra: z.string().nullable(),
      acao: z.string().nullable(),
    }),
  ),
});

const SISTEMA = `Você organiza as melhorias da Gêmeos Motors (loja de motos elétricas em Goiana-PE, atendimento no WhatsApp por uma IA chamada Milton e pela equipe).
Recebe ACHADOS numerados (sugestões, perguntas que ficaram sem resposta e erros da IA, tirados das conversas do dia) e transforma em CHAMADOS para o dono aprovar.

Regras obrigatórias:
- Junte achados parecidos num chamado só. Cada chamado lista em "achados" os números que o provam. Não invente achado.
- Se o achado já é coberto por um CHAMADO ABERTO, coloque em "reforcos" com o id dele, em vez de criar outro.
- Não crie chamado para o que a BASE DE CONHECIMENTO ou as INSTRUÇÕES ATUAIS DA IA já cobrem. Se a instrução já existe e a IA não seguiu, NÃO crie regra_ia repetida: é plano_acao, área sistema, dizendo que a IA não está seguindo a instrução tal.
- FLUXOS AUTOMÁTICOS: o texto destas partes é feito pelo sistema, não pelas instruções da IA, então regra_ia NÃO muda nada nelas: follow-ups e lembretes (mensagens de retomada quando o cliente some), agendamento de visita e test drive, simulação de parcelas no cartão, passagem para a equipe (transferência, "vou passar para a equipe"), aviso de cliente esperando, reconhecimento de quem não é cliente. Problema nelas é plano_acao, área sistema.
- Português do Brasil simples, para um dono leigo. Título curto (até 8 palavras). "problema": 1 ou 2 frases dizendo o que acontece e o efeito na venda.

Tipos:
- base_conhecimento: a IA não soube responder uma pergunta de cliente. Preencha categoria (Loja, Produtos, Pagamento, Entrega, Garantia, Assistência ou Documentação), tituloResposta (a pergunta, curta) e resposta (o texto que a IA vai usar). A resposta só pode usar o que a EQUIPE respondeu na conversa (veja o contexto do achado). Dado que você não tem: escreva [PREENCHER: o que falta] no lugar. NUNCA invente preço, prazo, taxa, cidade atendida ou característica.
- regra_ia: a IA errou o jeito de atender (repetiu, insistiu, fez várias perguntas juntas, ofereceu antes de entender, prometeu o que não fez). "regra": UMA frase curta no imperativo, como as regras atuais (ex.: "Não repita que o produto está em falta depois que o cliente já entendeu.").
- plano_acao: o que a IA não resolve sozinha: estoque e compras, preço e pagamento, equipe e processo, sistema (tela, defeito) e marketing. "acao": o que fazer, em 1 ou 2 frases, concreto.
Campos que não são do tipo: null.`;

/** Gera (ou reforça) os chamados a partir das fichas do dia. Devolve quantos criou e reforçou. */
/** Refaz do zero os chamados que ninguém decidiu ainda: apaga os "novo" e gera de novo, dia a dia, com as fichas dos
    últimos 7 dias (aprovados, recusados e o plano de ação ficam como estão). Serve para quando a regra do Analista
    melhora (dono, 16/10/2026: os chamados das 18:45 saíram pela versão antiga). */
export async function refazerChamados(agora = new Date()) {
  const desde = diaDaLoja(new Date(+agora - 6 * 86_400_000));
  const dias = (await diasComFichas(7)).filter((d) => d >= desde).sort();
  await db.delete(C).where(eq(C.status, "novo"));
  let novos = 0;
  let reforcados = 0;
  for (const dia of dias) {
    const r = await gerarChamados(dia);
    novos += r.novos;
    reforcados += r.reforcados;
  }
  return { novos, reforcados, dias: dias.length };
}

export async function gerarChamados(dia: string) {
  const achados = await achadosDoDia(dia);
  if (!achados.length) return { novos: 0, reforcados: 0 };
  const [abertos, base, regrasPub] = await Promise.all([
    db.select({ id: C.id, tipo: C.tipo, titulo: C.titulo, evidencias: C.evidencias }).from(C).where(inArray(C.status, ["novo", "plano"])),
    db.select({ categoria: schema.iaConhecimento.categoria, titulo: schema.iaConhecimento.titulo }).from(schema.iaConhecimento).where(eq(schema.iaConhecimento.ativo, true)),
    db.select({ secao: schema.iaPromptVersoes.secao, conteudo: schema.iaPromptVersoes.conteudo }).from(schema.iaPromptVersoes).where(eq(schema.iaPromptVersoes.status, "publicada")),
  ]);
  const instrucoes = SECOES_PROMPT.map((sec) => `## ${sec.titulo}\n${regrasPub.find((p) => p.secao === sec.chave)?.conteudo ?? sec.padrao}`).join("\n\n");

  const prompt = `ACHADOS DO DIA ${dia.split("-").reverse().join("/")}
${achados.map((a) => `${a.n}. [${a.tipo === "pergunta" ? "pergunta sem resposta" : a.tipo === "erro_ia" ? "erro da IA" : `sugestão · ${a.area}`}] ${a.texto}${a.contexto ? `\n   contexto: ${a.contexto}` : ""}`).join("\n")}

CHAMADOS ABERTOS
${abertos.map((c) => `#${c.id} [${c.tipo}] ${c.titulo}`).join("\n") || "nenhum"}

BASE DE CONHECIMENTO (títulos)
${base.map((b) => `${b.categoria} — ${b.titulo}`).join("\n") || "vazia"}

INSTRUÇÕES ATUAIS DA IA (por setor)
${instrucoes}`;

  const r = await gerarObjeto({ schema: esquemaAgrupamento, sistema: SISTEMA, prompt, maxTokens: 3500 });
  const porN = new Map(achados.map((a) => [a.n, a]));
  const provas = (ns: number[]) => [...new Set(ns)].map((n) => porN.get(n)).filter((a): a is Achado => !!a).map((a) => a.ev);
  const usados = new Set<number>();

  let reforcados = 0;
  for (const rf of r.reforcos) {
    const ch = abertos.find((c) => c.id === rf.chamadoId);
    const ev = provas(rf.achados.filter((n) => !usados.has(n)));
    if (!ch || !ev.length) continue;
    rf.achados.forEach((n) => usados.add(n));
    const j = juntarEvidencias(ch.evidencias, ev);
    await db.update(C).set({ evidencias: j.evidencias, clientes: j.clientes, atualizadoEm: new Date() }).where(eq(C.id, ch.id));
    reforcados++;
  }

  let novos = 0;
  for (const n of r.novos) {
    const ev = provas(n.achados.filter((x) => !usados.has(x)));
    if (!ev.length) continue; // chamado sem prova não entra
    n.achados.forEach((x) => usados.add(x));
    const proposta: PropostaChamado =
      n.tipo === "base_conhecimento"
        ? { categoria: n.categoria ?? "Loja", titulo: n.tituloResposta ?? n.titulo, conteudo: n.resposta ?? "[PREENCHER: a resposta]" }
        : n.tipo === "regra_ia"
          ? { regra: n.regra ?? "" }
          : { acao: n.acao ?? n.problema };
    if (n.tipo === "regra_ia" && !proposta.regra?.trim()) continue;
    /* número da resposta que ninguém disse na conversa (parcela, prazo, preço): o dono confere antes de aprovar */
    if (n.tipo === "base_conhecimento") {
      const contexto = n.achados.map((x) => porN.get(x)).map((a) => `${a?.contexto ?? ""} ${a?.ev.trecho ?? ""}`).join(" ");
      const soltos = numerosSemProva(proposta.conteudo ?? "", contexto);
      if (soltos.length) proposta.conteudo = `${proposta.conteudo}\n[PREENCHER: confira ${soltos.join(", ")}: este número não apareceu na conversa]`;
    }
    const j = juntarEvidencias([], ev);
    await db.insert(C).values({ tipo: n.tipo, area: n.tipo === "plano_acao" ? n.area : "ia", titulo: n.titulo.slice(0, 120), problema: n.problema, proposta, evidencias: j.evidencias, clientes: j.clientes });
    novos++;
  }
  return { novos, reforcados };
}

/** Passo do relógio: uma vez por dia, depois das 18:45 e com as fichas do dia prontas. */
export async function talvezGerarChamados(agora: Date, fichasPendentes: boolean) {
  const hora = fHora.format(agora);
  const dia = diaDaLoja(agora);
  if (hora < HORA_CHAMADOS || fichasPendentes) return null;
  const [l] = await db.select({ valor: schema.configuracoes.valor }).from(schema.configuracoes).where(eq(schema.configuracoes.chave, CHAVE_GERADO)).limit(1);
  if ((l?.valor as { dia?: string } | undefined)?.dia === dia) return null;
  /* marca antes: se a geração falhar, não tenta de novo a cada minuto (o botão "Gerar agora" refaz) */
  await db
    .insert(schema.configuracoes)
    .values({ chave: CHAVE_GERADO, valor: { dia } })
    .onConflictDoUpdate({ target: schema.configuracoes.chave, set: { valor: { dia }, atualizadoEm: new Date() } });
  return gerarChamados(dia);
}

/* ---------------- decisões do dono ---------------- */

async function buscar(id: number) {
  const [c] = await db.select().from(C).where(eq(C.id, id)).limit(1);
  if (!c) throw new ErroRegra("Chamado não encontrado.");
  return c;
}

/** Aprova: aplica sozinho o que é da IA; o resto entra no plano de ação. `proposta` = o texto como o dono deixou. */
export async function aprovarChamado(u: Quem, id: number, proposta: PropostaChamado, observacao?: string | null) {
  const c = await buscar(id);
  if (c.status !== "novo") throw new ErroRegra(`Este chamado já está como "${c.status}".`);
  const tipo = c.tipo as TipoChamado;
  const falta = faltaParaAprovar(tipo, proposta);
  if (falta) throw new ErroRegra(falta);

  return db.transaction(async (tx) => {
    let resultado: Record<string, unknown> = {};
    if (tipo === "base_conhecimento") {
      const [k] = await tx
        .insert(schema.iaConhecimento)
        .values({ categoria: proposta.categoria!.trim(), titulo: proposta.titulo!.trim(), conteudo: proposta.conteudo!.trim(), atualizadoPor: u.id })
        .returning({ id: schema.iaConhecimento.id });
      resultado = { conhecimentoId: k.id };
    } else if (tipo === "regra_ia") {
      const versao = await publicarRegras(tx, (atual) => comRegra(atual, proposta.regra!), u, `Chamado #${id}: ${c.titulo}`);
      resultado = { secao: SECAO_REGRAS, versao, regra: proposta.regra!.trim().replace(/\s+/g, " ") };
    }
    const status: StatusChamado = aplicaSozinho(tipo) ? "aplicado" : "plano";
    await tx.update(C).set({ proposta, status, resultado, observacao: observacao ?? null, decididoPor: u.id, decididoEm: new Date(), atualizadoEm: new Date() }).where(eq(C.id, id));
    await registrarLog(
      u,
      { acao: "melhoria.aprovada", entidade: "chamado_melhoria", entidadeId: id, descricao: `Aprovou o chamado #${id} (${TIPOS_CHAMADO[tipo]}): ${c.titulo}`, dados: resultado },
      tx,
    );
    return { status };
  });
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Publica uma versão nova do setor de regras com o texto mudado (a anterior fica no histórico da tela da IA). */
async function publicarRegras(tx: Tx, mudar: (atual: string) => string, u: Quem, nota: string) {
  const P = schema.iaPromptVersoes;
  const [pub] = await tx.select().from(P).where(and(eq(P.secao, SECAO_REGRAS), eq(P.status, "publicada"))).limit(1);
  const atual = pub?.conteudo ?? secaoPorChave(SECAO_REGRAS)!.padrao;
  const novo = mudar(atual);
  if (novo === atual) return pub?.versao ?? null;
  const versao = await proximaVersao(SECAO_REGRAS, tx);
  if (pub) await tx.update(P).set({ status: "arquivada" }).where(eq(P.id, pub.id));
  await tx.insert(P).values({ secao: SECAO_REGRAS, versao, conteudo: novo, status: "publicada", nota: nota.slice(0, 200), criadoPor: u.id, publicadoEm: new Date() });
  return versao;
}

/** Desfaz o que foi aplicado sozinho (desativa a resposta, tira a regra). */
export async function desfazerChamado(u: Quem, id: number) {
  const c = await buscar(id);
  if (c.status !== "aplicado") throw new ErroRegra("Só dá para desfazer um chamado aplicado.");
  const r = (c.resultado ?? {}) as { conhecimentoId?: number; regra?: string };
  await db.transaction(async (tx) => {
    if (r.conhecimentoId) await tx.update(schema.iaConhecimento).set({ ativo: false, atualizadoEm: new Date(), atualizadoPor: u.id }).where(eq(schema.iaConhecimento.id, r.conhecimentoId));
    if (r.regra) await publicarRegras(tx, (atual) => semRegra(atual, r.regra!), u, `Desfeito o chamado #${id}`);
    await tx.update(C).set({ status: "desfeito", atualizadoEm: new Date() }).where(eq(C.id, id));
    await registrarLog(u, { acao: "melhoria.desfeita", entidade: "chamado_melhoria", entidadeId: id, descricao: `Desfez o chamado #${id}: ${c.titulo}` }, tx);
  });
}

export async function recusarChamado(u: Quem, id: number, observacao?: string | null) {
  const c = await buscar(id);
  if (c.status !== "novo") throw new ErroRegra("Este chamado já foi decidido.");
  await db.update(C).set({ status: "recusado", observacao: observacao ?? null, decididoPor: u.id, decididoEm: new Date(), atualizadoEm: new Date() }).where(eq(C.id, id));
  await registrarLog(u, { acao: "melhoria.recusada", entidade: "chamado_melhoria", entidadeId: id, descricao: `Recusou o chamado #${id}: ${c.titulo}` });
}

export async function concluirPlano(u: Quem, id: number, observacao?: string | null) {
  const c = await buscar(id);
  if (c.status !== "plano") throw new ErroRegra("Este item não está no plano de ação.");
  await db.update(C).set({ status: "feito", observacao: observacao ?? c.observacao, atualizadoEm: new Date() }).where(eq(C.id, id));
  await registrarLog(u, { acao: "melhoria.feita", entidade: "chamado_melhoria", entidadeId: id, descricao: `Marcou como feito o item #${id} do plano de ação: ${c.titulo}` });
}

/* ---------------- leitura (tela Melhorias) ---------------- */

export async function listarChamados() {
  return db.select().from(C).orderBy(desc(C.clientes), desc(C.atualizadoEm)).limit(300);
}

export type ChamadoTela = Awaited<ReturnType<typeof listarChamados>>[number];

/** Dias que têm fichas (para escolher o relatório), do mais novo para o mais antigo. */
export async function diasComFichas(limite = 30) {
  const A = schema.analisesConversa;
  const r = await db.selectDistinct({ dia: A.dia }).from(A).orderBy(desc(A.dia)).limit(limite);
  return r.map((x) => x.dia);
}

/** Relatório de um dia, montado das fichas; com a semana anterior para comparar a nota. */
export async function relatorioDoDia(dia: string) {
  const A = schema.analisesConversa;
  const fichas = await db
    .select({ conversaId: A.conversaId, contato: schema.conversas.contatoNome, ficha: A.ficha, metricas: A.metricas })
    .from(A)
    .innerJoin(schema.conversas, eq(schema.conversas.id, A.conversaId))
    .where(eq(A.dia, dia));
  const seteAntes = new Date(+new Date(`${dia}T12:00:00-03:00`) - 7 * 86_400_000);
  const [semana] = await db
    .select({ nota: sql<number | null>`round(avg(${A.nota})::numeric, 1)`.mapWith((v) => (v == null ? null : Number(v))) })
    .from(A)
    .where(and(gte(A.dia, diaDaLoja(seteAntes)), lte(A.dia, dia), gt(A.nota, -1), sql`${A.dia} <> ${dia}`, sql`${A.assunto} <> 'nao_cliente'`));
  return { dia, ...montarRelatorio(fichas as { conversaId: number; contato: string | null; ficha: FichaConversa; metricas: MetricasConversa }[]), notaSemanaAnterior: semana?.nota ?? null };
}

export type RelatorioTela = Awaited<ReturnType<typeof relatorioDoDia>>;
