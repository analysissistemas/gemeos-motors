/* Prioridade do follow-up da equipe (dono, 15/10/2026). Roda com `npm run test:ia`. */
import assert from "node:assert/strict";
import { test } from "node:test";
import { prioridadeDoFollowUp } from "../../lib/followup-prioridade.ts";

test("quente, negociando e esperando a loja vem primeiro; novo contato parado há 9 dias fica por último", () => {
  const quente = prioridadeDoFollowUp({ etapa: "negociando", intencao: "alta", tipo: "simulacao", clienteEsperando: true, horasDesdeCliente: 30 });
  const parado = prioridadeDoFollowUp({ etapa: "whatsapp", intencao: "baixa", tipo: null, clienteEsperando: false, horasDesdeCliente: 9 * 24 });
  assert.equal(quente.nivel, "alta");
  assert.equal(parado.nivel, "baixa");
  assert.ok(quente.pontos > parado.pontos);
  assert.deepEqual(quente.motivos.map((m) => m.texto), ["Lead quente", "Negociando", "Pediu simulação", "Esperando a loja há 1 dia"]);
  assert.deepEqual(parado.motivos.map((m) => m.texto), ["Novo contato", "Sem falar com a loja há 9 dias"]);
});

test("morno interessado fica no meio", () => {
  assert.equal(prioridadeDoFollowUp({ etapa: "interessado", intencao: "media", tipo: null, clienteEsperando: false, horasDesdeCliente: 20 }).nivel, "media");
});
