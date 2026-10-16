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

/* Elton, 15/10/2026 (quinta, 16:34 em Recife): "Na quarta feira à tarde" → "Que horas?" → "Por volta das 14:00".
   O test drive foi parar na sexta 16/10; depois ele disse "Quarta feira que vem" e a agenda ficou na sexta. */
import { diaClaro, diaPorExtenso, remarcarPara } from "../../lib/ia/agenda.ts";
import { detectarMomento } from "../../lib/ia/fechamento.ts";
const ELTON = new Date("2026-10-15T19:34:00Z");

test("Elton: só a hora não é dia claro (a IA pergunta o dia, não supõe amanhã)", () => {
  const so = dataHoraDaVisita("Por volta das 14:00 mais ou menos", ELTON);
  assert.equal(so.diaDito, false);
  assert.equal(diaClaro(so, "Por volta das 14:00 mais ou menos"), false);
  assert.equal(diaClaro(dataHoraDaVisita("hoje às 17h", ELTON), "hoje às 17h"), true);
  assert.equal(diaClaro(dataHoraDaVisita("amanhã às 10h", ELTON), "amanhã às 10h"), true);
});

test("Elton: a hora junta com o dia escrito na pergunta da IA (\"Quarta, 21/10. E que horas…\")", () => {
  const dia = dataHoraDaVisita("Na quarta feira à tarde", ELTON);
  assert.equal(diaPorExtenso(dia.dia!), "quarta, 21/10");
  const junto = dataHoraDaVisita("Por volta das 14:00 mais ou menos\nquarta, 21/10", ELTON);
  assert.equal(junto.diaDito, true);
  assert.equal(quandoPorExtenso(junto.quando!), "quarta, 21/10, às 14h");
  // o horário da loja na pergunta ("das 8h às 18h") não entra: a hora do cliente vem primeiro
  assert.equal(quandoPorExtenso(dataHoraDaVisita("às 15h\nquarta, 21/10", ELTON).quando!), "quarta, 21/10, às 15h");
});

test("remarcar: muda só o que o cliente disse", () => {
  const sexta14h = new Date("2026-10-16T17:00:00Z");
  assert.equal(quandoPorExtenso(remarcarPara(dataHoraDaVisita("Quarta feira que vem", ELTON), sexta14h)!), "quarta, 21/10, às 14h");
  assert.equal(quandoPorExtenso(remarcarPara(dataHoraDaVisita("pode ser às 16h?", ELTON), sexta14h)!), "sexta, 16/10, às 16h");
  assert.equal(quandoPorExtenso(remarcarPara(dataHoraDaVisita("melhor sábado às 9h", ELTON), sexta14h)!), "sábado, 17/10, às 9h");
  assert.equal(remarcarPara(dataHoraDaVisita("ok, combinado", ELTON), sexta14h), null);
});

test("depois do agendado, outro dia ou hora é remarcação; pergunta não é", () => {
  const loja = "Agendado ✅ Te esperamos sexta, 16/10, às 14h, Elton, aqui na loja";
  assert.equal(detectarMomento({ textoCliente: "Quarta feira que vem", ultimaDaLoja: loja, conheceModelo: false, agora: ELTON, jaAgendou: true }), "informou_visita");
  assert.equal(detectarMomento({ textoCliente: "vocês abrem sábado?", ultimaDaLoja: loja, conheceModelo: false, agora: ELTON, jaAgendou: true }), null);
  assert.equal(detectarMomento({ textoCliente: "Quarta feira que vem", ultimaDaLoja: "Qual modelo te interessou?", conheceModelo: false, agora: ELTON }), null);
});
