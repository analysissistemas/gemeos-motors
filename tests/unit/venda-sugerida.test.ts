/* Venda já preenchida com o que o cliente disse (dono, 15/10/2026). Roda com `npm run test:ia`. */
import assert from "node:assert/strict";
import { test } from "node:test";
import { escolherVeiculo, pagamentoDasObservacoes, pagamentoDoTexto } from "../../lib/venda-sugerida.ts";

const estoque = [
  { id: 1, modelo: "N2", versao: null, cor: "Verde", status: "reservado", valorAnunciado: 5890 },
  { id: 2, modelo: "N2", versao: null, cor: "Verde", status: "disponivel", valorAnunciado: 5890 },
  { id: 3, modelo: "N2", versao: null, cor: "Preta", status: "disponivel", valorAnunciado: 5890 },
  { id: 4, modelo: "DF17", versao: null, cor: "Bege", status: "disponivel", valorAnunciado: 7190 },
  { id: 5, modelo: "Patinete 530W", versao: null, cor: "Preto", status: "disponivel", valorAnunciado: 3500 },
  { id: 6, modelo: "T3 RETRÔ", versao: null, cor: "Branca", status: "disponivel", valorAnunciado: 11000 },
];

test("escolhe a unidade do modelo e da cor que o cliente pediu, disponível primeiro", () => {
  assert.equal(escolherVeiculo(estoque, "N2 Verde")?.id, 2);
  assert.equal(escolherVeiculo(estoque, "quero a n2 preta")?.id, 3);
  assert.equal(escolherVeiculo(estoque, "DF17 Bege")?.id, 4);
  assert.equal(escolherVeiculo(estoque, "Patinete 530W")?.id, 5);
  assert.equal(escolherVeiculo(estoque, "T3 Retro")?.id, 6);
  // sem cor: o primeiro disponível do modelo
  assert.equal(escolherVeiculo(estoque, "N2")?.id, 2);
  // nada no estoque / nada dito
  assert.equal(escolherVeiculo(estoque, "moto"), null);
  assert.equal(escolherVeiculo(estoque, null), null);
  assert.equal(escolherVeiculo(estoque, "DN2 azul"), null);
});

test("forma de pagamento do que o cliente disse", () => {
  assert.deepEqual(pagamentoDoTexto("18 vezes no elo"), { forma: "credito", observacao: "18x no Elo" });
  assert.deepEqual(pagamentoDoTexto("Seria no cartão"), { forma: "credito", observacao: null });
  assert.deepEqual(pagamentoDoTexto("10x"), { forma: "credito", observacao: "10x" });
  assert.deepEqual(pagamentoDoTexto("no pix"), { forma: "pix", observacao: null });
  assert.deepEqual(pagamentoDoTexto("débito"), { forma: "debito", observacao: null });
  assert.deepEqual(pagamentoDoTexto("quero financiar"), { forma: "financiamento", observacao: null });
  assert.equal(pagamentoDoTexto("a combinar"), null);
  assert.equal(pagamentoDoTexto(null), null);
});

test("pagamento anotado pela IA nas observações do negócio (o mais recente que não está a confirmar)", () => {
  const obs = "14/10 10:00 · Pedido pelo WhatsApp (IA): N2\nPagamento: pix\n\n15/10 11:00 · Pedido pelo WhatsApp (IA): N2\nPagamento: 12x no cartão\n\n15/10 12:00 · Pagamento: a confirmar";
  assert.equal(pagamentoDasObservacoes(obs), "12x no cartão");
  assert.equal(pagamentoDasObservacoes(null), null);
});
