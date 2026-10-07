/* Conversa real de 06/10/2026 (Arine): a IA mandou a T3 Retrô quando a cliente pediu a DF17 e a AG08, prometeu fotos que
   não vieram e seguiu insistindo até a cliente perceber que era atendimento virtual e desistir. Cada passo dela vira teste
   das peças que decidem foto, texto e reclamação. Roda com `npm run test:ia`. */
import assert from "node:assert/strict";
import { test } from "node:test";
import { pedidoDeMidia, planejarPedido, tirarPromessaDeOutras, type ModeloComMidia } from "../../lib/ia/midia-tipos.ts";
import { reclamouDoAtendimento } from "../../lib/ia/intencao.ts";

const m = (id: number, nome: string, cor: string, video = true): ModeloComMidia => ({ id, nome, fotos: [{ url: `/f/${id}.webp`, cor }], videoUrl: video ? `/v/${id}.mp4` : null });
const T3 = m(1, "T3 RETRÔ", "Branca");
const T5 = m(2, "T5 RETRÔ", "Verde");
const DF17 = m(3, "DF17", "Bege");
const AG08 = m(4, "AG08", "Cinza");
const MODELOS = [T3, T5, DF17, AG08];
const historico = "Lead: Queria foto, valor e autonomia. Vi uma retrô que achei bonita\nLead: T3 da pra duas pessoas?";
const listaDaLoja = "Aqui estão algumas opções mais em conta:\n• *DF17* (bege ou preta): R$ 7.190\n• *AG08* (cinza): R$ 8.999,90\nQual dessas você quer conhecer melhor?";
const nomes = (p: ReturnType<typeof planejarPedido>) => (p?.itens ?? []).map((i) => i.legenda.replace(/\*/g, "").split(" na cor")[0]);

test("Arine 15:47 — \"Me mostra uma opção mais em conta\" não é pedido de foto da T3", () => {
  assert.deepEqual(pedidoDeMidia("Me mostra uma opção mais em conta."), []);
});

test("Arine 15:48 — \"Me envia foto das duas opções\" manda DF17 e AG08, nunca a T3", () => {
  const p = planejarPedido({ modelos: MODELOS, textoCliente: "Me envia foto das duas opções", historicoCliente: historico, interesse: "T3 RETRÔ", ultimasDaLoja: listaDaLoja });
  assert.deepEqual(nomes(p), ["DF17", "AG08"]);
});

test("Arine 15:52 — \"Enviar foto dos modelos acima Df17 e Ag08\" manda as duas", () => {
  const p = planejarPedido({ modelos: MODELOS, textoCliente: "Enviar foto dos modelos acima Df17 e Ag08", historicoCliente: historico, interesse: "T3 RETRÔ", ultimasDaLoja: listaDaLoja });
  assert.deepEqual(nomes(p), ["DF17", "AG08"]);
});

test("Arine — o texto não promete foto de moto que não vai junto", () => {
  const todos = MODELOS.map((x) => x.nome);
  assert.equal(tirarPromessaDeOutras("Aqui estão as fotos da *DF17* e da *AG08*.", ["T3 RETRÔ"], todos), "");
  assert.equal(tirarPromessaDeOutras("Aqui estão as fotos da *DF17* e da *AG08*.", ["DF17", "AG08"], todos), "Aqui estão as fotos da *DF17* e da *AG08*.");
});

test("Arine 15:49–15:51 — reclamação vira atendimento humano", () => {
  for (const t of ["Não veio foto", "Só veio a foto da T3 retrô", "Acho que tô falando com atendente virtual. Depois passo aí pessoalmente"]) assert.ok(reclamouDoAtendimento(t), t);
  for (const t of ["Me envia foto das duas opções", "T3 da pra duas pessoas?", "Visa"]) assert.ok(!reclamouDoAtendimento(t), t);
});
