import "server-only";
import { randomBytes } from "node:crypto";
import { createReadStream, mkdirSync, accessSync, constants } from "node:fs";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import type { Midia } from "./tipos";

/* Mídia do chat (fotos, PDFs, áudios) fica em disco no VPS, numa pasta que
   sobrevive a cada nova implantação (volume /data no EasyPanel). Nada é público:
   no banco guardamos só o caminho interno /api/midia/chat/..., e a rota
   app/api/midia confere se quem pede está logado e tem acesso ao atendimento.

   Cada arquivo tem ao lado um "<arquivo>.meta.json" com o tipo (mime). Os
   arquivos que estavam no Vercel Blob foram trazidos com o mesmo caminho por
   scripts/copiar-midia.mjs, então as mensagens antigas continuam abrindo. */

const PREFIXO = "/api/midia/";
export const LIMITE_BYTES = 16 * 1024 * 1024;
const SUFIXO_META = ".meta.json";

/** Pasta raiz da mídia. Em produção, o volume do EasyPanel; no computador, .midia/ do projeto. */
export function pastaMidia() {
  return process.env.MIDIA_DIR || (process.env.NODE_ENV === "production" ? "/data/midia" : path.join(/* turbopackIgnore: true */ process.cwd(), ".midia"));
}

/** Só aceita o formato que o próprio sistema grava: chat/<nome-seguro>. Nada de "..", barra extra ou metadado. */
export function caminhoValido(pathname: string) {
  return /^chat\/[A-Za-z0-9._-]+$/.test(pathname) && !pathname.includes("..") && !pathname.endsWith(SUFIXO_META);
}

function arquivoDe(pathname: string) {
  if (!caminhoValido(pathname)) return null;
  const raiz = path.resolve(/* turbopackIgnore: true */ pastaMidia());
  const alvo = path.resolve(/* turbopackIgnore: true */ raiz, pathname);
  return alvo.startsWith(raiz + path.sep) ? alvo : null;
}

/** A pasta existe e dá para gravar nela? Sem isso, o anexo fica fora (a tela avisa). */
export function armazenamentoDisponivel() {
  try {
    const pasta = path.join(/* turbopackIgnore: true */ pastaMidia(), "chat");
    mkdirSync(/* turbopackIgnore: true */ pasta, { recursive: true });
    accessSync(/* turbopackIgnore: true */ pasta, constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

export const ehMidiaInterna = (url: string) => url.startsWith(PREFIXO);

function nomeSeguro(nome: string) {
  return nome.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-zA-Z0-9._-]+/g, "-").slice(-80) || "arquivo";
}

/** "foto.jpg" vira "chat/foto-<aleatório>.jpg", como o Blob fazia: dois arquivos com o mesmo nome não se sobrescrevem. */
function caminhoNovo(nome: string) {
  const seguro = nomeSeguro(nome);
  const ext = path.extname(seguro).slice(0, 10);
  const base = (ext ? seguro.slice(0, -ext.length) : seguro).replace(/^\.+/, "") || "arquivo";
  const sufixo = randomBytes(16).toString("base64url").replace(/[^A-Za-z0-9]/g, "").slice(0, 21);
  return `chat/${base}-${sufixo}${ext}`;
}

export async function guardarMidia(bytes: Buffer | Uint8Array, nome: string, mime: string): Promise<Midia> {
  if (bytes.byteLength > LIMITE_BYTES) throw new Error("Arquivo maior que 16 MB.");
  const pathname = caminhoNovo(nome);
  const alvo = arquivoDe(pathname);
  if (!alvo) throw new Error("Nome de arquivo inválido.");
  await mkdir(/* turbopackIgnore: true */ path.dirname(alvo), { recursive: true });
  const tipo = mime.split(";")[0].trim() || mime || "application/octet-stream";
  await writeFile(/* turbopackIgnore: true */ alvo, Buffer.from(bytes), { flag: "wx" });
  await writeFile(/* turbopackIgnore: true */ alvo + SUFIXO_META, JSON.stringify({ mime: tipo }));
  return { url: PREFIXO + pathname, nome, mime, tamanho: bytes.byteLength };
}

/** Tipo e tamanho do arquivo guardado, ou null se não existir. */
export async function infoMidia(pathname: string) {
  const alvo = arquivoDe(pathname);
  if (!alvo) return null;
  try {
    const s = await stat(/* turbopackIgnore: true */ alvo);
    if (!s.isFile()) return null;
    let mime = "application/octet-stream";
    try {
      mime = JSON.parse(await readFile(/* turbopackIgnore: true */ alvo + SUFIXO_META, "utf8")).mime || mime;
    } catch {
      /* sem metadado: entrega como binário */
    }
    return { arquivo: alvo, mime, tamanho: s.size };
  } catch {
    return null;
  }
}

/** Abre o arquivo inteiro ou só um pedaço (ini e fim inclusivos, para o Range do áudio). */
export async function abrirMidia(pathname: string, faixa?: { ini: number; fim: number }) {
  const info = await infoMidia(pathname);
  if (!info) return null;
  const leitor = createReadStream(/* turbopackIgnore: true */ info.arquivo, faixa ? { start: faixa.ini, end: faixa.fim } : undefined);
  return { stream: Readable.toWeb(leitor) as ReadableStream<Uint8Array>, mime: info.mime, tamanho: info.tamanho };
}

/** Lê o arquivo de uma URL interna (/api/midia/...) ou de um data: URL. */
export async function lerBytes(url: string): Promise<{ bytes: Buffer; mime: string } | null> {
  if (url.startsWith("data:")) {
    const m = url.match(/^data:([^;,]+)?(;base64)?,(.*)$/s);
    if (!m) return null;
    return { bytes: m[2] ? Buffer.from(m[3], "base64") : Buffer.from(decodeURIComponent(m[3])), mime: m[1] ?? "application/octet-stream" };
  }
  if (ehMidiaInterna(url)) {
    const info = await infoMidia(url.slice(PREFIXO.length));
    if (!info) return null;
    return { bytes: await readFile(/* turbopackIgnore: true */ info.arquivo), mime: info.mime };
  }
  return null;
}

/** Se a mídia veio como data: URL (formulário da tela), passa para o disco. */
export async function persistirMidia(m: Midia | null | undefined): Promise<Midia | null> {
  if (!m) return null;
  if (!m.url.startsWith("data:") || !armazenamentoDisponivel()) return m;
  const arq = await lerBytes(m.url);
  if (!arq) return m;
  return guardarMidia(arq.bytes, m.nome ?? "arquivo", m.mime ?? arq.mime);
}
