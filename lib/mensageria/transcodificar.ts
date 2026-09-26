/* Conversão do áudio gravado no chat para o formato que o WhatsApp entrega de verdade.
   Sem `server-only` e sem alias, para os testes rodarem direto no Node.

   Por quê: o Chrome grava "audio/mp4;codecs=mp4a.40.2" como MP4 FRAGMENTADO. A Meta aceita o
   upload e o envio (volta 200 e um id), mas depois não entrega a mensagem ao cliente. OGG com
   Opus, mono, é o formato da nota de voz do próprio WhatsApp e é entregue sempre.

   Usa o ffmpeg do sistema (no Docker: `apk add ffmpeg`). FFMPEG_BIN troca o caminho. */
import { spawn } from "node:child_process";

export const MIME_OGG_OPUS = "audio/ogg";

export class ErroConversao extends Error {}

export function paraOggOpus(entrada: Uint8Array, opcoes: { timeoutMs?: number; bin?: string } = {}): Promise<Buffer> {
  const bin = opcoes.bin ?? process.env.FFMPEG_BIN ?? "ffmpeg";
  const timeoutMs = opcoes.timeoutMs ?? 30_000;
  return new Promise((resolve, reject) => {
    /* mono, 48 kHz, ~32 kbps: nota de voz do WhatsApp; -vn ignora capa/vídeo que venha junto */
    const args = ["-hide_banner", "-loglevel", "error", "-i", "pipe:0", "-vn", "-ac", "1", "-ar", "48000", "-c:a", "libopus", "-b:a", "32k", "-application", "voip", "-f", "ogg", "pipe:1"];
    let filho;
    try {
      filho = spawn(/* turbopackIgnore: true */ bin, args, { stdio: ["pipe", "pipe", "pipe"], windowsHide: true });
    } catch (e) {
      return reject(new ErroConversao(`ffmpeg não pôde ser iniciado (${(e as Error).message})`));
    }
    const saida: Buffer[] = [];
    let erro = "";
    let acabou = false;
    const fim = (f: () => void) => {
      if (acabou) return;
      acabou = true;
      clearTimeout(relogio);
      f();
    };
    const relogio = setTimeout(() => {
      filho.kill("SIGKILL");
      fim(() => reject(new ErroConversao("a conversão do áudio passou do tempo limite")));
    }, timeoutMs);

    filho.stdout.on("data", (c: Buffer) => saida.push(c));
    filho.stderr.on("data", (c: Buffer) => {
      if (erro.length < 2000) erro += c.toString();
    });
    filho.on("error", (e: NodeJS.ErrnoException) =>
      fim(() => reject(new ErroConversao(e.code === "ENOENT" ? "ffmpeg não está instalado no servidor" : `ffmpeg falhou (${e.message})`))),
    );
    filho.on("close", (codigo) =>
      fim(() => {
        const ogg = Buffer.concat(saida);
        if (codigo !== 0) return reject(new ErroConversao(`ffmpeg saiu com erro ${codigo}${erro ? `: ${erro.trim().split("\n").pop()}` : ""}`));
        if (!ehOggOpus(ogg)) return reject(new ErroConversao("o áudio convertido saiu vazio ou inválido"));
        resolve(ogg);
      }),
    );
    /* o ffmpeg pode fechar a entrada antes (arquivo inválido): EPIPE aqui não derruba o servidor */
    filho.stdin.on("error", () => {});
    filho.stdin.end(Buffer.from(entrada));
  });
}

/** Confere a assinatura: página Ogg ("OggS") com cabeçalho Opus ("OpusHead"). */
export function ehOggOpus(b: Uint8Array): boolean {
  if (b.byteLength < 64) return false;
  const txt = (o: number, n: number) => String.fromCharCode(...b.subarray(o, o + n));
  return txt(0, 4) === "OggS" && Buffer.from(b.subarray(0, 200)).includes("OpusHead");
}

/** "gravacao.m4a" -> "gravacao.ogg" */
export const nomeOgg = (nome?: string | null) => `${(nome ?? "audio").replace(/\.[a-z0-9]{1,5}$/i, "")}.ogg`;
