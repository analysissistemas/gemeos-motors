/* Follow-up de aquecimento (lib/ia/aquecimento.ts) e a abertura da Damarys (07/10/2026). Roda com `npm run test:ia`. */
import assert from "node:assert/strict";
import { test } from "node:test";
import { decidirAquecimento, ETAPAS_AQUECIMENTO, LIMITE_JANELA_MIN, mensagemPadraoAquecimento, textoDeAquecimentoAceito } from "../../lib/ia/aquecimento.ts";
import { instrucaoDoSite } from "../../lib/ia/intencao.ts";
import { semRepeticao } from "../../lib/ia/workflow/util.ts";
import { validarResposta } from "../../lib/ia/validador.ts";

test("3 tentativas: 1 h, 3 h e 23 h (Milton, 12/10/2026), a última dentro da janela de 24 h do WhatsApp", () => {
  assert.deepEqual(ETAPAS_AQUECIMENTO.map((e) => e.minutos), [60, 180, 1380]);
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
  /* sem "conseguiu ver as fotos e o vídeo": nem sempre a loja mandou vídeo (Heverton, 12/10/2026) */
  /* a 1ª, com moto, é a pergunta do dono (Milton, 12/10/2026: sai 1 h depois, se o cliente não responder) */
  assert.equal(mensagemPadraoAquecimento({ etapa: 1, nome: "Damarys", modelo: "X GÊMEOS" }), "Damarys, o que está faltando para concluirmos a sua compra da *X GÊMEOS*? 😊");
  assert.equal(mensagemPadraoAquecimento({ etapa: 1, nome: null, modelo: "Patinete 800W" }), "O que está faltando para concluirmos a sua compra do *Patinete 800W*? 😊");
  assert.match(mensagemPadraoAquecimento({ etapa: 2, nome: null, modelo: "Patinete 800W" }), /^Lembrando que o \*Patinete 800W\* é elétrico/u);
});

test("texto da IA: sem preço, número, link, promoção nem cumprimento; precisa de pergunta", () => {
  assert.equal(textoDeAquecimentoAceito("Damarys, ficou alguma dúvida sobre a *X GÊMEOS*? 😊"), true);
  assert.equal(textoDeAquecimentoAceito("Damarys, a *X GÊMEOS* sai por R$ 10.000 em 10x. Bora?"), false);
  assert.equal(textoDeAquecimentoAceito("Oi Damarys! Ainda pensando na moto?"), false);
  assert.equal(textoDeAquecimentoAceito("Damarys, é a última unidade, quer garantir?"), false);
  assert.equal(textoDeAquecimentoAceito("Damarys, veja em www.loja.com, gostou?"), false);
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

test("Heverton: só com a loja aberta, 50 min entre uma e outra, e a última dentro da janela de 24 h (12/10/2026)", async () => {
  const { planejarAquecimento } = await import("../../lib/ia/aquecimento.ts");
  const { HORARIO_PADRAO } = await import("../../lib/ia/horario.ts");
  const recife = (d: Date) => d.toLocaleString("pt-BR", { timeZone: "America/Recife", weekday: "short", hour: "2-digit", minute: "2-digit" });
  /* domingo 21:43 (loja fechada; abre segunda 8h): 8:00, 2 h depois (10:00) e a última antes de fechar (a janela acaba segunda 21:40) */
  const domingo = planejarAquecimento(new Date("2026-10-12T00:43:00Z"), HORARIO_PADRAO);
  assert.deepEqual(domingo.map((e) => recife(e.quando)), ["seg., 08:00", "seg., 10:00", "seg., 17:55"]);
  /* terça 10:00 (aberta): 11:00, 13:00 e quarta 9:00 (1 h, 3 h e 23 h; Milton, 12/10/2026) */
  const terca = planejarAquecimento(new Date("2026-10-13T13:00:00Z"), HORARIO_PADRAO);
  assert.deepEqual(terca.map((e) => recife(e.quando)), ["ter., 11:00", "ter., 13:00", "qua., 09:00"]);
  /* terça 17:45: a de 1 h cairia às 18:45 (fechada) e vai para quarta 8:00; a de 3 h, 2 h depois; a última às 16:45 */
  const fim = planejarAquecimento(new Date("2026-10-13T20:45:00Z"), HORARIO_PADRAO);
  assert.deepEqual(fim.map((e) => recife(e.quando)), ["qua., 08:00", "qua., 10:00", "qua., 16:45"]);
  /* sábado 21:00: domingo fechado e segunda 8h passa da janela; nada sai */
  assert.deepEqual(planejarAquecimento(new Date("2026-10-18T00:00:00Z"), HORARIO_PADRAO), []);
});

test("Heverton: a loja ficou de ver algo com a equipe; o follow-up não sai, vira tarefa (12/10/2026)", async () => {
  const { lojaFicouDeVer } = await import("../../lib/ia/aquecimento.ts");
  assert.equal(lojaFicouDeVer("A garantia exata pode variar conforme o modelo, e a equipe confirma certinho para você. Quer que eu veja com eles para informar o prazo? 🙂"), true);
  assert.equal(lojaFicouDeVer("Vou verificar com o vendedor e já te falo"), true);
  /* (81) 7301-7155, 11/10/2026: carga do Patinete 800W fora do catálogo */
  assert.equal(lojaFicouDeVer("• Patinete 800W: a carga máxima não está especificada, mas confirmo para você com a equipe."), true);
  assert.equal(lojaFicouDeVer("A DF17 tem garantia de 1 ano. O que está faltando para concluirmos a sua compra? 🙂"), false);
  assert.equal(lojaFicouDeVer("Você prefere retirar aqui na loja ou receber por entrega? 😊"), false);
});

test("(81) 7301-7155: 'vou mostrar a ele, solicito a você' — só a última tentativa, sem cobrar em 1 h e 3 h (12/10/2026)", async () => {
  const { clienteVaiRetornar, planejarAquecimento } = await import("../../lib/ia/aquecimento.ts");
  const { HORARIO_PADRAO } = await import("../../lib/ia/horario.ts");
  for (const t of ["Irei mostrar a ele, caso tenha interesse, solicito a você", "vou pensar", "te aviso", "qualquer coisa te chamo", "depois eu falo com vc", "vou ver com minha esposa"])
    assert.equal(clienteVaiRetornar(t), true, t);
  for (const t of ["Certo", "quanto custa a DF17?", "vou querer", "Valor dos patinetes elétricos?", "pode mandar", "Divide no cartão?"]) assert.equal(clienteVaiRetornar(t), false, t);
  const so = planejarAquecimento(new Date("2026-10-13T13:00:00Z"), HORARIO_PADRAO, { soUltima: true });
  assert.deepEqual(so.map((e) => e.etapa), [3]);
});

test("Milton: a 1ª tentativa com moto é sempre a pergunta do dono, sem a IA reescrever (12/10/2026)", async () => {
  const { aquecimentoFixo } = await import("../../lib/ia/aquecimento.ts");
  assert.equal(aquecimentoFixo(1, "M6"), true);
  assert.equal(aquecimentoFixo(1, null), false);
  assert.equal(aquecimentoFixo(2, "M6"), false);
});
