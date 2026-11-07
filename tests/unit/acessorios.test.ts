/* Acessório com foto (Manu, 07/11/2026: "Qual valor dos capacetes?" e veio a lista de 7 em texto, sem foto). */
import assert from "node:assert/strict";
import { test } from "node:test";
import { montarAcessorios, pedidoDeAcessorio, RX_ACESSORIO_DA_MOTO, RX_QUER_ACESSORIO } from "../../lib/ia/acessorios.ts";

const LOJA = [
  { nome: "Capacete TOMATE Branco", preco: 350, foto: "/api/vitrine/foto/a.webp", quantidade: 1 },
  { nome: "Capacete TOMATE Bege", preco: 350, foto: "/api/vitrine/foto/b.webp", quantidade: 1 },
  { nome: "Capacete aberto ProTork", preco: 500, foto: null, quantidade: 2 },
  { nome: "Capacete coquinho BR 101", preco: 500, foto: "/api/vitrine/foto/c.webp", quantidade: null },
  { nome: "Capacete Joy Vermelho", preco: 600, foto: "/api/vitrine/foto/d.webp", quantidade: 1 },
  { nome: "Capacete coquinho", preco: 300, foto: "/api/vitrine/foto/e.webp", quantidade: 0 },
  { nome: "Baú 28 litros", preco: 400, foto: "/api/vitrine/foto/f.webp", quantidade: 7 },
];

test("Manu: 'Qual valor dos capacetes?' é pedido de capacete; 'vem com capacete?' é sobre a moto", () => {
  const t = "Qual valor dos capacetes?";
  assert.equal(pedidoDeAcessorio(t), "capacete");
  assert.ok(RX_QUER_ACESSORIO.test(t) && !RX_ACESSORIO_DA_MOTO.test(t));
  assert.ok(RX_ACESSORIO_DA_MOTO.test("a moto vem com capacete?"));
  assert.equal(pedidoDeAcessorio("tem baú pra AG08?"), "bau");
  assert.equal(pedidoDeAcessorio("quero a N2"), null);
});

test("3 capacetes com foto, do mais em conta, sem o que acabou; o resto pelo link do site", () => {
  const r = montarAcessorios(LOJA, "capacete", "Manu")!;
  assert.equal(r.abertura, "Manu, temos 5 opções de capacete, de R$ 350 a R$ 600. Separei algumas:");
  assert.deepEqual(r.itens.map((x) => x.nome), ["Capacete TOMATE Branco", "Capacete TOMATE Bege", "Capacete coquinho BR 101"], "com foto primeiro; o coquinho de quantidade 0 não entra");
  assert.equal(r.itens[0].legenda, "*Capacete TOMATE Branco*\n💰 *R$ 350*");
  assert.match(r.pergunta, /gemeosmotors\.com\.br\/#tipo=acessorio\n\nQual deles te interessou mais\? 😊$/);
});

test("um só: sem link e pergunta de fechar", () => {
  const r = montarAcessorios(LOJA, "bau", null)!;
  assert.equal(r.abertura, "Temos um baú a pronta entrega, por R$ 400:");
  assert.equal(r.pergunta, "Quer garantir o seu? 😊");
  assert.equal(montarAcessorios(LOJA.filter((a) => !/ba/i.test(a.nome)), "bau", null), null);
});
