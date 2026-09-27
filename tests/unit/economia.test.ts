/* Conta de economia moto elétrica × gasolina: o sistema calcula (semana e mês), a IA só repete. */
import assert from "node:assert/strict";
import { test } from "node:test";
import { autonomiaMinima, kmPorSemana, lerParametrosEconomia, textoEconomia } from "../../lib/ia/economia.ts";

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

test("economia: quanto o cliente roda por semana", () => {
  assert.equal(kmPorSemana("uso pra trabalhar, uns 20 km por dia"), 140);
  assert.equal(kmPorSemana("rodo 150 km na semana"), 150);
  assert.equal(kmPorSemana("uns 600 km por mês"), 140);
  assert.equal(kmPorSemana("rodo 20km/dia. na verdade 30 km por dia"), 210);
  assert.equal(kmPorSemana("autonomia de 70 km"), null);
});

test("economia: conta do cliente na semana e no mês (AG08, 40 km por carga, 140 km por semana)", () => {
  const t = textoEconomia(40, lerParametrosEconomia(BASE)!, 140);
  /* semana: 3,5 cargas (R$ 7 a R$ 18) × 3,5 litros (R$ 24); mês: 15 cargas (R$ 30 a R$ 75) × 15 litros (R$ 102) */
  assert.match(t, /os mesmos 40 km numa moto a gasolina custam R\$ 6,77/);
  assert.match(t, /CONTA DO CLIENTE: 140 km por semana → na semana: luz R\$ 7 a R\$ 18 × gasolina R\$ 24 \(economiza de R\$ 6 a R\$ 17\); no mês: luz R\$ 30 a R\$ 75 × gasolina R\$ 102 \(economiza de R\$ 27 a R\$ 72\)/);
});

test("economia: sem saber o uso, vão os cenários de 100, 200 e 300 km por semana", () => {
  const t = textoEconomia(70, lerParametrosEconomia(BASE)!);
  assert.match(t, /100 km por semana → na semana:/);
  assert.match(t, /300 km por semana → na semana:/);
});
