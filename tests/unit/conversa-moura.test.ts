/* Moura (21 e 22/10/2026, conversa 371) e o pedido do chefe (23/10/2026: "a IA está fazendo muita pergunta e se confunde.
   Cliente pediu pra simular, aí ela ao mesmo tempo pediu o endereço. Ele manda, ela agenda a entrega e não simula"). */
import assert from "node:assert/strict";
import { test } from "node:test";
import { detectarMomento, semPerguntasDoSistema } from "../../lib/ia/fechamento.ts";
import { quandoRetirar } from "../../lib/ia/retirada.ts";
import { HORARIO_PADRAO } from "../../lib/ia/horario.ts";

const m = (textoCliente: string, ultimaDaLoja: string) => detectarMomento({ textoCliente, ultimaDaLoja, conheceModelo: true });

test("a loja ofereceu a simulação e o cliente topou: o sistema simula", () => {
  const oferta = "Se preferir parcelar, as motos elétricas podem ser divididas em até 21 vezes no cartão de crédito, com uma pequena taxa da maquininha.\n\nQuer que eu faça uma simulação pra você? 😊";
  assert.equal(m("Sim", oferta), "pediu_simulacao");
  assert.equal(m("Isso", "Moura, só para confirmar: você quer que eu faça a simulação no cartão Master, certo? 😊"), "pediu_simulacao");
  assert.equal(m("Quanto tempo de garantia?\nMaster", "Quer que eu faça a simulação no cartão Master para essa moto?"), "pediu_simulacao");
  assert.equal(m("Sim", "A *M6* tem garantia de 1 ano, Moura 😊. Posso seguir com a simulação no cartão Master para você?"), "pediu_simulacao");
  assert.notEqual(m("Não, obrigado", oferta), "pediu_simulacao");
});

test("'Fica alta a parcela, depois vejo melhor' não é 'sim' ao 'Posso separar a sua?'", () => {
  const simulacao = "Fiz a simulação pra você 😊\n• Moto: *AG08*\n• No Mastercard: *12x de R$ 862,50*\nPosso separar a sua?";
  assert.notEqual(m("Fica alta a parcela\nDepois vejo melhor tô fazendo conta o de preço", simulacao), "decidido");
  assert.equal(m("Sim, pode separar", simulacao), "decidido");
});

test("'quero a M6 no Pix, pode separar' depois de 'simular em mais vezes' é decisão, não 6 parcelas", () => {
  const loja = "Entendo, Moura! Vamos achar um jeito que caiba no seu bolso 😊\n• No *Pix ou dinheiro* a *M6* sai por R$ 11.900,00\n• Dá pra simular em mais vezes, com a parcela menor (até 21 vezes)\nQual dessas fica melhor pra você?";
  assert.equal(m("Pensei melhor, quero a M6 no Pix, pode separar", loja), "decidido");
  assert.equal(m("em 18", loja), "pediu_simulacao");
});

test("pergunta não é o nome completo da lista de dados", () => {
  const lista = "Show! Pra combinar a entrega, me manda só:\n• Seu nome completo\n• Endereço (rua, número, bairro e cidade)\n• Que dia e horário você pode receber?";
  assert.notEqual(m("Só me passe quantos anos de garantia", lista), "mandou_dados");
  assert.equal(m("José Luiz de Moura neto\nRua 07 bairro novo\nCarpina-PE\nQualquer horário", lista), "mandou_dados");
  /* os dados chegaram depois de uma pergunta no meio: a lista não é mais a última fala da loja */
  const dados = "José Luiz de Moura Teste\nRua 07, 12, bairro novo, Goiana\nNo período da tarde a partir das 14:30";
  assert.equal(detectarMomento({ textoCliente: dados, ultimaDaLoja: "A *M6* tem 1 ano de garantia, Moura 😊", conheceModelo: true, pediuDadosAntes: true }), "mandou_dados");
  assert.notEqual(detectarMomento({ textoCliente: dados, ultimaDaLoja: "A *M6* tem 1 ano de garantia, Moura 😊", conheceModelo: true }), "mandou_dados");
});

test("a IA não pergunta retirar ou entrega, não reconfirma e não promete simular", () => {
  assert.deepEqual(
    semPerguntasDoSistema(["Perfeito, Moura! Vou simular a compra da moto no cartão Master para você. Enquanto isso, posso confirmar se prefere retirar a moto na loja em Goiana ou receber por entrega? 📍🛵"]),
    ["Perfeito, Moura!"],
  );
  assert.deepEqual(
    semPerguntasDoSistema(["Certo, Sidney! Vou encaminhar para a equipe fazer a simulação do parcelamento em 21 vezes no Mastercard para a *AG08* 😊", "Enquanto isso, gostaria de saber se prefere retirar a moto na loja em Goiana ou se quer combinar a entrega? 🛵"]),
    ["Certo, Sidney!"],
  );
  assert.deepEqual(semPerguntasDoSistema(["A *M6* tem garantia de 1 ano, Moura 😊. Posso seguir com a simulação no cartão Master para você?"]), ["A *M6* tem garantia de 1 ano, Moura 😊."]);
  /* resposta sobre entrega sem perguntar, e oferta de simulação, ficam */
  assert.deepEqual(semPerguntasDoSistema(["A gente entrega em toda a região 😊"]), ["A gente entrega em toda a região 😊"]);
  assert.deepEqual(semPerguntasDoSistema(["Quer que eu faça uma simulação pra você? 😊"]), ["Quer que eu faça uma simulação pra você? 😊"]);
});

test("entrega: só a hora, sem o dia, não vira data marcada", () => {
  const agora = new Date("2026-10-23T00:07:00Z"); // quinta, 21:07 em Recife
  const sidney = "No período da tarde a partir das 14:30, e em relação ao dia, o mais rápido possível";
  assert.equal(quandoRetirar(sidney, HORARIO_PADRAO, agora, true).problema, "sem_dia");
  assert.equal(quandoRetirar("sexta às 15h", HORARIO_PADRAO, agora, true).problema, null);
  /* retirada continua como antes ("às 10h" de noite = amanhã) */
  assert.equal(quandoRetirar("às 10h", HORARIO_PADRAO, agora).problema, null);
});
