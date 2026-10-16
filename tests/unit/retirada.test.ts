/* Retirada na loja com dia e hora (dono, 15/10/2026). Roda com `npm run test:ia`. */
import assert from "node:assert/strict";
import { test } from "node:test";
import { planoRetirada, quandoRetirar, textoLembreteRetirada } from "../../lib/ia/retirada.ts";
import { HORARIO_PADRAO } from "../../lib/ia/horario.ts";
import { validarResposta } from "../../lib/ia/validador.ts";

/* quinta, 15/10/2026, 20:38 em Recife (23:38 UTC) */
const agora = new Date("2026-10-15T23:38:00Z");

test("'Amanhã às 10h' vira sexta 16/10 às 10h; sem hora, fora do horário e no passado pedem de novo", () => {
  const r = quandoRetirar("Amanhã às 10h", HORARIO_PADRAO, agora);
  assert.equal(r.problema, null);
  assert.equal(r.quando?.toISOString(), "2026-10-16T13:00:00.000Z");
  assert.equal(quandoRetirar("amanhã de manhã", HORARIO_PADRAO, agora).problema, "sem_hora");
  assert.equal(quandoRetirar("às 10h", HORARIO_PADRAO, agora).problema, null); // "às 10h" de noite = amanhã
  assert.equal(quandoRetirar("domingo às 10h", HORARIO_PADRAO, agora).problema, "fechada");
  assert.equal(quandoRetirar("qualquer dia", HORARIO_PADRAO, agora).problema, "sem_dia");
});

test("equipe 3 h antes, lembrete 2 h antes (nunca antes das 8 h), só dentro das 24 h do WhatsApp", () => {
  const quando = new Date("2026-10-16T13:00:00Z"); // sexta 10h
  const p = planoRetirada(quando, agora, agora);
  assert.equal(p.equipeEm.toISOString(), "2026-10-16T10:00:00.000Z"); // 7h
  assert.equal(p.lembreteEm?.toISOString(), "2026-10-16T11:00:00.000Z"); // 8h (2 h antes seria 8h mesmo)
  const as9 = planoRetirada(new Date("2026-10-16T12:00:00Z"), agora, agora); // retirada às 9h
  assert.equal(as9.lembreteEm?.toISOString(), "2026-10-16T11:00:00.000Z"); // 8h, não 7h
  const as15 = planoRetirada(new Date("2026-10-16T18:00:00Z"), agora, agora);
  assert.equal(as15.lembreteEm?.toISOString(), "2026-10-16T16:00:00.000Z"); // 13h, ainda dentro das 24 h
  const sabado = planoRetirada(new Date("2026-10-17T13:00:00Z"), agora, agora);
  assert.equal(sabado.lembreteEm, null); // sábado 8h passa da janela de 24 h (o cliente falou quinta 20:38)
  assert.equal(sabado.foraDaJanela, true);
  const daquiUmaHora = planoRetirada(new Date(agora.getTime() + 90 * 60_000), agora, agora);
  assert.equal(daquiUmaHora.lembreteEm, null); // em cima da hora: a confirmação já basta
});

test("texto do lembrete: hoje, a hora e a moto, e passa no validador", () => {
  const t = textoLembreteRetirada({ nome: "Maria", modelo: "N2", quando: new Date("2026-10-16T13:00:00Z") });
  assert.equal(t, "Oi, Maria! Passando pra lembrar que hoje, às 10h, a sua *N2* está te esperando aqui na loja 😊 Se precisar mudar o horário, é só me avisar por aqui.");
  assert.equal(validarResposta(t, {}).aprovada, true, JSON.stringify(validarResposta(t, {}).violacoes));
});

test("trecho de quando e confirmação com dia e hora", async () => {
  const { trechoDeQuando, textoRetiradaMarcada } = await import("../../lib/ia/retirada.ts");
  assert.equal(trechoDeQuando(null, "Nome: Ana\nCPF: 111.444.777-35\nRua A, 12\nVou sexta às 15h"), "Vou sexta às 15h");
  assert.equal(trechoDeQuando("Amanhã às 10h", "qualquer"), "Amanhã às 10h");
  const t = textoRetiradaMarcada({ nome: "Teste", modelo: "N2", quandoExtenso: "sexta, 16/10, às 10h", lembrete: true });
  assert.equal(t, "Perfeito, Teste! Está tudo certinho ✅ Anotei sua retirada para sexta, 16/10, às 10h. A equipe vai deixar a sua *N2* separada pra você, e no dia eu te mando um lembrete por aqui 😊");
  assert.equal(validarResposta(t, {}).aprovada, true, JSON.stringify(validarResposta(t, {}).violacoes));
});

test("lembrete de test drive e de visita", async () => {
  const { textoLembreteVisita } = await import("../../lib/ia/retirada.ts");
  const q = new Date("2026-10-16T18:30:00Z"); // 15h30
  const td = textoLembreteVisita({ nome: "Ana", descricao: "Gêmeos M6", quando: q });
  assert.equal(td, "Oi, Ana! Passando pra lembrar do seu test drive da *Gêmeos M6* hoje, às 15h30, aqui na loja 😊 Se precisar mudar o horário, é só me avisar por aqui.");
  assert.equal(textoLembreteVisita({ nome: null, descricao: "Visita à loja", quando: q }), "Oi! Passando pra lembrar da sua visita hoje, às 15h30, aqui na loja 😊 Se precisar mudar o horário, é só me avisar por aqui.");
  assert.equal(validarResposta(td, {}).aprovada, true, JSON.stringify(validarResposta(td, {}).violacoes));
});

test("entrega com dia e hora: Goiana confirma e lembra; fora de Goiana só anota", async () => {
  const { textoEntregaMarcada, textoLembreteEntrega } = await import("../../lib/ia/retirada.ts");
  const goiana = textoEntregaMarcada({ nome: "Ana", modelo: "N2", quandoExtenso: "sexta, 16/10, às 10h", lembrete: true, foraDeGoiana: false });
  assert.equal(goiana, "Perfeito, Ana! Está tudo certinho ✅ Anotei a entrega para sexta, 16/10, às 10h. A equipe vai preparar a sua *N2* pra levar até você, e no dia eu te mando um lembrete por aqui 😊");
  const fora = textoEntregaMarcada({ nome: "Ana", modelo: "N2", quandoExtenso: "sexta, 16/10, às 10h", lembrete: false, foraDeGoiana: true });
  assert.match(fora, /confirma com você se a entrega atende aí/);
  assert.doesNotMatch(fora, /lembrete/);
  const l = textoLembreteEntrega({ nome: "Ana", modelo: "N2", quando: new Date("2026-10-16T13:00:00Z") });
  assert.equal(l, "Oi, Ana! Passando pra lembrar que hoje, às 10h, a gente leva a sua *N2* até você 🛵 Se precisar mudar o horário, é só me avisar por aqui.");
  for (const t of [goiana, fora, l]) assert.equal(validarResposta(t, {}).aprovada, true, JSON.stringify(validarResposta(t, {}).violacoes));
});
