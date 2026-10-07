/* Autonomia só do catálogo (lib/ia/ficha-fatos.ts). Roda com `npm run test:ia`. */
import assert from "node:assert/strict";
import { test } from "node:test";
import { corrigirKmSemFonte } from "../../lib/ia/ficha-fatos.ts";

const FICHAS = [
  { nome: "X GÊMEOS", autonomia: null, descricao: "Caixa de som integrada, sistema de ré, farol em LED e painel digital." },
  { nome: "T3 RETRÔ", autonomia: "60 a 70 km", descricao: null },
  { nome: "DF17", autonomia: "40 a 50 km", descricao: null },
];

test("km que a ficha não tem vira \"a confirmar\" (X GÊMEOS, 06/10/2026)", () => {
  assert.equal(corrigirKmSemFonte("• *X GÊMEOS* (preto): autonomia aproximada de 45 km, por R$ 10.000", FICHAS), "• *X GÊMEOS* (preto): autonomia a confirmar com a equipe, por R$ 10.000");
  assert.equal(corrigirKmSemFonte("A *T3 RETRÔ* anda até 90 km com uma carga.", FICHAS), "A *T3 RETRÔ* tem autonomia a confirmar com a equipe.");
});

test("km da ficha, conta de economia e frase com dois modelos ficam", () => {
  assert.equal(corrigirKmSemFonte("A *T3 RETRÔ* anda de 60 a 70 km com uma carga.", FICHAS), "A *T3 RETRÔ* anda de 60 a 70 km com uma carga.");
  assert.equal(corrigirKmSemFonte("A *DF17* anda até 50 km.", FICHAS), "A *DF17* anda até 50 km.");
  assert.equal(corrigirKmSemFonte("Rodando 80 km por semana com a *T3 RETRÔ*, você economiza R$ 200.", FICHAS), "Rodando 80 km por semana com a *T3 RETRÔ*, você economiza R$ 200.");
  assert.equal(corrigirKmSemFonte("A *DF17* e a *T3 RETRÔ* andam até 70 km.", FICHAS), "A *DF17* e a *T3 RETRÔ* andam até 70 km.");
});
