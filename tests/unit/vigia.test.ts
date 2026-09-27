/* Vigia do atendente: quando avisar, quando a IA assume e quando responde com a loja fechada. */
import assert from "node:assert/strict";
import { test } from "node:test";
import { decidirVigia, tokenDoVigia } from "../../lib/ia/workflow/vigia-regra.ts";

const base = { esperaMin: 0, lojaAberta: true, iaPodeResponder: true, avisoMin: 5, assumeMin: 15, jaAvisado: false, jaRespondidaFechada: false };

test("loja aberta: antes de 5 min nada; aos 5 min avisa uma vez", () => {
  assert.equal(decidirVigia({ ...base, esperaMin: 4 }), "nada");
  assert.equal(decidirVigia({ ...base, esperaMin: 6 }), "avisar");
  assert.equal(decidirVigia({ ...base, esperaMin: 6, jaAvisado: true }), "nada");
});

test("loja aberta: aos 15 min a IA assume; com IA desligada só avisa", () => {
  assert.equal(decidirVigia({ ...base, esperaMin: 16, jaAvisado: true }), "assumir");
  assert.equal(decidirVigia({ ...base, esperaMin: 16, iaPodeResponder: false }), "avisar");
  assert.equal(decidirVigia({ ...base, esperaMin: 16, iaPodeResponder: false, jaAvisado: true }), "nada");
});

test("IA assume = 0 significa nunca assumir", () => {
  assert.equal(decidirVigia({ ...base, esperaMin: 200, assumeMin: 0, jaAvisado: true }), "nada");
});

test("loja fechada: a IA responde na hora, uma vez por mensagem; desligada, nada", () => {
  assert.equal(decidirVigia({ ...base, lojaAberta: false, esperaMin: 0 }), "responder_fechada");
  assert.equal(decidirVigia({ ...base, lojaAberta: false, jaRespondidaFechada: true }), "nada");
  assert.equal(decidirVigia({ ...base, lojaAberta: false, iaPodeResponder: false }), "nada");
});

test("token da rota interna depende do segredo", async () => {
  assert.equal(await tokenDoVigia("a"), await tokenDoVigia("a"));
  assert.notEqual(await tokenDoVigia("a"), await tokenDoVigia("b"));
});

test("vigia: cliente sem resposta ganha nova tentativa da IA, em qualquer horário, até 3 vezes", async () => {
  const { decidirNovaTentativa } = await import("../../lib/ia/workflow/vigia-regra.ts");
  const b = { iaPodeResponder: true, esperaMin: 5, tentativas: 0, minDesdeTentativa: null };
  assert.equal(decidirNovaTentativa({ ...b, esperaMin: 1 }), false);
  assert.equal(decidirNovaTentativa(b), true);
  assert.equal(decidirNovaTentativa({ ...b, tentativas: 1, minDesdeTentativa: 1 }), false);
  assert.equal(decidirNovaTentativa({ ...b, tentativas: 1, minDesdeTentativa: 3 }), true);
  assert.equal(decidirNovaTentativa({ ...b, tentativas: 3, minDesdeTentativa: 10 }), false);
  assert.equal(decidirNovaTentativa({ ...b, iaPodeResponder: false }), false);
});
