/* Barrinha do crédito da IA na Visão geral (lib/ia/credito.ts, usuário 29/10/2026). Roda com `npm run test:ia`. */
import assert from "node:assert/strict";
import { test } from "node:test";
import { custoAudioUsd, custoUsd, situacaoDoCredito, textoDoCredito } from "../../lib/ia/credito.ts";

const agora = new Date("2026-10-29T12:00:00Z");
const diasAtras = (d: number) => new Date(agora.getTime() - d * 86_400_000).toISOString();

test("custo por modelo: gpt-4.1 custa 5x o mini; modelo desconhecido paga o preço do gpt-4.1", () => {
  assert.equal(custoUsd("gpt-4.1", 1_000_000, 0), 2);
  assert.equal(custoUsd("openai/gpt-4.1-mini", 1_000_000, 1_000_000), 2);
  assert.equal(custoUsd("modelo-novo", 0, 1_000_000), 8);
  assert.equal(custoUsd("gpt-4.1", null, undefined), 0);
});

test("áudio: mínimo de 1 minuto, pelo tamanho do arquivo", () => {
  assert.equal(custoAudioUsd(10_000), 0.003);
  assert.equal(custoAudioUsd(360_000), 0.009);
});

test("sem saldo informado: pede o saldo", () => {
  const s = situacaoDoCredito({ saldo: null, gastoDesdeSaldo: 0, gasto7Dias: 3, agora, semCreditoDesde: null });
  assert.equal(s.nivel, "sem_saldo");
  assert.match(textoDoCredito(s), /Informe o saldo/);
});

test("saldo folgado: ok, com dias no ritmo da última semana", () => {
  const s = situacaoDoCredito({ saldo: { usd: 50, em: diasAtras(10) }, gastoDesdeSaldo: 10, gasto7Dias: 7, agora, semCreditoDesde: null });
  assert.equal(s.nivel, "ok");
  assert.equal(s.restante, 40);
  assert.equal(s.dias, 40);
  assert.match(textoDoCredito(s), /US\$ 40,00, cerca de 40 dias/);
});

test("faltam 10 dias ou menos, ou menos de 20%: baixo", () => {
  assert.equal(situacaoDoCredito({ saldo: { usd: 50, em: diasAtras(10) }, gastoDesdeSaldo: 42, gasto7Dias: 7, agora, semCreditoDesde: null }).nivel, "baixo");
  assert.equal(situacaoDoCredito({ saldo: { usd: 100, em: diasAtras(10) }, gastoDesdeSaldo: 85, gasto7Dias: 0.7, agora, semCreditoDesde: null }).nivel, "baixo");
});

test("3 dias ou menos, ou menos de US$ 1: acabando", () => {
  const s = situacaoDoCredito({ saldo: { usd: 20, em: diasAtras(10) }, gastoDesdeSaldo: 17.5, gasto7Dias: 7, agora, semCreditoDesde: null });
  assert.equal(s.nivel, "acabando");
  assert.match(textoDoCredito(s), /está acabando: sobra US\$ 2,50, cerca de 2 dias/);
  assert.equal(situacaoDoCredito({ saldo: { usd: 5, em: diasAtras(10) }, gastoDesdeSaldo: 4.5, gasto7Dias: 0, agora, semCreditoDesde: null }).nivel, "acabando");
});

test("na primeira semana, a média é do que passou desde o saldo informado", () => {
  const s = situacaoDoCredito({ saldo: { usd: 30, em: diasAtras(2) }, gastoDesdeSaldo: 4, gasto7Dias: 9, agora, semCreditoDesde: null });
  assert.equal(s.mediaDia, 2);
  assert.equal(s.dias, 13);
});

test("OpenAI recusou por falta de crédito: acabou, mesmo com a conta dizendo que sobra", () => {
  const s = situacaoDoCredito({ saldo: { usd: 50, em: diasAtras(10) }, gastoDesdeSaldo: 10, gasto7Dias: 7, agora, semCreditoDesde: diasAtras(0) });
  assert.equal(s.nivel, "acabou");
  assert.match(textoDoCredito(s), /parou de responder/);
});
