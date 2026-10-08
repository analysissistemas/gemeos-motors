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

test("saudação que trouxe conteúdo fica só com o cumprimento", () => {
  assert.equal(soCumprimento("Bom dia! Aqui na Gêmeos Motors, pagar à vista no Pix não tem taxa. 🙂!"), "Bom dia!");
  assert.equal(soCumprimento("Oii, boa tardee! Tudo certinho? 😊"), "Oii, boa tardee! Tudo certinho? 😊");
});

test("proposta: cor no feminino e pagamento escrito pelo cliente", async () => {
  const { corNoTexto, pagamentoDoTexto } = await import("../../lib/ia/workflow/util.ts");
  assert.equal(corNoTexto("Preto", "quero a ag08 preta"), true);
  assert.equal(corNoTexto("Branco perolado", "a branca perolada"), true);
  assert.equal(corNoTexto("Azul", "azul"), true);
  assert.equal(corNoTexto("Preto", "pretinho"), false);
  assert.equal(pagamentoDoTexto("pago no pix"), "Pix");
  assert.equal(pagamentoDoTexto("vou financiar"), "Financiamento");
  assert.equal(pagamentoDoTexto("quero a preta"), null);
});

test("proposta: a cor concorda com moto", async () => {
  const { corDaMoto } = await import("../../lib/ia/workflow/util.ts");
  assert.equal(corDaMoto("Preto"), "preta");
  assert.equal(corDaMoto("Branco perolado"), "branca perolada");
  assert.equal(corDaMoto("Azul marinho"), "azul marinho");
  assert.equal(corDaMoto("Cinza"), "cinza");
});

test("nome do cliente: só o primeiro nome, bem escrito", async () => {
  const { primeiroNome } = await import("../../lib/ia/workflow/util.ts");
  assert.equal(primeiroNome("carla souza"), "Carla");
  assert.equal(primeiroNome("JOÃO"), "João");
  assert.equal(primeiroNome("😊"), null);
  assert.equal(primeiroNome(null), null);
});

test("variar: escolhe uma das frases e nunca sai da lista", async () => {
  const { variar, RX_PERGUNTA_NOME } = await import("../../lib/ia/workflow/util.ts");
  const l = ["a", "b", "c"];
  assert.equal(variar(l, 0), "a");
  assert.equal(variar(l, 0.5), "b");
  assert.equal(variar(l, 0.9999), "c");
  assert.equal(variar(l, 1), "c");
  for (const p of ["Com quem eu falo?", "Qual é o seu nome?", "Como posso te chamar?"]) assert.ok(RX_PERGUNTA_NOME.test(p), p);
});

test("pergunta se é robô: a apresentação fica (é a resposta), só o cumprimento sai", async () => {
  const { tirarCumprimentoRepetido } = await import("../../lib/ia/workflow/util.ts");
  assert.equal(tirarCumprimentoRepetido("Boa tarde! Sou o assistente virtual da Gêmeos Motors 😊", true), "Sou o assistente virtual da Gêmeos Motors 😊");
  assert.equal(tirarCumprimentoRepetido("Boa tarde! Sou o assistente virtual da Gêmeos Motors. Posso ajudar?"), "Posso ajudar?");
});

test("fase 2: nome do perfil do WhatsApp só quando parece nome de pessoa", async () => {
  const { nomeDoPerfil, saudacaoComNome, tirarCumprimentoRepetido } = await import("../../lib/ia/workflow/util.ts");
  assert.equal(nomeDoPerfil("Carla Souza"), "Carla Souza");
  for (const p of ["💕Lu💕", "Loja do Zé", "João 81 9999", "", null, "Gêmeos Motos Peças", "a"]) assert.equal(nomeDoPerfil(p), null, String(p));
  assert.equal(saudacaoComNome("Boa tarde! Tudo certinho? 😊", "Carla"), "Boa tarde, Carla! Tudo certinho? 😊");
  assert.equal(saudacaoComNome("Booa noitee! Tudo bem?", "Rui"), "Booa noitee, Rui! Tudo bem?");
  assert.equal(saudacaoComNome("Boa tarde, Carla!", "Carla"), "Boa tarde, Carla!");
  assert.equal(saudacaoComNome("Boa tarde!", null), "Boa tarde!");
  /* a apresentação do Milton vai no cumprimento: na resposta ela sai */
  assert.equal(tirarCumprimentoRepetido("Boa noite! Me chamo Milton, sou da Gêmeos Motors 😊 A T1 custa R$ 12.000."), "A T1 custa R$ 12.000.");
  assert.equal(tirarCumprimentoRepetido("Sou o Milton, da Gêmeos Motors! A AG08 tem ré."), "A AG08 tem ré.");
  /* perguntou se é robô: a apresentação é a resposta */
  assert.equal(tirarCumprimentoRepetido("Boa noite! Sou o Milton, assistente virtual da Gêmeos Motors, e vou te ajudar por aqui!", true), "Sou o Milton, assistente virtual da Gêmeos Motors, e vou te ajudar por aqui!");
});

test("sem balão repetido nem a pergunta repetida da mensagem anterior (Arine, 06/10/2026)", async () => {
  const { semRepeticao } = await import("../../lib/ia/workflow/util.ts");
  const t3 = "• *T3 RETRÔ* (branca): R$ 9.990. Anda até 70 km com uma carga.";
  assert.deepEqual(semRepeticao([t3, "• *T5 RETRÔ* (verde): R$ 11.000.", t3]), [t3, "• *T5 RETRÔ* (verde): R$ 11.000."]);
  assert.deepEqual(semRepeticao(["A AG08 custa R$ 8.999,90.", "Qual dessas você quer conhecer melhor? 😊"], "Temos DF17 e AG08.\nQual dessas você quer conhecer melhor? 😊"), ["A AG08 custa R$ 8.999,90."]);
  assert.deepEqual(semRepeticao(["Oi!", "Quer saber mais?"], "Temos a T1."), ["Oi!", "Quer saber mais?"]);
});

test("o nome é perguntado de novo depois de 2 mensagens sem resposta, no máximo 3 vezes (07/10/2026)", async () => {
  const { deveRepetirPerguntaDoNome } = await import("../../lib/ia/workflow/util.ts");
  const perguntou = "Agente IA: Boa tarde! Me chamo Milton. Com quem eu falo? 😊";
  /* o histórico não traz a mensagem que acabou de chegar: ela conta como mais uma */
  assert.equal(deveRepetirPerguntaDoNome(perguntou), false);
  assert.equal(deveRepetirPerguntaDoNome([perguntou, "Lead: quanto custa a T1?", "Agente IA: A T1 custa R$ 12.000."].join("\n\n")), true);
  const tresVezes = [perguntou, "Lead: a", "Lead: b", "Agente IA: Qual é o seu nome? 😊", "Lead: c", "Lead: d", "Agente IA: Como posso te chamar? 😊", "Lead: e", "Lead: f"].join("\n\n");
  assert.equal(deveRepetirPerguntaDoNome(tresVezes), false);
  assert.equal(deveRepetirPerguntaDoNome("Lead: oi\n\nLead: tudo bem"), false);
});
