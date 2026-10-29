/* ============================================================
   CRÉDITO DA IA (OpenAI) — conta pura, sem banco
   A OpenAI não informa o saldo pela chave do sistema. Então o dono digita o
   saldo que aparece em platform.openai.com → Billing, e o sistema desconta o
   que cada chamada gastou (tokens × preço) para avisar antes de acabar
   (usuário, 29/10/2026: "tem que ter uma barrinha dizendo que vai acabar os créditos").
   Sem `server-only` de propósito: o teste local importa direto.
   ============================================================ */

/** USD por 1 milhão de tokens (tabela oficial, sem desconto de cache: a estimativa erra para mais, nunca para menos). */
export const PRECOS_POR_MILHAO: Record<string, { entrada: number; saida: number }> = {
  "gpt-4.1": { entrada: 2, saida: 8 },
  "gpt-4.1-mini": { entrada: 0.4, saida: 1.6 },
  "gpt-4.1-nano": { entrada: 0.1, saida: 0.4 },
  "gpt-4o": { entrada: 2.5, saida: 10 },
  "gpt-4o-mini": { entrada: 0.15, saida: 0.6 },
};
/** Transcrição de áudio (gpt-4o-mini-transcribe): US$ 0,003 por minuto. */
export const PRECO_AUDIO_MINUTO = 0.003;

/** Custo de uma chamada. Modelo desconhecido paga o preço do gpt-4.1 (o mais caro da lista que usamos). */
export function custoUsd(modelo: string, tokensEntrada: number | null | undefined, tokensSaida: number | null | undefined) {
  const p = PRECOS_POR_MILHAO[modelo.replace(/^openai\//, "")] ?? PRECOS_POR_MILHAO["gpt-4.1"];
  return ((tokensEntrada ?? 0) * p.entrada + (tokensSaida ?? 0) * p.saida) / 1_000_000;
}

/** Áudio do WhatsApp (opus, ~16 kbit/s ≈ 2 KB por segundo): minutos estimados pelo tamanho, mínimo de 1 minuto. */
export const custoAudioUsd = (bytes: number) => Math.round(Math.max(1, Math.ceil(bytes / 120_000)) * PRECO_AUDIO_MINUTO * 1e6) / 1e6;

export type SaldoInformado = { usd: number; em: string };
export type NivelCredito = "ok" | "baixo" | "acabando" | "acabou" | "sem_saldo";
export type SituacaoCredito = {
  nivel: NivelCredito;
  saldo: SaldoInformado | null;
  /** saldo informado menos o que a IA gastou desde então */
  restante: number | null;
  mediaDia: number;
  /** dias até acabar no ritmo atual (null sem gasto para medir) */
  dias: number | null;
  /** a OpenAI recusou por falta de crédito (fica até a próxima chamada dar certo) */
  semCreditoDesde: string | null;
};

/**
 * Monta a situação do crédito.
 * - acabou: a OpenAI já recusou por falta de crédito (a IA parou de responder);
 * - acabando: a conta dá zero, ou faltam 3 dias ou menos, ou menos de US$ 1;
 * - baixo: faltam 10 dias ou menos, ou sobra menos de 20% do saldo informado;
 * - sem_saldo: ninguém informou o saldo ainda (o sistema não tem como saber).
 */
export function situacaoDoCredito(p: {
  saldo: SaldoInformado | null;
  gastoDesdeSaldo: number;
  gasto7Dias: number;
  agora: Date;
  semCreditoDesde: string | null;
}): SituacaoCredito {
  const diasDesde = p.saldo ? (p.agora.getTime() - new Date(p.saldo.em).getTime()) / 86_400_000 : 7;
  /* na primeira semana depois de informar o saldo, a média é do que já passou (mínimo de 1 dia) */
  const mediaDia = diasDesde < 7 && p.saldo ? p.gastoDesdeSaldo / Math.max(1, diasDesde) : p.gasto7Dias / 7;
  const restante = p.saldo ? p.saldo.usd - p.gastoDesdeSaldo : null;
  const dias = restante != null && mediaDia > 0 ? Math.max(0, restante / mediaDia) : null;
  const base = { saldo: p.saldo, restante, mediaDia, dias, semCreditoDesde: p.semCreditoDesde };
  if (p.semCreditoDesde) return { ...base, nivel: "acabou" };
  if (!p.saldo || restante == null) return { ...base, nivel: "sem_saldo" };
  if (restante <= 1 || (dias != null && dias <= 3)) return { ...base, nivel: "acabando" };
  if ((dias != null && dias <= 10) || restante < p.saldo.usd * 0.2) return { ...base, nivel: "baixo" };
  return { ...base, nivel: "ok" };
}

const usd = (v: number) => `US$ ${Math.max(0, v).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const emDias = (d: number | null) => (d == null ? "" : d < 1 ? "menos de 1 dia" : `cerca de ${Math.floor(d)} dia${Math.floor(d) === 1 ? "" : "s"}`);

/** Frase da barrinha da Visão geral. */
export function textoDoCredito(s: SituacaoCredito): string {
  switch (s.nivel) {
    case "acabou":
      return "O crédito da IA acabou: ela parou de responder os clientes. Recarregue em platform.openai.com → Billing.";
    case "sem_saldo":
      return "Informe o saldo da OpenAI para o sistema avisar antes de o crédito da IA acabar.";
    case "acabando":
      return `O crédito da IA está acabando: sobra ${usd(s.restante ?? 0)}${s.dias != null ? `, ${emDias(s.dias)} no ritmo atual` : ""}. Recarregue para a IA não parar.`;
    case "baixo":
      return `Crédito da IA baixo: sobra ${usd(s.restante ?? 0)}${s.dias != null ? `, ${emDias(s.dias)} no ritmo atual` : ""}.`;
    default:
      return `Crédito da IA: ${usd(s.restante ?? 0)}${s.dias != null ? `, ${emDias(s.dias)} no ritmo atual` : ""}.`;
  }
}
