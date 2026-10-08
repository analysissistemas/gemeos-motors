/* Autonomia e velocidade só do catálogo (lib/ia/ficha-fatos.ts). Roda com `npm run test:ia`. */
import assert from "node:assert/strict";
import { test } from "node:test";
import { corrigirKmSemFonte } from "../../lib/ia/ficha-fatos.ts";

const FICHAS = [
  { nome: "X GÊMEOS", autonomia: null, velocidade: null, descricao: "Caixa de som integrada, sistema de ré, farol em LED e painel digital." },
  { nome: "T3 RETRÔ", autonomia: "60 a 70 km", velocidade: "32 km/h", descricao: null },
  { nome: "DF17", autonomia: "40 a 50 km", velocidade: null, descricao: null },
];

test("frase com km/km/h que a ficha não tem sai e entra a frase limpa (X GÊMEOS, 07/10/2026)", () => {
  assert.equal(
    corrigirKmSemFonte("Prazer, Pedro! A *X GÊMEOS* tem bateria de lítio removível 60V e anda até 45 km, com velocidade máxima de 32 km/h e motor forte de 1000 W.", FICHAS),
    "Prazer, Pedro! A autonomia e a velocidade da *X GÊMEOS* eu confirmo com a equipe.",
  );
  assert.equal(corrigirKmSemFonte("• *X GÊMEOS* (preto): autonomia aproximada de 45 km, por R$ 10.000", FICHAS), "A autonomia da *X GÊMEOS* eu confirmo com a equipe.");
});

test("km e km/h da ficha, conta de economia e frase com dois modelos ficam", () => {
  const ok = ["A *T3 RETRÔ* anda de 60 a 70 km com uma carga e chega a 32 km/h.", "A *DF17* anda até 50 km.", "Rodando 80 km por semana com a *T3 RETRÔ*, você economiza R$ 200.", "A *DF17* e a *T3 RETRÔ* andam até 70 km."];
  for (const t of ok) assert.equal(corrigirKmSemFonte(t, FICHAS), t, t);
});
