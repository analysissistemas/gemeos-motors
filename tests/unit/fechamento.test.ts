/* Condução até o fechamento (lib/ia/fechamento.ts), pedido do dono em 03/10/2026: "o que está faltando
   para concluirmos a sua compra?", objeção de preço vira economia, decidido ganha parabéns e
   "retirar ou entrega?", e os dados vão para o vendedor confirmar. */
import assert from "node:assert/strict";
import { test } from "node:test";
import { detectarMomento, instrucaoDeFechamento, listaDeDados, parabens, RX_PARABENS, textoDadosRecebidos } from "../../lib/ia/fechamento.ts";

const m = (textoCliente: string, ultimaDaLoja = "", conheceModelo = true) => detectarMomento({ textoCliente, ultimaDaLoja, conheceModelo });

test("interesse: cita o modelo e fala em comprar ou preço", () => {
  assert.equal(m("Quero comprar uma moto. Quanto custa a AG08?"), "interesse");
  assert.equal(m("Vi no site a Tank, tenho interesse"), "interesse");
  assert.equal(m("a T1 está disponível?"), "interesse");
  /* sem modelo conhecido ainda não é momento de fechamento */
  assert.equal(m("quero comprar uma moto", "", false), null);
});

test("decidido: vou querer, fechado, quero essa", () => {
  for (const t of ["Vou querer a AG08", "fechado!", "quero essa", "pode fechar", "como faço pra comprar?"]) assert.equal(m(t), "decidido", t);
});

test("objeção de preço e outras dúvidas", () => {
  for (const t of ["achei caro", "tá muito salgado", "tem desconto?", "não tenho esse dinheiro agora"]) assert.equal(m(t), "objecao_preco", t);
  for (const t of ["vou pensar", "vou falar com minha esposa", "não sei ainda", "tô em dúvida"]) assert.equal(m(t), "objecao", t);
  /* "cara" como gíria não é objeção */
  assert.notEqual(m("cara, quero essa"), "objecao_preco");
});

test("respondeu 'retirar ou entrega?'", () => {
  const pergunta = "Você prefere retirar aqui na loja ou receber por entrega? 😊";
  assert.equal(m("Entrega, moro em Goiana", pergunta), "escolheu_entrega");
  assert.equal(m("prefiro buscar aí", pergunta), "escolheu_retirada");
  assert.equal(m("vou aí retirar", pergunta), "escolheu_retirada");
  /* sem a pergunta, "vocês entregam?" é dúvida, não escolha */
  assert.notEqual(m("vocês entregam?"), "escolheu_entrega");
});

test("mandou os dados: com CPF passa ao vendedor; sem CPF, pede o que falta", () => {
  const lista = listaDeDados("entrega", {});
  assert.equal(m("Carlos Silva\n123.456.789-09\nRua das Flores 120", lista), "mandou_dados");
  assert.equal(m("Carlos Silva\nRua das Flores 120\nCentro", lista), "dados_parciais");
});

test("lista de dados: a do Milton, sem o que o cliente já disse; retirada sem endereço", () => {
  const entrega = listaDeDados("entrega", { cidade: "Goiana", pagamento: "pix" });
  assert.match(entrega, /• Nome completo[\s\S]*• CPF[\s\S]*• Data de nascimento[\s\S]*• Ponto de referência/);
  assert.doesNotMatch(entrega, /• Cidade|• Forma de pagamento/);
  assert.match(listaDeDados("entrega", { cidade: "Itambé" }), /equipe confirma se atende/);
  const retirada = listaDeDados("retirada", {});
  assert.match(retirada, /• CPF/);
  assert.doesNotMatch(retirada, /CEP|Rua|Bairro/);
});

test("textos prontos: parabéns, dados recebidos sem prometer conclusão", () => {
  assert.ok(parabens("AG08").every((p) => RX_PARABENS.test(p) && p.includes("AG08")));
  assert.doesNotMatch(textoDadosRecebidos(true) + textoDadosRecebidos(false), /conclu[ií]d|reservad|separad/);
  assert.match(instrucaoDeFechamento("objecao_preco", "AG08"), /Não ofereça desconto/);
  assert.match(instrucaoDeFechamento("interesse", "AG08"), /O que está faltando para concluirmos/);
  assert.equal(instrucaoDeFechamento(null, null), "");
});
