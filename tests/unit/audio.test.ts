/* Testes de formato e duração de áudio. Os arquivos em fixtures/ foram gravados de verdade
   pelo Chrome (2,2 s de gravação), então a duração esperada vem de um arquivo real. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { decidirDuracao, ehAudioAceito, extensaoDoMime, medirDuracao, mimeBase, PREFERENCIA_GRAVACAO, vaiParaWhatsApp } from "../../lib/mensageria/audio-formatos.ts";

const MP4 = new Uint8Array(readFileSync(new URL("./fixtures/gravacao-2s.m4a", import.meta.url)));
const WEBM = new Uint8Array(readFileSync(new URL("./fixtures/gravacao-2s.webm", import.meta.url)));

test("a duração vem do ARQUIVO: o mp4 gravado pelo Chrome mede ~2,1 s", async () => {
  const d = await medirDuracao(MP4, "audio/mp4;codecs=mp4a.40.2");
  assert.ok(d !== null && d > 1.9 && d < 2.4, `duração medida: ${d}`);
});

test("WebM gravado pelo navegador não informa duração (por isso não é confiável nem vai ao WhatsApp)", async () => {
  const d = await medirDuracao(WEBM, "audio/webm");
  assert.ok(d === null || d > 0);
  assert.equal(vaiParaWhatsApp("audio/webm;codecs=opus"), false);
});

test("arquivo corrompido ou vazio não quebra: devolve null", async () => {
  assert.equal(await medirDuracao(new Uint8Array([1, 2, 3, 4]), "audio/mp4"), null);
  assert.equal(await medirDuracao(new Uint8Array(), "audio/ogg"), null);
});

test("o mp4 gravado tem cara de mp4 (caixa ftyp) e AAC pode ir ao WhatsApp", () => {
  assert.equal(new TextDecoder().decode(MP4.slice(4, 8)), "ftyp");
  assert.equal(vaiParaWhatsApp("audio/mp4;codecs=mp4a.40.2"), true);
});

test("formatos: base do mime, extensão e listas aceitas", () => {
  assert.equal(mimeBase("Audio/OGG; codecs=opus"), "audio/ogg");
  assert.equal(extensaoDoMime("audio/mp4;codecs=mp4a.40.2"), "m4a");
  assert.equal(extensaoDoMime("audio/webm;codecs=opus"), "webm");
  assert.equal(extensaoDoMime("video/mp4"), "bin");
  assert.equal(ehAudioAceito("audio/ogg;codecs=opus"), true);
  assert.equal(ehAudioAceito("application/pdf"), false);
  assert.equal(ehAudioAceito("audio/wav"), false);
});

test("a preferência de gravação pede o codec AAC explícito antes do WebM", () => {
  assert.equal(PREFERENCIA_GRAVACAO[0], "audio/mp4;codecs=mp4a.40.2");
  assert.ok(PREFERENCIA_GRAVACAO.indexOf("audio/webm;codecs=opus") > PREFERENCIA_GRAVACAO.indexOf("audio/mp4;codecs=mp4a.40.2"));
});

test("decisão de duração: o arquivo manda; o navegador só serve de reserva e é limitado", () => {
  assert.deepEqual(decidirDuracao(2.1, 9), { duracao: 2.1, origem: "arquivo", divergencia: 6.9 });
  assert.deepEqual(decidirDuracao(null, 3.04), { duracao: 3, origem: "navegador", divergencia: null });
  assert.equal(decidirDuracao(null, null), null);
  assert.equal(decidirDuracao(null, 0), null);
  assert.equal(decidirDuracao(null, Number.POSITIVE_INFINITY), null);
  assert.equal(decidirDuracao(null, 9999)?.duracao, 305);
});
