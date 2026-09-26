import "server-only";
import { randomBytes } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { ErroRegra } from "@/lib/acao";
import { pastaMidia } from "@/lib/mensageria/midia";

/* Fotos guardadas pelo sistema, no mesmo volume da mídia do chat (/data no VPS).
   Dois acervos, cada um com pasta, endereço e formato de nome próprios:

   - perfil (pasta "fotos/"): equipe e clientes. Entregues por app/api/fotos,
     que exige login — mas não exige acesso ao atendimento, porque o técnico
     também vê a foto dos colegas e dos clientes.
   - catálogo (pasta "catalogo/"): a moto em cada cor. PÚBLICAS, entregues por
     app/api/vitrine/foto, porque a vitrine do cliente mostra sem login.

   A tela já reduz a foto (webp) antes de enviar; aqui a regra é não confiar no
   navegador: confere o tipo pelos primeiros bytes e o tamanho. */

export const FOTO_LIMITE_BYTES = 2 * 1024 * 1024;
const EXTENSOES = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" } as const;
type TipoFoto = keyof typeof EXTENSOES;
const MIME_POR_EXT: Record<string, TipoFoto> = { jpg: "image/jpeg", png: "image/png", webp: "image/webp" };

type Acervo = { pasta: string; prefixo: string; nomeValido: RegExp };
const PERFIL: Acervo = {
  pasta: "fotos",
  prefixo: "/api/fotos/",
  /* só o formato que o próprio sistema grava: usuario-12-<aleatório>.webp */
  nomeValido: /^(usuario|cliente)-\d+-[A-Za-z0-9]{16,32}\.(jpg|png|webp)$/,
};
const CATALOGO: Acervo = {
  pasta: "catalogo",
  prefixo: "/api/vitrine/foto/",
  /* modelo-3-<aleatório>.webp — nada de barra, ponto duplo ou outro caractere */
  nomeValido: /^modelo-\d+-[a-f0-9]{32}\.(jpg|png|webp)$/,
};

function pastaDe(a: Acervo) {
  return path.join(/* turbopackIgnore: true */ pastaMidia(), a.pasta);
}

/** Descobre o tipo pelo conteúdo (assinatura do arquivo), não pelo nome nem pelo que o navegador disse. */
function tipoPelosBytes(b: Uint8Array): TipoFoto | null {
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 && b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a) return "image/png";
  if (b.length >= 12 && String.fromCharCode(...b.subarray(0, 4)) === "RIFF" && String.fromCharCode(...b.subarray(8, 12)) === "WEBP") return "image/webp";
  return null;
}

async function guardar(a: Acervo, arquivo: unknown, dono: string) {
  if (!(arquivo instanceof File) || arquivo.size === 0) throw new ErroRegra("Escolha uma foto.");
  if (arquivo.size > FOTO_LIMITE_BYTES) throw new ErroRegra("A foto passa de 2 MB. Escolha uma menor.");
  if (!(arquivo.type in EXTENSOES)) throw new ErroRegra("Use uma foto JPG, PNG ou WebP.");
  const bytes = new Uint8Array(await arquivo.arrayBuffer());
  const tipo = tipoPelosBytes(bytes);
  if (!tipo) throw new ErroRegra("Este arquivo não é uma foto JPG, PNG ou WebP.");
  const nome = `${dono}-${randomBytes(16).toString("hex")}.${EXTENSOES[tipo]}`;
  try {
    await mkdir(/* turbopackIgnore: true */ pastaDe(a), { recursive: true });
    await writeFile(/* turbopackIgnore: true */ path.join(/* turbopackIgnore: true */ pastaDe(a), nome), bytes, { flag: "wx" });
  } catch (e) {
    console.error("[fotos] não gravou", e);
    throw new ErroRegra("O armazenamento de arquivos não está disponível agora. Tente de novo mais tarde.");
  }
  return a.prefixo + nome;
}

function arquivoDe(a: Acervo, nome: string) {
  if (!a.nomeValido.test(nome)) return null;
  const raiz = path.resolve(/* turbopackIgnore: true */ pastaDe(a));
  const alvo = path.resolve(/* turbopackIgnore: true */ raiz, nome);
  return alvo.startsWith(raiz + path.sep) ? alvo : null;
}

async function apagar(a: Acervo, url: string | null | undefined) {
  if (!url?.startsWith(a.prefixo)) return;
  const alvo = arquivoDe(a, url.slice(a.prefixo.length));
  if (!alvo) return;
  await unlink(/* turbopackIgnore: true */ alvo).catch(() => {});
}

async function ler(a: Acervo, nome: string) {
  const alvo = arquivoDe(a, nome);
  if (!alvo) return null;
  try {
    const bytes = await readFile(/* turbopackIgnore: true */ alvo);
    return { bytes, mime: MIME_POR_EXT[path.extname(nome).slice(1)] };
  } catch {
    return null;
  }
}

/* ---------- perfil (equipe e clientes; só com login) ---------- */

/** Confere e grava a foto; devolve o endereço interno (/api/fotos/...). */
export async function guardarFoto(arquivo: unknown, dono: { tipo: "usuario" | "cliente"; id: number }) {
  return guardar(PERFIL, arquivo, `${dono.tipo}-${dono.id}`);
}
/** Apaga a foto antiga (trocada ou removida). Se falhar, só fica um arquivo sobrando. */
export async function apagarFoto(url: string | null | undefined) {
  return apagar(PERFIL, url);
}
/** Lê a foto para a rota de entrega; null se o nome for inválido ou o arquivo não existir. */
export async function lerFoto(nome: string) {
  return ler(PERFIL, nome);
}

/* ---------- catálogo (a moto em cada cor; público, a vitrine mostra) ---------- */

/** Confere e grava a foto de uma cor do modelo; devolve /api/vitrine/foto/... */
export async function guardarFotoCatalogo(arquivo: unknown, modeloId: number) {
  return guardar(CATALOGO, arquivo, `modelo-${modeloId}`);
}
export async function apagarFotoCatalogo(url: string | null | undefined) {
  return apagar(CATALOGO, url);
}
export async function lerFotoCatalogo(nome: string) {
  return ler(CATALOGO, nome);
}
