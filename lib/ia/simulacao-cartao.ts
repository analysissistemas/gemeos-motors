/* Simulação de parcelas no cartão de crédito, feita pelo SISTEMA (a IA nunca calcula).
   Tabelas de taxa da maquininha passadas pelo dono em 06/10/2026 (% por número de parcelas, de 2x a 21x):
   - Elo (tabela mais cara);
   - Visa e Mastercard ("melhores taxas").
   Regras do dono (06/10/2026): quem paga a taxa é o CLIENTE (preço × (1 + taxa)); 1x não tem taxa; só Visa,
   Master e Elo têm tabela; American Express segue a tabela do Elo, mas acima de 12x o vendedor consulta se o
   cartão do cliente permite; Hipercard e Diners vão para o vendedor. Não há entrada mínima; com entrada, a taxa
   vale só sobre o que sobra para parcelar. Tudo no DÉBITO tem taxa e o dono confirma a margem: não calcula aqui. */

export const TAXAS_ELO: Record<number, number> = {
  2: 7, 3: 9, 4: 11, 5: 12, 6: 13, 7: 14, 8: 16, 9: 16.5, 10: 17, 11: 17.5, 12: 20,
  13: 21, 14: 21.5, 15: 22.5, 16: 25.5, 17: 26.5, 18: 27.5, 19: 28.5, 20: 29.5, 21: 31,
};
export const TAXAS_VISA_MASTER: Record<number, number> = {
  2: 4.9, 3: 6, 4: 7, 5: 8, 6: 9.5, 7: 10.5, 8: 11.5, 9: 13, 10: 13, 11: 14, 12: 15,
  13: 17, 14: 17, 15: 19.5, 16: 20, 17: 20.5, 18: 21, 19: 23.5, 20: 24, 21: 25,
};
export const MAX_PARCELAS = 21;
/** Amex: até aqui a conta sai direto; acima, o vendedor consulta se o cartão do cliente permite. */
export const AMEX_ATE = 12;

/** Débito (informativo, não vai ao cliente): 1,5% Master e Visa, 2% Elo. */
export const TAXA_DEBITO: Record<string, number> = { Mastercard: 1.5, Visa: 1.5, Elo: 2 };

/** "acrescimo": o cliente paga preço × (1 + taxa), como o dono definiu. "liquido" fica só como alternativa. */
export const MODO_TAXA: "acrescimo" | "liquido" = "acrescimo";

export type ResultadoSimulacao =
  | { tipo: "ok"; bandeira: string; parcelas: number; taxa: number; total: number; parcela: number; aVista: number; entrada: number }
  | { tipo: "consultar"; motivo: "amex_acima_12" | "bandeira_sem_tabela" | "parcelas_acima_de_21" | "dados_incompletos" };

const arred = (x: number) => Math.round(x * 100) / 100;

function tabelaDa(bandeira: string): Record<number, number> | null {
  if (bandeira === "Visa" || bandeira === "Mastercard") return TAXAS_VISA_MASTER;
  if (bandeira === "Elo" || bandeira === "American Express") return TAXAS_ELO;
  return null;
}

export function simularCartao(p: { preco: number | null; parcelas: number | null; bandeira: string | null; entrada?: number | null }): ResultadoSimulacao {
  if (!p.preco || p.preco <= 0 || !p.parcelas || !p.bandeira) return { tipo: "consultar", motivo: "dados_incompletos" };
  const entrada = p.entrada && p.entrada > 0 ? p.entrada : 0;
  if (entrada >= p.preco) return { tipo: "consultar", motivo: "dados_incompletos" };
  if (p.parcelas > MAX_PARCELAS) return { tipo: "consultar", motivo: "parcelas_acima_de_21" };
  if (p.bandeira === "American Express" && p.parcelas > AMEX_ATE) return { tipo: "consultar", motivo: "amex_acima_12" };
  const tabela = tabelaDa(p.bandeira);
  if (!tabela) return { tipo: "consultar", motivo: "bandeira_sem_tabela" };
  const taxa = p.parcelas === 1 ? 0 : tabela[p.parcelas];
  if (taxa === undefined) return { tipo: "consultar", motivo: "dados_incompletos" };
  const restante = p.preco - entrada;
  const financiado = arred(MODO_TAXA === "acrescimo" ? restante * (1 + taxa / 100) : restante / (1 - taxa / 100));
  return { tipo: "ok", bandeira: p.bandeira, parcelas: p.parcelas, taxa, total: arred(entrada + financiado), parcela: arred(financiado / p.parcelas), aVista: p.preco, entrada };
}

/** Todas as faixas (2x a 21x) de uma bandeira, para a tabela completa. Amex só até 12x. Vazio se a bandeira não tem tabela. */
export function tabelaCompleta(p: { preco: number | null; bandeira: string | null; entrada?: number | null }) {
  const linhas: { parcelas: number; parcela: number; total: number }[] = [];
  const maximo = p.bandeira === "American Express" ? AMEX_ATE : MAX_PARCELAS;
  for (let n = 2; n <= maximo; n++) {
    const r = simularCartao({ preco: p.preco, parcelas: n, bandeira: p.bandeira, entrada: p.entrada });
    if (r.tipo === "ok") linhas.push({ parcelas: n, parcela: r.parcela, total: r.total });
  }
  return linhas;
}

/** Valor da entrada que o cliente escreveu ("entrada de 3 mil", "dou R$ 2.500 de entrada"); null se não deu para ler. */
export function entradaDoTexto(texto: string): number | null {
  const t = texto.toLowerCase();
  const m = /entrada[^\d]{0,20}(?:r\$\s*)?(\d{1,3}(?:\.\d{3})+|\d+)(?:,(\d{1,2}))?\s*(mil)?/.exec(t) ?? /(?:r\$\s*)?(\d{1,3}(?:\.\d{3})+|\d+)(?:,(\d{1,2}))?\s*(mil)?\s*(?:reais\s*)?(?:de|na)\s+entrada/.exec(t);
  if (!m) return null;
  let v = Number(m[1].replace(/\./g, "") + (m[2] ? `.${m[2]}` : ""));
  if (m[3]) v *= 1000;
  return v > 0 ? v : null;
}
