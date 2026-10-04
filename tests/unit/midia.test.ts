/* Foto e vídeo da moto que a IA manda junto com a resposta (lib/ia/midia-tipos.ts). Puro: sem banco
   nem WhatsApp. Roda com `npm run test:ia`. */
import assert from "node:assert/strict";
import { test } from "node:test";
import { instrucaoDeMidia, pedidoDeMidia, planejarApresentacao, planejarOpcoes, planejarPedido, tirarPromessaDeMidia, ultimaCitada, type ModeloComMidia } from "../../lib/ia/midia-tipos.ts";

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

test("apresentação: 1ª vez que a moto aparece leva foto e vídeo; depois não repete", () => {
  const p = planejarApresentacao({ modelos: [AG08, TANK], textoCliente: "quanto custa a AG08?", resposta: "A AG08 custa...", jaEnviadas: [] });
  assert.deepEqual(p?.itens.map((i) => i.tipo), ["foto", "video"]);
  assert.equal(p?.itens[0].legenda, "*AG08* na cor Cinza");
  assert.equal(planejarApresentacao({ modelos: [AG08], textoCliente: "e a AG08?", resposta: "", jaEnviadas: [AG08.videoUrl!] }), null);
  /* a resposta apresenta duas motos: não escolhe sozinho */
  assert.equal(planejarApresentacao({ modelos: [AG08, TANK], textoCliente: "quais motos?", resposta: "Temos a AG08 e a TANK AG11.", jaEnviadas: [] }), null);
});

test("apresentação depois das opções: a foto já foi, então vai só o vídeo", () => {
  const p = planejarApresentacao({ modelos: [AG08, TANK], textoCliente: "gostei da AG08", resposta: "", jaEnviadas: [AG08.fotos[0].url, TANK.fotos[0].url] });
  assert.deepEqual(p?.itens.map((i) => i.tipo), ["video"]);
  /* sem vídeo cadastrado e a foto já foi: nada repete */
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
