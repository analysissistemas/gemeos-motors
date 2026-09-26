/* Conversão para OGG/Opus com o ffmpeg de verdade, a partir de uma gravação real do Chrome
   (MP4 fragmentado). Sem ffmpeg na máquina (FFMPEG_BIN ou "ffmpeg" no PATH), os testes que
   precisam dele são pulados e dizem por quê. */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { ErroConversao, ehOggOpus, nomeOgg, paraOggOpus } from "../../lib/mensageria/transcodificar.ts";

const MP4 = new Uint8Array(readFileSync(new URL("./fixtures/gravacao-2s.m4a", import.meta.url)));
const BIN = process.env.FFMPEG_BIN ?? "ffmpeg";
const temFfmpeg = !spawnSync(BIN, ["-version"], { windowsHide: true }).error;
const semFfmpeg = temFfmpeg ? false : `ffmpeg não encontrado (${BIN}); defina FFMPEG_BIN para rodar`;

test("MP4 fragmentado do Chrome vira OGG/Opus válido", { skip: semFfmpeg }, async () => {
  const ogg = await paraOggOpus(MP4);
  assert.ok(ehOggOpus(ogg), "saída precisa começar com OggS e ter OpusHead");
  assert.ok(ogg.byteLength > 1000 && ogg.byteLength < MP4.byteLength * 3);
});

test("arquivo que não é áudio falha com erro legível", { skip: semFfmpeg }, async () => {
  await assert.rejects(paraOggOpus(new TextEncoder().encode("isto não é áudio".repeat(20))), ErroConversao);
});

test("ffmpeg ausente vira erro claro, sem derrubar o processo", async () => {
  await assert.rejects(paraOggOpus(MP4, { bin: "ffmpeg-que-nao-existe-xyz" }), (e: unknown) => e instanceof ErroConversao && /não está instalado/.test((e as Error).message));
});

test("assinatura OGG/Opus e nome do arquivo", () => {
  assert.equal(ehOggOpus(MP4), false);
  assert.equal(nomeOgg("gravacao.m4a"), "gravacao.ogg");
  assert.equal(nomeOgg(null), "audio.ogg");
});
