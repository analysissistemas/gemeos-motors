/* Dia e hora da visita/test drive que o cliente escreve (lib/ia/agenda.ts). Fuso de Recife. */
import assert from "node:assert/strict";
import { test } from "node:test";
import { dataHoraDaVisita, quandoPorExtenso, RX_PEDIU_HORARIO_VISITA, RX_QUER_VISITAR } from "../../lib/ia/agenda.ts";

/* sábado, 03/10/2026, 09:00 em Recife (12:00 UTC) */
const AGORA = new Date(Date.UTC(2026, 9, 3, 12, 0));
const ext = (t: string) => {
  const r = dataHoraDaVisita(t, AGORA);
  return r.quando ? quandoPorExtenso(r.quando) : `${r.temDia ? "dia" : "-"}/${r.temHora ? "hora" : "-"}`;
};

test("dia da semana, amanhã, hoje e data", () => {
  assert.equal(ext("sábado às 10h"), "sábado, 03/10, às 10h");
  assert.equal(ext("amanhã 15h"), "domingo, 04/10, às 15h");
  assert.equal(ext("hoje às 4 da tarde"), "sábado, 03/10, às 16h");
  assert.equal(ext("dia 6 às 9"), "terça, 06/10, às 9h");
  assert.equal(ext("06/10 14:30"), "terça, 06/10, às 14h30");
  assert.equal(ext("segunda meio dia"), "segunda, 05/10, às 12h");
  /* "sábado" dito no próprio sábado, com hora que já passou: o próximo */
  assert.equal(ext("sábado às 8h"), "sábado, 10/10, às 8h");
  assert.equal(ext("sexta às 15h"), "sexta, 09/10, às 15h");
});

test("hora de comércio: 'às 3' é da tarde; falta dia ou hora", () => {
  assert.equal(ext("segunda às 3"), "segunda, 05/10, às 15h");
  assert.equal(ext("amanhã às 3"), "domingo, 04/10, às 15h");
  assert.equal(ext("terça de manhã"), "dia/-");
  assert.equal(ext("às 10h"), "sábado, 03/10, às 10h");
  assert.equal(ext("pode ser"), "-/-");
});

test("quer vir à loja / test drive; a loja perguntou o horário", () => {
  for (const t of ["quero fazer um test drive", "posso ir aí ver a moto?", "vou passar aí amanhã", "dá pra ver ela pessoalmente?"]) assert.ok(RX_QUER_VISITAR.test(t), t);
  assert.ok(!RX_QUER_VISITAR.test("quanto custa a AG08?"));
  assert.ok(RX_PEDIU_HORARIO_VISITA.test("Qual dia e horário fica melhor pra você vir? 😊"));
});
