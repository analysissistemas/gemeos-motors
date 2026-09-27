/* Texto da IA arrumado para o WhatsApp: só o formato muda, nunca o conteúdo. */
import assert from "node:assert/strict";
import { test } from "node:test";
import { organizarTexto } from "../../lib/ia/organizar.ts";

test("título e **negrito** de markdown viram o negrito do WhatsApp", () => {
  assert.equal(organizarTexto("## Modelos disponíveis\nA **AG08** custa **R$ 10.990**."), "*Modelos disponíveis*\nA *AG08* custa *R$ 10.990*.");
});

test("lista com hífen ou asterisco vira lista com bolinha", () => {
  assert.equal(organizarTexto("Temos:\n- AG08\n* M6\n– DF17"), "Temos:\n• AG08\n• M6\n• DF17");
});

test("negrito do WhatsApp no começo da linha não vira item de lista", () => {
  assert.equal(organizarTexto("*AG08* chegou!"), "*AG08* chegou!");
});

test("espaços e linhas em branco demais são limpos", () => {
  assert.equal(organizarTexto("Oi ,  tudo bem ?\n\n\n\nTemos sim.   "), "Oi, tudo bem?\n\nTemos sim.");
});

test("link em markdown fica só o texto", () => {
  assert.equal(organizarTexto("Veja [aqui](https://x.com/a) as fotos"), "Veja aqui as fotos");
});

test("texto já organizado não muda", () => {
  const ok = "Boa noite, Mariana! 😊\n\nA *AG08* está disponível:\n• Motor de 1000 W\n• Até 70 km de autonomia\n\nQuer agendar um test drive?";
  assert.equal(organizarTexto(ok), ok);
});
