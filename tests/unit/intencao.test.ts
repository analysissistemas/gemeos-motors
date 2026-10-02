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
