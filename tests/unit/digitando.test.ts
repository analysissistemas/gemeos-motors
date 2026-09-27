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
