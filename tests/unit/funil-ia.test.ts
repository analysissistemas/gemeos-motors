/* Funil conectado à IA (03/10/2026): a IA move o card só para frente e só nas colunas dela
   (Novo contato → Interessado → Visita / test drive → Aguardando equipe). */
import assert from "node:assert/strict";
import { test } from "node:test";
import { ETAPAS, ETAPAS_ABERTAS, ETAPAS_DA_IA, iaPodeAvancar } from "../../lib/dominio.ts";

test("as colunas do funil, na ordem combinada", () => {
  assert.deepEqual(ETAPAS.map((e) => e.rotulo), ["Novo contato", "Interessado", "Visita / test drive", "Aguardando equipe", "Proposta enviada", "Negociando / troca", "Venda fechada", "Venda perdida"]);
  assert.deepEqual(ETAPAS_DA_IA, ["whatsapp", "interessado", "visita", "equipe"]);
  for (const e of ETAPAS_DA_IA) assert.ok(ETAPAS_ABERTAS.includes(e), e);
});

test("a IA só anda para frente e só nas colunas dela", () => {
  assert.ok(iaPodeAvancar("whatsapp", "interessado"));
  assert.ok(iaPodeAvancar("whatsapp", "equipe"));
  assert.ok(iaPodeAvancar("interessado", "visita"));
  assert.ok(!iaPodeAvancar("visita", "interessado"), "não volta");
  assert.ok(!iaPodeAvancar("equipe", "equipe"), "não repete");
  /* card que a equipe levou adiante (ou fechou/perdeu) a IA não mexe */
  for (const atual of ["proposta", "negociando", "fechada", "perdida"]) assert.ok(!iaPodeAvancar(atual, "equipe"), atual);
  assert.ok(!iaPodeAvancar("whatsapp", "proposta"), "proposta é da equipe");
});
