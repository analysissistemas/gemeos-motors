/* Formatos de áudio e duração real do arquivo. Sem `server-only` e sem alias,
   para os testes rodarem direto no Node.

   Regra de ouro: o navegador só grava um formato que o WhatsApp aceita se
   pedirmos o codec certo. `audio/mp4` sem codec sai com Opus (recusado pela
   Meta); `audio/webm` é recusado e ainda não traz a duração no cabeçalho.
   Aceitos pela Meta: audio/aac, audio/mp4 (AAC), audio/mpeg, audio/amr, audio/ogg (Opus). */

export const LIMITE_AUDIO_BYTES = 4 * 1024 * 1024; // a Vercel corta requisições acima de 4,5 MB
export const DURACAO_MAXIMA_S = 300;
export const DURACAO_MINIMA_S = 1;

/** Tipos que o WhatsApp Cloud API aceita como áudio. */
export const MIMES_WHATSAPP = ["audio/mp4", "audio/aac", "audio/mpeg", "audio/amr", "audio/ogg"] as const;
/** Tipos que o sistema guarda e toca no chat (WebM toca, mas não vai para o WhatsApp). */
export const MIMES_ACEITOS = [...MIMES_WHATSAPP, "audio/webm"] as const;

/** Ordem de preferência na gravação. O primeiro que o navegador suportar é usado. */
export const PREFERENCIA_GRAVACAO = ["audio/mp4;codecs=mp4a.40.2", "audio/ogg;codecs=opus", "audio/webm;codecs=opus", "audio/webm"] as const;

/** "audio/ogg; codecs=opus" -> "audio/ogg" */
export const mimeBase = (mime: string) => mime.split(";")[0].trim().toLowerCase();

export const ehAudioAceito = (mime: string) => (MIMES_ACEITOS as readonly string[]).includes(mimeBase(mime));
export const vaiParaWhatsApp = (mime: string) => (MIMES_WHATSAPP as readonly string[]).includes(mimeBase(mime));

const EXTENSOES: Record<string, string> = { "audio/mp4": "m4a", "audio/aac": "aac", "audio/mpeg": "mp3", "audio/amr": "amr", "audio/ogg": "ogg", "audio/webm": "webm" };
export const extensaoDoMime = (mime: string) => EXTENSOES[mimeBase(mime)] ?? "bin";

/** MP4 gravado pelo MediaRecorder é "fragmentado": o cabeçalho (moov) não traz a duração total,
 *  que fica espalhada nos fragmentos (moof/trun). Somamos a duração de cada amostra. */
function duracaoMp4Fragmentado(b: Uint8Array): number | null {
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const tipo = (o: number) => String.fromCharCode(b[o], b[o + 1], b[o + 2], b[o + 3]);
  const CONTAINERS = new Set(["moov", "trak", "mdia", "mvex", "moof", "traf"]);
  let timescale = 0;
  let padrao = 0;
  let total = 0;
  let trafPadrao = 0;
  const varrer = (ini: number, fim: number) => {
    let o = ini;
    while (o + 8 <= fim) {
      let tam = dv.getUint32(o);
      const t = tipo(o + 4);
      if (tam === 0) tam = fim - o;
      if (tam < 8 || o + tam > fim) break;
      const corpo = o + 8;
      if (CONTAINERS.has(t)) {
        if (t === "traf") trafPadrao = padrao;
        varrer(corpo, o + tam);
      } else if (t === "mdhd" && !timescale) {
        timescale = dv.getUint32(corpo + (b[corpo] === 1 ? 20 : 12));
      } else if (t === "trex") {
        padrao = dv.getUint32(corpo + 12);
      } else if (t === "tfhd") {
        const fl = dv.getUint32(corpo) & 0xffffff;
        let p = corpo + 8;
        if (fl & 0x1) p += 8;
        if (fl & 0x2) p += 4;
        trafPadrao = fl & 0x8 ? dv.getUint32(p) : padrao;
      } else if (t === "trun") {
        const fl = dv.getUint32(corpo) & 0xffffff;
        const n = dv.getUint32(corpo + 4);
        let p = corpo + 8;
        if (fl & 0x1) p += 4;
        if (fl & 0x4) p += 4;
        const passo = (fl & 0x100 ? 4 : 0) + (fl & 0x200 ? 4 : 0) + (fl & 0x400 ? 4 : 0) + (fl & 0x800 ? 4 : 0);
        for (let i = 0; i < n && p + passo <= o + tam; i++, p += passo) total += fl & 0x100 ? dv.getUint32(p) : trafPadrao;
      }
      o += tam;
    }
  };
  try {
    varrer(0, b.length);
  } catch {
    return null;
  }
  return timescale > 0 && total > 0 ? total / timescale : null;
}

/** Mede a duração REAL do arquivo lendo os metadados. Devolve null quando o arquivo não informa
 *  (caso do WebM gravado pelo navegador). Nunca confia no número que o navegador mandou. */
export async function medirDuracao(bytes: Uint8Array, mime: string): Promise<number | null> {
  try {
    let d: number | undefined | null = null;
    if (mimeBase(mime) === "audio/mp4") d = duracaoMp4Fragmentado(bytes);
    if (d == null) {
      const { parseBuffer } = await import("music-metadata");
      d = (await parseBuffer(bytes, { mimeType: mimeBase(mime) }, { duration: true })).format.duration;
    }
    return typeof d === "number" && Number.isFinite(d) && d > 0 ? Math.round(d * 10) / 10 : null;
  } catch {
    return null;
  }
}

export type DecisaoDuracao = { duracao: number; origem: "arquivo" | "navegador"; divergencia: number | null };

/** Escolhe a duração a guardar: a do arquivo, se existir; senão a do navegador (limitada). */
export function decidirDuracao(doArquivo: number | null, doNavegador: number | null): DecisaoDuracao | null {
  const nav = doNavegador != null && Number.isFinite(doNavegador) ? Math.min(Math.max(doNavegador, 0), DURACAO_MAXIMA_S + 5) : null;
  if (doArquivo != null) return { duracao: doArquivo, origem: "arquivo", divergencia: nav != null ? Math.round(Math.abs(nav - doArquivo) * 10) / 10 : null };
  if (nav != null && nav > 0) return { duracao: Math.round(nav * 10) / 10, origem: "navegador", divergencia: null };
  return null;
}
