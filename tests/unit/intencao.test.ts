/* Primeiro entender o que o cliente quer (lib/ia/intencao.ts), pedido do dono em 02/10/2026:
   quem só cumprimenta pode querer garantia ou assistência, então nada de oferecer moto antes. */
import assert from "node:assert/strict";
import { test } from "node:test";
import { instrucaoDeIntencao, intencaoDoTexto, tirarOfertaDeProduto } from "../../lib/ia/intencao.ts";

const NOMES = ["AG08", "TANK AG11", "T1", "DF17"];

test("só cumprimento ou só o nome: ainda não se sabe o que o cliente quer", () => {
  for (const t of ["boa tarde", "Oii", "Oi, sou o Carlos", "Carlos", "bom dia, tudo bem?"]) assert.equal(intencaoDoTexto(t, NOMES), null, t);
});

test("assistência, garantia e defeito ganham de compra", () => {
  for (const t of ["quero ver a garantia", "minha moto deu defeito", "a bateria não carrega", "preciso de uma peça", "a moto parou de funcionar", "vocês fazem revisão?"]) assert.equal(intencaoDoTexto(t, NOMES), "assistencia", t);
});

test("falou de moto, modelo, preço ou pagamento: é compra", () => {
  for (const t of ["quanto custa a AG08?", "vi a moto no site", "tem a T1?", "quais modelos vocês têm?", "aceita pix?", "df17"]) assert.equal(intencaoDoTexto(t, NOMES), "compra", t);
  /* nome dentro de outra palavra não conta */
  assert.equal(intencaoDoTexto("ag080", NOMES), null);
});

test("sem intenção, a frase que oferece produto sai e o resto fica", () => {
  assert.equal(tirarOfertaDeProduto("Prazer, Carlos! A AG08 está a pronta entrega por R$ 8.999,90. Temos modelos com ótima autonomia."), "Prazer, Carlos!");
  assert.equal(tirarOfertaDeProduto("Boa tarde! Temos a AG08 aqui 😊", NOMES), "Boa tarde!");
  assert.equal(tirarOfertaDeProduto("Que bom falar com você!"), "Que bom falar com você!");
});

test("a IA é avisada antes de escrever", () => {
  assert.match(instrucaoDeIntencao(null), /NÃO fale de moto/);
  assert.match(instrucaoDeIntencao("assistencia"), /NÃO ofereça moto/);
  assert.equal(instrucaoDeIntencao("compra"), "");
});

test("frase comum de quem está comprando não vira assistência", () => {
  for (const t of ["sem problema, pode ser terça", "tem problema se eu pagar no cartão?", "qual a garantia da T1?", "vem com carregador? quanto custa a AG08?", "e a revisão da moto, como funciona?", "não tem problema nenhum"])
    assert.notEqual(intencaoDoTexto(t, NOMES), "assistencia", t);
  for (const t of ["comprei uma moto aí, a garantia ainda vale?", "a garantia da minha moto", "estou com problema na T1"]) assert.equal(intencaoDoTexto(t, NOMES), "assistencia", t);
});

test("pós-venda que vai para uma pessoa: empatia, sem insistir, sem oferecer moto", async () => {
  const { textoPosVenda, RX_DETALHE_PROBLEMA } = await import("../../lib/ia/intencao.ts");
  const fechada = textoPosVenda({ nome: null, lojaAberta: false, jaEncaminhou: false, naoPodeVir: false, irritado: true, semDetalhe: true });
  assert.match(fechada, /^Entendo, e sinto muito pelo transtorno/);
  assert.match(fechada, /assim que a loja abrir/);
  assert.match(fechada, /me conta aqui o que está acontecendo/);
  assert.doesNotMatch(fechada, /motos\?|seu nome|alguma coisa/);
  const longe = textoPosVenda({ nome: "Marcos", lojaAberta: true, jaEncaminhou: true, naoPodeVir: true, irritado: true, semDetalhe: false });
  assert.match(longe, /^Entendo, Marcos, e peço desculpas/);
  assert.match(longe, /difícil vir até a loja/);
  assert.match(longe, /já está com os responsáveis/);
  assert.doesNotMatch(longe, /me conta/);
  assert.ok(longe.split("\n").length <= 12);
  assert.ok(RX_DETALHE_PROBLEMA.test("a bateria não segura carga"));
  assert.ok(!RX_DETALHE_PROBLEMA.test("comprei uma moto aí e estou com problema"));
});

test("pós-venda: não pode vir à loja ou está irritado → passa para uma pessoa", async () => {
  const { RX_NAO_PODE_VIR, RX_IRRITADO } = await import("../../lib/ia/intencao.ts");
  for (const t of ["eu moro longe e não vou perder um dia", "não consigo ir aí", "não posso levar a moto"]) assert.ok(RX_NAO_PODE_VIR.test(t), t);
  for (const t of ["Vocês não resolvem nada!", "já estou cansado disso", "vou no procon"]) assert.ok(RX_IRRITADO.test(t), t);
  assert.ok(!RX_NAO_PODE_VIR.test("posso ir sábado"));
  assert.match(instrucaoDeIntencao("assistencia"), /convide UMA vez/);
  assert.match(instrucaoDeIntencao("assistencia"), /NÃO insista/);
});
