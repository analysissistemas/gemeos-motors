/* Avisos no celular do Milton (dono, 15/10/2026). Roda com `npm run test:ia`. */
import assert from "node:assert/strict";
import { test } from "node:test";
import { avisoDaAnotacao, avisoResumoDoDia, avisoVisitaMarcada } from "../../lib/avisos/regras.ts";

const p = { conversaId: 173, nome: "Teste" };

test("dados do pedido viram aviso urgente com a retirada e o pagamento", () => {
  const a = avisoDaAnotacao(
    "Dados do pedido salvos no cadastro de Teste Lembrete da Silva.\nPedido pelo WhatsApp (IA): N2\nRetirada na loja: sexta, 16/10, às 10h · endereço do cliente: Rua das Flores, 12 · Centro · Goiana\nSeparar a moto: tarefa em Follow-ups às 07:00.\nPagamento: pix",
    p,
  );
  assert.equal(a?.titulo, "✅ Teste mandou os dados da N2");
  assert.equal(a?.corpo, "Retirada na loja: sexta, 16/10, às 10h · Pagamento: pix");
  assert.equal(a?.urgente, true);
  assert.equal(a?.url, "/sistema/conversas?c=173");
});

test("passou para a equipe: pedido de pessoa avisa; fechamento não (o aviso dos dados vem logo depois)", () => {
  const recado = avisoDaAnotacao('Transferido para atendimento humano pela IA. Motivo: Recado / outro assunto. O cliente escreveu: "Gostaria de falar com o proprietário". Resumo: x', p);
  assert.equal(recado?.titulo, "🙋 Teste quer falar com alguém");
  assert.match(recado!.corpo, /proprietário/);
  assert.equal(avisoDaAnotacao("Transferido para atendimento humano pela IA. Motivo: Fechamento: o cliente mandou os dados. Resumo: x", p), null);
  assert.equal(avisoDaAnotacao('REVISAR ATENDIMENTO DA IA: o cliente reclamou ("não veio foto"). Veja o que a IA mandou antes.', p)?.titulo, "🙋 Teste reclamou do atendimento");
});

test("esperando em Humano e anotações comuns", () => {
  assert.equal(avisoDaAnotacao("Cliente esperando resposta há 5 min. Responda assim que puder: ...", p)?.titulo, "⏰ Teste está esperando há 5 min");
  assert.equal(avisoDaAnotacao("Número sem cadastro. Cadastre o cliente para ligar a conversa ao CRM.", p), null);
  assert.equal(avisoDaAnotacao("IA parada nesta conversa. Não é cliente: ...", p), null);
});

test("visita marcada e resumo do dia", () => {
  assert.equal(avisoVisitaMarcada({ conversaId: 5, nome: "Ana", descricao: "Gêmeos M6", quandoExtenso: "sexta, 16/10, às 15h30" }).titulo, "📅 Ana marcou test drive da Gêmeos M6");
  assert.equal(avisoVisitaMarcada({ conversaId: 5, nome: "Ana", descricao: "Visita à loja", quandoExtenso: "sexta, 16/10, às 15h30" }).corpo, "Sexta, 16/10, às 15h30. Marcado pela IA no WhatsApp.");
  assert.equal(avisoResumoDoDia({ retiradas: 2, testDrives: 1, followUps: 4, prontos: 3, esperando: 0 })?.corpo, "Hoje: 3 clientes prontos para fechar, 2 retiradas, 1 test drive/visita, 4 follow-ups da equipe.");
  assert.equal(avisoResumoDoDia({ retiradas: 0, testDrives: 0, followUps: 0, prontos: 0, esperando: 0 }), null);
});
