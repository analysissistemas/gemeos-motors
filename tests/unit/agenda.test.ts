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

test("Simulador 15/10 (quinta, 22:42): \"na verdade vou na quinta feira\" depois do agendado remarca para a próxima quinta", () => {
  const quinta22h = new Date("2026-10-16T01:42:00Z");
  const quarta14h = new Date("2026-10-21T17:00:00Z");
  assert.equal(quandoPorExtenso(remarcarPara(dataHoraDaVisita("Na verdade vou na quinta feira", quinta22h), quarta14h)!), "quinta, 22/10, às 14h");
  assert.equal(diaPorExtenso(dataHoraDaVisita("quinta que vem", new Date("2026-10-15T12:00:00Z")).dia!), "quinta, 22/10");
  // quinta de manhã, "quinta" sem hora ainda é hoje
  assert.equal(diaPorExtenso(dataHoraDaVisita("passo aí quinta", new Date("2026-10-15T12:00:00Z")).dia!), "quinta, 15/10");
});

test("com visita marcada: outro dia ou hora remarca só se fala de ir à loja ou é só a data", async () => {
  const { ehRemarcacao } = await import("../../lib/ia/fechamento.ts");
  for (const t of ["Na verdade vou na quinta feira", "Quarta feira que vem", "quinta às 10h", "pode ser sexta?", "melhor sábado de manhã", "passo aí na segunda", "amanhã às 15h", "Dia 22"]) assert.equal(ehRemarcacao(t), true, t);
  for (const t of ["amanhã te mando o comprovante", "segunda eu recebo o salário", "hoje não consigo falar, minha esposa decide sábado"]) assert.equal(ehRemarcacao(t), false, t);
  const AGORA16 = new Date("2026-10-16T22:13:00Z");
  assert.equal(detectarMomento({ textoCliente: "Na verdade vou na quinta feira", ultimaDaLoja: "O que está faltando para concluirmos a sua compra? 😊", conheceModelo: true, agora: AGORA16, jaAgendou: true }), "informou_visita");
  assert.notEqual(detectarMomento({ textoCliente: "amanhã te mando o comprovante", ultimaDaLoja: "Qualquer coisa estou por aqui", conheceModelo: true, agora: AGORA16, jaAgendou: true }), "informou_visita");
});

test("Milton (19/10/2026): 'dia 30 de novembro eu compro' é compra prevista; 'sexta vou aí' já é visita informada", async () => {
  const { compraPrevista, dataHoraDaVisita } = await import("../../lib/ia/agenda.ts");
  const { detectarMomento } = await import("../../lib/ia/fechamento.ts");
  const segunda = new Date("2026-10-19T13:00:00Z"); // segunda, 10h em Recife
  assert.deepEqual(dataHoraDaVisita("dia 30 de novembro", segunda).dia, { ano: 2026, mes: 10, dia: 30 });
  assert.deepEqual(dataHoraDaVisita("5 de janeiro", segunda).dia, { ano: 2027, mes: 0, dia: 5 });
  assert.deepEqual(compraPrevista("Ou dia 30 de novembro eu compro", segunda), { ano: 2026, mes: 10, dia: 30 });
  assert.deepEqual(compraPrevista("sexta eu fecho com você", segunda), { ano: 2026, mes: 9, dia: 23 });
  assert.deepEqual(compraPrevista("semana que vem não, sábado venho buscar", segunda), { ano: 2026, mes: 9, dia: 24 });
  assert.equal(compraPrevista("vou comprar", segunda), null); // sem o dia
  assert.equal(compraPrevista("sexta não vou comprar", segunda), null);
  assert.equal(compraPrevista("quanto fica a DF17?", segunda), null);
  const m = (t: string) => detectarMomento({ textoCliente: t, ultimaDaLoja: "Qual delas te agradou mais? 😊", conheceModelo: true, objecoesAntes: 0, jaAgendou: false });
  assert.equal(m("Sexta feira vou aí"), "informou_visita");
  assert.equal(m("Gostei, sexta eu passo aí"), "informou_visita");
  assert.equal(m("vou aí ver de perto"), "quer_visitar");
});

test("Simulador, 20/10/2026: o vendedor convidou e o cliente disse o dia que pode (dia negado não conta)", async () => {
  const { detectarMomento } = await import("../../lib/ia/fechamento.ts");
  const terca = new Date("2026-10-20T08:30:00Z"); // terça, 05:30 em Recife
  assert.deepEqual(dataHoraDaVisita("Amanhã não dá, só sábado de manhã", terca).dia, { ano: 2026, mes: 9, dia: 24 });
  assert.deepEqual(dataHoraDaVisita("sexta não posso, pode ser segunda", terca).dia, { ano: 2026, mes: 9, dia: 26 });
  assert.equal(dataHoraDaVisita("amanhã não dá", terca).diaDito, false);
  assert.deepEqual(dataHoraDaVisita("amanhã às 10h", terca).dia, { ano: 2026, mes: 9, dia: 21 });
  const convite = "Edimilson, aqui é o Milton. A N2 tem pronta entrega na cor verde, quer vir ver amanhã?";
  const m = (t: string, loja = convite) => detectarMomento({ textoCliente: t, ultimaDaLoja: loja, conheceModelo: true, objecoesAntes: 0, jaAgendou: false });
  assert.equal(m("Amanhã não dá, só sábado de manhã"), "informou_visita");
  assert.equal(m("pode ser sexta"), "informou_visita");
  assert.notEqual(m("sábado vocês abrem?"), "informou_visita"); // pergunta não anota
  assert.notEqual(m("sábado", "Qual delas te agradou mais? 😊"), "informou_visita"); // sem convite, só o dia não anota
});

test("dono, 20/10/2026: na dúvida nada vai para a agenda (talvez, vou ver, se der)", async () => {
  const { detectarMomento } = await import("../../lib/ia/fechamento.ts");
  const { compraPrevista } = await import("../../lib/ia/agenda.ts");
  const terca = new Date("2026-10-20T08:30:00Z");
  const convite = "A N2 tem pronta entrega, quer vir ver amanhã?";
  const m = (t: string, loja = convite, jaAgendou = false) => detectarMomento({ textoCliente: t, ultimaDaLoja: loja, conheceModelo: true, objecoesAntes: 0, jaAgendou, agora: terca });
  assert.equal(m("talvez sábado"), "quer_visitar");
  assert.equal(m("vou ver se sábado dá"), "quer_visitar");
  assert.equal(m("Sexta feira vou aí, se der", ""), "quer_visitar");
  assert.equal(m("acho que quarta eu passo aí", ""), "quer_visitar");
  assert.equal(m("talvez quarta", "", true), "quer_visitar"); // já agendado: dúvida não remarca
  assert.equal(m("sábado"), "informou_visita");
  assert.equal(m("Sexta feira vou aí", ""), "informou_visita");
  assert.equal(compraPrevista("talvez dia 30 eu compro", terca), null);
  assert.equal(compraPrevista("se der, sexta eu fecho", terca), null);
});
