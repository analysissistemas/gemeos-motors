/* ============================================================
   LIMPEZA ÚNICA: tira TODAS as vendas e TODOS os veículos do estoque
   ============================================================
   Pedido do dono em 26/09/2026: as vendas e o estoque que estavam no
   sistema eram fictícios. Clientes, negócios do funil, conversas, OS e
   histórico ficam. Rodar no console do serviço "sistema" do EasyPanel:

     CONFIRMAR=APAGAR-VENDAS-E-ESTOQUE node scripts/limpar-vendas-estoque.mjs

   Sem o CONFIRMAR, só mostra o que seria apagado (nada muda).

   O que faz, nesta ordem:
   1. conta vendas, pagamentos, assinaturas de venda e veículos;
   2. grava uma cópia completa dessas linhas em /data/backup/ (volume do
      EasyPanel, sobrevive a reimplantações) ANTES de apagar;
   3. apaga numa transação só (ou vai tudo, ou nada muda);
   4. registra a limpeza no histórico do sistema.

   Negócio que apontava para um veículo ou OS que apontava para uma venda
   continuam existindo, só sem o vínculo (o banco já faz isso sozinho).
   Na tela aparecem só contagens, nunca o conteúdo.
   ============================================================ */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import pg from "pg";

const URL = process.env.DATABASE_URL;
const APAGAR = process.env.CONFIRMAR === "APAGAR-VENDAS-E-ESTOQUE";
const PASTA = process.env.BACKUP_DIR || "/data/backup";

if (!URL) {
  console.error("[limpeza] PAROU: DATABASE_URL não definida.");
  process.exit(1);
}

const db = new pg.Client({ connectionString: URL });
await db.connect();

const consultas = {
  vendas: "select * from vendas",
  venda_pagamentos: "select * from venda_pagamentos",
  assinaturas_de_venda: "select * from assinaturas where documento_tipo = 'venda'",
  veiculos: "select * from veiculos",
};

const copia = {};
for (const [nome, sql] of Object.entries(consultas)) copia[nome] = (await db.query(sql)).rows;
console.log("[limpeza] encontrado:");
for (const [nome, linhas] of Object.entries(copia)) console.log(`  ${nome}: ${linhas.length}`);

if (!APAGAR) {
  console.log("\n[limpeza] Nada foi apagado. Para apagar, rode de novo com CONFIRMAR=APAGAR-VENDAS-E-ESTOQUE");
  await db.end();
  process.exit(0);
}

mkdirSync(PASTA, { recursive: true });
const arquivo = join(PASTA, `limpeza-vendas-estoque-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
writeFileSync(arquivo, JSON.stringify({ criadoEm: new Date().toISOString(), ...copia }));
console.log(`\n[limpeza] cópia de segurança gravada em ${arquivo}`);

try {
  await db.query("begin");
  const a = await db.query("delete from assinaturas where documento_tipo = 'venda'");
  const v = await db.query("delete from vendas"); // pagamentos saem junto (cascade)
  const e = await db.query("delete from veiculos");
  await db.query(
    "insert into logs (usuario_nome, acao, entidade, descricao, dados, origem) values ($1, $2, $3, $4, $5, $6)",
    [
      "Sistema",
      "sistema.limpeza",
      "venda",
      `Limpeza pedida pelo dono: apagadas ${v.rowCount} vendas e ${e.rowCount} veículos fictícios`,
      JSON.stringify({ vendas: v.rowCount, assinaturas: a.rowCount, veiculos: e.rowCount, backup: arquivo }),
      "sistema",
    ],
  );
  await db.query("commit");
  console.log(`[limpeza] apagado: ${v.rowCount} vendas (e seus pagamentos), ${a.rowCount} assinaturas de venda, ${e.rowCount} veículos.`);
} catch (err) {
  await db.query("rollback");
  console.error("[limpeza] PAROU e nada foi apagado:", err.message);
  process.exitCode = 1;
}

const depois = {};
for (const nome of ["vendas", "venda_pagamentos", "veiculos"]) depois[nome] = (await db.query(`select count(*)::int as n from ${nome}`)).rows[0].n;
console.log("[limpeza] agora:", depois);
await db.end();
