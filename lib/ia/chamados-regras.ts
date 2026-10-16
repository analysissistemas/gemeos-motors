/* Chamados de melhoria (dono, 15/10/2026: "as sugestões de melhoria já criarem um chamado para eu aprovar e já
   melhorar sozinho no plano de ação", "com um relatório para mim integrado").
   O Analista junta as sugestões das fichas em chamados; o dono aprova; o sistema aplica sozinho o que é da IA
   (resposta na base de conhecimento, regra de atendimento) e o resto vira item do plano de ação.
   Regras puras, sem banco (npm run test:ia). */
import { AREAS_SUGESTAO, TIPOS_OBJECAO, type FichaConversa, type MetricasConversa } from "./analista-regras.ts";

export const TIPOS_CHAMADO = {
  base_conhecimento: "Resposta para a IA",
  regra_ia: "Regra de atendimento da IA",
  plano_acao: "Plano de ação",
} as const;
export type TipoChamado = keyof typeof TIPOS_CHAMADO;

/* novo → aplicado (IA, sozinho) | plano → feito (o resto) | recusado. Aplicado pode ser desfeito. */
export const STATUS_CHAMADO = {
  novo: "Esperando aprovação",
  aplicado: "Aplicado",
  plano: "No plano de ação",
  feito: "Feito",
  recusado: "Recusado",
  desfeito: "Desfeito",
} as const;
export type StatusChamado = keyof typeof STATUS_CHAMADO;

export type PropostaChamado = {
  /** base_conhecimento */
  categoria?: string;
  titulo?: string;
  conteudo?: string;
  /** regra_ia: uma frase que entra no setor "Regras e proibições" */
  regra?: string;
  /** plano_acao: o que fazer */
  acao?: string;
};

export type EvidenciaChamado = { conversaId: number; dia: string; mensagemId: number | null; trecho: string; contato: string | null };

/** O que o tipo aplica sozinho ao aprovar. */
export function aplicaSozinho(tipo: TipoChamado) {
  return tipo === "base_conhecimento" || tipo === "regra_ia";
}

/** Marcação que o Analista deixa onde não sabe o dado (ex.: "[PREENCHER: prazo de entrega em Itaquitinga]"). */
const RX_PREENCHER = /\[PREENCHER[^\]]*\]/i;

/** O que falta para aprovar; null = pode aprovar. */
export function faltaParaAprovar(tipo: TipoChamado, p: PropostaChamado): string | null {
  if (tipo === "base_conhecimento") {
    if (!p.categoria?.trim() || !p.titulo?.trim() || !p.conteudo?.trim()) return "Preencha a categoria, o título e a resposta.";
    if (RX_PREENCHER.test(`${p.titulo} ${p.conteudo}`)) return "Troque o [PREENCHER…] pela informação certa antes de aprovar.";
  }
  if (tipo === "regra_ia") {
    if (!p.regra?.trim()) return "Escreva a regra.";
    if (RX_PREENCHER.test(p.regra)) return "Troque o [PREENCHER…] antes de aprovar.";
  }
  if (tipo === "plano_acao" && !p.acao?.trim()) return "Escreva o que deve ser feito.";
  return null;
}

/** Acrescenta a regra no fim do setor (uma linha), sem repetir uma que já está lá. */
export function comRegra(textoAtual: string, regra: string): string {
  const r = regra.trim().replace(/\s+/g, " ");
  const linhas = textoAtual.replace(/\s+$/, "").split("\n");
  if (linhas.some((l) => l.trim() === r)) return linhas.join("\n");
  return [...linhas, r].join("\n");
}

/** Tira a regra (para desfazer), deixando o resto do setor como está hoje. */
export function semRegra(textoAtual: string, regra: string): string {
  const r = regra.trim().replace(/\s+/g, " ");
  return textoAtual
    .split("\n")
    .filter((l) => l.trim() !== r)
    .join("\n");
}

/** Junta evidências sem repetir a mesma mensagem; conta clientes (conversas) diferentes. */
export function juntarEvidencias(antigas: EvidenciaChamado[], novas: EvidenciaChamado[]) {
  const chave = (e: EvidenciaChamado) => `${e.conversaId}:${e.mensagemId ?? e.dia}`;
  const vistas = new Set(antigas.map(chave));
  const todas = [...antigas, ...novas.filter((e) => !vistas.has(chave(e)) && vistas.add(chave(e)))];
  return { evidencias: todas.slice(-40), clientes: new Set(todas.map((e) => e.conversaId)).size };
}

/* ---------------- relatório do dia ---------------- */

export type FichaDoDia = { conversaId: number; contato: string | null; ficha: FichaConversa; metricas: MetricasConversa };

type Contagem = { chave: string; rotulo: string; total: number };
type Citacao = { conversaId: number; contato: string | null; texto: string };

export type RelatorioDia = {
  conversas: number;
  deVenda: number;
  naoClientes: number;
  compraram: number;
  perderam: number;
  emAberto: number;
  quentes: number;
  notaMedia: number | null;
  notasBaixas: Citacao[];
  primeiraRespostaMediaMin: number | null;
  maiorEsperaMin: number | null;
  semRespostaNoFim: Citacao[];
  objecoes: Contagem[];
  modelos: Contagem[];
  perguntasSemResposta: Citacao[];
  concorrencia: Citacao[];
  errosIa: Citacao[];
  errosEquipe: Citacao[];
  travas: Citacao[];
  sugestoesPorArea: Contagem[];
};

const media = (xs: number[]) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : null);

function contar(itens: string[], rotulos: Record<string, string> = {}): Contagem[] {
  const m = new Map<string, number>();
  for (const i of itens) m.set(i, (m.get(i) ?? 0) + 1);
  return [...m.entries()].map(([chave, total]) => ({ chave, rotulo: rotulos[chave] ?? chave, total })).sort((a, b) => b.total - a.total || a.rotulo.localeCompare(b.rotulo));
}

/** Números e listas do dia, só a partir das fichas (nada inventado: sem ficha, sem número). */
export function montarRelatorio(fichas: FichaDoDia[]): RelatorioDia {
  const venda = fichas.filter((f) => f.ficha.assunto !== "nao_cliente");
  const cita = (f: FichaDoDia, texto: string): Citacao => ({ conversaId: f.conversaId, contato: f.contato, texto });
  const notas = venda.map((f) => f.ficha.nota).filter((n): n is number => n != null);
  const primeiras = fichas.map((f) => f.metricas.primeiraRespostaMin).filter((n): n is number => n != null);
  const esperas = fichas.map((f) => f.metricas.maiorEsperaMin).filter((n): n is number => n != null);
  return {
    conversas: fichas.length,
    deVenda: venda.filter((f) => f.ficha.assunto === "compra").length,
    naoClientes: fichas.length - venda.length,
    compraram: venda.filter((f) => f.ficha.resultado === "comprou").length,
    perderam: venda.filter((f) => f.ficha.resultado === "perdeu").length,
    emAberto: venda.filter((f) => f.ficha.resultado === "em_aberto").length,
    quentes: venda.filter((f) => f.ficha.temperatura === "quente").length,
    notaMedia: media(notas),
    notasBaixas: venda.filter((f) => f.ficha.nota != null && f.ficha.nota <= 5).map((f) => cita(f, `Nota ${f.ficha.nota}: ${f.ficha.notaMotivo}`)),
    primeiraRespostaMediaMin: media(primeiras),
    maiorEsperaMin: esperas.length ? Math.max(...esperas) : null,
    semRespostaNoFim: fichas.filter((f) => f.metricas.terminouSemResposta && f.ficha.assunto !== "nao_cliente").map((f) => cita(f, f.ficha.resumo)),
    objecoes: contar(venda.flatMap((f) => f.ficha.objecoes.map((o) => o.tipo)), TIPOS_OBJECAO),
    modelos: contar(venda.map((f) => f.ficha.modeloInteresse?.trim()).filter((m): m is string => !!m)),
    perguntasSemResposta: venda.flatMap((f) => f.ficha.perguntasSemResposta.map((p) => cita(f, p.pergunta))),
    concorrencia: venda.flatMap((f) => f.ficha.concorrentes.map((c) => cita(f, `${c.quem}: ${c.oQueDisse}`))),
    errosIa: venda.flatMap((f) => f.ficha.errosIa.map((e) => cita(f, e.descricao))),
    errosEquipe: venda.flatMap((f) => f.ficha.errosEquipe.map((e) => cita(f, e.descricao))),
    travas: venda.filter((f) => f.ficha.ondeTravou).map((f) => cita(f, f.ficha.ondeTravou!)),
    sugestoesPorArea: contar(venda.flatMap((f) => f.ficha.sugestoes.map((s) => s.area)), AREAS_SUGESTAO),
  };
}

/** Números da resposta proposta que não aparecem no que foi dito na conversa (preço, parcela, prazo inventados).
    "21x" e "R$ 5.890" contam; o número precisa estar no contexto do mesmo jeito (só dígitos). */
export function numerosSemProva(resposta: string, contexto: string): string[] {
  const nums = (t: string) => (t.match(/\d+(?:[.,]\d+)*/g) ?? []).map((n) => n.replace(/[.,]/g, ""));
  const vistos = new Set(nums(contexto));
  return [...new Set(nums(resposta))].filter((n) => !vistos.has(n));
}
