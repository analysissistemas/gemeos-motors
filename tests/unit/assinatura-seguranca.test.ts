import test from "node:test";
import assert from "node:assert/strict";
import { limitar } from "../../lib/limite.ts";
import { ipConfiavel } from "../../lib/ip.ts";

test("limitar bloqueia após o máximo e libera após a janela", () => {
  assert.equal(limitar("t", 2, 1000, 0), true);
  assert.equal(limitar("t", 2, 1000, 1), true);
  assert.equal(limitar("t", 2, 1000, 2), false);
  assert.equal(limitar("t", 2, 1000, 2000), true);
});

test("ipConfiavel ignora x-forwarded-for forjado", () => {
  const h = (o: Record<string, string>) => ({ get: (n: string) => o[n] ?? null });
  assert.equal(ipConfiavel(h({ "x-forwarded-for": "1.2.3.4" })), null);
  assert.equal(ipConfiavel(h({ "x-real-ip": "9.9.9.9", "x-forwarded-for": "1.2.3.4" })), "9.9.9.9");
});
