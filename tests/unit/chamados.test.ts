/* Chamados de melhoria e relatório do dia (dono, 15/10/2026). Regras puras. Roda com `npm run test:ia`. */
import assert from "node:assert/strict";
import { test } from "node:test";
import { aplicaSozinho, comRegra, faltaParaAprovar, juntarEvidencias, montarRelatorio, semRegra, type FichaDoDia } from "../../lib/ia/chamados-regras.ts";
import type { FichaConversa } from "../../lib/ia/analista-regras.ts";

test("só resposta e regra da IA se aplicam sozinhas", () => {
  assert.equal(aplicaSozinho("base_conhecimento"), true);
  assert.equal(aplicaSozinho("regra_ia"), true);
  assert.equal(aplicaSozinho("plano_acao"), false);
});

test("não aprova com [PREENCHER] nem com campo vazio", () => {
  assert.match(faltaParaAprovar("base_conhecimento", { categoria: "Entrega", titulo: "Entrega em Itaquitinga?", conteudo: "Sim, entregamos. Prazo: [PREENCHER: prazo]" })!, /PREENCHER/);
  assert.match(faltaParaAprovar("base_conhecimento", { categoria: "Entrega", titulo: "", conteudo: "Sim" })!, /Preencha/);
  assert.equal(faltaParaAprovar("base_conhecimento", { categoria: "Entrega", titulo: "Entrega em Itaquitinga?", conteudo: "Sim, entregamos em Itaquitinga." }), null);
  assert.match(faltaParaAprovar("regra_ia", { regra: "  " })!, /regra/);
  assert.equal(faltaParaAprovar("plano_acao", { acao: "Comprar 2 M6 vermelhas" }), null);
});

test("regra entra no fim do setor uma vez só e sai sem mexer no resto", () => {
  const atual = "Nunca invente preço.\nNunca peça senha.";
  const r = "Não repita que o produto está em falta depois que o cliente já entendeu.";
  const com = comRegra(atual, `  ${r}  `);
  assert.equal(com, `${atual}\n${r}`);
  assert.equal(comRegra(com, r), com, "não repete");
  // o dono editou outra regra depois: desfazer tira só a do chamado
  const editado = com.replace("Nunca peça senha.", "Nunca peça senha nem código do cartão.");
  assert.equal(semRegra(editado, r), "Nunca invente preço.\nNunca peça senha nem código do cartão.");
});

test("provas não se repetem e contam clientes diferentes", () => {
  const e = (conversaId: number, mensagemId: number) => ({ conversaId, dia: "2026-10-15", mensagemId, trecho: "x", contato: null });
  const j = juntarEvidencias([e(1, 10)], [e(1, 10), e(1, 11), e(2, 20)]);
  assert.equal(j.evidencias.length, 3);
  assert.equal(j.clientes, 2);
});

const ficha = (x: Partial<FichaConversa>): FichaConversa => ({
  resumo: "r",
  assunto: "compra",
  modeloInteresse: null,
  formaPagamento: null,
  usoDeclarado: null,
  cidade: null,
  temperatura: "morno",
  resultado: "em_aberto",
  objecoes: [],
  concorrentes: [],
  perguntasSemResposta: [],
  errosIa: [],
  errosEquipe: [],
  acertos: [],
  ondeTravou: null,
  nota: 7,
  notaMotivo: "ok",
  sugestoes: [],
  lacunas: [],
  ...x,
});
const met = { msgsCliente: 1, msgsIa: 1, msgsEquipe: 0, primeiraRespostaMin: 2, maiorEsperaMin: 10, maiorEsperaEquipeMin: null, terminouSemResposta: false };

test("relatório soma só o que está nas fichas; não-cliente fica fora da nota e das listas", () => {
  const fichas: FichaDoDia[] = [
    { conversaId: 1, contato: "Elton Manoel", metricas: met, ficha: ficha({ modeloInteresse: "triciclo", nota: 7, objecoes: [{ tipo: "preco", descricao: "caro", mensagemId: 1 }], perguntasSemResposta: [{ pergunta: "Tem banquinho?", mensagemId: 2 }] }) },
    { conversaId: 2, contato: "Beatriz", metricas: { ...met, primeiraRespostaMin: 6, maiorEsperaMin: 120, terminouSemResposta: true }, ficha: ficha({ modeloInteresse: "DF17", nota: 4, notaMotivo: "demorou", resultado: "comprou", temperatura: "quente", objecoes: [{ tipo: "preco", descricao: "achou caro", mensagemId: 3 }, { tipo: "parcela", descricao: "18x", mensagemId: 4 }] }) },
    { conversaId: 3, contato: "TIM", metricas: { ...met, terminouSemResposta: true }, ficha: ficha({ assunto: "nao_cliente", nota: null, resultado: "nao_e_venda" }) },
  ];
  const r = montarRelatorio(fichas);
  assert.equal(r.conversas, 3);
  assert.equal(r.naoClientes, 1);
  assert.equal(r.compraram, 1);
  assert.equal(r.quentes, 1);
  assert.equal(r.notaMedia, 5.5);
  assert.deepEqual(r.notasBaixas.map((n) => n.contato), ["Beatriz"]);
  assert.equal(r.primeiraRespostaMediaMin, 3.3);
  assert.equal(r.maiorEsperaMin, 120);
  assert.deepEqual(r.semRespostaNoFim.map((n) => n.conversaId), [2], "a TIM não entra");
  assert.deepEqual(r.objecoes.map((o) => [o.rotulo, o.total]), [["Preço", 2], ["Parcela / cartão", 1]]);
  assert.deepEqual(r.perguntasSemResposta.map((p) => p.texto), ["Tem banquinho?"]);
});

test("dia sem fichas: tudo vazio, nada de número inventado", () => {
  const r = montarRelatorio([]);
  assert.equal(r.conversas, 0);
  assert.equal(r.notaMedia, null);
  assert.equal(r.primeiraRespostaMediaMin, null);
  assert.equal(r.maiorEsperaMin, null);
});

test("número da resposta que não está na conversa é apontado", async () => {
  const { numerosSemProva } = await import("../../lib/ia/chamados-regras.ts");
  const contexto = "CLIENTE: no cartão fica o mesmo valor? | EQUIPE: no cartão de crédito tem a taxa da maquininha, à vista sai R$ 5.890";
  assert.deepEqual(numerosSemProva("À vista sai R$ 5.890; no cartão tem a taxa da maquininha.", contexto), []);
  assert.deepEqual(numerosSemProva("Pode parcelar em até 21 vezes, à vista R$ 5.890.", contexto), ["21"]);
});
