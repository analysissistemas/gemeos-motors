/* Qualificação automática do lead: temperatura e triagem montadas pelos fatos que a IA aprendeu. */
import assert from "node:assert/strict";
import { test } from "node:test";
import { temTroca, temperaturaDaIntencao, temperaturaDoLead, triagemDosFatos } from "../../lib/ia/qualificacao.ts";

test("quente: sabe a moto e a forma de pagamento, ou pediu proposta", () => {
  assert.equal(temperaturaDoLead({ interesse: "M6", pagamento: "Pix" }), "quente");
  assert.equal(temperaturaDoLead({ nome: "Ana" }, { pediuProposta: true }), "quente");
});

test("morno: sabe a moto ou o uso; frio: o resto", () => {
  assert.equal(temperaturaDoLead({ interesse: "AG08" }), "morno");
  assert.equal(temperaturaDoLead({ uso: "entregas" }), "morno");
  assert.equal(temperaturaDoLead({ nome: "Ana", cidade: "Goiana" }), "frio");
  assert.equal(temperaturaDoLead({ interesse: "  ", pagamento: "Pix" }), "frio");
});

test("troca: 'não tenho' conta como sem troca", () => {
  assert.equal(temTroca("Não tenho"), false);
  assert.equal(temTroca("nenhuma"), false);
  assert.equal(temTroca("Uma Biz 2015"), true);
  assert.equal(temTroca(null), null);
});

test("triagem pelos fatos: intenção, dados coletados, o que falta e o que já existia", () => {
  const t = triagemDosFatos({ nome: "Ana", interesse: "M6", pagamento: "Pix", troca: "Biz 2015" }, "Quer a M6 no Pix", null);
  assert.equal(t.intencaoCompra, "alta");
  assert.equal(t.temTroca, true);
  assert.equal(t.trocaDescricao, "Biz 2015");
  assert.deepEqual(t.dadosColetados, ["nome", "moto de interesse", "forma de pagamento", "troca"]);
  assert.deepEqual(t.faltaPerguntar, ["uso", "cidade"]);
  const anterior = { ...t, prontoParaHumano: true, veiculo: "M6 branca" };
  const t2 = triagemDosFatos({ nome: "Ana" }, null, anterior);
  assert.equal(t2.prontoParaHumano, true);
  assert.equal(t2.veiculo, "M6 branca");
  assert.equal(t2.resumo, "Quer a M6 no Pix");
  assert.equal(t2.interesse, "M6");
  assert.equal(t2.intencaoCompra, "baixa");
});

test("intenção vira temperatura para a tela", () => {
  assert.equal(temperaturaDaIntencao("alta"), "quente");
  assert.equal(temperaturaDaIntencao("media"), "morno");
  assert.equal(temperaturaDaIntencao("indefinida"), null);
});
