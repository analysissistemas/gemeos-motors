/* Simulação de parcelas 100% do sistema (relatório "Taxas da maquineta" do dono, 10/10/2026). Roda com `npm run test:ia`.
   As taxas abaixo foram COPIADAS do relatório, de propósito separadas do código: se alguém mudar uma taxa do padrão por
   engano, este teste quebra. */
import assert from "node:assert/strict";
import { test } from "node:test";
import { errosDasTaxas, FAIXAS, normalizarTaxas, paraCima, simularCartao, tabelaCompleta, TAXAS_PADRAO } from "../../lib/ia/simulacao-cartao.ts";
import { decidirSimulacao } from "../../lib/ia/simulacao-fluxo.ts";
import { detectarMomento, PERGUNTA_PARCELAS, PERGUNTA_QUAL_MOTO, PERGUNTA_SO_BANDEIRA, simulacaoPedida, textoConsultaGerencia, textoPerguntaAmex, textoSimulacaoDebito } from "../../lib/ia/fechamento.ts";
import { validarResposta } from "../../lib/ia/validador.ts";

const RELATORIO_MASTER_VISA = "2x: 4,9% 3x: 6% 4x: 7% 5x: 8% 6x: 9,5% 7x: 10,5% 8x: 11,5% 9x: 13% 10x: 13% 11x: 14% 12x: 15% 13x: 17% 14x: 17% 15x: 19,5% 16x: 20% 17x: 20,5% 18x: 21% 19x: 23,5% 20x: 24% 21x: 25%";
const RELATORIO_ELO_AMEX = "2x: 7% 3x: 9% 4x: 11% 5x: 12% 6x: 13% 7x: 14% 8x: 16% 9x: 16,5% 10x: 17% 11x: 17,5% 12x: 20% 13x: 21% 14x: 21,5% 15x: 22,5% 16x: 25,5% 17x: 26,5% 18x: 27,5% 19x: 28,5% 20x: 29,5% 21x: 31%";
const lerRelatorio = (s: string) => Object.fromEntries([...s.matchAll(/(\d+)x: ([\d,]+)%/g)].map((m) => [Number(m[1]), Number(m[2].replace(",", "."))]));

test("as 40 taxas de crédito e as de débito são as do relatório de 10/10/2026", () => {
  assert.deepEqual(TAXAS_PADRAO.visaMaster, lerRelatorio(RELATORIO_MASTER_VISA));
  assert.deepEqual(TAXAS_PADRAO.eloAmex, lerRelatorio(RELATORIO_ELO_AMEX));
  assert.deepEqual(TAXAS_PADRAO.debito, { visaMaster: 1.5, eloAmex: 2 });
  assert.deepEqual(FAIXAS, Array.from({ length: 20 }, (_, i) => i + 2));
});

test("a conta: valor × (1 + taxa) ÷ parcelas, parcela para cima no centavo, total = parcela × vezes", () => {
  /* exemplo do dono: R$ 1.000 em 21x no Master, 25% → 1.250 ÷ 21 = 59,5238… → 59,53 (para cima, decisão de 10/10/2026) */
  const r = simularCartao({ preco: 1000, parcelas: 21, bandeira: "Mastercard" });
  assert.ok(r.tipo === "ok");
  if (r.tipo !== "ok") return;
  assert.equal(r.taxa, 25);
  assert.equal(r.parcela, 59.53);
  assert.equal(r.total, 1250.13);
  /* toda combinação: a parcela cobre o valor com taxa (a loja nunca perde) e passa dele menos de 1 centavo por parcela */
  for (const bandeira of ["Visa", "Mastercard", "Elo", "American Express"])
    for (const n of FAIXAS)
      for (const preco of [1000, 2200, 7190, 8999.9, 10000, 13490]) {
        const s = simularCartao({ preco, parcelas: n, bandeira, amexConfirmado: true });
        assert.ok(s.tipo === "ok", `${bandeira} ${n}x`);
        if (s.tipo !== "ok") continue;
        const comTaxa = preco * (1 + s.taxa / 100);
        assert.ok(s.parcela * n >= comTaxa - 1e-9, `${bandeira} ${n}x ${preco}: parcela abaixo`);
        assert.ok(s.parcela * n - comTaxa < n * 0.01 + 1e-9, `${bandeira} ${n}x ${preco}: parcela acima demais`);
        assert.equal(s.total, Math.round(s.parcela * n * 100) / 100);
      }
  assert.equal(paraCima(678), 678);
  /* 0,1 + 0,2 = 0,30000000000000004 no computador: ruído não vira centavo a mais */
  assert.equal(paraCima(0.1 + 0.2), 0.3);
  assert.equal(paraCima(10.001), 10.01);
});

test("débito: o cliente paga a taxa (Master/Visa 1,5%, Elo/Amex 2%)", () => {
  const v = simularCartao({ preco: 10000, parcelas: null, bandeira: "Visa", modalidade: "debito" });
  const a = simularCartao({ preco: 10000, parcelas: null, bandeira: "American Express", modalidade: "debito" });
  assert.ok(v.tipo === "ok" && v.total === 10150 && v.parcelas === 1);
  assert.ok(a.tipo === "ok" && a.total === 10200);
  assert.deepEqual(simularCartao({ preco: 10000, parcelas: null, bandeira: "Hipercard", modalidade: "debito" }), { tipo: "consultar", motivo: "bandeira_sem_tabela" });
});

test("Amex acima de 12x só com o cliente confirmando que o cartão permite", () => {
  assert.deepEqual(simularCartao({ preco: 10000, parcelas: 18, bandeira: "American Express" }), { tipo: "consultar", motivo: "amex_acima_12" });
  const r = simularCartao({ preco: 10000, parcelas: 18, bandeira: "American Express", amexConfirmado: true });
  assert.ok(r.tipo === "ok" && r.taxa === 27.5);
  assert.equal(tabelaCompleta({ preco: 10000, bandeira: "American Express", amexConfirmado: true }).length, 20);
});

test("taxas editadas na tela: a simulação usa as do banco; valor estranho volta ao relatório", () => {
  const editadas = normalizarTaxas({ ...TAXAS_PADRAO, visaMaster: { ...TAXAS_PADRAO.visaMaster, 12: 16 } });
  const r = simularCartao({ preco: 10000, parcelas: 12, bandeira: "Visa" }, editadas);
  assert.ok(r.tipo === "ok" && r.taxa === 16 && r.total === 11600.04);
  const estranhas = normalizarTaxas({ visaMaster: { 2: -1, 3: "abc", 4: 150 }, debito: { visaMaster: null } });
  assert.deepEqual(estranhas, TAXAS_PADRAO);
  assert.deepEqual(errosDasTaxas(TAXAS_PADRAO), []);
  assert.equal(errosDasTaxas({ ...TAXAS_PADRAO, debito: { visaMaster: 1.555, eloAmex: 100 } }).length, 2);
});

test("leitura do que o cliente escreveu: por extenso, sem 'x', várias opções e débito", () => {
  assert.deepEqual(simulacaoPedida("doze vezes no visa").todas, [12]);
  assert.deepEqual(simulacaoPedida("em vinte e uma parcelas no master").todas, [21]);
  assert.deepEqual(simulacaoPedida("quero parcelar em 10 no elo").todas, [10]);
  assert.deepEqual(simulacaoPedida("simula 12x ou 18x no visa").todas, [12, 18]);
  assert.equal(simulacaoPedida("passo no débito visa").debito, true);
  /* valor e porcentagem não são parcelas; "à vista, de uma vez" também não */
  assert.deepEqual(simulacaoPedida("dividir em 12 mil").todas, []);
  assert.deepEqual(simulacaoPedida("a moto de 7.190 dá pra pagar de uma vez?").todas, []);
});

const BASE = { ultimaDaLoja: "", recentesCliente: "", modelo: "DF17", preco: 7190, nome: "Rita" };
const d = (textoCliente: string, extra: Partial<typeof BASE> = {}) => decidirSimulacao({ ...BASE, ...extra, textoCliente });

test("fluxo: parcelas e bandeira → a conta sai pelo sistema, com o valor certo", () => {
  const r = d("12x no visa");
  assert.equal(r.acao, "enviar");
  assert.match(r.texto, /12 parcelas de R\$ 689,05/);
  assert.match(r.texto, /total de R\$ 8\.268,60/);
  assert.match(r.texto, /dinheiro ou Pix/);
  if (r.acao === "enviar") assert.match(r.registro, /taxa 15%/);
  /* várias quantidades na mesma mensagem */
  const v = d("me simula 12x ou 18x no master");
  assert.equal(v.acao, "enviar");
  assert.match(v.texto, /12x de R\$ 689,05/);
  /* 7190 × 1,21 ÷ 18 = 483,327… → 483,33 */
  assert.match(v.texto, /18x de R\$ 483,33 \(total R\$ 8\.699,94\)/);
});

test("fluxo: falta um dado → pergunta (nunca chuta)", () => {
  assert.deepEqual(d("quero simular", { modelo: null as never, preco: null as never }), { acao: "perguntar", texto: PERGUNTA_QUAL_MOTO });
  assert.deepEqual(d("quero simular"), { acao: "perguntar", texto: PERGUNTA_PARCELAS });
  assert.deepEqual(d("em 10 vezes"), { acao: "perguntar", texto: PERGUNTA_SO_BANDEIRA });
  assert.deepEqual(d("no débito"), { acao: "perguntar", texto: PERGUNTA_SO_BANDEIRA });
  /* acima de 21x: diz o limite e pergunta de novo */
  const r = d("30x no visa");
  assert.equal(r.acao, "perguntar");
  assert.match(r.texto, /até 21 vezes/);
  /* perguntou a moto e o cliente não disse: o vendedor faz */
  assert.equal(d("tanto faz", { modelo: null as never, preco: null as never, ultimaDaLoja: PERGUNTA_QUAL_MOTO }).acao, "vendedor");
});

test("fluxo: bandeira sem parcelas → tabela completa; parcelas ditas antes também valem", () => {
  const r = d("visa");
  assert.equal(r.acao, "enviar");
  assert.match(r.texto, /• 2x de/);
  assert.match(r.texto, /• 21x de/);
  const antes = d("visa", { recentesCliente: "Lead: dá pra fazer em 10 vezes?" });
  assert.match(antes.texto, /10 parcelas de/);
});

test("fluxo: débito com a bandeira", () => {
  const r = d("vou passar no débito master", { preco: 10000 });
  assert.equal(r.acao, "enviar");
  assert.match(r.texto, /No débito Mastercard: \*R\$ 10\.150,00\*/);
});

test("fluxo: Amex acima de 12x → pergunta; 'sim' calcula; 'não' manda até 12x", () => {
  const p = d("18x no amex");
  assert.deepEqual(p, { acao: "perguntar", texto: textoPerguntaAmex(18) });
  const sim = d("permite sim", { ultimaDaLoja: textoPerguntaAmex(18) });
  assert.equal(sim.acao, "enviar");
  assert.match(sim.texto, /18 parcelas de/);
  if (sim.acao === "enviar") assert.match(sim.registro, /cliente confirmou/);
  const nao = d("não permite", { ultimaDaLoja: textoPerguntaAmex(18) });
  assert.equal(nao.acao, "enviar");
  assert.match(nao.texto, /• 12x de/);
  assert.doesNotMatch(nao.texto, /• 13x de/);
  /* a pergunta do Amex faz o "sim" seguinte voltar para a simulação */
  assert.equal(detectarMomento({ textoCliente: "sim", ultimaDaLoja: textoPerguntaAmex(18), conheceModelo: true }), "pediu_simulacao");
});

test("fluxo: o que o vendedor faz (entrada sem valor, Hipercard)", () => {
  assert.equal(d("12x no visa com entrada").acao, "vendedor");
  assert.equal(d("12x no hipercard").acao, "vendedor");
  /* com o valor da entrada, a conta sai */
  const r = d("entrada de 2 mil e o resto em 10x no visa");
  assert.equal(r.acao, "enviar");
  assert.match(r.texto, /Entrada: R\$ 2\.000,00/);
});

test("não aceitou a simulação → consulta a gerência; 'vou de Pix' não é recusa", () => {
  const sim = d("12x no visa").texto;
  assert.equal(detectarMomento({ textoCliente: "ficou caro, não dá", ultimaDaLoja: sim, conheceModelo: true }), "recusou_simulacao");
  assert.equal(detectarMomento({ textoCliente: "achei alto o juros", ultimaDaLoja: sim, conheceModelo: true }), "recusou_simulacao");
  assert.notEqual(detectarMomento({ textoCliente: "não, vou pagar no pix", ultimaDaLoja: sim, conheceModelo: true }), "recusou_simulacao");
  assert.equal(detectarMomento({ textoCliente: "e em 18x?", ultimaDaLoja: sim, conheceModelo: true }) === "recusou_simulacao", false);
  assert.match(textoConsultaGerencia({ nome: "Rita", modelo: "DF17", aVista: 7190, lojaAberta: true }), /gerência/);
});

test("todos os textos da simulação passam no validador como texto do sistema", () => {
  const textos = [
    d("12x no visa").texto,
    d("visa").texto,
    d("me simula 12x ou 18x no master").texto,
    d("permite", { ultimaDaLoja: textoPerguntaAmex(18) }).texto,
    textoSimulacaoDebito({ nome: null, modelo: "DF17", aVista: 7190, bandeira: "Visa", total: 7297.85 }),
    textoPerguntaAmex(18),
    PERGUNTA_QUAL_MOTO,
    textoConsultaGerencia({ nome: null, modelo: "DF17", aVista: 7190, lojaAberta: false }),
  ];
  for (const t of textos)
    for (const b of t.split(/\n\n/)) assert.ok(validarResposta(b, { promptSistema: "", fontesAutorizadas: [t] }).aprovada, `${b.slice(0, 80)} → ${JSON.stringify(validarResposta(b, { promptSistema: "", fontesAutorizadas: [t] }).violacoes)}`);
});

test("'em 21' sem o x, respondendo 'em quantas vezes': calcula 21x, não manda a tabela inteira (Leandro, 11/10/2026)", () => {
  const base = { modelo: "M6", preco: 11900, nome: null };
  /* as duas mensagens no mesmo envio */
  assert.equal(detectarMomento({ textoCliente: "em 21\nvisa", ultimaDaLoja: PERGUNTA_PARCELAS, conheceModelo: true }), "pediu_simulacao");
  const juntas = decidirSimulacao({ ...base, textoCliente: "em 21\nvisa", recentesCliente: "", ultimaDaLoja: PERGUNTA_PARCELAS });
  assert.equal(juntas.acao, "enviar");
  assert.match(juntas.texto, /21 parcelas de R\$ 708,34/);
  assert.doesNotMatch(juntas.texto, /2x de/);
  /* "em 21" sozinho: pergunta só a bandeira; o "visa" seguinte calcula 21x */
  assert.equal(detectarMomento({ textoCliente: "em 21", ultimaDaLoja: PERGUNTA_PARCELAS, conheceModelo: true }), "pediu_simulacao");
  const so = decidirSimulacao({ ...base, textoCliente: "em 21", recentesCliente: "", ultimaDaLoja: PERGUNTA_PARCELAS });
  assert.deepEqual(so, { acao: "perguntar", texto: PERGUNTA_SO_BANDEIRA });
  const depois = decidirSimulacao({ ...base, textoCliente: "visa", recentesCliente: "em 21", ultimaDaLoja: PERGUNTA_SO_BANDEIRA });
  assert.match(depois.texto, /21 parcelas de R\$ 708,34/);
  /* número que não é parcela não conta, nem fora da pergunta */
  assert.equal(simulacaoPedida("em 21", false).parcelas, null);
  assert.equal(simulacaoPedida("dou 3 mil de entrada", true).parcelas, null);
  assert.equal(simulacaoPedida("passo aí em 2 dias", true).parcelas, null);
  assert.equal(simulacaoPedida("R$ 50", true).parcelas, null);
  assert.equal(simulacaoPedida("até 18 no master", true).parcelas, 18);
});
