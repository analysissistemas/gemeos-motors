/* Quem não é cliente (dono, 15/10/2026: a IA ficou em loop vendendo moto para a TIM, que oferecia serviço).
   Roda com `npm run test:ia`. */
import assert from "node:assert/strict";
import { test } from "node:test";
import { mensagemAutomatica, naoEhCliente, ofertaDeServico } from "../../lib/ia/nao-cliente.ts";

const ofertas = [
  // conversa real (11) 5128-5383, 09/10/2026: robô da TIM que a IA tentou vender moto e foi parar em Prontos
  "Olá! 😊 Fico feliz em saber que você está satisfeito! E falando em mobilidade, que tal dar uma olhada na nossa oferta *TIM Controle*?",
  "Milton, agradeço a disponibilidade. Eu só consigo ajudar com a oferta *TIM Controle* da linha do Luis e não tenho acesso a nada da Gêmeos Motors",
  "Se o Luis quiser em algum momento, posso explicar rapidamente o plano TIM Controle de 33GB, o valor em fatura e as opções de vencimento.",
  "Olá! Sou consultora da TIM e tenho uma oferta exclusiva para a sua empresa",
  "Boa tarde, aqui é da Vivo Empresas. Temos planos de internet com fibra para o seu CNPJ",
  "TIM Empresas: sua empresa foi selecionada para ganhar 50GB",
  "Oi! Trabalhamos com internet fibra empresarial na região de Goiana, posso te passar os valores?",
  "Faça a portabilidade das suas linhas móveis e ganhe desconto",
  "Sua empresa tem crédito pré-aprovado de R$ 50 mil",
  "Trabalho com tráfego pago e marketing digital para lojas de moto",
  "Temos uma proposta comercial para vocês",
  "Plano de celular pós-pago com ligações ilimitadas",
  "Que tal aproveitar nossa condição especial de internet para o seu negócio hoje?",
];
const clientes = [
  "Oi, quanto custa a DF17?",
  "Claro, pode me mandar as fotos",
  "Eu vivo em Goiana, vocês entregam?",
  "Aceita maquininha? Vou pagar no cartão",
  "Vocês fazem financiamento ou empréstimo?",
  "Oi tudo bem? Queria ver o patinete",
  "Quero falar com o dono sobre a minha empresa comprar 3 motos",
  "Tim, me manda o preço da M6",
  "Pode ser no plano de 12 vezes?",
];

test("oferta de operadora, banco ou agência é reconhecida", () => {
  for (const t of ofertas) assert.equal(ofertaDeServico(t), true, t);
});

test("cliente de verdade não é confundido com oferta", () => {
  for (const t of clientes) assert.equal(naoEhCliente({ texto: t, anterioresDoCliente: [], mensagensDaIaUltimaHora: 3 }), null, t);
});

test("menu de robô é reconhecido", () => {
  for (const t of ["Digite 1 para falar com um consultor ou 2 para planos", "Opção inválida. Tente novamente.", "Esta é uma mensagem automática, não responda esta mensagem", "Não entendi sua resposta. Escolha uma das opções abaixo", "Para não receber mais mensagens, envie SAIR"])
    assert.equal(mensagemAutomatica(t), true, t);
  assert.equal(mensagemAutomatica("Pode me mandar o número da loja?"), false);
});

test("loop: a mesma mensagem longa volta depois de a IA já ter respondido várias vezes", () => {
  const pitch = "Olá! Você recebeu uma mensagem importante, confira agora mesmo";
  assert.equal(naoEhCliente({ texto: pitch, anterioresDoCliente: ["oi", pitch], mensagensDaIaUltimaHora: 8 }), "loop");
  // começo de conversa: repetir não basta
  assert.equal(naoEhCliente({ texto: pitch, anterioresDoCliente: [pitch], mensagensDaIaUltimaHora: 2 }), null);
  // mensagem curta repetida ("ok", "sim") não é loop
  assert.equal(naoEhCliente({ texto: "Sim, quero", anterioresDoCliente: ["Sim, quero"], mensagensDaIaUltimaHora: 10 }), null);
  // freio geral: 30 mensagens da IA em 1 hora
  assert.equal(naoEhCliente({ texto: "Quanto fica a M6?", anterioresDoCliente: [], mensagensDaIaUltimaHora: 30 }), "loop");
});
