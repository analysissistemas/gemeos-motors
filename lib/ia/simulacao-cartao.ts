/* Simulação de parcelas no cartão, feita pelo SISTEMA (a IA nunca calcula e nunca escolhe a taxa).
   Taxas da maquineta: relatório do dono de 10/10/2026 (antes, 06/10/2026), editáveis em Configurações → Taxas da
   maquineta (lib/ia/taxas-maquineta.ts guarda no banco; aqui ficam os valores do relatório como padrão).
   Regras do dono:
   - quem paga a taxa é o CLIENTE: valor × (1 + taxa), dividido pelas parcelas (ex.: R$ 1.000 em 21x no Master,
     taxa 25% → R$ 1.250 ÷ 21);
   - a parcela é ARREDONDADA PARA CIMA no centavo (10/10/2026: a loja nunca perde centavo) e o total é parcela × vezes;
   - 1x no crédito não tem taxa; débito tem a taxa do débito (Master/Visa 1,5%, Elo/Amex 2%), também paga pelo cliente;
   - Visa e Master usam a tabela das melhores taxas; Elo e American Express, a deles;
   - American Express acima de 12x: o sistema pergunta se o cartão do cliente permite; com o "sim", calcula;
   - Hipercard, Diners e outras: o vendedor faz;
   - entrada: a taxa vale só sobre o que sobra para parcelar. */

export const MAX_PARCELAS = 21;
/** Amex: até aqui a conta sai direto; acima, só com o cliente confirmando que o cartão permite. */
export const AMEX_ATE = 12;
/** Parcelas com taxa na tabela (1x no crédito não tem taxa). */
export const FAIXAS = Array.from({ length: MAX_PARCELAS - 1 }, (_, i) => i + 2);

export type TaxasMaquineta = {
  /** % por número de parcelas (2 a 21) */
  visaMaster: Record<number, number>;
  eloAmex: Record<number, number>;
  debito: { visaMaster: number; eloAmex: number };
};

/** Relatório "Taxas da maquineta" do dono, 10/10/2026. */
export const TAXAS_PADRAO: TaxasMaquineta = {
  visaMaster: {
    2: 4.9, 3: 6, 4: 7, 5: 8, 6: 9.5, 7: 10.5, 8: 11.5, 9: 13, 10: 13, 11: 14, 12: 15,
    13: 17, 14: 17, 15: 19.5, 16: 20, 17: 20.5, 18: 21, 19: 23.5, 20: 24, 21: 25,
  },
  eloAmex: {
    2: 7, 3: 9, 4: 11, 5: 12, 6: 13, 7: 14, 8: 16, 9: 16.5, 10: 17, 11: 17.5, 12: 20,
    13: 21, 14: 21.5, 15: 22.5, 16: 25.5, 17: 26.5, 18: 27.5, 19: 28.5, 20: 29.5, 21: 31,
  },
  debito: { visaMaster: 1.5, eloAmex: 2 },
};
export const TAXAS_VISA_MASTER = TAXAS_PADRAO.visaMaster;
export const TAXAS_ELO = TAXAS_PADRAO.eloAmex;

const taxaValida = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x) && x >= 0 && x < 100;

/** O que veio do banco, conferido: faixa faltando ou valor estranho fica com o padrão do relatório. */
export function normalizarTaxas(v: unknown): TaxasMaquineta {
  const o = (v ?? {}) as Partial<{ visaMaster: Record<string, unknown>; eloAmex: Record<string, unknown>; debito: Record<string, unknown> }>;
  const tabela = (t: Record<string, unknown> | undefined, padrao: Record<number, number>) =>
    Object.fromEntries(FAIXAS.map((n) => [n, taxaValida(t?.[n]) ? (t![n] as number) : padrao[n]]));
  return {
    visaMaster: tabela(o.visaMaster, TAXAS_PADRAO.visaMaster),
    eloAmex: tabela(o.eloAmex, TAXAS_PADRAO.eloAmex),
    debito: {
      visaMaster: taxaValida(o.debito?.visaMaster) ? (o.debito!.visaMaster as number) : TAXAS_PADRAO.debito.visaMaster,
      eloAmex: taxaValida(o.debito?.eloAmex) ? (o.debito!.eloAmex as number) : TAXAS_PADRAO.debito.eloAmex,
    },
  };
}

/** Para a tela: cada taxa entre 0 e 99,99 com até 2 casas. Devolve os erros (vazio = pode salvar). */
export function errosDasTaxas(t: TaxasMaquineta): string[] {
  const erros: string[] = [];
  const confere = (x: unknown, onde: string) => {
    if (!taxaValida(x) || Math.round(x * 100) !== Number((x * 100).toFixed(6))) erros.push(`${onde}: use um número de 0 a 99,99, com até 2 casas`);
  };
  for (const n of FAIXAS) {
    confere(t.visaMaster[n], `Master/Visa ${n}x`);
    confere(t.eloAmex[n], `Elo/Amex ${n}x`);
  }
  confere(t.debito.visaMaster, "Débito Master/Visa");
  confere(t.debito.eloAmex, "Débito Elo/Amex");
  return erros;
}

export type Modalidade = "credito" | "debito";
export type MotivoConsultar = "amex_acima_12" | "bandeira_sem_tabela" | "parcelas_acima_de_21" | "dados_incompletos";
export type ResultadoSimulacao =
  | { tipo: "ok"; modalidade: Modalidade; bandeira: string; parcelas: number; taxa: number; total: number; parcela: number; aVista: number; entrada: number }
  | { tipo: "consultar"; motivo: MotivoConsultar };

const centavos = (x: number) => Number((x * 100).toFixed(6));
/** Para cima no centavo: 59,5238 → 59,53; 678,00 continua 678,00 (sem cair no erro de ponto flutuante). */
export const paraCima = (x: number) => Math.ceil(centavos(x)) / 100;
const arred = (x: number) => Math.round(centavos(x)) / 100;

function grupo(bandeira: string): "visaMaster" | "eloAmex" | null {
  if (bandeira === "Visa" || bandeira === "Mastercard") return "visaMaster";
  if (bandeira === "Elo" || bandeira === "American Express") return "eloAmex";
  return null;
}

export function simularCartao(
  p: { preco: number | null; parcelas: number | null; bandeira: string | null; entrada?: number | null; modalidade?: Modalidade; amexConfirmado?: boolean },
  taxas: TaxasMaquineta = TAXAS_PADRAO,
): ResultadoSimulacao {
  const modalidade = p.modalidade ?? "credito";
  const parcelas = modalidade === "debito" ? 1 : p.parcelas;
  if (!p.preco || p.preco <= 0 || !parcelas || parcelas < 1 || !p.bandeira) return { tipo: "consultar", motivo: "dados_incompletos" };
  const entrada = p.entrada && p.entrada > 0 ? p.entrada : 0;
  if (entrada >= p.preco) return { tipo: "consultar", motivo: "dados_incompletos" };
  if (parcelas > MAX_PARCELAS) return { tipo: "consultar", motivo: "parcelas_acima_de_21" };
  if (modalidade === "credito" && p.bandeira === "American Express" && parcelas > AMEX_ATE && !p.amexConfirmado) return { tipo: "consultar", motivo: "amex_acima_12" };
  const g = grupo(p.bandeira);
  if (!g) return { tipo: "consultar", motivo: "bandeira_sem_tabela" };
  const taxa = modalidade === "debito" ? taxas.debito[g] : parcelas === 1 ? 0 : taxas[g][parcelas];
  if (taxa === undefined) return { tipo: "consultar", motivo: "dados_incompletos" };
  const restante = p.preco - entrada;
  const parcela = paraCima((restante * (1 + taxa / 100)) / parcelas);
  return { tipo: "ok", modalidade, bandeira: p.bandeira, parcelas, taxa, total: arred(entrada + parcela * parcelas), parcela, aVista: p.preco, entrada };
}

/** Faixas de uma bandeira no crédito (de 2x até o máximo), para a tabela completa. Amex só até 12x, salvo com o cliente
 *  confirmando que o cartão permite. `so` limita às parcelas pedidas ("12x ou 18x"). Vazio se a bandeira não tem tabela. */
export function tabelaCompleta(
  p: { preco: number | null; bandeira: string | null; entrada?: number | null; amexConfirmado?: boolean; so?: number[] },
  taxas: TaxasMaquineta = TAXAS_PADRAO,
) {
  const linhas: { parcelas: number; parcela: number; total: number }[] = [];
  const maximo = p.bandeira === "American Express" && !p.amexConfirmado ? AMEX_ATE : MAX_PARCELAS;
  for (const n of p.so ?? FAIXAS) {
    if (n > maximo) continue;
    const r = simularCartao({ preco: p.preco, parcelas: n, bandeira: p.bandeira, entrada: p.entrada, amexConfirmado: p.amexConfirmado }, taxas);
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
