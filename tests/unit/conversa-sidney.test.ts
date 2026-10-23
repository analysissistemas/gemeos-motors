/* Sidney (22/10/2026, conversa 407): "Vocês fazem entrega pra Pernambuco?" virou "pras entregas" e tarefa para a equipe
   confirmar se a loja (de Goiana-PE) entrega em Pernambuco; "Mas queria essa" em cima da M6 virou conversa da N2; "o
   máximo possível, Mastercard" não virou simulação em 21x. */
import assert from "node:assert/strict";
import { test } from "node:test";
import { lerDoCliente, perguntouEntrega } from "../../lib/ia/necessidade.ts";
import { ehSoOEstado, listaDeDados, notaDeEntrega, simulacaoPedida } from "../../lib/ia/fechamento.ts";
import { decidirSimulacao } from "../../lib/ia/simulacao-fluxo.ts";
import { comMotoCitada, ultimaCitada } from "../../lib/ia/midia-tipos.ts";

const PERGUNTAS =
  "1ª - Vocês fazem entrega pra Pernambuco?\n2ª- Qual a moto elétrica (scooter de preferência) com bateria de lítio mais em conta que vocês tem?\n3ª- Qual a scooter elétrica de 1000w mais em conta";

test("entrega da loja não é o uso da moto", () => {
  assert.equal(lerDoCliente(PERGUNTAS).uso, null);
  assert.equal(lerDoCliente("Entrega").uso, null);
  assert.equal(lerDoCliente("qual a taxa de entrega pra Recife?").uso, null);
  assert.equal(lerDoCliente("quero pra fazer entregas no ifood").uso, "entregas");
  assert.equal(lerDoCliente("trabalho com entregas").uso, "entregas");
  assert.ok(perguntouEntrega(PERGUNTAS));
  assert.ok(perguntouEntrega("vcs entregam em Recife?"));
  assert.ok(!perguntouEntrega("Entrega"));
});

test("'Pernambuco' não é cidade de fora: sem tarefa, e pede a cidade no endereço", () => {
  for (const c of ["Pernambuco", "PE", "pernambuco."]) assert.ok(ehSoOEstado(c), c);
  assert.equal(notaDeEntrega("Pernambuco"), null);
  assert.match(notaDeEntrega("Recife") ?? "", /Recife/);
  assert.equal(notaDeEntrega("Goiana"), null);
  assert.match(listaDeDados("entrega", { cidade: "Pernambuco" }), /bairro e cidade/);
});

test("'o máximo possível' são 21 vezes e a simulação sai", () => {
  assert.equal(simulacaoPedida("O máximo possível, Mastercard").parcelas, 21);
  assert.equal(simulacaoPedida("Quanto ficariam o valor das parcelas (no máximo de vezes) na AG08??").parcelas, 21);
  assert.equal(simulacaoPedida("posso pagar no máximo 10 mil").parcelas, null);
  assert.equal(simulacaoPedida("aguenta no máximo 150 kg?").parcelas, null);
  assert.equal(simulacaoPedida("no máximo 12x").parcelas, 12);
  const d = decidirSimulacao({
    textoCliente: "Quanto ficariam o valor das parcelas (no máximo de vezes) na AG08?? Se possível me manda foto dela",
    recentesCliente: "Lead: Ou se puder, me apresenta modelos mais robustos\nLead: O máximo possível, Mastercard",
    ultimaDaLoja: "Você quer saber mais detalhes ou formas de pagamento dela? 🙂",
    modelo: "AG08",
    preco: 8999.9,
    nome: "Sidney",
  });
  assert.equal(d.acao, "enviar");
  assert.match(d.acao === "enviar" ? d.texto : "", /21x de/);
});

test("resposta em cima do cartão da moto: 'essa' é aquela moto", () => {
  const MODELOS = ["N2", "M6", "T3 RETRÔ", "AG08"].map((nome) => ({ nome }));
  const n2 = comMotoCitada("Pelo preço gostei dessa🤣", "*N2*\nBateria de lítio removível, cestinha na frente e banco de garupa.\n💰 *R$ 5.890* (a mais em conta)", MODELOS);
  const m6 = comMotoCitada("Mas queria essa", "*M6*\nAguenta até 180 kg.\n💰 *R$ 11.900*", MODELOS);
  assert.equal(ultimaCitada(MODELOS, [n2, m6, "Como pode ser feito o pagamento?"].join("\n\n"))?.nome, "M6");
  /* escreveu o nome: vale o que ele escreveu; citou mensagem sem moto: nada muda */
  assert.equal(comMotoCitada("quero a AG08", "*M6*\nAguenta até 180 kg.", MODELOS), "quero a AG08");
  assert.equal(comMotoCitada("ok", "Qual delas te agradou mais? 😊", MODELOS), "ok");
});
