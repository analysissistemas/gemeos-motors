/* Intenções do cliente lidas por regras (sem IA): retorno futuro (follow-up) e pedido de ligação.
   Determinístico de propósito: dá para testar e não inventa nada. Sem `server-only` e sem alias,
   para os testes rodarem direto no Node.

   Fuso: Pernambuco (America/Recife, UTC-3 o ano todo, sem horário de verão). */

const FUSO_MIN = -3 * 60;

export function semAcento(t: string) {
  return t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
}

/** Hora local de Recife como partes de calendário. */
function local(d: Date) {
  const l = new Date(d.getTime() + FUSO_MIN * 60_000);
  return { ano: l.getUTCFullYear(), mes: l.getUTCMonth(), dia: l.getUTCDate(), hora: l.getUTCHours(), min: l.getUTCMinutes(), semana: l.getUTCDay() };
}
/** Monta um instante a partir de data e hora locais de Recife. */
function daquiA(base: Date, dias: number, hora: number, min = 0) {
  const l = local(base);
  return new Date(Date.UTC(l.ano, l.mes, l.dia + dias, hora, min) - FUSO_MIN * 60_000);
}

/* ---------- follow-up ---------- */
export type TipoFollowUp = "retorno_cliente" | "pagamento" | "consulta_terceiro" | "pensar";
export type IntencaoFollowUp = { tipo: TipoFollowUp; motivo: string; quando: Date; confianca: "alta" | "media" };

const DIAS_SEMANA: Record<string, number> = { domingo: 0, segunda: 1, terca: 2, quarta: 3, quinta: 4, sexta: 5, sabado: 6 };

function quandoDoTexto(t: string, agora: Date): Date | null {
  if (/\bdepois de amanha\b/.test(t)) return daquiA(agora, 2, 10);
  if (/\bamanha\b/.test(t)) return daquiA(agora, 1, 10);
  if (/\b(semana que vem|proxima semana)\b/.test(t)) return daquiA(agora, 7, 10);
  if (/\b(mais tarde|daqui a pouco|logo mais|hoje a noite|hoje)\b/.test(t)) return new Date(Math.max(agora.getTime() + 3 * 3600_000, 0));
  const dia = /\b(?:na |no |ate |esta |essa )?(domingo|segunda|terca|quarta|quinta|sexta|sabado)(?:-feira)?\b/.exec(t);
  if (dia) {
    const alvo = DIAS_SEMANA[dia[1]];
    let d = (alvo - local(agora).semana + 7) % 7;
    if (d === 0) d = 7;
    return daquiA(agora, d, 10);
  }
  return null;
}

const RE_ENCERRAMENTO = /^(ok|okay|blz|beleza|certo|entendi|show|valeu|obrigad[oa]s?|muito obrigad[oa]|brigad[oa]|tchau|ate mais|ate logo|tudo bem|combinado|perfeito|top|fechou|de nada)[\s.!,]*$/;
const RE_TERCEIRO = /\b(vou|preciso|tenho que|deixa eu|vou ter que) (falar|conversar|ver|combinar|consultar|alinhar) com (a |o |minha |meu )?(esposa|marido|mulher|namorad[oa]|pai|mae|filh[oa]|irmao|irma|socio|patrao|chefe|familia|patroa)/;
const RE_PAGAMENTO_FORTE = /\b(vou passar o cartao|vou passar no cartao|vou fazer o pix|vou fazer a transferencia|vou pagar|vou depositar|vou mandar o pix|vou dar a entrada)\b/;
const RE_VOLTAR = /\b(vou|volto|voltarei|retorno|retornarei|passo|passarei|apareco|aparecerei|irei|vou ate|vou passar|vou voltar|vou ai|vou na loja|chamo|te chamo|te aviso|aviso|falo|te falo|dou retorno|mando mensagem)\b.*\b(amanha|depois de amanha|semana que vem|proxima semana|segunda|terca|quarta|quinta|sexta|sabado|domingo|mais tarde|hoje|depois)\b|\b(amanha|depois de amanha|semana que vem|segunda|terca|quarta|quinta|sexta|sabado|mais tarde|depois)\b.*\b(volto|passo|apareco|te chamo|te aviso|retorno|dou retorno|vou ai|vou na loja|falo com voce)\b/;
const RE_PENSAR = /\b(vou pensar|vou avaliar|vou ver e (te )?aviso|deixa eu pensar|preciso pensar|vou analisar|depois eu (volto|chamo|te falo|vejo))\b/;

/** Devolve o follow-up sugerido ou null (agradecimento, encerramento ou mensagem sem retorno futuro). */
export function classificarFollowUp(texto: string, agora: Date = new Date()): IntencaoFollowUp | null {
  const t = semAcento(texto);
  if (!t || t.length > 600) return null;
  if (RE_ENCERRAMENTO.test(t)) return null;
  const quando = quandoDoTexto(t, agora);

  if (RE_TERCEIRO.test(t)) return { tipo: "consulta_terceiro", motivo: "Cliente vai conversar com outra pessoa antes de decidir", quando: quando ?? daquiA(agora, 1, 10), confianca: "alta" };
  if (RE_PAGAMENTO_FORTE.test(t)) return { tipo: "pagamento", motivo: "Cliente disse que vai efetuar o pagamento", quando: quando ?? daquiA(agora, 1, 9), confianca: "alta" };
  if (RE_VOLTAR.test(t) && quando) return { tipo: "retorno_cliente", motivo: "Cliente combinou de voltar", quando, confianca: "alta" };
  if (RE_PENSAR.test(t)) return { tipo: "pensar", motivo: "Cliente vai pensar e retornar", quando: quando ?? daquiA(agora, 2, 10), confianca: "media" };
  return null;
}

/* ---------- pedido de ligação ---------- */
export type PedidoLigacao = { preferencia: string | null };

const RE_NAO_LIGAR = /\b(nao|n) (me )?(liga|ligue|ligar)\b|\bnao quero (ligacao|que (voces )?liguem)\b|\bnao precisa (me )?ligar\b/;
const RE_LIGAR = [
  /\b(pode|podem|poderia|poderiam|consegue|conseguem|da pra|dá pra|daria pra|tem como|tem como voces|sera que (pode|podem)) (me |nos )?(ligar|telefonar)\b/,
  /\bme (liga|ligue|ligar|telefona|telefone)\b/,
  /\b(prefiro|quero|preciso|gostaria de) (falar |conversar )?(por |numa |em |uma )?(ligacao|telefone|ligar)\b/,
  /\b(pode|podem) ligar\b/,
  /\bliga (pra|para) (mim|gente)\b|\bligue (pra|para) (mim|gente)\b/,
  /\b(quero|queria|preciso) (que )?(voces )?(me )?(liguem|ligarem|ligar)\b/,
  /\bpode me chamar (por|na) (ligacao|voz)\b/,
];

/** Detecta "pode me ligar?" e afins. Devolve a preferência de horário dita pelo cliente, se houver. */
export function detectarPedidoLigacao(texto: string): PedidoLigacao | null {
  const t = semAcento(texto);
  if (!t || RE_NAO_LIGAR.test(t)) return null;
  if (!RE_LIGAR.some((r) => r.test(t))) return null;
  const pref = /\b(depois das? \d{1,2}(h|:\d{2})?|antes das? \d{1,2}(h|:\d{2})?|as \d{1,2}(h|:\d{2})|de manha|a tarde|de tarde|a noite|amanha( de manha| a tarde| cedo)?|depois do almoco|no almoco|hoje|agora|segunda|terca|quarta|quinta|sexta|sabado)\b/.exec(t);
  return { preferencia: pref ? pref[0] : null };
}

/* ---------- horário administrativo ---------- */
export type JanelaDia = { de: number; ate: number } | null; // hora inteira, [de, ate)
export type HorarioAdministrativo = Record<0 | 1 | 2 | 3 | 4 | 5 | 6, JanelaDia>;

/** Horário informado pelo dono: 8h às 18h, segunda a sábado (domingo fechado). */
export const HORARIO_ADMIN_PADRAO: HorarioAdministrativo = { 0: null, 1: { de: 8, ate: 18 }, 2: { de: 8, ate: 18 }, 3: { de: 8, ate: 18 }, 4: { de: 8, ate: 18 }, 5: { de: 8, ate: 18 }, 6: { de: 8, ate: 18 } };

export function dentroDoHorario(agora: Date, h: HorarioAdministrativo = HORARIO_ADMIN_PADRAO): boolean {
  const l = local(agora);
  const j = h[l.semana as 0 | 1 | 2 | 3 | 4 | 5 | 6];
  if (!j) return false;
  const x = l.hora + l.min / 60;
  return x >= j.de && x < j.ate;
}

/** Próxima abertura (ou o próprio instante, se já está aberto). */
export function proximaAbertura(agora: Date, h: HorarioAdministrativo = HORARIO_ADMIN_PADRAO): Date {
  if (dentroDoHorario(agora, h)) return agora;
  for (let d = 0; d <= 8; d++) {
    const l = local(daquiA(agora, d, 12));
    const j = h[l.semana as 0 | 1 | 2 | 3 | 4 | 5 | 6];
    if (!j) continue;
    const abre = daquiA(agora, d, j.de);
    if (abre.getTime() > agora.getTime()) return abre;
  }
  return agora;
}

export const MENSAGEM_LIGACAO_RECEBIDA = "Recebemos sua solicitação. Um de nossos atendentes vai entrar em contato por ligação no nosso horário de atendimento.";
