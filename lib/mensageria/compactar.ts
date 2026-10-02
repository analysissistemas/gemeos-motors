/* Compactação da mídia do chat para ocupar o mínimo de disco no VPS (pedido do dono, 26/09/2026).
   Sem `server-only` e sem alias, para os testes rodarem direto no Node (igual a transcodificar.ts).

   - Foto JPEG: lado maior até 1600 px, JPEG qualidade ~80. Continua JPEG de propósito: é o formato
     que o WhatsApp aceita como foto, então a foto guardada ainda pode ser reenviada.
   - Vídeo: H.264 até 720p (lado menor), CRF 28, áudio AAC 96k, "faststart" para começar a tocar
     antes de baixar tudo. Roda em segundo plano, um por vez, para não travar o servidor.
   - Só troca o arquivo se o novo ficar pelo menos 20% menor; senão fica o original.
   - Áudio (já é Opus, pequeno), PDF e documento não mexe: compactar pode estragar.

   `scripts/compactar-midia.mjs` usa os MESMOS parâmetros para os arquivos antigos: mudou aqui,
   mude lá. COMPACTAR_MIDIA=0 desliga tudo. */
import { spawn } from "node:child_process";

export const LADO_MAX_FOTO = 1600;
export const GANHO_MINIMO = 0.8;
export const ARGS_FOTO_SAIDA = ["-q:v", "5", "-f", "image2", "-c:v", "mjpeg"];
export const ARGS_VIDEO_SAIDA = [
  "-vf", "scale='if(gt(iw,ih),-2,min(720,iw))':'if(gt(iw,ih),min(720,ih),-2)'",
  "-c:v", "libx264", "-preset", "veryfast", "-crf", "28", "-pix_fmt", "yuv420p",
  "-c:a", "aac", "-b:a", "96k", "-movflags", "+faststart",
];

export const compactacaoLigada = () => process.env.COMPACTAR_MIDIA !== "0";

function ffmpeg(args: string[], entrada: Uint8Array | null, timeoutMs: number): Promise<Buffer> {
  const bin = process.env.FFMPEG_BIN ?? "ffmpeg";
  return new Promise((resolve, reject) => {
    let filho;
    try {
      filho = spawn(/* turbopackIgnore: true */ bin, ["-hide_banner", "-loglevel", "error", ...args], { stdio: ["pipe", "pipe", "pipe"], windowsHide: true });
    } catch (e) {
      return reject(e);
    }
    const saida: Buffer[] = [];
    let erro = "";
    const relogio = setTimeout(() => filho.kill("SIGKILL"), timeoutMs);
    filho.stdout.on("data", (c: Buffer) => saida.push(c));
    filho.stderr.on("data", (c: Buffer) => {
      if (erro.length < 1000) erro += c.toString();
    });
    filho.on("error", (e) => {
      clearTimeout(relogio);
      reject(e);
    });
    filho.on("close", (codigo) => {
      clearTimeout(relogio);
      if (codigo === 0) resolve(Buffer.concat(saida));
      else reject(new Error(`ffmpeg saiu com ${codigo}: ${erro.trim().split("\n").pop() ?? ""}`));
    });
    filho.stdin.on("error", () => {});
    filho.stdin.end(entrada ? Buffer.from(entrada) : undefined);
  });
}

/** Orientação EXIF (1 a 8) de um JPEG, ou 1 se não houver. O ffmpeg não gira a foto sozinho. */
export function orientacaoJpeg(b: Uint8Array): number {
  if (b[0] !== 0xff || b[1] !== 0xd8) return 1;
  let i = 2;
  while (i + 4 < b.length && b[i] === 0xff) {
    const marca = b[i + 1];
    const tam = (b[i + 2] << 8) | b[i + 3];
    if (marca === 0xe1 && String.fromCharCode(...b.subarray(i + 4, i + 8)) === "Exif") {
      const t = i + 10;
      const le = b[t] === 0x49;
      const u16 = (o: number) => (le ? b[t + o] | (b[t + o + 1] << 8) : (b[t + o] << 8) | b[t + o + 1]);
      const u32 = (o: number) => (le ? u16(o) | (u16(o + 2) << 16) : (u16(o) << 16) | u16(o + 2)) >>> 0;
      const ifd = u32(4);
      const n = u16(ifd);
      for (let k = 0; k < n; k++) {
        const e = ifd + 2 + k * 12;
        if (u16(e) === 0x0112) return u16(e + 8) || 1;
      }
      return 1;
    }
    if (marca === 0xda) break;
    i += 2 + tam;
  }
  return 1;
}

/* orientação EXIF -> filtro que endireita (as espelhadas, 2/4/5/7, ficam sem compactar) */
const GIRO: Record<number, string> = { 1: "", 3: "hflip,vflip,", 6: "transpose=1,", 8: "transpose=2," };

/** JPEG menor, ou null quando não vale a pena (não é JPEG, espelhada, ganho pequeno, ffmpeg falhou). */
export async function compactarFoto(bytes: Uint8Array): Promise<Buffer | null> {
  if (!compactacaoLigada() || bytes.byteLength < 60 * 1024) return null;
  const giro = GIRO[orientacaoJpeg(bytes)];
  if (giro === undefined || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  const escala = `scale='min(${LADO_MAX_FOTO},iw)':'min(${LADO_MAX_FOTO},ih)':force_original_aspect_ratio=decrease`;
  try {
    const novo = await ffmpeg(["-noautorotate", "-i", "pipe:0", "-vf", giro + escala, ...ARGS_FOTO_SAIDA, "pipe:1"], bytes, 30_000);
    return novo.byteLength > 0 && novo[0] === 0xff && novo[1] === 0xd8 && novo.byteLength <= bytes.byteLength * GANHO_MINIMO ? novo : null;
  } catch {
    return null;
  }
}

/** Grava em `saida` o vídeo compactado. Quem chama compara o tamanho e decide trocar. */
export async function compactarVideoArquivo(entrada: string, saida: string, timeoutMs = 10 * 60_000) {
  await ffmpeg(["-y", "-i", entrada, ...ARGS_VIDEO_SAIDA, "-f", "mp4", saida], null, timeoutMs);
}

/** Foto do catálogo (WebP) em JPEG para o WhatsApp, que não aceita WebP como foto. JPEG e PNG passam direto. */
export async function fotoParaWhatsApp(bytes: Uint8Array): Promise<{ bytes: Buffer; mime: "image/jpeg" | "image/png" }> {
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return { bytes: Buffer.from(bytes), mime: "image/jpeg" };
  if (bytes[0] === 0x89 && bytes[1] === 0x50) return { bytes: Buffer.from(bytes), mime: "image/png" };
  const jpeg = await ffmpeg(["-i", "pipe:0", "-frames:v", "1", ...ARGS_FOTO_SAIDA, "pipe:1"], bytes, 30_000);
  if (!(jpeg[0] === 0xff && jpeg[1] === 0xd8)) throw new Error("a conversão da foto para JPEG falhou");
  return { bytes: jpeg, mime: "image/jpeg" };
}
