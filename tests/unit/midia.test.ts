/* Foto e vídeo da moto que a IA manda junto com a resposta (lib/ia/midia-tipos.ts). Puro: sem banco
   nem WhatsApp. Roda com `npm run test:ia`. */
import assert from "node:assert/strict";
import { test } from "node:test";
import { instrucaoDeMidia, pedidoDeMidia, planejarApresentacao, planejarIndicacao, planejarOpcoes, planejarPedido, tirarPromessaDeMidia, ultimaCitada, type ModeloComMidia } from "../../lib/ia/midia-tipos.ts";

const AG08: ModeloComMidia = { id: 5, nome: "AG08", fotos: [{ url: "/api/vitrine/foto/modelo-5-a.webp", cor: "Cinza" }], videoUrl: "/api/midia/chat/video-AG08-x.mp4" };
const TANK: ModeloComMidia = { id: 1, nome: "TANK AG11", fotos: [{ url: "/api/vitrine/foto/modelo-1-b.webp", cor: "Preta" }], videoUrl: null };
const DF17: ModeloComMidia = { id: 7, nome: "DF17", fotos: [], videoUrl: null };

test("pedido: foto, vídeo, os dois, ou 'quero ver a moto' (os dois)", () => {
  assert.deepEqual(pedidoDeMidia("tem foto dela?"), ["foto"]);
  assert.deepEqual(pedidoDeMidia("manda um vídeo"), ["video"]);
  assert.deepEqual(pedidoDeMidia("tem foto e video?"), ["foto", "video"]);
  assert.deepEqual(pedidoDeMidia("quero ver a moto"), ["foto", "video"]);
  assert.deepEqual(pedidoDeMidia("me mostra ela"), ["foto", "video"]);
  assert.deepEqual(pedidoDeMidia("quanto custa a AG08?"), []);
  /* "fotógrafo" e "videogame" não são pedido */
  assert.deepEqual(pedidoDeMidia("sou fotógrafo e jogo videogame"), []);
});

test("moto citada: a última do texto, pelo nome inteiro ou pelo pedaço com número", () => {
  assert.equal(ultimaCitada([AG08, TANK], "gostei da tank ag11 mas e a ag08?")?.nome, "AG08");
  assert.equal(ultimaCitada([AG08, TANK], "e a AG11?")?.nome, "TANK AG11");
  assert.equal(ultimaCitada([AG08, TANK], "ag080")?.nome, undefined);
});

test("pedido sem citar moto: usa a do histórico; sem histórico e com uma moto só no estoque, essa", () => {
  const p1 = planejarPedido({ modelos: [AG08, TANK], textoCliente: "tem foto?", historicoCliente: "Lead: quanto custa a AG08?", interesse: null });
  assert.equal(p1?.modelo?.nome, "AG08");
  assert.deepEqual(p1?.itens.map((i) => i.tipo), ["foto"]);
  const p2 = planejarPedido({ modelos: [AG08], textoCliente: "manda video", historicoCliente: "", interesse: null });
  assert.deepEqual(p2?.itens.map((i) => i.url), [AG08.videoUrl]);
  /* duas motos e nenhuma citada: pergunta qual, nada vai */
  const p3 = planejarPedido({ modelos: [AG08, TANK], textoCliente: "tem foto?", historicoCliente: "", interesse: null });
  assert.equal(p3?.modelo, null);
  assert.match(instrucaoDeMidia(p3!), /pergunte qual moto/);
});

test("pedido sem arquivo cadastrado: nada vai e a IA é avisada para não prometer", () => {
  const p = planejarPedido({ modelos: [DF17], textoCliente: "tem video da DF17?", historicoCliente: "", interesse: null });
  assert.deepEqual(p?.itens, []);
  assert.match(instrucaoDeMidia(p!), /NÃO diga que está mandando/);
});

test("apresentação: 1ª vez que a moto aparece leva só a foto (vídeo só se o cliente pedir: Milton, 27/10/2026); depois não repete", () => {
  const p = planejarApresentacao({ modelos: [AG08, TANK], textoCliente: "quanto custa a AG08?", resposta: "A AG08 custa...", jaEnviadas: [] });
  assert.deepEqual(p?.itens.map((i) => i.tipo), ["foto"]);
  assert.equal(p?.itens[0].legenda, "*AG08* na cor Cinza");
  assert.equal(planejarApresentacao({ modelos: [AG08], textoCliente: "e a AG08?", resposta: "", jaEnviadas: [AG08.videoUrl!] }), null);
  /* a resposta apresenta duas motos: não escolhe sozinho */
  assert.equal(planejarApresentacao({ modelos: [AG08, TANK], textoCliente: "quais motos?", resposta: "Temos a AG08 e a TANK AG11.", jaEnviadas: [] }), null);
});

test("apresentação depois das opções: a foto já foi, nada vai de novo (o vídeo, só pedido)", () => {
  assert.equal(planejarApresentacao({ modelos: [AG08, TANK], textoCliente: "gostei da AG08", resposta: "", jaEnviadas: [AG08.fotos[0].url, TANK.fotos[0].url] }), null);
  assert.equal(planejarApresentacao({ modelos: [AG08, TANK], textoCliente: "e a tank?", resposta: "", jaEnviadas: [TANK.fotos[0].url] }), null);
});

test("sem mídia: a frase que promete foto/vídeo sai, o resto fica", () => {
  assert.equal(tirarPromessaDeMidia("A AG08 anda até 45 km. Segue a foto dela! Quer saber o preço?"), "A AG08 anda até 45 km. Quer saber o preço?");
  assert.equal(tirarPromessaDeMidia("Vou te mandar o vídeo agora."), "");
  assert.equal(tirarPromessaDeMidia("A AG08 tem banco plano."), "A AG08 tem banco plano.");
});

test("pesquisando: a resposta com 2 ou 3 motos leva uma foto de cada, sem vídeo e sem repetir", () => {
  const p = planejarOpcoes({ modelos: [AG08, TANK, DF17], resposta: "Temos a AG08 por R$ 8.999,90 e a TANK AG11 por R$ 11.990.", jaEnviadas: [] });
  assert.deepEqual(p?.itens.map((i) => i.legenda), ["*AG08* na cor Cinza", "*TANK AG11* na cor Preta"]);
  assert.ok(p?.itens.every((i) => i.tipo === "foto"));
  /* uma moto só não é "opções"; foto já mandada não repete */
  assert.equal(planejarOpcoes({ modelos: [AG08, TANK], resposta: "A AG08 custa R$ 8.999,90.", jaEnviadas: [] }), null);
  assert.deepEqual(planejarOpcoes({ modelos: [AG08, TANK], resposta: "AG08 e TANK AG11", jaEnviadas: [AG08.fotos[0].url] })?.itens.map((i) => i.legenda), ["*TANK AG11* na cor Preta"]);
});

test("\"moto tank\" é a TANK AG11; palavra genérica não identifica modelo (05/10/2026)", () => {
  const ms = [{ nome: "TANK AG11" }, { nome: "T1" }, { nome: "Patinete 800W" }, { nome: "X GÊMEOS" }, { nome: "Capacete Joy Bege" }];
  assert.equal(ultimaCitada(ms, "fechado, quero a moto tank")?.nome, "TANK AG11");
  assert.equal(ultimaCitada(ms, "quero um patinete"), null);
  assert.equal(ultimaCitada(ms, "vocês são da gêmeos motors?"), null);
  assert.equal(ultimaCitada(ms, "e o de 800W?")?.nome, "Patinete 800W");
});

test("texto e foto batem: promessa de foto de moto que não vai sai (Arine, 06/10/2026)", async () => {
  const { tirarPromessaDeOutras } = await import("../../lib/ia/midia-tipos.ts");
  const todos = ["T3 RETRÔ", "DF17", "AG08"];
  assert.equal(tirarPromessaDeOutras("Aqui está a foto da *DF17* e da *AG08*. A DF17 custa R$ 7.190.", ["T3 RETRÔ"], todos), "A DF17 custa R$ 7.190.");
  assert.equal(tirarPromessaDeOutras("Aqui estão as fotos da *DF17* e da *AG08* 👇", ["DF17", "AG08"], todos), "Aqui estão as fotos da *DF17* e da *AG08* 👇");
  assert.equal(tirarPromessaDeOutras("A AG08 anda até 45 km.", [], todos), "A AG08 anda até 45 km.");
});

test("'Olha ela aí' sem a foto junto sai do texto (usuário, 12/10/2026: pediu a foto da M6 e veio só a frase)", () => {
  assert.equal(tirarPromessaDeMidia("Olha ela aí"), "");
  assert.equal(tirarPromessaDeMidia("Olha ela aí 👇"), "");
  assert.equal(tirarPromessaDeMidia("Olha ela aí! A M6 custa R$ 11.900."), "A M6 custa R$ 11.900.");
  assert.equal(tirarPromessaDeMidia("Olha, ela é ótima para a cidade."), "Olha, ela é ótima para a cidade.");
});

test("a frase do site não é cortada no ponto de 'gemeosmotors.com.br' (12/10/2026: sobrava 'com.br' e o validador barrava)", () => {
  const t = tirarPromessaDeMidia("Pela foto eu não consigo confirmar o modelo, mas aqui estão todos os que a gente tem, com foto e preço: gemeosmotors.com.br. Me diz qual te chamou atenção.");
  assert.doesNotMatch(t, /^com\.br/u);
  assert.doesNotMatch(t, /(?<![\p{L}])com\.br/u);
});

test("indicação da qualificação: uma foto de cada moto indicada, sem vídeo e sem repetir (Milton, 27/10/2026)", () => {
  const p = planejarIndicacao({ modelos: [AG08, TANK, DF17], nomes: ["AG08", "TANK AG11"], jaEnviadas: [] })!;
  assert.deepEqual(p.itens.map((i) => i.legenda), ["*AG08* na cor Cinza", "*TANK AG11* na cor Preta"]);
  /* a foto da AG08 já foi: vai a outra */
  assert.deepEqual(planejarIndicacao({ modelos: [AG08, TANK], nomes: ["AG08", "TANK AG11"], jaEnviadas: [AG08.fotos[0].url] })!.itens.map((i) => i.legenda), ["*TANK AG11* na cor Preta"]);
  /* sem arquivo nenhum (DF17): nada */
  assert.equal(planejarIndicacao({ modelos: [DF17], nomes: ["DF17"], jaEnviadas: [] }), null);
});

test("dono (21/10/2026): cliente pede a foto da moto esgotada, a foto vai e a IA não diz que não dá", () => {
  const mm3 = { id: 9, nome: "MM3", fotos: [{ url: "/m/mm3.jpg", cor: null }], videoUrl: null, semEstoque: true };
  const plano = planejarPedido({ modelos: [mm3], textoCliente: "manda a foto dela direitinho", historicoCliente: "", interesse: "MM3" });
  assert.equal(plano?.itens[0]?.url, "/m/mm3.jpg");
  assert.match(instrucaoDeMidia(plano), /a foto vai mesmo assim/);
});

test("Simulador (21/10/2026): 'manda o vídeo dele' depois de mostrar UMA moto manda o vídeo dela", () => {
  const fox = { id: 1, nome: "Triciclo Foxscoo", fotos: [{ url: "/f.jpg", cor: null }], videoUrl: "/f.mp4" };
  const n2 = { id: 2, nome: "N2", fotos: [{ url: "/n2.jpg", cor: null }], videoUrl: "/n2.mp4" };
  const plano = planejarPedido({ modelos: [fox, n2], textoCliente: "manda o vídeo dele", historicoCliente: "Lead: queria uma moto pra minha mãe que é idosa", interesse: null, ultimasDaLoja: "Agente IA: *Triciclo Foxscoo* Triciclo elétrico. 💰 *R$ 10.000*\nGostou dela? Quer que eu te mande o vídeo? 😊" });
  assert.equal(plano?.modelo?.nome, "Triciclo Foxscoo");
  assert.equal(plano?.itens.find((i) => i.tipo === "video")?.url, "/f.mp4");
});
