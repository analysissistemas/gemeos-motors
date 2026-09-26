import assert from "node:assert/strict";
import { test } from "node:test";
import { classificarFollowUp, detectarPedidoLigacao, dentroDoHorario, proximaAbertura } from "../../lib/mensageria/intencoes.ts";

/* quarta-feira, 23/09/2026, 10:00 em Recife (13:00 UTC) */
const AGORA = new Date("2026-09-23T13:00:00Z");
const recife = (d: Date) => new Date(d.getTime() - 3 * 3600_000).toISOString().slice(0, 16);

test("follow-up: 'vou voltar amanhã' agenda para amanhã 10h", () => {
  const r = classificarFollowUp("Beleza, amanhã eu volto aí na loja", AGORA);
  assert.equal(r?.tipo, "retorno_cliente");
  assert.equal(recife(r!.quando), "2026-09-24T10:00");
});
test("follow-up: cartão, esposa, pensar", () => {
  assert.equal(classificarFollowUp("vou passar o cartão", AGORA)?.tipo, "pagamento");
  assert.equal(classificarFollowUp("vou falar com minha esposa e te falo", AGORA)?.tipo, "consulta_terceiro");
  assert.equal(classificarFollowUp("vou pensar", AGORA)?.tipo, "pensar");
});
test("follow-up: dia da semana e semana que vem", () => {
  assert.equal(recife(classificarFollowUp("passo aí na sexta", AGORA)!.quando), "2026-09-25T10:00");
  assert.equal(recife(classificarFollowUp("volto semana que vem", AGORA)!.quando), "2026-09-30T10:00");
});
test("follow-up: agradecimento e encerramento NÃO geram follow-up", () => {
  for (const t of ["obrigado", "Obrigada!", "ok", "valeu", "tchau", "beleza", "Muito obrigado", "tudo bem", "oi, qual o preço da T1?", "quanto custa?"]) assert.equal(classificarFollowUp(t, AGORA), null, t);
});
test("follow-up: 'obrigado, vou voltar amanhã' gera (o retorno pesa mais que o agradecimento)", () => {
  assert.equal(classificarFollowUp("obrigado, amanhã eu volto", AGORA)?.tipo, "retorno_cliente");
});
test("ligação: variações reais", () => {
  for (const t of ["pode me ligar?", "Você pode me ligar amanhã de manhã?", "me liga por favor", "prefiro uma ligação", "gostaria de falar por telefone", "pode ligar depois das 14h", "liga pra mim"]) assert.ok(detectarPedidoLigacao(t), t);
});
test("ligação: negativas e conversa comum não disparam", () => {
  for (const t of ["não me liga por favor", "não quero ligação", "oi tudo bem", "quanto custa a T3?", "vou ligar pra minha esposa"]) assert.equal(detectarPedidoLigacao(t), null, t);
});
test("ligação: captura preferência de horário", () => {
  assert.equal(detectarPedidoLigacao("pode me ligar depois das 14h?")?.preferencia, "depois das 14h");
  assert.equal(detectarPedidoLigacao("pode me ligar?")?.preferencia, null);
});
test("horário administrativo: dentro, fora e próxima abertura", () => {
  assert.equal(dentroDoHorario(AGORA), true); // quarta 10h
  const noite = new Date("2026-09-23T23:00:00Z"); // quarta 20h Recife
  assert.equal(dentroDoHorario(noite), false);
  assert.equal(recife(proximaAbertura(noite)), "2026-09-24T08:00");
  const domingo = new Date("2026-09-27T15:00:00Z");
  assert.equal(dentroDoHorario(domingo), false);
  assert.equal(recife(proximaAbertura(domingo)), "2026-09-28T08:00");
});
