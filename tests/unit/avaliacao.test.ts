/* Venda facilitada com troca (dono, 17/10/2026: a IA dizia que a loja não pega moto na troca). Frases das conversas
   reais do Ryan, do Valmir e do Jordão. Roda com `npm run test:ia`. */
import assert from "node:assert/strict";
import { test } from "node:test";
import { itemDoTexto, jaPediuAvaliacao, motivoAvaliacao, pedidoDeAvaliacao, textoPedidoAvaliacao } from "../../lib/ia/avaliacao.ts";

test("troca: reconhece o pedido e o tipo do item", () => {
  const casos: [string, string][] = [
    ["Pega Twister de entrada?", "moto"],
    ["Quero trocar uma Jet pô uma elétrica vc aceita", "moto"],
    ["Troca na JET 2027", "moto"],
    ["Queria saber se faz uma troca", "outro"],
    ["vocês aceitam moto na troca?", "moto"],
    ["dou minha CG 160 de entrada na T1", "moto"],
    ["aceita carro como entrada?", "carro"],
    ["tenho um gol 2015 pra dar na troca", "carro"],
    ["pega iPhone 13 na troca?", "celular"],
    ["posso dar uma JBL de entrada?", "outro"],
    ["vcs trabalham com troca?", "outro"],
    ["dá pra abater meu celular no valor?", "celular"],
  ];
  for (const [frase, item] of casos) assert.deepEqual(pedidoDeAvaliacao(frase), { tipo: "troca", item }, frase);
});

test("compra: a loja comprar o que o cliente tem", () => {
  assert.deepEqual(pedidoDeAvaliacao("Vocês compram moto também ?"), { tipo: "compra", item: "moto" });
  assert.deepEqual(pedidoDeAvaliacao("quero vender minha moto"), { tipo: "compra", item: "moto" });
  /* Ryan: "Tenho uma elite" veio antes; "Sim só vender mesmo" depois */
  assert.deepEqual(pedidoDeAvaliacao("Sim só vender mesmo", "Tenho uma elite\n2026"), { tipo: "compra", item: "moto" });
  assert.deepEqual(pedidoDeAvaliacao("Vende-se Twister 2020 25.000 km"), { tipo: "compra", item: "moto" });
});

test("não confunde com compra da loja, assistência ou troca de cor e horário", () => {
  for (const f of [
    "quero comprar uma moto elétrica",
    "Qual o preço da AG08?",
    "dá pra trocar a cor?",
    "posso trocar o horário pra amanhã?",
    "a troca da bateria é na garantia?",
    "minha moto não liga",
    "posso trocar a moto se der defeito?",
    "se eu não gostar posso trocar a moto?",
    "vocês vendem capacete?",
    "Bom dia",
  ])
    assert.equal(pedidoDeAvaliacao(f), null, f);
});

test("item: celular antes de moto (moto g é celular)", () => {
  assert.equal(itemDoTexto("tenho um moto g52"), "celular");
  assert.equal(itemDoTexto("tenho uma cg 150"), "moto");
  assert.equal(itemDoTexto("uma caixa de som jbl"), "outro");
  assert.equal(itemDoTexto("bom dia"), null);
});

test("texto pede os dados daquele item, sem valor, e fecha conforme a loja", () => {
  const moto = textoPedidoAvaliacao({ tipo: "troca", item: "moto", nome: "Jordão", lojaAberta: true });
  assert.ok(moto.startsWith("Jordão, aqui a gente faz venda facilitada com troca"));
  for (const d of ["Marca e modelo", "Ano", "Km rodado", "quitada", "Quanto você quer nela?", "painel mostrando o km"]) assert.ok(moto.includes(d), d);
  assert.ok(moto.includes("um vendedor avalia e te passa o valor"));
  assert.ok(!/R\$/.test(moto));
  const cel = textoPedidoAvaliacao({ tipo: "troca", item: "celular", nome: null, lojaAberta: false });
  assert.ok(cel.startsWith("Aqui a gente"));
  assert.ok(cel.includes("Saúde da bateria") && cel.includes("quantos GB"));
  assert.ok(cel.includes("assim que abrir"));
  const compra = textoPedidoAvaliacao({ tipo: "compra", item: "moto", nome: "Ryan", lojaAberta: true });
  assert.ok(compra.startsWith("Ryan, a nossa equipe avalia a sua moto pra compra"));
  assert.ok(jaPediuAvaliacao(`Agente IA: ${compra}`));
});

test("motivo para o vendedor", () => {
  const m = motivoAvaliacao({ tipo: "troca", item: "moto", modeloDeInteresse: "AG08", relato: "Quero trocar uma Jet" });
  assert.ok(m.startsWith("AVALIAR MOTO NA TROCA") && m.includes("da AG08"));
  assert.ok(motivoAvaliacao({ tipo: "compra", item: "carro", modeloDeInteresse: null, relato: "x" }).startsWith("COMPRA DE CARRO"));
});
