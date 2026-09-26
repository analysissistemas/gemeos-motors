/* ============================================================
   ESPAÇO EM DISCO — quanto o sistema ocupa e quanto cresce por mês
   ============================================================
   Rodar no console do serviço "sistema" do EasyPanel:

     node scripts/espaco.mjs

   Só lê: mostra o tamanho da pasta de mídia (/data/midia) separado por
   tipo e por mês, as cópias de segurança (/data/backup) e o tamanho do
   banco. Com isso dá para prever quando o disco do VPS enche.

   Opcional: MANTER_BACKUPS=5 node scripts/espaco.mjs
   apaga as cópias de segurança mais antigas de /data/backup e deixa só as
   5 mais novas (sem essa variável, nada é apagado).
   ============================================================ */
import { readdirSync, statSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import pg from "pg";

const MIDIA = process.env.MIDIA_DIR || "/data/midia";
const BACKUP = process.env.BACKUP_DIR || "/data/backup";
const MANTER = process.env.MANTER_BACKUPS ? Number(process.env.MANTER_BACKUPS) : null;

const mb = (b) => `${(b / 1024 / 1024).toFixed(1)} MB`;

function arquivos(pasta) {
  const out = [];
  let itens;
  try {
    itens = readdirSync(pasta, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const i of itens) {
    const c = join(pasta, i.name);
    if (i.isDirectory()) out.push(...arquivos(c));
    else {
      const s = statSync(c);
      out.push({ caminho: c, nome: i.name, bytes: s.size, quando: s.mtime });
    }
  }
  return out;
}

const tipo = (nome) => {
  const ext = nome.split(".").pop().toLowerCase();
  if (["ogg", "opus", "mp3", "m4a", "webm", "mp4a", "aac", "wav"].includes(ext)) return "áudio";
  if (["jpg", "jpeg", "png", "webp", "gif"].includes(ext)) return "imagem";
  if (["mp4", "3gp", "mov"].includes(ext)) return "vídeo";
  return "documento/outro";
};

/* ---------- mídia ---------- */
const midia = arquivos(MIDIA);
const total = midia.reduce((s, a) => s + a.bytes, 0);
console.log(`\nMídia em ${MIDIA}: ${midia.length} arquivos, ${mb(total)}`);
const porTipo = {};
const porMes = {};
for (const a of midia) {
  porTipo[tipo(a.nome)] = (porTipo[tipo(a.nome)] ?? 0) + a.bytes;
  const mes = a.quando.toISOString().slice(0, 7);
  porMes[mes] = (porMes[mes] ?? 0) + a.bytes;
}
for (const [t, b] of Object.entries(porTipo).sort((x, y) => y[1] - x[1])) console.log(`  ${t}: ${mb(b)}`);
console.log("  por mês:");
for (const [m, b] of Object.entries(porMes).sort()) console.log(`    ${m}: ${mb(b)}`);

/* ---------- cópias de segurança ---------- */
const backups = arquivos(BACKUP).sort((a, b) => b.quando - a.quando);
console.log(`\nCópias de segurança em ${BACKUP}: ${backups.length}, ${mb(backups.reduce((s, a) => s + a.bytes, 0))}`);
if (MANTER != null && Number.isInteger(MANTER) && MANTER >= 1) {
  for (const velho of backups.slice(MANTER)) {
    unlinkSync(velho.caminho);
    console.log(`  apagada: ${velho.nome}`);
  }
}

/* ---------- banco ---------- */
if (process.env.DATABASE_URL) {
  const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
  try {
    await db.connect();
    const [{ tamanho }] = (await db.query("select pg_database_size(current_database())::bigint as tamanho")).rows;
    console.log(`\nBanco: ${mb(Number(tamanho))}`);
    const maiores = (await db.query("select relname as tabela, pg_total_relation_size(relid)::bigint as bytes from pg_catalog.pg_statio_user_tables order by 2 desc limit 5")).rows;
    for (const t of maiores) console.log(`  ${t.tabela}: ${mb(Number(t.bytes))}`);
  } catch (e) {
    console.log(`\nBanco: não deu para medir (${e.message})`);
  } finally {
    await db.end().catch(() => {});
  }
}
console.log("\nDisco do VPS inteiro: veja o card Disco no painel do EasyPanel.\n");
