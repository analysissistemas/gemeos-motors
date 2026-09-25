/* ============================================================
   FLUXO DE ATENDIMENTO DA IA (puro, sem banco e sem rede)
   Cada passo é uma ETAPA independente (nome, entrada, saída). Um fluxo é uma
   lista de etapas; o executor está em fluxo.ts e registra a trilha.
   Toda etapa que toca o mundo (modelo, estoque, envio) usa `deps`, então os
   testes rodam com dependências falsas e NADA chega ao WhatsApp real.
   A IA só produz dados (SaidaModelo): quem age são as etapas.
   Os fluxos compartilham ETAPAS_DE_SAIDA (fatos, validador, permissão, envio):
   nenhum fluxo novo consegue contornar essas camadas.
   ============================================================ */
import type { ControleIa } from "./permissoes.ts";
import { norm, type ConsultaEstoque, type ResultadoEstoque } from "./estoque-tipos.ts";
import { validarResposta, type Violacao } from "./validador.ts";
import { executarFluxo, type Etapa, type PassoDaTrilha } from "./fluxo.ts";

export const LIMITE_MENSAGEM_CLIENTE = 2000;
export const TEXTO_CONFIRMAR_COM_EQUIPE = "Vou confirmar essa informação com a nossa equipe e já te retorno por aqui.";
export const TEXTO_INDISPONIVEL = "No momento esse modelo não está disponível. Quer que eu te ajude a encontrar outra opção?";
export const TEXTO_TRANSFERENCIA = "Já estou te encaminhando para o nosso vendedor, ele continua com você por aqui.";

export type SaidaModelo = { mensagem: string | null; consultaEstoque: ConsultaEstoque | null; transferir: boolean };

export type Deps = {
  controle: ControleIa;
  promptSistema: string;
  /** marcas e modelos que existem no catálogo; a IA só pode citar o que o estoque confirmou */
  nomesDeProdutos: string[];
  /** textos autorizados (base de conhecimento ativa): horário e endereço só valem se estiverem aqui */
  fontesAutorizadas: string[];
  gerar: (p: { mensagemCliente: string; estoque: ResultadoEstoque | null }) => Promise<SaidaModelo>;
  consultarEstoque: (c: ConsultaEstoque) => Promise<ResultadoEstoque>;
  enviar: (texto: string) => Promise<{ ok: boolean; erro?: string }>;
};

export type MotivoPipeline =
  | "ia_desligada"
  | "mensagem_longa"
  | "suspeita_injecao"
  | "erro_modelo"
  | "estoque_nao_confirmado"
  | "produto_sem_confirmacao"
  | "sem_fonte_autorizada"
  | "modelo_pediu_transferencia"
  | "validador"
  | "sem_permissao_envio"
  | "falha_envio"
  | "erro_etapa";

export type ResultadoPipeline = {
  acao: "nao_executada" | "enviada" | "bloqueada";
  motivo: MotivoPipeline | null;
  /** texto que seria (ou foi) enviado ao cliente */
  texto: string | null;
  violacoes: Violacao[];
  /** true = um humano precisa assumir esta conversa */
  transferirHumano: boolean;
  chamouModelo: boolean;
  chamouEstoque: boolean;
  /** cada etapa que rodou, para auditoria */
  trilha: PassoDaTrilha[];
};

/* Mensagem do cliente é dado não confiável. Estes padrões só levantam suspeita:
   na dúvida a conversa vai para um humano e o modelo nem é chamado. */
const PADROES_INJECAO = [
  /ignor(?:e|a|ar|em)\s+(?:todas?\s+)?(?:as\s+|suas\s+)?(?:instru[cç][õo]es|regras|ordens)/i,
  /esque[cç]a\s+(?:tudo|as\s+instru|suas\s+regras)/i,
  /desconsidere\s+(?:tudo|as\s+instru|suas\s+regras)/i,
  /(?:mostre|revele|diga|repita|exiba)\s+(?:o\s+|seu\s+|as\s+|suas\s+)*(?:prompt|instru[cç][õo]es|regras\s+internas)/i,
  /system\s*prompt|prompt\s+do\s+sistema|modo\s+(?:desenvolvedor|admin\w*|deus)|jailbreak/i,
  /finja\s+que\s+(?:sou|voc[êe]\s+[ée])/i,
  /sou\s+(?:o\s+|a\s+)?(?:administrador|admin|dono|desenvolvedor)\b/i,
  /ignore\s+(?:all|previous|the)\s+(?:previous\s+)?instructions/i,
];
export const suspeitaDeInjecao = (t: string) => PADROES_INJECAO.some((r) => r.test(t));

/* Marcas comuns: mesmo fora do catálogo, a IA não pode citá-las sem confirmação. */
const MARCAS_COMUNS = ["honda", "yamaha", "suzuki", "kawasaki", "shineray", "dafra", "haojue", "bmw", "harley", "fiat", "volkswagen", "chevrolet", "toyota", "ford", "hyundai", "renault", "jeep", "nissan", "peugeot", "citroen"];

const escapar = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const palavraInteira = (nome: string) => new RegExp(`(?<![\\p{L}\\p{N}])${escapar(nome)}(?![\\p{L}\\p{N}])`, "gu");

/** Nomes de produto que o texto cita mas o estoque não confirmou nesta execução.
 *  Primeiro tira do texto os nomes confirmados (maiores primeiro), para "Voltz EV1 Sport"
 *  confirmado não ser confundido com "Voltz EV1". */
export function produtosNaoConfirmados(texto: string, nomesDeProdutos: string[], estoque: ResultadoEstoque | null) {
  const confirmados = (estoque?.confirmado ? estoque.itens : []).flatMap((i) => [[i.marca, i.modelo, i.versao].filter(Boolean).join(" "), i.modelo, i.marca]).filter((x): x is string => !!x).map(norm);
  let resto = ` ${norm(texto)} `;
  for (const n of Array.from(new Set(confirmados)).sort((a, b) => b.length - a.length)) resto = resto.replace(palavraInteira(n), " ");
  const todos = Array.from(new Set([...nomesDeProdutos, ...MARCAS_COMUNS].map(norm))).filter((n) => n.length >= 3);
  return todos.filter((n) => new RegExp(palavraInteira(n).source, "u").test(resto));
}

/* Afirmar (ou negar) disponibilidade só é permitido com o estoque tendo CONFIRMADO_DISPONIVEL nesta execução.
   Pega o "Temos sim!" genérico, sem nome de produto. Conservador de propósito. */
const AFIRMA_DISPONIBILIDADE = /(?<![\p{L}\p{N}])(?:temos|tenho|tem\s+sim|h[aá]\s+sim|em\s+estoque|pronta\s+entrega|dispon[ií]ve(?:l|is))(?![\p{L}\p{N}])/iu;
export const afirmaDisponibilidade = (t: string) => AFIRMA_DISPONIBILIDADE.test(t);

/* Horário e endereço são os fatos que mais se inventam. Só valem se estiverem, iguais, numa fonte autorizada. */
const AFIRMACOES = [
  /\b\d{1,2}\s?(?:h|hs|horas)\b(?:\s?\d{2})?/gi,
  /\b\d{1,2}:\d{2}\b/g,
  /\b(?:rua|avenida|av\.|travessa|rodovia|estrada|pra[cç]a)\s+[^,.\n]{3,40}/gi,
  /\b(?:segunda|ter[cç]a|quarta|quinta|sexta|s[aá]bado|domingo)s?\s+a\s+(?:segunda|ter[cç]a|quarta|quinta|sexta|s[aá]bado|domingo)s?/gi,
];
export function afirmacoesSemFonte(texto: string, fontes: string[]) {
  const base = norm(fontes.join(" \n "));
  const achadas = AFIRMACOES.flatMap((r) => Array.from(texto.matchAll(r), (m) => m[0].trim()));
  return achadas.filter((a) => !base.includes(norm(a)));
}

/* ---------------- contexto e etapas ---------------- */

export type Ctx = {
  mensagemCliente: string;
  deps: Deps;
  saida: SaidaModelo | null;
  estoque: ResultadoEstoque | null;
  texto: string | null;
  humano: boolean;
  motivo: MotivoPipeline | null;
  violacoes: Violacao[];
  chamouModelo: boolean;
  chamouEstoque: boolean;
};
export type EtapaDeAtendimento = Etapa<Ctx>;

const bloqueia = (motivo: MotivoPipeline, extra: Partial<Ctx> = {}) => ({ encerrar: "bloqueada", detalhe: motivo, ctx: { motivo, humano: true, ...extra } });
const ehTextoFixo = (t: string | null) => t === TEXTO_CONFIRMAR_COM_EQUIPE || t === TEXTO_TRANSFERENCIA || t === TEXTO_INDISPONIVEL;

/* --- entrada: regras determinísticas, antes de qualquer IA --- */
export const chaveGeral: EtapaDeAtendimento = {
  nome: "chave_geral",
  rodar: (c) => (c.deps.controle.ligada ? {} : { encerrar: "nao_executada", detalhe: "ia_desligada", ctx: { motivo: "ia_desligada" } }),
};
export const limiteDaMensagem: EtapaDeAtendimento = {
  nome: "limite_da_mensagem",
  rodar: (c) => (c.mensagemCliente.length > LIMITE_MENSAGEM_CLIENTE ? bloqueia("mensagem_longa") : {}),
};
export const deteccaoDeInjecao: EtapaDeAtendimento = {
  nome: "deteccao_de_injecao",
  rodar: (c) => (suspeitaDeInjecao(c.mensagemCliente) ? bloqueia("suspeita_injecao") : {}),
};

/* --- interpretar: a IA entende a mensagem e devolve dados, nunca ações --- */
export const interpretar: EtapaDeAtendimento = {
  nome: "interpretar",
  rodar: async (c) => {
    try {
      const saida = await c.deps.gerar({ mensagemCliente: c.mensagemCliente, estoque: null });
      return { ctx: { chamouModelo: true, saida, texto: saida.mensagem, humano: saida.transferir, motivo: saida.transferir ? "modelo_pediu_transferencia" : null } };
    } catch {
      return bloqueia("erro_modelo", { chamouModelo: true });
    }
  },
};

/* --- estoque: ferramenta de leitura. Não confirmou = a IA não sabe --- */
export const consultaDeEstoque: EtapaDeAtendimento = {
  nome: "consulta_de_estoque",
  rodar: async (c) => {
    const pedido = c.saida?.consultaEstoque;
    if (!pedido) return c.saida?.transferir ? { ctx: { texto: TEXTO_TRANSFERENCIA } } : {};
    let estoque: ResultadoEstoque;
    let chamou = false;
    if (!c.deps.controle.permissoes.lerEstoque) {
      estoque = { estado: "SEM_PERMISSAO", confirmado: false, itens: [] };
    } else {
      try {
        chamou = true;
        estoque = await c.deps.consultarEstoque(pedido);
      } catch {
        estoque = { estado: "ERRO_CONSULTA", confirmado: false, itens: [] };
      }
    }
    const base = { estoque, chamouEstoque: chamou };
    if (!estoque.confirmado) return { detalhe: estoque.estado, ctx: { ...base, texto: TEXTO_CONFIRMAR_COM_EQUIPE, humano: true, motivo: "estoque_nao_confirmado" as const } };
    if (estoque.estado === "CONFIRMADO_INDISPONIVEL") return { detalhe: estoque.estado, ctx: { ...base, texto: TEXTO_INDISPONIVEL } };
    return { detalhe: estoque.estado, ctx: base };
  },
};

/* --- redigir: só com estoque CONFIRMADO_DISPONIVEL a IA escreve a partir do resultado --- */
export const redigirComEstoque: EtapaDeAtendimento = {
  nome: "redigir_com_estoque",
  rodar: async (c) => {
    if (c.estoque?.estado !== "CONFIRMADO_DISPONIVEL") return {};
    try {
      const saida = await c.deps.gerar({ mensagemCliente: c.mensagemCliente, estoque: c.estoque });
      return { ctx: { saida, texto: saida.mensagem, humano: c.humano || saida.transferir, motivo: saida.transferir ? ("modelo_pediu_transferencia" as const) : c.motivo } };
    } catch {
      return bloqueia("erro_modelo");
    }
  },
};

/* --- saída compartilhada por TODO fluxo: fatos, validador, permissão, envio --- */
export const travaDeFatos: EtapaDeAtendimento = {
  nome: "trava_de_fatos",
  rodar: (c) => {
    const t = c.texto;
    if (!t || ehTextoFixo(t)) return {};
    /* nunca citar produto que o estoque não confirmou nesta execução */
    if (produtosNaoConfirmados(t, c.deps.nomesDeProdutos, c.estoque).length) return bloqueia("produto_sem_confirmacao");
    if (afirmaDisponibilidade(t) && c.estoque?.estado !== "CONFIRMADO_DISPONIVEL") return bloqueia("produto_sem_confirmacao");
    /* nunca afirmar horário ou endereço que não esteja numa fonte autorizada */
    if (afirmacoesSemFonte(t, c.deps.fontesAutorizadas).length) return bloqueia("sem_fonte_autorizada");
    return {};
  },
};
export const validadorDeResposta: EtapaDeAtendimento = {
  nome: "validador",
  rodar: (c) => {
    const v = validarResposta(c.texto, { promptSistema: c.deps.promptSistema });
    return v.aprovada ? {} : bloqueia("validador", { violacoes: v.violacoes });
  },
};
export const permissaoDeEnvio: EtapaDeAtendimento = {
  nome: "permissao_de_envio",
  rodar: (c) => (c.deps.controle.permissoes.enviarMensagem ? {} : { encerrar: "bloqueada", detalhe: "sem_permissao_envio", ctx: { motivo: "sem_permissao_envio" as const } }),
};
export const envio: EtapaDeAtendimento = {
  nome: "envio",
  rodar: async (c) => {
    const r = await c.deps.enviar(c.texto as string);
    return r.ok ? { encerrar: "enviada" } : bloqueia("falha_envio");
  },
};

export const ETAPAS_DE_ENTRADA: EtapaDeAtendimento[] = [chaveGeral, limiteDaMensagem, deteccaoDeInjecao];
export const ETAPAS_DE_SAIDA: EtapaDeAtendimento[] = [travaDeFatos, validadorDeResposta, permissaoDeEnvio, envio];

/** Primeiro atendimento: mensagem → interpretar → estoque → redigir → fatos → validador → permissão → envio. */
export const FLUXO_PRIMEIRO_ATENDIMENTO: EtapaDeAtendimento[] = [...ETAPAS_DE_ENTRADA, interpretar, consultaDeEstoque, redigirComEstoque, ...ETAPAS_DE_SAIDA];

export async function processarMensagem(mensagemCliente: string, deps: Deps, fluxo: EtapaDeAtendimento[] = FLUXO_PRIMEIRO_ATENDIMENTO): Promise<ResultadoPipeline> {
  const inicial: Ctx = { mensagemCliente, deps, saida: null, estoque: null, texto: null, humano: false, motivo: null, violacoes: [], chamouModelo: false, chamouEstoque: false };
  const e = await executarFluxo(fluxo, inicial);
  const { ctx } = e;
  const comum = { texto: ctx.texto, violacoes: ctx.violacoes, chamouModelo: ctx.chamouModelo, chamouEstoque: ctx.chamouEstoque, trilha: e.trilha };
  if (e.fim === "nao_executada") return { ...comum, acao: "nao_executada", motivo: ctx.motivo, transferirHumano: false };
  if (e.fim === "enviada") return { ...comum, acao: "enviada", motivo: ctx.motivo, transferirHumano: ctx.humano };
  if (e.fim === "bloqueada") return { ...comum, acao: "bloqueada", motivo: ctx.motivo, transferirHumano: ctx.humano };
  /* erro numa etapa, ou fluxo que terminou sem enviar: falha fechada, um humano assume */
  return { ...comum, acao: "bloqueada", motivo: "erro_etapa", transferirHumano: true };
}
