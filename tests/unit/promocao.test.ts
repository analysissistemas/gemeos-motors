import assert from "node:assert/strict";
import { test } from "node:test";
import { formatarRestante, precoVigente } from "../../lib/promocao.ts";

const P = { precoPromocional: 9000, inicioEm: new Date("2026-10-01T12:00:00Z"), fimEm: new Date("2026-10-05T12:00:00Z"), ativo: true };

test("dentro da janela vale o preço promocional e mostra o tempo restante", () => {
  const r = precoVigente(10000, P, new Date("2026-10-03T09:00:00Z"));
  assert.equal(r.preco, 9000);
  assert.equal(r.emPromocao, true);
  assert.equal(r.restanteMs, 51 * 3600_000);
});
test("antes do início e depois do fim o preço é o normal (volta sozinho)", () => {
  assert.equal(precoVigente(10000, P, new Date("2026-09-30T00:00:00Z")).preco, 10000);
  assert.equal(precoVigente(10000, P, new Date("2026-10-05T12:00:00Z")).preco, 10000); // no instante do fim já acabou
  assert.equal(precoVigente(10000, P, new Date("2026-10-06T00:00:00Z")).emPromocao, false);
});
test("promoção encerrada à mão ou com preço maior que o normal é ignorada", () => {
  assert.equal(precoVigente(10000, { ...P, ativo: false }, new Date("2026-10-03T00:00:00Z")).preco, 10000);
  assert.equal(precoVigente(8000, P, new Date("2026-10-03T00:00:00Z")).preco, 8000);
});
test("sem promoção e sem preço normal não inventa valor", () => {
  assert.equal(precoVigente(null, null).preco, null);
});
test("formato do tempo restante", () => {
  assert.equal(formatarRestante(51 * 3600_000 + 10 * 60_000), "2d 03h 10min");
  assert.equal(formatarRestante(3 * 3600_000 + 5 * 60_000), "03h 05min");
  assert.equal(formatarRestante(9 * 60_000), "9min");
});
