/* Follow-up de aquecimento (lib/ia/aquecimento.ts) e a abertura da Damarys (07/10/2026). Roda com `npm run test:ia`. */
import assert from "node:assert/strict";
import { test } from "node:test";
import { comDesculpaDoHorario, decidirAquecimento, ETAPAS_AQUECIMENTO, LIMITE_JANELA_MIN, mensagemPadraoAquecimento, textoDeAquecimentoAceito } from "../../lib/ia/aquecimento.ts";
import { instrucaoDoSite } from "../../lib/ia/intencao.ts";
import { semRepeticao } from "../../lib/ia/workflow/util.ts";
import { validarResposta } from "../../lib/ia/validador.ts";

test("3 tentativas: 10 min, 1 h e 23 h 53 min, a última dentro da janela de 24 h do WhatsApp", () => {
  assert.deepEqual(ETAPAS_AQUECIMENTO.map((e) => e.minutos), [10, 60, 1433]);
  assert.ok(ETAPAS_AQUECIMENTO.every((e) => e.minutos < LIMITE_JANELA_MIN));
});

test("na hora de enviar: só sai se o cliente continua calado e a IA ainda atende", () => {
  const ok = { iaPodeEnviar: true, modo: "ia", status: "aberta", clienteFalouDepois: false, minDesdeCliente: 10 };
  assert.equal(decidirAquecimento(ok), null);
  assert.equal(decidirAquecimento({ ...ok, clienteFalouDepois: true }), "cliente_respondeu");
  assert.equal(decidirAquecimento({ ...ok, modo: "humano" }), "vendedor_assumiu");
  assert.equal(decidirAquecimento({ ...ok, status: "encerrada" }), "conversa_encerrada");
  assert.equal(decidirAquecimento({ ...ok, iaPodeEnviar: false }), "ia_desligada");
  assert.equal(decidirAquecimento({ ...ok, minDesdeCliente: 24 * 60 }), "fora_da_janela");
});

test("mensagem pronta: com nome e moto, sem número, e passa no validador", () => {
  for (const etapa of [1, 2, 3]) {
    for (const [nome, modelo] of [["Damarys", "X GÊMEOS"], [null, null], ["Rui", "Patinete 800W"]] as const) {
      const t = mensagemPadraoAquecimento({ etapa, nome, modelo });
      assert.ok(!/\d(?!00W)/.test(t.replace(/Patinete 800W/g, "")), t);
      assert.equal(validarResposta(t).aprovada, true, `${t} ${JSON.stringify(validarResposta(t).violacoes)}`);
      if (nome) assert.ok(t.startsWith(`${nome}, `), t);
      if (modelo) assert.ok(t.includes(`*${modelo}*`), t);
    }
  }
  assert.match(mensagemPadraoAquecimento({ etapa: 1, nome: "Damarys", modelo: "X GÊMEOS" }), /^Damarys, conseguiu ver as fotos e o vídeo da \*X GÊMEOS\*\?/u);
  assert.match(mensagemPadraoAquecimento({ etapa: 2, nome: null, modelo: "Patinete 800W" }), /^Lembrando que o \*Patinete 800W\* é elétrico/u);
});

test("texto da IA: sem preço, número, link, promoção nem cumprimento; precisa de pergunta", () => {
  assert.equal(textoDeAquecimentoAceito("Damarys, ficou alguma dúvida sobre a *X GÊMEOS*? 😊"), true);
  assert.equal(textoDeAquecimentoAceito("Damarys, a *X GÊMEOS* sai por R$ 10.000 em 10x. Bora?"), false);
  assert.equal(textoDeAquecimentoAceito("Oi Damarys! Ainda pensando na moto?"), false);
  assert.equal(textoDeAquecimentoAceito("Damarys, é a última unidade, quer garantir?"), false);
  assert.equal(textoDeAquecimentoAceito("Damarys, veja em www.loja.com, gostou?"), false);
});

test("fora do horário a mensagem começa pedindo desculpa pela hora; dentro, fica igual", () => {
  const t = "Damarys, conseguiu ver as fotos e o vídeo da *X GÊMEOS*? Ficou alguma dúvida? 😊";
  assert.equal(comDesculpaDoHorario(t, "Damarys", true), t);
  assert.equal(comDesculpaDoHorario(t, "Damarys", false), "Damarys, desculpa estar te mandando mensagem a essa hora 🙏 Conseguiu ver as fotos e o vídeo da *X GÊMEOS*? Ficou alguma dúvida? 😊");
  assert.equal(comDesculpaDoHorario("Ainda está por aí? 😊", null, false), "Desculpa estar te mandando mensagem a essa hora 🙏 Ainda está por aí? 😊");
  assert.equal(validarResposta(comDesculpaDoHorario(t, "Damarys", false)).aprovada, true);
});

test("Damarys: veio do site e perguntou disponível e valor — a IA responde em vez de perguntar o que ela procura", () => {
  const so = instrucaoDoSite("Olá! Vim pelo site da Gêmeos Motors e quero falar com um consultor.");
  assert.match(so, /pergunte o que ele procura/u);
  const perguntou = instrucaoDoSite("Olá! Vim pelo site da Gêmeos Motors e quero falar com um consultor.\n\nVcs tem disponível\n\nValor");
  assert.match(perguntou, /RESPONDA isso agora/u);
  assert.match(perguntou, /liste as motos EM ESTOQUE com o preço/u);
  assert.doesNotMatch(perguntou, /pergunte o que ele procura/u);
  assert.equal(instrucaoDoSite("quanto custa a T1?"), "");
});

test("Damarys: 'Como posso te ajudar?' não se repete em outra variação logo depois", () => {
  const antes = "Como posso te ajudar hoje? Você está procurando uma moto elétrica, um patinete ou acessórios? 😊";
  assert.deepEqual(semRepeticao(["Como posso te ajudar hoje? 🙂"], antes), []);
  assert.deepEqual(semRepeticao(["Bom te ver por aqui! Em que posso te ajudar?"], antes), ["Bom te ver por aqui!"]);
  assert.deepEqual(semRepeticao(["Como posso te ajudar?"], "Temos a T1."), ["Como posso te ajudar?"]);
});

test("Beatriz: pediu a simulação e espera o vendedor — o aquecimento não sai", () => {
  const ok = { iaPodeEnviar: true, modo: "ia", status: "aberta", clienteFalouDepois: false, minDesdeCliente: 60 };
  assert.equal(decidirAquecimento({ ...ok, lojaDeveResposta: true }), "loja_deve_resposta");
  assert.equal(decidirAquecimento({ ...ok, lojaDeveResposta: false }), null);
});

test("Beatriz: simulação prometida e ninguém da equipe respondeu — cobra com a loja aberta, uma vez", async () => {
  const { deveCobrarTarefa, COBRAR_TAREFA_MIN } = await import("../../lib/ia/workflow/vigia-regra.ts");
  const base = { lojaAberta: true, minDesdeCriada: COBRAR_TAREFA_MIN, jaCobrada: false, equipeRespondeuDepois: false };
  assert.equal(deveCobrarTarefa(base), true);
  assert.equal(deveCobrarTarefa({ ...base, minDesdeCriada: COBRAR_TAREFA_MIN - 1 }), false);
  assert.equal(deveCobrarTarefa({ ...base, lojaAberta: false }), false);
  assert.equal(deveCobrarTarefa({ ...base, jaCobrada: true }), false);
  assert.equal(deveCobrarTarefa({ ...base, equipeRespondeuDepois: true }), false);
});

test("Guilherme: falou 'moto' e mandou foto — patinete fica fora da comparação", async () => {
  const { candidatosDaFoto } = await import("../../lib/ia/midia-tipos.ts");
  const m = [{ nome: "TANK AG11", tipo: "moto_eletrica" }, { nome: "Patinete 530W", tipo: "patinete" }, { nome: "X GÊMEOS", tipo: "moto_eletrica" }];
  assert.deepEqual(candidatosDaFoto(m, "Moto elétrica\nBom dia! Vocês tem desse modelo ?").map((x) => x.nome), ["TANK AG11", "X GÊMEOS"]);
  assert.deepEqual(candidatosDaFoto(m, "Patinete não amigo\nQueria as motinhas").map((x) => x.nome), ["TANK AG11", "X GÊMEOS"]);
  assert.deepEqual(candidatosDaFoto(m, "tem desse patinete?").map((x) => x.nome), ["Patinete 530W"]);
  assert.equal(candidatosDaFoto(m, "Vocês tem desse modelo?").length, 3);
});

test("Guilherme: respondeu só o nome — a IA não repete a ficha (detector)", async () => {
  const { respondeuSoONome } = await import("../../lib/ia/workflow/util.ts");
  const perguntou = "Olha ela aí\n\nQual é o seu nome? 😊";
  for (const t of ["Guilherme", "guilherme abreu", "Meu nome é Carla", "É a Rui!", "Sou o João 😊"]) assert.equal(respondeuSoONome(t, perguntou), true, t);
  for (const t of ["Guilherme, quanto custa?", "quero a tank", "Sim", "ok", "Guilherme 81 9999"]) assert.equal(respondeuSoONome(t, perguntou), false, t);
  assert.equal(respondeuSoONome("Guilherme", "A TANK custa R$ 12.900."), false);
});
