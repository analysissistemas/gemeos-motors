/* Analista (dono, 15/10/2026: "uma IA interna para analisar as conversas do cliente, pegar todos os insights do
   atendimento e sugerir melhorias do sistema, não somente da IA mas todo o sistema comercial").
   Regras puras, sem banco, para os testes rodarem direto no Node (npm run test:ia). */

const FUSO = "America/Recife";

/* ---------------- a ficha de cada conversa ---------------- */

export const ASSUNTOS = { compra: "Compra", assistencia: "Assistência", garantia: "Garantia", peca_acessorio: "Peça / acessório", nao_cliente: "Não é cliente", outro: "Outro", indefinido: "Indefinido" } as const;
export const RESULTADOS = { comprou: "Comprou", perdeu: "Perdeu", em_aberto: "Em aberto", nao_e_venda: "Não é venda" } as const;
export const TEMPERATURAS = { quente: "Quente", morno: "Morno", frio: "Frio", indefinida: "Indefinida" } as const;
export const TIPOS_OBJECAO = {
  preco: "Preço",
  parcela: "Parcela / cartão",
  financiamento: "Financiamento",
  autonomia: "Autonomia / bateria",
  distancia_frete: "Distância / frete",
  confianca: "Confiança na loja",
  decisao_terceiro: "Decide com outra pessoa",
  vou_pensar: "Vai pensar",
  estoque_cor: "Sem o modelo ou a cor",
  concorrencia: "Achou em outro lugar",
  outro: "Outra",
} as const;
export const AREAS_SUGESTAO = { ia: "IA (Milton)", estoque: "Estoque / compras", preco_pagamento: "Preço e pagamento", equipe: "Equipe e processo", sistema: "Sistema", marketing: "Marketing" } as const;

type Prova = { mensagemId: number | null };
export type FichaConversa = {
  resumo: string;
  assunto: keyof typeof ASSUNTOS;
  modeloInteresse: string | null;
  formaPagamento: string | null;
  usoDeclarado: string | null;
  cidade: string | null;
  temperatura: keyof typeof TEMPERATURAS;
  resultado: keyof typeof RESULTADOS;
  objecoes: ({ tipo: keyof typeof TIPOS_OBJECAO; descricao: string } & Prova)[];
  concorrentes: ({ quem: string; oQueDisse: string } & Prova)[];
  perguntasSemResposta: ({ pergunta: string } & Prova)[];
  errosIa: ({ descricao: string } & Prova)[];
  errosEquipe: ({ descricao: string } & Prova)[];
  acertos: ({ descricao: string } & Prova)[];
  ondeTravou: string | null;
  nota: number | null;
  notaMotivo: string;
  sugestoes: ({ area: keyof typeof AREAS_SUGESTAO; sugestao: string } & Prova)[];
  lacunas: string[];
};

/** Listas em que cada item precisa citar a mensagem que o prova. */
export const LISTAS_COM_PROVA = ["objecoes", "concorrentes", "perguntasSemResposta", "errosIa", "errosEquipe", "acertos", "sugestoes"] as const;

/* ---------------- dados pessoais fora do texto que vai para o modelo ---------------- */

const RX_EMAIL = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g;
const RX_CPF = /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g;
const RX_CEP = /\b\d{5}-\d{3}\b/g;
/* telefone: 10 a 13 dígitos com separadores, com ou sem +55 e DDD entre parênteses. Valor em reais nunca casa:
   "5.890", "R$ 8.999,90" e "18x" têm poucos dígitos. */
const RX_TELEFONE = /(?:\+?55[\s.-]?)?\(?\b\d{2}\)?[\s.-]?9?\d{4}[\s.-]?\d{4}\b/g;
/* endereço: tipo de logradouro + nome, até a vírgula, o fim da linha ou o número da casa */
const RX_ENDERECO =
  /\b(?:rua|r\.|avenida|av\.?|travessa|tv\.?|estrada|rodovia|alameda|loteamento|conjunto|cond(?:om[ií]nio)?\.?|vila|s[ií]tio|povoado)\s+[^\n,.;!?]{2,60}?(?:,?\s*(?:n[º°o.]?\s*)?\d{1,5}\b)?(?=[\n,.;!?]|$)/gi;

/** Tira CPF, telefone, e-mail, CEP e endereço. O modelo não precisa deles para analisar o atendimento. */
export function anonimizar(texto: string): string {
  return texto
    .replace(RX_EMAIL, "[e-mail]")
    .replace(RX_CPF, "[cpf]")
    .replace(RX_CEP, "[cep]")
    .replace(RX_TELEFONE, "[telefone]")
    .replace(RX_ENDERECO, "[endereço]");
}

/* ---------------- transcrição com o número de cada mensagem (é a "prova" que o Analista cita) ---------------- */

export type MensagemAnalise = { id: number; autor: string; tipo: string; conteudo: string | null; criadoEm: Date };

const fHora = new Intl.DateTimeFormat("pt-BR", { timeZone: FUSO, day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

const QUEM: Record<string, string> = { cliente: "CLIENTE", ia: "IA", usuario: "EQUIPE", sistema: "SISTEMA" };

export function transcreverParaAnalise(msgs: MensagemAnalise[]): string {
  return msgs
    .map((m) => {
      const quem = QUEM[m.autor] ?? "EQUIPE";
      const texto = m.conteudo ? anonimizar(m.conteudo).replace(/\s+/g, " ").trim() : "";
      const corpo = m.tipo === "texto" || m.tipo === "sistema" ? texto : `[${m.tipo}${texto ? `: ${texto}` : ""}]`;
      return `#${m.id} (${fHora.format(m.criadoEm).replace(",", "")}) ${quem}: ${corpo.slice(0, 700)}`;
    })
    .join("\n");
}

/* ---------------- números do atendimento: calculados aqui, não pelo modelo ---------------- */

export type MetricasConversa = {
  msgsCliente: number;
  msgsIa: number;
  msgsEquipe: number;
  /** minutos entre a 1ª mensagem do cliente no dia e a 1ª resposta (IA ou equipe) */
  primeiraRespostaMin: number | null;
  /** maior espera do cliente por uma resposta, em minutos */
  maiorEsperaMin: number | null;
  /** maior espera por resposta da EQUIPE depois que ela entrou na conversa */
  maiorEsperaEquipeMin: number | null;
  /** a última mensagem do dia é do cliente e ninguém respondeu */
  terminouSemResposta: boolean;
};

const minutos = (a: Date, b: Date) => Math.max(0, Math.round((+b - +a) / 60_000));

export function calcularMetricas(msgs: MensagemAnalise[]): MetricasConversa {
  const r: MetricasConversa = { msgsCliente: 0, msgsIa: 0, msgsEquipe: 0, primeiraRespostaMin: null, maiorEsperaMin: null, maiorEsperaEquipeMin: null, terminouSemResposta: false };
  let esperandoDesde: Date | null = null;
  let equipeEntrou = false;
  for (const m of msgs) {
    if (m.autor === "cliente") {
      r.msgsCliente++;
      esperandoDesde ??= m.criadoEm;
      continue;
    }
    if (m.autor === "sistema") continue;
    if (m.autor === "ia") r.msgsIa++;
    else r.msgsEquipe++;
    if (esperandoDesde) {
      const espera = minutos(esperandoDesde, m.criadoEm);
      if (r.primeiraRespostaMin === null) r.primeiraRespostaMin = espera;
      r.maiorEsperaMin = Math.max(r.maiorEsperaMin ?? 0, espera);
      if (m.autor !== "ia" && equipeEntrou) r.maiorEsperaEquipeMin = Math.max(r.maiorEsperaEquipeMin ?? 0, espera);
      esperandoDesde = null;
    }
    if (m.autor !== "ia") equipeEntrou = true;
  }
  r.terminouSemResposta = esperandoDesde !== null;
  return r;
}

/* ---------------- só fica o que tem prova ---------------- */

type ComProva = { mensagemId: number | null };

/** Tira da ficha os achados que citam uma mensagem que não existe na conversa (o modelo inventou a prova).
    `exigir` = listas em que a prova é obrigatória. Devolve quantos foram descartados. */
export function conferirProvas<F extends Record<string, unknown>>(ficha: F, idsValidos: Set<number>, exigir: (keyof F)[]): { ficha: F; descartados: number } {
  let descartados = 0;
  const saida = { ...ficha };
  for (const campo of exigir) {
    const lista = saida[campo];
    if (!Array.isArray(lista)) continue;
    const boas = (lista as ComProva[]).filter((x) => x.mensagemId != null && idsValidos.has(x.mensagemId));
    descartados += lista.length - boas.length;
    saida[campo] = boas as F[keyof F];
  }
  return { ficha: saida, descartados };
}

/* ---------------- quando analisar ---------------- */

/** "2026-10-15" no fuso da loja. */
export function diaDaLoja(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: FUSO, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

function horaDaLoja(d: Date): string {
  return new Intl.DateTimeFormat("pt-BR", { timeZone: FUSO, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(d);
}

/** O resumo do dono sai às 19h: o dia de hoje é analisado a partir das 18:30. De madrugada, o dia anterior
    é conferido de novo, para pegar o que o cliente mandou depois do relatório. */
export const HORA_ANALISE_DO_DIA = "18:30";

export type PedidoAnalise = { dia: string; refazerSeMudou: boolean };

export function diasParaAnalisar(agora: Date): PedidoAnalise[] {
  const ontem = diaDaLoja(new Date(+agora - 24 * 3600_000));
  const pedidos: PedidoAnalise[] = [{ dia: ontem, refazerSeMudou: true }];
  if (horaDaLoja(agora) >= HORA_ANALISE_DO_DIA) pedidos.unshift({ dia: diaDaLoja(agora), refazerSeMudou: false });
  return pedidos;
}

/** Precisa (re)analisar esta conversa neste dia? */
export function precisaAnalisar(p: { jaTemFicha: boolean; ultimaAnalisadaId: number | null; ultimaDoDiaId: number; refazerSeMudou: boolean }): boolean {
  if (!p.jaTemFicha) return true;
  return p.refazerSeMudou && (p.ultimaAnalisadaId ?? 0) < p.ultimaDoDiaId;
}
