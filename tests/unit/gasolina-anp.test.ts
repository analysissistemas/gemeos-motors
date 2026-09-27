/* Preço da gasolina pela ANP: a cidade do cliente quando a ANP pesquisa lá, senão a média do estado. */
import assert from "node:assert/strict";
import { test } from "node:test";
import { cidadeNoTexto, linkResumoMaisRecente, nomeAnp, precoParaCidade, type PrecosGasolina } from "../../lib/ia/gasolina-anp.ts";
import { comGasolinaDaRegiao, fraseEconomia } from "../../lib/ia/economia.ts";

const DADOS: PrecosGasolina = {
  arquivo: "resumo_semanal_lpc_2026-09-20_2026-09-26.xlsx",
  semanaFim: "2026-09-26",
  estados: { PERNAMBUCO: 6.94, PARAIBA: 6.61 },
  municipios: { "PERNAMBUCO|RECIFE": 6.97, "PERNAMBUCO|VITORIA DE SANTO ANTAO": 6.86, "PARAIBA|JOAO PESSOA": 6.59 },
};

test("gasolina: nome no jeito da ANP", () => {
  assert.equal(nomeAnp("Vitória de Santo Antão"), "VITORIA DE SANTO ANTAO");
});

test("gasolina: cidade pesquisada vale o preço dela; fora da pesquisa, a média do estado", () => {
  assert.deepEqual(precoParaCidade(DADOS, "Recife", "Pernambuco"), { preco: 6.97, onde: "Recife" });
  assert.deepEqual(precoParaCidade(DADOS, "Goiana", "Pernambuco"), { preco: 6.94, onde: "média de Pernambuco" });
  assert.deepEqual(precoParaCidade(DADOS, "João Pessoa", "Pernambuco"), { preco: 6.59, onde: "Joao Pessoa" });
  assert.deepEqual(precoParaCidade(DADOS, null, "Pernambuco"), { preco: 6.94, onde: "média de Pernambuco" });
});

test("gasolina: acha a cidade que o cliente escreveu", () => {
  assert.equal(cidadeNoTexto(DADOS, "moro em Vitória de Santo Antão, perto do centro", "Pernambuco"), "VITORIA DE SANTO ANTAO");
  assert.equal(cidadeNoTexto(DADOS, "moro em Goiana", "Pernambuco"), null);
});

test("gasolina: link do resumo semanal mais novo", () => {
  const html = `<a href="https://x/resumo_semanal_lpc_2026-09-13_2026-09-19.xlsx">a</a><a href="https://x/revendas_lpc_2026-09-20_2026-09-26.xlsx">b</a><a href="https://x/resumo_semanal_lpc_2026-09-20_2026-09-26.xlsx">c</a>`;
  assert.equal(linkResumoMaisRecente(html), "https://x/resumo_semanal_lpc_2026-09-20_2026-09-26.xlsx");
});

test("gasolina: a frase para o cliente diz o preço e de onde ele vem", () => {
  const p = comGasolinaDaRegiao({ gasolina: 6.77, kmPorLitro: 40, cargaMin: 2, cargaMax: 5 }, { preco: 6.94, onde: "média de Pernambuco" });
  assert.match(fraseEconomia("AG08", 40, 140, p), /na gasolina \(R\$ 6,94 o litro, média de Pernambuco\) você gastaria R\$ 104 por mês/);
});
