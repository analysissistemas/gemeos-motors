/* Compactação de foto e vídeo do chat com o ffmpeg de verdade. As imagens e o vídeo de teste são
   gerados pelo próprio ffmpeg. Sem ffmpeg com libx264 (FFMPEG_BIN ou "ffmpeg" no PATH), os testes
   que precisam dele são pulados e dizem por quê. */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { compactarFoto, compactarVideoArquivo, orientacaoJpeg } from "../../lib/mensageria/compactar.ts";

const BIN = process.env.FFMPEG_BIN ?? "ffmpeg";
const versao = spawnSync(BIN, ["-hide_banner", "-encoders"], { windowsHide: true, encoding: "utf8" });
const semFfmpeg = versao.error || !/libx264/.test(versao.stdout ?? "") ? `ffmpeg com libx264 não encontrado (${BIN}); defina FFMPEG_BIN para rodar` : false;

function gerar(args: string[]) {
  const r = spawnSync(BIN, ["-hide_banner", "-loglevel", "error", ...args], { windowsHide: true, maxBuffer: 64 * 1024 * 1024 });
  if (r.status !== 0) throw new Error(String(r.stderr));
  return r.stdout as Buffer;
}
/** foto "pesada" 3000x2000 (qualidade máxima) */
const fotoGrande = () => gerar(["-f", "lavfi", "-i", "testsrc2=s=3000x2000", "-frames:v", "1", "-q:v", "2", "-f", "image2", "-c:v", "mjpeg", "pipe:1"]);

/** largura e altura lidas do marcador SOF do JPEG */
function tamanhoJpeg(b: Uint8Array) {
  let i = 2;
  while (i < b.length) {
    const m = b[i + 1];
    if (m >= 0xc0 && m <= 0xc3) return { altura: (b[i + 5] << 8) | b[i + 6], largura: (b[i + 7] << 8) | b[i + 8] };
    i += 2 + ((b[i + 2] << 8) | b[i + 3]);
  }
  throw new Error("SOF não achado");
}

/** põe um bloco EXIF com a orientação pedida logo depois do início do JPEG */
function comOrientacao(jpeg: Buffer, orientacao: number) {
  const tiff = Buffer.from([0x49, 0x49, 0x2a, 0x00, 0x08, 0, 0, 0, 0x01, 0x00, 0x12, 0x01, 0x03, 0x00, 0x01, 0, 0, 0, orientacao, 0, 0, 0, 0, 0, 0, 0]);
  const corpo = Buffer.concat([Buffer.from("Exif\0\0", "binary"), tiff]);
  const app1 = Buffer.concat([Buffer.from([0xff, 0xe1, (corpo.length + 2) >> 8, (corpo.length + 2) & 0xff]), corpo]);
  return Buffer.concat([jpeg.subarray(0, 2), app1, jpeg.subarray(2)]);
}

test("orientação EXIF é lida; sem EXIF vale 1", { skip: semFfmpeg }, () => {
  const j = fotoGrande();
  assert.equal(orientacaoJpeg(j), 1);
  assert.equal(orientacaoJpeg(comOrientacao(j, 6)), 6);
  assert.equal(orientacaoJpeg(new Uint8Array([1, 2, 3])), 1);
});

test("foto grande vira JPEG de até 1600 px e bem menor", { skip: semFfmpeg }, async () => {
  const antes = fotoGrande();
  const depois = await compactarFoto(antes);
  assert.ok(depois, "devia compactar");
  assert.equal(tamanhoJpeg(depois).largura, 1600);
  assert.ok(depois.byteLength <= antes.byteLength * 0.8, `${depois.byteLength} de ${antes.byteLength}`);
});

test("foto de celular deitada (EXIF 6) sai em pé", { skip: semFfmpeg }, async () => {
  const depois = await compactarFoto(comOrientacao(fotoGrande(), 6));
  assert.ok(depois);
  const t = tamanhoJpeg(depois);
  assert.ok(t.altura > t.largura, `${t.largura}x${t.altura}`);
  assert.equal(orientacaoJpeg(depois), 1);
});

test("foto espelhada (EXIF 2), pequena, ou que não é JPEG fica como está", { skip: semFfmpeg }, async () => {
  assert.equal(await compactarFoto(comOrientacao(fotoGrande(), 2)), null);
  assert.equal(await compactarFoto(new Uint8Array(1000)), null);
  assert.equal(await compactarFoto(Buffer.alloc(200_000, 7)), null);
});

test("vídeo 1080p vira 720p menor e toca do início", { skip: semFfmpeg }, async () => {
  const pasta = mkdtempSync(path.join(tmpdir(), "compactar-"));
  try {
    const entrada = path.join(pasta, "entrada.mp4");
    const saida = path.join(pasta, "saida.mp4");
    gerar(["-f", "lavfi", "-i", "testsrc2=s=1920x1080:r=30:d=3", "-f", "lavfi", "-i", "sine=d=3", "-c:v", "libx264", "-b:v", "8M", "-c:a", "aac", "-shortest", "-y", entrada]);
    await compactarVideoArquivo(entrada, saida);
    assert.ok(statSync(saida).size <= statSync(entrada).size * 0.8, `${statSync(saida).size} de ${statSync(entrada).size}`);
    const info = spawnSync(BIN, ["-hide_banner", "-i", saida], { windowsHide: true, encoding: "utf8" }).stderr;
    assert.match(info, /1280x720/);
    const b = readFileSync(saida);
    assert.ok(b.indexOf("moov") < b.indexOf("mdat"), "faststart: o índice (moov) vem antes dos dados");
  } finally {
    rmSync(pasta, { recursive: true, force: true });
  }
});
