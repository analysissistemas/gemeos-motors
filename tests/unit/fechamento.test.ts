/* Condução até o fechamento (lib/ia/fechamento.ts), pedido do dono em 03/10/2026: "o que está faltando
   para concluirmos a sua compra?", objeção de preço vira economia, decidido ganha parabéns e
   "retirar ou entrega?", e os dados vão para o vendedor confirmar. */
import assert from "node:assert/strict";
import { test } from "node:test";
import { validarResposta } from "../../lib/ia/validador.ts";
import { detectarMomento, instrucaoDeFechamento, listaDeDados, MOMENTOS_SEM_TRANSFERIR, notaDeEntrega, parabens, RX_PARABENS, RX_PEDE_PESSOA, pediuDadosDeRetirada, PERGUNTA_PARCELAS, PERGUNTA_TEM_MODELO, PERGUNTAS_ENTREGA_OU_RETIRADA, PERGUNTAS_FALTA, PERGUNTAS_KM, PERGUNTAS_VISITA, simulacaoPedida, textoDadosRecebidos, textoSimulacao, tirarPropostaAntiga, ultimaFalaDaLoja } from "../../lib/ia/fechamento.ts";

const m = (textoCliente: string, ultimaDaLoja = "", conheceModelo = true) => detectarMomento({ textoCliente, ultimaDaLoja, conheceModelo });

test("interesse: cita o modelo e fala em comprar ou preço", () => {
  assert.equal(m("Quero comprar uma moto. Quanto custa a AG08?"), "interesse");
  assert.equal(m("Vi no site a Tank, tenho interesse"), "interesse");
  assert.equal(m("a T1 está disponível?"), "interesse");
  /* sem modelo conhecido ainda não é momento de fechamento: o Milton pergunta se já tem modelo em mente */
  assert.equal(m("quero comprar uma moto", "", false), "sem_modelo");
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

test("respondeu os km depois do pedido da conta: a conta é do sistema e volta para o fechamento", () => {
  const pedido = "Me fala quantos km você roda por dia, mais ou menos, que eu faço a conta da sua economia 💰";
  assert.equal(m("rodo uns 20 km por dia", pedido), "informou_km");
  /* km sem o pedido da conta não é esse momento */
  assert.notEqual(m("rodo uns 20 km por dia", "Qual cor você prefere?"), "informou_km");
  assert.match(instrucaoDeFechamento("informou_km", "AG08"), /nunca faça conta/);
});

test("no meio do fechamento a IA não passa ao vendedor sozinha, a não ser que o cliente peça uma pessoa", () => {
  for (const mo of ["decidido", "escolheu_entrega", "escolheu_retirada", "dados_parciais"] as const) assert.ok(MOMENTOS_SEM_TRANSFERIR.includes(mo), mo);
  assert.ok(!MOMENTOS_SEM_TRANSFERIR.includes("mandou_dados"));
  assert.ok(RX_PEDE_PESSOA.test("quero falar com um atendente"));
  assert.ok(!RX_PEDE_PESSOA.test("entrega, moro em Goiana"));
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
  assert.match(listaDeDados("entrega", {}), /• Cidade e CEP/);
  assert.equal(notaDeEntrega("Itambé"), "Sobre a entrega em Itambé, a nossa equipe confirma se atende aí e te fala certinho 😊");
  assert.equal(notaDeEntrega("Goiana"), null);
  const retirada = listaDeDados("retirada", {});
  assert.match(retirada, /• CPF/);
  assert.doesNotMatch(retirada, /CEP|Rua|Bairro/);
});

test("textos prontos: parabéns, dados recebidos sem prometer conclusão", () => {
  assert.ok(parabens("AG08").every((p) => RX_PARABENS.test(p) && p.includes("AG08")));
  /* repasse humanizado: nome, moto e o próximo passo certo; nunca "compra concluída" nem "moto reservada" */
  const entrega = textoDadosRecebidos({ nome: "Carlos", modelo: "AG08", modo: "entrega", lojaAberta: true }, 0);
  assert.equal(entrega, "Perfeito, Carlos! Está tudo certinho ✅ Vou repassar seus dados pra minha equipe, que vai combinar com você o melhor horário pra entregar a sua *AG08* 🛵");
  const fechada = textoDadosRecebidos({ nome: "Carlos", modelo: "AG08", modo: "entrega", lojaAberta: false }, 0.9);
  assert.match(fechada, /^Show, Carlos!.*assim que a loja abrir.*melhor horário/);
  const retirada = textoDadosRecebidos({ nome: null, modelo: null, modo: "retirada", lojaAberta: true }, 0);
  assert.match(retirada, /^Perfeito! .*separação da sua moto e o horário que você vem buscar/);
  for (const s of [0, 0.9]) for (const aberta of [true, false]) for (const modo of ["entrega", "retirada"] as const)
    assert.doesNotMatch(textoDadosRecebidos({ nome: "Ana", modelo: "T1", modo, lojaAberta: aberta }, s), /conclu[ií]d|reservad|separad[ao] (pra|para) voc/);
  assert.ok(pediuDadosDeRetirada(listaDeDados("retirada", {})));
  assert.ok(!pediuDadosDeRetirada(listaDeDados("entrega", {})));
  assert.match(instrucaoDeFechamento("objecao_preco", "AG08"), /Não ofereça desconto/);
  assert.match(instrucaoDeFechamento("interesse", "AG08"), /O que está faltando para concluirmos/);
  assert.equal(instrucaoDeFechamento(null, null), "");
});

test("parcelamento: quer parcelar, depois parcelas e bandeira viram simulação para o vendedor", () => {
  assert.equal(m("dá pra parcelar?", "", true), "quer_parcelar");
  assert.equal(m("quero dividir no cartão", "", true), "quer_parcelar");
  const pergunta = "Em quantas vezes você gostaria de dividir? E qual é a bandeira do cartão? 😊";
  assert.equal(m("12x no Visa", pergunta), "pediu_simulacao");
  assert.equal(m("master", pergunta), "pediu_simulacao");
  /* com os dois numa mensagem só, mesmo sem a pergunta */
  assert.equal(m("quero parcelar em 10 vezes no elo"), "pediu_simulacao");
  assert.deepEqual(simulacaoPedida("12x no Visa"), { parcelas: 12, bandeira: "Visa" });
  assert.deepEqual(simulacaoPedida("em 10 vezes no mastercard"), { parcelas: 10, bandeira: "Mastercard" });
  assert.deepEqual(simulacaoPedida("hiper"), { parcelas: null, bandeira: "Hipercard" });
  const t = textoSimulacao({ parcelas: 12, bandeira: "Visa", modelo: "AG08" });
  assert.match(t, /^Perfeito! Já passei pro nosso vendedor fazer a simulação em 12 vezes no Visa pra \*AG08\*/);
  assert.doesNotMatch(t, /R\$|juros|taxa de/);
  assert.match(textoSimulacao({ parcelas: 30, bandeira: null, modelo: null }), /em até 21 vezes/);
});

test("mensagens do sistema passam no validador (teste de 04/10: 'Margem' do endereço e lista longa foram barradas)", () => {
  const visita = "Agendado ✅ Te esperamos segunda, 05/10, às 10h, Rafael, aqui na loja: Rodovia Margem da PE-75, nº 1418, Goiana — PE. A *T1* vai estar te esperando pro test drive 🛵";
  assert.deepEqual(validarResposta(visita).violacoes, []);
  for (const t of [listaDeDados("entrega", {}), listaDeDados("entrega", { cidade: "Itambé", pagamento: null }), listaDeDados("retirada", {}), notaDeEntrega("Itambé")!])
    assert.deepEqual(validarResposta(t).violacoes, [], t);
  /* "margem" de lucro continua barrada */
  assert.ok(validarResposta("Nossa margem nessa moto é pequena").violacoes.some((v) => v.regra === "interno"));
});

test("toda mensagem pronta do sistema passa no validador (teste de 04/10: '10x' foi barrado)", () => {
  const prontas = [
    ...[1, 5, 10, 12, 21, 30].flatMap((n) => [textoSimulacao({ parcelas: n, bandeira: "Visa", modelo: "T1" }), textoSimulacao({ parcelas: n, bandeira: null, modelo: null })]),
    ...[0, 0.9].flatMap((s) => (["entrega", "retirada"] as const).flatMap((modo) => [true, false].map((aberta) => textoDadosRecebidos({ nome: "Bruno", modelo: "T1", modo, lojaAberta: aberta }, s)))),
    ...parabens("T1"),
    ...parabens(null),
    PERGUNTA_PARCELAS,
    ...PERGUNTAS_FALTA,
    ...PERGUNTAS_ENTREGA_OU_RETIRADA,
    ...PERGUNTAS_KM,
    ...PERGUNTAS_VISITA,
  ];
  for (const t of prontas) assert.deepEqual(validarResposta(t).violacoes, [], t);
});

test("a última fala da loja junta os balões depois da última mensagem do cliente", () => {
  const h = "Lead: entrega, moro em Itambé\n\nAgente IA: Show! Para finalizar seu pedido, me manda por aqui:\n• Nome completo\n• CPF\n\nAgente IA: Sobre a entrega em Itambé, a nossa equipe confirma se atende aí";
  const fala = ultimaFalaDaLoja(h);
  assert.match(fala, /Nome completo/);
  assert.match(fala, /Itambé, a nossa equipe/);
  assert.doesNotMatch(fala, /moro em Itambé/);
  assert.equal(m("Bruno Souza\n529.982.247-25\nRua Projetada, 45", fala), "mandou_dados");
});

test("a proposta antiga sai da resposta da IA", () => {
  const r = tirarPropostaAntiga(["Perfeito, Bruno! Recebemos seus dados. Vou montar a proposta para você:", "*Proposta Gêmeos Motors*\n• Moto: T1\n• Entrega: Itambé e região", "Quer mais alguma coisa?"]);
  assert.deepEqual(r, ["Perfeito, Bruno! Recebemos seus dados.", "Quer mais alguma coisa?"]);
});

test("sem modelo: pediu opções (pesquisando) ou só quer comprar (pergunta se já tem modelo em mente)", () => {
  for (const t of ["quais motos vocês têm?", "quais são as mais baratas?", "tô pesquisando", "me mostra as opções"]) assert.equal(m(t, "", false), "pesquisando", t);
  assert.equal(m("quero comprar uma moto", "", false), "sem_modelo");
  assert.match(instrucaoDeFechamento("pesquisando", null), /gemeosmotors.com.br/);
  assert.deepEqual(validarResposta(PERGUNTA_TEM_MODELO).violacoes, []);
});

test("patinete: as frases prontas usam o artigo certo (o patinete, a moto)", async () => {
  const { parabens, textoDadosRecebidos, textoSimulacao } = await import("../../lib/ia/fechamento.ts");
  const { artigo } = await import("../../lib/ia/estoque-tipos.ts");
  assert.equal(artigo("Patinete 350W"), "o");
  assert.equal(artigo("T1"), "a");
  assert.ok(parabens("Patinete 350W").every((t) => !/\ba \*Patinete|\bA \*Patinete/.test(t)));
  assert.match(textoDadosRecebidos({ nome: "Ana", modelo: "Patinete 350W", modo: "entrega", lojaAberta: true }, 0), /entregar o seu \*Patinete 350W\*/);
  assert.match(textoDadosRecebidos({ nome: "Ana", modelo: "T1", modo: "retirada", lojaAberta: true }, 0), /separação da sua \*T1\*/);
  assert.match(textoSimulacao({ parcelas: 10, bandeira: "Visa", modelo: "Patinete 350W" }), /do patinete\?$/);
});

test("\"quero que entregue\" também é escolha de entrega (teste de 05/10/2026)", () => {
  const ultimaDaLoja = "Prefere vir buscar aqui na loja ou que a gente entregue pra você? 🛵";
  for (const t of ["quero que entregue, moro em Goiana", "pode entregar", "entrega", "manda pra mim", "leva aqui em casa"]) assert.equal(detectarMomento({ textoCliente: t, ultimaDaLoja, conheceModelo: true }), "escolheu_entrega", t);
  assert.equal(detectarMomento({ textoCliente: "vou buscar aí", ultimaDaLoja, conheceModelo: true }), "escolheu_retirada");
});

test("venda não se adia: \"conversamos amanhã\" e \"loja está fechada\" saem da resposta (05/10/2026)", async () => {
  const { tirarAdiamento } = await import("../../lib/ia/fechamento.ts");
  assert.deepEqual(
    tirarAdiamento(["A loja está fechada neste momento, mas a equipe vai te atender amanhã. A *TANK AG11* está disponível por R$ 12.900.", "É um modelo com motor forte. O que acha de conversarmos melhor amanhã para confirmar sua compra? 🙂"]),
    ["A *TANK AG11* está disponível por R$ 12.900.", "É um modelo com motor forte."],
  );
  assert.deepEqual(tirarAdiamento(["A T1 anda até 70 km."]), ["A T1 anda até 70 km."]);
});

test("só a bandeira (\"Visa\") depois da pergunta da IA com as duas coisas: ainda pergunta as parcelas (Arine, 06/10/2026)", async () => {
  const { jaPerguntouSoOQueFalta, PERGUNTA_SO_PARCELAS } = await import("../../lib/ia/fechamento.ts");
  assert.equal(jaPerguntouSoOQueFalta("Em quantas vezes você gostaria de dividir? E qual é a bandeira do cartão? 😊", "parcelas"), false);
  assert.equal(jaPerguntouSoOQueFalta(PERGUNTA_SO_PARCELAS, "parcelas"), true);
  assert.equal(jaPerguntouSoOQueFalta("E qual é a bandeira do cartão? 😊", "parcelas"), false);
});
