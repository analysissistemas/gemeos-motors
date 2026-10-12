/* Foto e áudio do cliente (lib/ia/foto-cliente.ts), queixa do dono de 10/10/2026: "as pessoas estão mandando foto e a IA
   está oferecendo as motos nada a ver". Roda com `npm run test:ia`. */
import assert from "node:assert/strict";
import { test } from "node:test";
import { instrucaoDeFoto, respostaParaMidia, TEXTO_CATALOGO_FOTO, TEXTO_CATALOGO_AUDIO, TEXTO_FOTO_NAO_CONFIRMA, TEXTO_DA_RESPOSTA } from "../../lib/ia/foto-cliente.ts";
import { textoDaMensagem } from "../../lib/ia/workflow/util.ts";
import { validarResposta } from "../../lib/ia/validador.ts";

const MODELOS = ["TANK AG11", "X GÊMEOS", "DF17", "Patinete 800W", "T3 Retrô", "MM3"];
/* o buffer como o nó "Juntar mensagens" monta: uma mensagem por parágrafo */
const foto = (legenda?: string) => textoDaMensagem({ tipo: "imagem", conteudo: legenda ?? null, transcricao: "Moto elétrica preta com baú, parecida com uma scooter." });
const audio = "[áudio] (o cliente mandou um áudio; a IA não o transcreve)";
const r = (textoBuffer: string, ultimaDaLoja = "Me chamo Milton, da Gêmeos Motors! Como posso te ajudar?", foraDaVenda = false) =>
  respostaParaMidia({ textoBuffer, ultimaDaLoja, modelos: MODELOS, foraDaVenda });

test("a descrição da foto nunca chega à IA: só a legenda que o cliente escreveu", () => {
  assert.equal(foto(), "[imagem]");
  assert.equal(foto("tem essa?"), "[imagem: tem essa?]");
  assert.doesNotMatch(foto("quanto?"), /preta|baú|scooter/u);
});

test("foto de qualquer jeito, sem o nome de um modelo: vai o catálogo", () => {
  assert.equal(r(foto()), "catalogo_foto");
  assert.equal(r(foto("tem essa?")), "catalogo_foto");
  assert.equal(r(foto("quanto custa essa moto?")), "catalogo_foto");
  /* foto e o texto em mensagens separadas, nas duas ordens */
  assert.equal(r([foto(), "Tem essa ai?"].join("\n\n")), "catalogo_foto");
  assert.equal(r(["Boa tarde", foto(), "vcs tem?"].join("\n\n")), "catalogo_foto");
  /* duas fotos seguidas */
  assert.equal(r([foto(), foto()].join("\n\n")), "catalogo_foto");
  /* moto que a loja não trabalha: também catálogo, sem confirmar nada */
  assert.equal(r([foto(), "tem a honda biz eletrica?"].join("\n\n")), "catalogo_foto");
});

test("áudio, só ou com texto sem o nome de um modelo: vai o catálogo", () => {
  assert.equal(r(audio), "catalogo_audio");
  assert.equal(r([audio, "me responde"].join("\n\n")), "catalogo_audio");
});

test("escreveu o nome de um modelo da loja: a IA atende sobre ele", () => {
  assert.equal(r(foto("tem essa TANK?")), null);
  assert.equal(r([foto(), "quanto ta a x gêmeos?"].join("\n\n")), null);
  assert.equal(r([audio, "queria saber da DF17"].join("\n\n")), null);
  assert.equal(r([foto(), "e o patinete 800w?"].join("\n\n")), null);
});

test("o catálogo não vai duas vezes seguidas", () => {
  assert.equal(r(foto(), TEXTO_CATALOGO_FOTO), "foto_nao_confirma");
  assert.equal(r(audio, TEXTO_CATALOGO_AUDIO), "audio_nao_ouve");
  /* só texto depois do catálogo da foto: "tem essa?" sem dizer qual */
  assert.equal(r("Tem essa?", TEXTO_CATALOGO_FOTO), "foto_nao_confirma");
  assert.equal(r("quanto é essa ai", TEXTO_FOTO_NAO_CONFIRMA), "foto_nao_confirma");
  assert.equal(r("e essa do áudio?", TEXTO_CATALOGO_AUDIO), "audio_nao_ouve");
  /* depois do catálogo, escolheu pelo nome ou fez outra pergunta: a IA responde */
  assert.equal(r("gostei da TANK", TEXTO_CATALOGO_FOTO), null);
  assert.equal(r("vocês entregam em Itambé?", TEXTO_CATALOGO_FOTO), null);
});

test("assistência, recado e reclamação não recebem catálogo (foto do defeito)", () => {
  assert.equal(r(foto("minha moto parou de ligar"), undefined, true), null);
  assert.equal(r(audio, undefined, true), null);
});

test("sem foto nem áudio, nada muda", () => {
  assert.equal(r("Oi, quanto custa a TANK?"), null);
  assert.equal(r("tem moto pra entrega?"), null);
});

test("foto com o nome do modelo: a IA é avisada de que não vê a foto", () => {
  assert.match(instrucaoDeFoto(foto("tem essa TANK?")), /NÃO vê a foto/u);
  assert.equal(instrucaoDeFoto("quanto custa a TANK?"), "");
});

test("os textos do sistema passam no validador e não dizem que a loja tem a moto da foto", () => {
  for (const texto of Object.values(TEXTO_DA_RESPOSTA)) {
    const v = validarResposta(texto);
    assert.equal(v.aprovada, true, `barrado: ${texto} → ${JSON.stringify(v.violacoes)}`);
    assert.doesNotMatch(texto, /temos\s+(?:essa|sim)|é\s+a\s+da\s+foto|qual é a da foto/iu);
  }
});

test("Mayna Dornelas: áudio transcrito vale como texto; a IA entende o assunto e não manda o catálogo (12/10/2026)", async () => {
  const { instrucaoDeAudio } = await import("../../lib/ia/foto-cliente.ts");
  const ouvido = textoDaMensagem({ tipo: "audio", conteudo: null, transcricao: "Oi, a scooter que eu comprei aí tá mostrando LC no painel e não anda" });
  assert.equal(ouvido, "[áudio] Oi, a scooter que eu comprei aí tá mostrando LC no painel e não anda");
  /* transcrito: a IA responde (assistência segue o caminho dela; compra, a IA atende) */
  assert.equal(r(ouvido), null);
  assert.equal(r(textoDaMensagem({ tipo: "audio", conteudo: null, transcricao: "vocês parcelam no cartão?" })), null);
  assert.match(instrucaoDeAudio(ouvido), /Nunca sugira nem escolha um modelo/u);
  /* sem transcrição (desligada ou falhou): o catálogo, como antes */
  assert.equal(r(textoDaMensagem({ tipo: "audio", conteudo: null, transcricao: null })), "catalogo_audio");
  assert.equal(r(audio), "catalogo_audio");
  assert.equal(instrucaoDeAudio(audio), "");
  assert.equal(instrucaoDeAudio("quanto custa a DF17?"), "");
});
