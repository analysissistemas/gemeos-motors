/* Fila de espera (dono, 18/10/2026): modelo esgotado, aviso de chegada. Roda com `npm run test:ia`. */
import assert from "node:assert/strict";
import { test } from "node:test";
import { citouSemEstoque, maisParecida, MODELO_AVISO_CHEGADA, pediuAviso, perguntouAviso, textoChegou, textoEsgotado, textoNaFila, type ModeloSemEstoque } from "../../lib/ia/fila-espera.ts";

const TANK: ModeloSemEstoque = { id: 1, nome: "TANK AG11", tipo: "moto_eletrica", preco: 12900, chegaEm: null };
const MM3: ModeloSemEstoque = { id: 2, nome: "MM3", tipo: "moto_eletrica", preco: 10500, chegaEm: "25/10" };
const P800: ModeloSemEstoque = { id: 3, nome: "Patinete 800W", tipo: "patinete", preco: 3900, chegaEm: null };
const COM = [
  { nome: "T1", tipo: "moto_eletrica", preco: 12000 },
  { nome: "N2", tipo: "moto_eletrica", preco: 5890 },
  { nome: "Patinete 530W", tipo: "patinete", preco: 3500 },
];

test("reconhece o modelo esgotado que o cliente pediu (nome inteiro ou o pedaço com número)", () => {
  assert.equal(citouSemEstoque("tem a tank?", [TANK, MM3])?.nome, "TANK AG11");
  /* palavra genérica sozinha não é modelo */
  assert.equal(citouSemEstoque("quero um patinete", [P800]), null);
  assert.equal(citouSemEstoque("Tem a TANK AG11?", [TANK, MM3])?.nome, "TANK AG11");
  assert.equal(citouSemEstoque("e a ag11, tem?", [TANK, MM3])?.nome, "TANK AG11");
  assert.equal(citouSemEstoque("quando chega a MM3?", [TANK, MM3])?.nome, "MM3");
  assert.equal(citouSemEstoque("quero o patinete 800w", [TANK, P800])?.nome, "Patinete 800W");
  assert.equal(citouSemEstoque("quanto custa a AG08?", [TANK, MM3]), null);
});

test("pedido de aviso: o botão do site e o jeito de falar", () => {
  assert.ok(pediuAviso("Olá! Quero ser avisado quando a *TANK AG11* chegar."));
  assert.ok(pediuAviso("me avisa quando chegar a tank"));
  assert.ok(pediuAviso("me chama quando tiver"));
  assert.ok(!pediuAviso("tem a tank?"));
  assert.ok(perguntouAviso("…\n\nQuer que eu te avise aqui assim que a *TANK AG11* chegar?"));
});

test("esgotado: previsão, a mais parecida com estoque e uma pergunta", () => {
  const t = textoEsgotado({ nome: "Ana", modelo: MM3, parecida: maisParecida(MM3, COM) });
  assert.ok(t.startsWith("Ana, a *MM3* esgotou no momento"));
  assert.ok(t.includes("previsão de chegar dia 25/10"));
  assert.ok(t.includes("a *T1*, por R$ 12.000"));
  assert.equal((t.match(/\?/g) ?? []).length, 1);
  assert.ok(perguntouAviso(t));
  /* patinete: o mais parecido é patinete */
  assert.equal(maisParecida(P800, COM)?.nome, "Patinete 530W");
  assert.ok(textoEsgotado({ nome: null, modelo: P800, parecida: null }).startsWith("O *Patinete 800W* esgotou"));
});

test("na fila e chegou: sem prometer data que não existe", () => {
  assert.ok(!/previsão/.test(textoNaFila({ nome: "Ana", modelo: TANK })));
  assert.ok(textoNaFila({ nome: null, modelo: MM3 }).includes("(a previsão é dia 25/10)"));
  assert.equal(textoChegou({ nome: "Ana", modelo: "TANK AG11" }), "Oi, Ana! Boa notícia: a *TANK AG11* que você pediu chegou na Gêmeos Motors 🛵 Quer que eu separe a sua?");
  assert.equal(MODELO_AVISO_CHEGADA.definicao.components[0].text.match(/\{\{\d\}\}/g)?.length, 2);
});
