import "server-only";
import { get, put } from "@vercel/blob";
import type { Midia } from "./tipos";

/* Mídia do chat (fotos, PDFs) fica no Vercel Blob PRIVADO: sem login, o link
   não abre. No banco guardamos só o caminho interno /api/midia/..., que a rota
   app/api/midia confere (usuário logado com acesso ao atendimento). */

const PREFIXO = "/api/midia/";
export const LIMITE_BYTES = 16 * 1024 * 1024;

export const blobDisponivel = () => !!process.env.BLOB_READ_WRITE_TOKEN;
export const ehMidiaInterna = (url: string) => url.startsWith(PREFIXO);

function nomeSeguro(nome: string) {
  return nome.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-zA-Z0-9._-]+/g, "-").slice(-80) || "arquivo";
}

export async function guardarMidia(bytes: Buffer | Uint8Array, nome: string, mime: string): Promise<Midia> {
  if (bytes.byteLength > LIMITE_BYTES) throw new Error("Arquivo maior que 16 MB.");
  const r = await put(`chat/${nomeSeguro(nome)}`, Buffer.from(bytes), { access: "private", addRandomSuffix: true, contentType: mime });
  return { url: PREFIXO + r.pathname, nome, mime, tamanho: bytes.byteLength };
}

/** Lê o arquivo de uma URL interna (/api/midia/...) ou de um data: URL. */
export async function lerBytes(url: string): Promise<{ bytes: Buffer; mime: string } | null> {
  if (url.startsWith("data:")) {
    const m = url.match(/^data:([^;,]+)?(;base64)?,(.*)$/s);
    if (!m) return null;
    return { bytes: m[2] ? Buffer.from(m[3], "base64") : Buffer.from(decodeURIComponent(m[3])), mime: m[1] ?? "application/octet-stream" };
  }
  if (ehMidiaInterna(url)) {
    const r = await abrirMidia(url.slice(PREFIXO.length));
    if (!r) return null;
    return { bytes: Buffer.from(await new Response(r.stream).arrayBuffer()), mime: r.mime };
  }
  return null;
}

export async function abrirMidia(pathname: string) {
  const r = await get(pathname, { access: "private" });
  if (!r || r.statusCode !== 200) return null;
  return { stream: r.stream, mime: r.blob.contentType, tamanho: r.blob.size };
}

/** Se a mídia veio como data: URL (formulário da tela), passa para o Blob. */
export async function persistirMidia(m: Midia | null | undefined): Promise<Midia | null> {
  if (!m) return null;
  if (!m.url.startsWith("data:") || !blobDisponivel()) return m;
  const arq = await lerBytes(m.url);
  if (!arq) return m;
  return guardarMidia(arq.bytes, m.nome ?? "arquivo", m.mime ?? arq.mime);
}
