/* Conta de economia moto elétrica × gasolina: o sistema calcula, a IA só repete. */
import assert from "node:assert/strict";
import { test } from "node:test";
import { autonomiaMinima, lerParametrosEconomia, textoEconomia } from "../../lib/ia/economia.ts";

const BASE = [
  "Uma carga completa (de 0 a 100%) custa entre R$ 2 e R$ 5 na conta de luz, conforme o carregador.",
  "Preço da gasolina: R$ 6,77 o litro (média de Recife na ANP).\nMoto a gasolina de referência (160 cilindradas): 40 km por litro.",
];

test("economia: lê os números da base", () => {
  assert.deepEqual(lerParametrosEconomia(BASE), { gasolina: 6.77, kmPorLitro: 40, cargaMin: 2, cargaMax: 5 });
  assert.equal(lerParametrosEconomia([BASE[0]]), null);
});

test("economia: autonomia do lado seguro", () => {
  assert.equal(autonomiaMinima("40 a 45 km"), 40);
  assert.equal(autonomiaMinima("até 70 km"), 70);
  assert.equal(autonomiaMinima(null), null);
});

test("economia: conta pronta da AG08 (40 km)", () => {
  const t = textoEconomia(40, lerParametrosEconomia(BASE)!);
  /* 40 km: 1 litro de gasolina = R$ 6,77; 20 km/dia = 600 km/mês = 15 cargas (R$ 30 a R$ 75) × 15 litros (R$ 102) */
  assert.match(t, /os mesmos 40 km numa moto a gasolina custam R\$ 6,77/);
  assert.match(t, /20 km\/dia: luz R\$ 30 a R\$ 75 por mês × gasolina R\$ 102 por mês \(economia de R\$ 27 a R\$ 72 por mês\)/);
});
