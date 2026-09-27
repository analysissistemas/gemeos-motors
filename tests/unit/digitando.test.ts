/* Tempo de "digitando" da IA: parece uma pessoa no celular, nunca curto demais nem longo demais. */
import assert from "node:assert/strict";
import { test } from "node:test";
import { tempoDigitando } from "../../lib/ia/workflow/util.ts";

test("resposta curta leva pelo menos 2 s; longa, no máximo 9 s", () => {
  assert.equal(tempoDigitando("Oi!", 0), 2000);
  assert.equal(tempoDigitando("x".repeat(2000), 1), 9000);
});

test("quanto maior o texto, mais tempo digitando", () => {
  const curta = tempoDigitando("Temos sim, a AG08 está disponível.", 0.5);
  const longa = tempoDigitando("Temos sim! A AG08 está disponível na cor branca, com autonomia de até 70 km e motor de 1000 W. Quer agendar um test drive?", 0.5);
  assert.ok(longa > curta, `${longa} > ${curta}`);
});

test("a variação é pequena (±15%) para não ficar robótico", () => {
  const t = "Posso te mandar as fotos da moto?";
  const a = tempoDigitando(t, 0), b = tempoDigitando(t, 1);
  assert.ok(b > a && b / a < 1.4, `${a} .. ${b}`);
});

import { tirarCumprimentoRepetido } from "../../lib/ia/workflow/util.ts";
test("cumprimento repetido sai do começo da resposta; o resto fica igual", () => {
  assert.equal(
    tirarCumprimentoRepetido("Bom diaa! Tudo certinho? Hoje a loja está fechada, mas nossa equipe responde assim que abrirmos."),
    "Hoje a loja está fechada, mas nossa equipe responde assim que abrirmos.",
  );
  assert.equal(tirarCumprimentoRepetido("Boa noite, Mariana! A AG08 custa R$ 10.990."), "A AG08 custa R$ 10.990.");
  assert.equal(tirarCumprimentoRepetido("A AG08 custa R$ 10.990. Bom dia!"), "A AG08 custa R$ 10.990. Bom dia!");
  assert.equal(tirarCumprimentoRepetido("Oitenta km de autonomia."), "Oitenta km de autonomia.");
  assert.equal(tirarCumprimentoRepetido("Bom dia! Tudo bem?"), "");
});

test("apresentação repetida também sai do começo da resposta", () => {
  assert.equal(tirarCumprimentoRepetido("Oi! Aqui é a assistente virtual da Gêmeos Motors. A M6 custa R$ 10.990."), "A M6 custa R$ 10.990.");
  assert.equal(tirarCumprimentoRepetido("Sou a assistente da loja. Posso te ajudar com a AG08?"), "Posso te ajudar com a AG08?");
  assert.equal(tirarCumprimentoRepetido("Aqui na loja a M6 é a mais procurada."), "Aqui na loja a M6 é a mais procurada.");
});

import { soCumprimento, tirarEmojiDoInicio } from "../../lib/ia/workflow/util.ts";
test("saudação fica só com o cumprimento (pergunta de nome e apresentação vão para a resposta)", () => {
  assert.equal(soCumprimento("Boa noite! Seja bem-vindo(a) à Gêmeos Motors 😊 Com quem eu falo?"), "Boa noite!");
  assert.equal(soCumprimento("Boa noitee! Tudo certinho?"), "Boa noitee! Tudo certinho?");
  assert.equal(soCumprimento("Boa tarde! Aqui é a Gêmeos Motors."), "Boa tarde!");
});
test("emoji solto no começo da mensagem sai; o do meio fica", () => {
  assert.equal(tirarEmojiDoInicio("😊 Para te ajudar a escolher, me conta"), "Para te ajudar a escolher, me conta");
  assert.equal(tirarEmojiDoInicio("A M6 é ótima 😊"), "A M6 é ótima 😊");
});

import { corrigirCumprimento } from "../../lib/ia/horario.ts";
test("cumprimento com letra a mais ('Boa tardea') também é corrigido para o horário", () => {
  const manha = new Date("2026-09-27T11:45:00Z"); // 08:45 em Recife
  assert.equal(corrigirCumprimento("Boa tardea! Tudo certinho?", manha), "Bom dia! Tudo certinho?");
});

import { quebrarEmBlocos } from "../../lib/ia/workflow/util.ts";
test("mensagem longa: preço com milhar nunca é partido e a lista fica inteira", () => {
  const t = "Perfeito, Tati! Para 20 km por dia, estas são ótimas opções:\n• *AG08*: R$ 8.990 — autonomia de 40 a 45 km, pronta entrega\n• *MM3*: R$ 10.500 — autonomia de 45 a 55 km\nA AG08 tem a pronta entrega e é ideal para o seu trajeto. Ela é econômica e não precisa de CNH. Qual cor você prefere?";
  const b = quebrarEmBlocos(t, 3);
  assert.ok(b.every((x) => !/^\d/.test(x)), JSON.stringify(b));
  assert.ok(b.some((x) => x.includes("R$ 8.990") && x.includes("R$ 10.500")), JSON.stringify(b));
  assert.equal(b.join(" ").includes("Perfeito, Tati!"), true);
});
