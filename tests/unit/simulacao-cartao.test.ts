import { test } from "node:test";
import assert from "node:assert/strict";
import { simularCartao, TAXAS_ELO, TAXAS_VISA_MASTER } from "../../lib/ia/simulacao-cartao.ts";
import { textoSimulacaoPronta, textoSimulacaoConsultar } from "../../lib/ia/fechamento.ts";

test("tabelas do dono: 20 faixas (2x a 21x) em cada uma", () => {
  assert.equal(Object.keys(TAXAS_ELO).length, 20);
  assert.equal(Object.keys(TAXAS_VISA_MASTER).length, 20);
  assert.equal(TAXAS_ELO[21], 31);
  assert.equal(TAXAS_VISA_MASTER[2], 4.9);
});

test("Visa e Master usam a tabela das melhores taxas; Elo, a dela", () => {
  const v = simularCartao({ preco: 10000, parcelas: 12, bandeira: "Visa" });
  const e = simularCartao({ preco: 10000, parcelas: 12, bandeira: "Elo" });
  assert.ok(v.tipo === "ok" && e.tipo === "ok");
  if (v.tipo === "ok" && e.tipo === "ok") {
    assert.equal(v.taxa, 15);
    assert.equal(e.taxa, 20);
    assert.ok(v.total < e.total);
    assert.equal(v.parcela, Math.round((v.total / 12) * 100) / 100);
  }
});

test("1x não tem taxa", () => {
  const r = simularCartao({ preco: 8999.9, parcelas: 1, bandeira: "Mastercard" });
  assert.ok(r.tipo === "ok" && r.total === 8999.9 && r.taxa === 0);
});

test("Amex: até 12x calcula; acima, o vendedor consulta se o cartão permite", () => {
  assert.equal(simularCartao({ preco: 10000, parcelas: 12, bandeira: "American Express" }).tipo, "ok");
  const r = simularCartao({ preco: 10000, parcelas: 13, bandeira: "American Express" });
  assert.deepEqual(r, { tipo: "consultar", motivo: "amex_acima_12" });
});

test("bandeira sem tabela, acima de 21x e dados faltando não geram valor", () => {
  assert.deepEqual(simularCartao({ preco: 10000, parcelas: 6, bandeira: "Hipercard" }), { tipo: "consultar", motivo: "bandeira_sem_tabela" });
  assert.deepEqual(simularCartao({ preco: 10000, parcelas: 22, bandeira: "Visa" }), { tipo: "consultar", motivo: "parcelas_acima_de_21" });
  assert.deepEqual(simularCartao({ preco: null, parcelas: 6, bandeira: "Visa" }), { tipo: "consultar", motivo: "dados_incompletos" });
});

test("mensagem pronta: moto, à vista, parcela e total, sem prometer aprovação", () => {
  const t = textoSimulacaoPronta({ nome: "Rita", modelo: "T1", aVista: 10000, parcelas: 12, bandeira: "Visa", parcela: 958.33, total: 11500 });
  assert.match(t, /^Rita, fiz a simulação/);
  assert.match(t, /12 parcelas de R\$ 958,33/);
  assert.match(t, /R\$ 11\.500,00/);
  assert.doesNotMatch(t, /aprova/i);
  assert.match(textoSimulacaoConsultar({ motivo: "amex_acima_12", modelo: "T1" }), /American Express.*acima de 12 vezes/);
});

test("entrada: a taxa vale só sobre o que sobra; o valor é lido do texto", async () => {
  const { entradaDoTexto } = await import("../../lib/ia/simulacao-cartao.ts");
  assert.equal(entradaDoTexto("dou uma entrada de 3 mil e o resto em 12x no visa"), 3000);
  assert.equal(entradaDoTexto("entrada de R$ 2.500,50"), 2500.5);
  assert.equal(entradaDoTexto("posso dar 4000 de entrada"), 4000);
  assert.equal(entradaDoTexto("tem entrada?"), null);
  const r = simularCartao({ preco: 10000, parcelas: 10, bandeira: "Visa", entrada: 4000 });
  assert.ok(r.tipo === "ok");
  if (r.tipo === "ok") {
    assert.equal(r.total, 4000 + 6000 * 1.13);
    assert.equal(r.parcela, 678);
    assert.equal(r.entrada, 4000);
  }
  assert.equal(simularCartao({ preco: 10000, parcelas: 10, bandeira: "Visa", entrada: 10000 }).tipo, "consultar");
});
