/* Pergunta do cliente que não pode se perder (Sidney, 22/10/2026; plano de 23/10/2026). */
import assert from "node:assert/strict";
import { test } from "node:test";
import { instrucaoVariasPerguntas, perguntasDoCliente, perguntasSemResposta } from "../../lib/ia/perguntas-soltas.ts";

const SIDNEY =
  "1ª - Vocês fazem entrega pra Pernambuco?\n2ª- Qual a moto elétrica (scooter de preferência) com bateria de lítio mais em conta que vocês tem?\n3ª- Qual a scooter elétrica de 1000w mais em conta";

test("acha as perguntas, inclusive o item numerado sem '?'", () => {
  assert.deepEqual(perguntasDoCliente(SIDNEY), [
    "Vocês fazem entrega pra Pernambuco?",
    "Qual a moto elétrica (scooter de preferência) com bateria de lítio mais em conta que vocês tem?",
    "Qual a scooter elétrica de 1000w mais em conta",
  ]);
  assert.deepEqual(perguntasDoCliente("Ela vem com porta trecos?\n\nEntrega\n\nOk, fico no aguardo"), ["Ela vem com porta trecos?"]);
  assert.deepEqual(perguntasDoCliente("ok\n\nobrigado"), []);
  assert.deepEqual(perguntasDoCliente("??"), []);
});

test("o texto pronto da entrega não responde o porta-trecos", () => {
  const lista = "Show! Pra combinar a entrega, me manda só:\n• Seu nome completo\n• Endereço (rua, número e bairro)\n• Que dia e horário você pode receber?";
  assert.deepEqual(perguntasSemResposta("Ela vem com porta trecos?\n\nEntrega\n\nOk, fico no aguardo", lista), ["Ela vem com porta trecos?"]);
});

test("indicação do Sidney: entrega e lítio respondidos, a de 1000W não", () => {
  const resposta = [
    "Sobre a entrega: sim! A loja fica em Goiana, Pernambuco, e a gente entrega em toda a região.",
    "Sidney, pelo que você me contou (procurando a mais em conta), separei as que mais combinam com você:",
    "*N2*\nBateria de lítio removível, cestinha na frente e banco de garupa.\n💰 *R$ 5.890* (a mais em conta)",
  ].join("\n\n");
  assert.deepEqual(perguntasSemResposta(SIDNEY, resposta), ["Qual a scooter elétrica de 1000w mais em conta"]);
});

test("várias perguntas: instrução para responder todas; uma só, nada", () => {
  assert.match(instrucaoVariasPerguntas(SIDNEY), /FEZ 3 PERGUNTAS/);
  assert.equal(instrucaoVariasPerguntas("Quanto custa a T1?"), "");
});

test("pergunta de preço com o preço na resposta não vira 'confirmo com a equipe' (Gilson, 24/10/2026)", () => {
  const cartoes = "as que eu te indico são estas:\n\n*T3 RETRÔ*\n💰 *R$ 11.000*\n\n*T5 RETRÔ*\n💰 *R$ 11.000*";
  assert.deepEqual(perguntasSemResposta("Oi! Vi o anúncio da RETRÔ e quero saber mais sobre o modelo\n\nvalor a vista?", cartoes), []);
  /* sem preço na resposta, continua solta */
  assert.equal(perguntasSemResposta("valor a vista?", "A T3 é ótima pra cidade.").length, 1);
});
