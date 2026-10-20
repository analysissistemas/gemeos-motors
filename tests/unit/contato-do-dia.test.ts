/* Contato no dia combinado (lib/ia/contato-do-dia.ts), dono, 20/10/2026: "talvez sábado" → a IA pergunta o período e
   chama o cliente no dia; fora das 24 h do WhatsApp vai o modelo aprovado pela Meta. Fuso de Recife. */
import assert from "node:assert/strict";
import { test } from "node:test";
import { validarResposta } from "../../lib/ia/validador.ts";
import {
  definicaoParaMeta,
  horaDoContato,
  MODELO_CONFIRMAR_VISITA,
  MODELO_LEMBRETE_VISITA,
  periodoDoTexto,
  RX_PERGUNTOU_PERIODO,
  textoContatoCombinado,
  textoDoDia,
  textoDoModelo,
  textoPerguntaPeriodo,
  valoresConfirmar,
  valoresLembrete,
} from "../../lib/ia/contato-do-dia.ts";

const TERCA = new Date("2026-10-20T22:45:00Z"); // terça, 19:45 em Recife
const SABADO = { ano: 2026, mes: 9, dia: 24 };
const recife = (d: Date) => new Date(d.getTime() - 3 * 3_600_000).toISOString().slice(0, 16).replace("T", " ");

test("período: manhã, tarde, hora dita; 'boa tarde' e 'amanhã' não são período", () => {
  assert.equal(periodoDoTexto("de tarde", TERCA), "tarde");
  assert.equal(periodoDoTexto("à tarde", TERCA), "tarde");
  assert.equal(periodoDoTexto("depois do almoço", TERCA), "tarde");
  assert.equal(periodoDoTexto("de manhã cedo", TERCA), "manha");
  assert.deepEqual(periodoDoTexto("lá pras 15h", TERCA), { hora: 15, min: 0 });
  assert.equal(periodoDoTexto("Boa tarde, talvez sábado eu passo aí", TERCA), null);
  assert.equal(periodoDoTexto("talvez amanhã", TERCA), null);
  assert.equal(periodoDoTexto("talvez sábado à tarde", TERCA), "tarde");
});

test("hora do contato: manhã 8h, tarde 11h, hora dita 2 h antes (não antes das 8h), sem período 9h", () => {
  assert.equal(recife(horaDoContato(SABADO, "manha")), "2026-10-24 08:00");
  assert.equal(recife(horaDoContato(SABADO, "tarde")), "2026-10-24 11:00");
  assert.equal(recife(horaDoContato(SABADO, { hora: 15, min: 0 })), "2026-10-24 13:00");
  assert.equal(recife(horaDoContato(SABADO, { hora: 9, min: 0 })), "2026-10-24 08:00");
  assert.equal(recife(horaDoContato(SABADO, null)), "2026-10-24 09:00");
});

test("textos da IA: pergunta o período, confirma sem dizer que anotou, e passam no validador", () => {
  const pergunta = textoPerguntaPeriodo({ nome: "Edimilson", diaExtenso: "sábado, 24/10" });
  assert.equal(pergunta, "Fica à vontade, Edimilson! Sábado você pensa em vir mais de manhã ou à tarde? Assim no dia eu te chamo por aqui pra confirmar 😊");
  assert.ok(RX_PERGUNTOU_PERIODO.test(pergunta));
  const ok = textoContatoCombinado({ nome: null, diaExtenso: "sábado, 24/10", periodo: "tarde" });
  assert.equal(ok, "Fechado! Sábado à tarde eu te chamo por aqui pra confirmar ✅");
  assert.doesNotMatch(ok, /anotad|agendad|marcad/iu);
  const dia = textoDoDia({ nome: "Edimilson", modelo: "N2", periodo: "tarde" });
  assert.equal(dia, "Oi, Edimilson! Hoje é o dia de ver a *N2* de perto 😊 Ainda dá pra você passar aqui à tarde? Me fala que horas fica melhor pra você que eu deixo tudo pronto.");
  for (const t of [pergunta, ok, dia]) assert.ok(validarResposta(t, { promptSistema: "", fontesAutorizadas: ["N2"] }).aprovada, t);
});

test("modelos da Meta: preenchidos sem campo vazio; categoria Utilidade com exemplo", () => {
  assert.equal(
    textoDoModelo(MODELO_CONFIRMAR_VISITA, valoresConfirmar({ nome: null, modelo: null })),
    "Oi, tudo bem! Aqui é o Milton, da Gêmeos Motors. Você comentou que pensava em vir aqui na loja hoje ver a moto. Ainda está de pé? Me responde com o horário que fica melhor pra você que eu deixo tudo pronto.",
  );
  assert.equal(
    textoDoModelo(MODELO_LEMBRETE_VISITA, valoresLembrete({ nome: "Ana", descricao: "N2", hora: "15h" })),
    "Oi, Ana! Aqui é o Milton, da Gêmeos Motors. Passando pra lembrar do seu test drive da N2 hoje, às 15h, aqui na loja. Se precisar mudar o horário, é só responder esta mensagem.",
  );
  assert.deepEqual(valoresLembrete({ nome: "Ana", descricao: "Visita à loja", hora: "9h" })[1], "da sua visita");
  const def = definicaoParaMeta(MODELO_CONFIRMAR_VISITA);
  assert.equal(def.category, "UTILITY");
  assert.equal(def.components[0].example.body_text[0].length, 2);
});

test("a resposta ao 'Me responde com o horário que fica melhor' vira visita (modelo do dia)", async () => {
  const { detectarMomento } = await import("../../lib/ia/fechamento.ts");
  const loja = textoDoModelo(MODELO_CONFIRMAR_VISITA, ["Ana", "N2"]);
  assert.equal(detectarMomento({ textoCliente: "vou sim, às 15h", ultimaDaLoja: loja, conheceModelo: true }), "informou_visita");
  const dia = textoDoDia({ nome: "Ana", modelo: "N2", periodo: null });
  assert.equal(detectarMomento({ textoCliente: "às 16h", ultimaDaLoja: dia, conheceModelo: true }), "informou_visita");
});
