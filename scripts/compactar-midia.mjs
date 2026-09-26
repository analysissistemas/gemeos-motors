/* ============================================================
   COMPACTAR A MÍDIA ANTIGA DO CHAT — fotos e vídeos já guardados
   ============================================================
   Rodar no console do serviço "sistema" do EasyPanel:

     node scripts/compactar-midia.mjs            (só mostra o que dá para compactar)
     APLICAR=1 node scripts/compactar-midia.mjs  (compacta de verdade)

   A mídia NOVA já chega compactada sozinha (lib/mensageria/midia.ts). Este
   comando é para o que foi guardado antes. Usa exatamente as mesmas regras
   (lib/mensageria/compactar.ts, copiado para scripts/lib/compactar.mts na imagem): foto
   JPEG até 1600 px, vídeo até 720p, e só troca o arquivo se o novo ficar
   pelo menos 20% menor. Áudio, PDF e documento não são tocados.

   Pode rodar de novo quando quiser: o que já foi compactado fica menor que
   o limite e é pulado. O original é substituído (é o que libera espaço).
   ============================================================ */
import { existsSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import pg from "pg";

const aqui = dirname(fileURLToPath(import.meta.url));
const modulo = [join(aqui, "lib", "compactar.mts"), join(aqui, "..", "lib", "mensageria", "compactar.ts")].find((c) => existsSync(c));
if (!modulo) throw new Error("compactar.ts não encontrado (scripts/lib/ na imagem ou lib/mensageria/ no projeto).");
const { compactarFoto, compactarVideoArquivo, GANHO_MINIMO } = await import(pathToFileURL(modulo).href);

const MIDIA = process.env.MIDIA_DIR || "/data/midia";
const APLICAR = process.env.APLICAR === "1";
const mb = (b) => `${(b / 1024 / 1024).toFixed(1)} MB`;

const pasta = join(MIDIA, "chat");
const candidatos = [];
for (const nome of existsSync(pasta) ? readdirSync(pasta) : []) {
  if (!nome.endsWith(".meta.json")) continue;
  const arquivo = join(pasta, nome.slice(0, -".meta.json".length));
  if (!existsSync(arquivo)) continue;
  let mime = "";
  try {
    mime = JSON.parse(readFileSync(arquivo + ".meta.json", "utf8")).mime || "";
  } catch {
    continue;
  }
  const s = statSync(arquivo);
  /* vídeo gravado há menos de 15 min pode estar sendo compactado pelo próprio sistema */
  if (mime.startsWith("video/") && Date.now() - s.mtimeMs < 15 * 60_000) continue;
  if (mime === "image/jpeg" || mime.startsWith("video/")) candidatos.push({ arquivo, nome: nome.slice(0, -".meta.json".length), mime, bytes: s.size });
}

const fotos = candidatos.filter((c) => c.mime === "image/jpeg");
const videos = candidatos.filter((c) => c.mime.startsWith("video/"));
const soma = (l) => l.reduce((t, c) => t + c.bytes, 0);
console.log(`Pasta: ${pasta}`);
console.log(`Fotos JPEG: ${fotos.length} (${mb(soma(fotos))})   Vídeos: ${videos.length} (${mb(soma(videos))})`);
if (!APLICAR) {
  console.log("\nNada foi mudado. Para compactar: APLICAR=1 node scripts/compactar-midia.mjs");
  process.exit(0);
}

const url = process.env.DATABASE_URL;
const banco = url ? new pg.Client({ connectionString: url, ssl: /sslmode=require/.test(url) ? { rejectUnauthorized: false } : undefined }) : null;
if (banco) await banco.connect();

let antes = 0, depois = 0, trocados = 0;
for (const c of candidatos) {
  let novoTamanho = null;
  try {
    if (c.mime === "image/jpeg") {
      const menor = await compactarFoto(readFileSync(c.arquivo));
      if (menor) {
        writeFileSync(c.arquivo + ".compactando", menor);
        renameSync(c.arquivo + ".compactando", c.arquivo);
        novoTamanho = menor.byteLength;
      }
    } else {
      const tmp = c.arquivo + ".compactando.mp4";
      try {
        await compactarVideoArquivo(c.arquivo, tmp);
        const t = statSync(tmp).size;
        if (t > 0 && t <= c.bytes * GANHO_MINIMO) {
          renameSync(tmp, c.arquivo);
          writeFileSync(c.arquivo + ".meta.json", JSON.stringify({ mime: "video/mp4" }));
          novoTamanho = t;
        }
      } finally {
        rmSync(tmp, { force: true });
      }
    }
  } catch (e) {
    console.log(`  pulado ${c.nome}: ${e.message}`);
  }
  if (novoTamanho == null) continue;
  trocados++;
  antes += c.bytes;
  depois += novoTamanho;
  if (banco)
    await banco.query("update mensagens set midia_tamanho = $1, midia_mime = case when $3 then 'video/mp4' else midia_mime end where midia_url = $2", [
      novoTamanho,
      `/api/midia/chat/${c.nome}`,
      c.mime.startsWith("video/"),
    ]);
  console.log(`  ${c.nome}: ${mb(c.bytes)} -> ${mb(novoTamanho)}`);
}
if (banco) await banco.end();
console.log(`\nCompactados: ${trocados} de ${candidatos.length}. Economia: ${mb(antes - depois)} (${mb(antes)} -> ${mb(depois)}).`);
