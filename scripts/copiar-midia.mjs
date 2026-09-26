/* ============================================================
   CÓPIA ÚNICA DA MÍDIA DO CHAT: Vercel Blob  →  disco do VPS
   ============================================================
   Rodar no console do serviço "sistema" do EasyPanel (onde o volume /data
   está montado):

     BLOB_READ_WRITE_TOKEN='<token do Blob>' node scripts/copiar-midia.mjs

   Baixa cada arquivo de chat/ e grava em MIDIA_DIR (padrão /data/midia) com o
   MESMO caminho, mais um "<arquivo>.meta.json" com o tipo. Assim as mensagens
   antigas, que apontam para /api/midia/chat/..., continuam abrindo.
   Pode rodar de novo: o que já foi copiado (mesmo tamanho) é pulado.
   Na tela aparecem só contagens, nunca nome de arquivo nem conteúdo.
   ============================================================ */
import { mkdir, rename, stat, writeFile } from "node:fs/promises";
import path from "node:path";

const TOKEN = process.env.BLOB_READ_WRITE_TOKEN;
const PASTA = path.resolve(process.env.MIDIA_DIR || "/data/midia");
const API = "https://vercel.com/api/blob";

function parar(msg) {
  console.error(`\n[copiar-midia] PAROU: ${msg}\n`);
  process.exit(1);
}
if (!TOKEN) parar("defina BLOB_READ_WRITE_TOKEN.");
/* o token tem o formato vercel_blob_rw_<loja>_<segredo>; a API pede a loja num cabeçalho */
const loja = TOKEN.split("_")[3] ?? "";
if (!loja) parar("o token não parece um BLOB_READ_WRITE_TOKEN (vercel_blob_rw_...).");

const cabecalhosApi = { authorization: `Bearer ${TOKEN}`, "x-api-version": "12", "x-vercel-blob-store-id": loja };

async function listar(cursor) {
  const p = new URLSearchParams({ prefix: "chat/", limit: "1000" });
  if (cursor) p.set("cursor", cursor);
  const r = await fetch(`${API}?${p}`, { headers: cabecalhosApi });
  if (!r.ok) parar(`a listagem do Blob respondeu ${r.status}. Confira o token.`);
  return r.json();
}

async function tamanhoLocal(arquivo) {
  try {
    return (await stat(arquivo)).size;
  } catch {
    return -1;
  }
}

const conta = { copiados: 0, pulados: 0, ignorados: 0, erros: 0 };
let total = 0;
let cursor;
do {
  const pagina = await listar(cursor);
  for (const b of pagina.blobs ?? []) {
    total++;
    /* só o formato que o sistema grava; qualquer outra coisa fica de fora */
    if (!/^chat\/[A-Za-z0-9._-]+$/.test(b.pathname) || b.pathname.endsWith(".meta.json")) {
      conta.ignorados++;
      continue;
    }
    const alvo = path.join(PASTA, b.pathname);
    if (!alvo.startsWith(PASTA + path.sep)) {
      conta.ignorados++;
      continue;
    }
    if ((await tamanhoLocal(alvo)) === b.size && (await tamanhoLocal(alvo + ".meta.json")) > 0) {
      conta.pulados++;
      continue;
    }
    try {
      /* arquivo privado: o download também precisa do token */
      const r = await fetch(b.url, { headers: { authorization: `Bearer ${TOKEN}` } });
      if (!r.ok) throw new Error(`status ${r.status}`);
      const bytes = Buffer.from(await r.arrayBuffer());
      const mime = (r.headers.get("content-type") || "application/octet-stream").split(";")[0].trim();
      await mkdir(path.dirname(alvo), { recursive: true });
      await writeFile(alvo + ".parcial", bytes);
      await rename(alvo + ".parcial", alvo);
      await writeFile(alvo + ".meta.json", JSON.stringify({ mime }));
      conta.copiados++;
    } catch (e) {
      conta.erros++;
      console.error(`  erro no arquivo ${total}: ${e.message}`);
    }
  }
  cursor = pagina.hasMore ? pagina.cursor : undefined;
} while (cursor);

console.log(`[copiar-midia] ${total} arquivo(s) no Blob: ${conta.copiados} copiado(s), ${conta.pulados} já estavam aqui, ${conta.ignorados} fora do padrão, ${conta.erros} com erro. Pasta: ${PASTA}`);
if (conta.erros) process.exit(1);
