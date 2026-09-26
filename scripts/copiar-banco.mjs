/* ============================================================
   CÓPIA ÚNICA DO BANCO: Neon (Vercel)  →  PostgreSQL do EasyPanel (VPS)
   ============================================================
   Rodar UMA vez, no console do serviço "sistema" do EasyPanel:

     ORIGEM_DATABASE_URL='<endereço da Neon>' \
     DESTINO_DATABASE_URL="$DATABASE_URL" \
     node scripts/copiar-banco.mjs

   O que faz, nesta ordem:
   1. aplica as migrations de drizzle/ no destino (cria as tabelas);
   2. recusa se alguma tabela do destino já tiver linha (FORCAR=1 esvazia o
      destino antes — só use se tiver certeza de que ali não há dado real);
   3. copia todas as tabelas do schema public numa transação só: ou vai tudo,
      ou nada muda no destino;
   4. acerta os contadores de id (a próxima venda continua a numeração);
   5. confere se a quantidade de linhas bate, tabela por tabela.

   A origem só é LIDA. Na tela aparecem só nomes de tabela e contagens,
   nunca o conteúdo (o banco tem dado de cliente).
   ============================================================ */
import pg from "pg";
import { aplicarMigracoes } from "./migracoes.mjs";

const ORIGEM = process.env.ORIGEM_DATABASE_URL;
const DESTINO = process.env.DESTINO_DATABASE_URL;
const FORCAR = process.env.FORCAR === "1";
const LOTE = 200;

function parar(msg) {
  console.error(`\n[copiar-banco] PAROU: ${msg}\n`);
  process.exit(1);
}
if (!ORIGEM || !DESTINO) parar("defina ORIGEM_DATABASE_URL e DESTINO_DATABASE_URL.");
if (ORIGEM === DESTINO) parar("origem e destino são o mesmo banco.");

/* Origem devolve TUDO como texto, do jeito que o Postgres escreve. O destino lê
   cada texto com o tipo da própria coluna: data, JSON, lista e número chegam
   exatamente iguais, sem passar por conversão do JavaScript. */
const comoTexto = { getTypeParser: () => (v) => v };
const origem = new pg.Client({ connectionString: ORIGEM, types: comoTexto });
const destino = new pg.Client({ connectionString: DESTINO });
const q = (c, texto, valores) => c.query(texto, valores).then((r) => r.rows);
const id = (nome) => `"${nome.replaceAll('"', '""')}"`;
const erroCurto = (e) => `${e.code ?? ""} ${e.message ?? e}`.trim();

async function tabelas(c) {
  const r = await q(c, `select table_name as t from information_schema.tables
                        where table_schema = 'public' and table_type = 'BASE TABLE' order by 1`);
  return r.map((x) => x.t);
}
async function colunas(c, t) {
  return q(c, `select column_name as nome, is_generated as gerada, is_identity as identidade, identity_generation as geracao
               from information_schema.columns where table_schema = 'public' and table_name = $1 order by ordinal_position`, [t]);
}
async function contar(c, t) {
  const [{ n }] = await q(c, `select count(*)::bigint as n from ${id(t)}`);
  return Number(n);
}
async function migracoesAplicadas(c) {
  try {
    const [{ n }] = await q(c, `select count(*)::int as n from drizzle.__drizzle_migrations`);
    return Number(n);
  } catch {
    return 0;
  }
}

/** Ordem que respeita as chaves estrangeiras: primeiro quem é apontado, depois quem aponta. */
async function ordemSegura(c, lista) {
  const fks = await q(c, `select cl.relname as filha, pa.relname as mae
                          from pg_constraint k
                          join pg_class cl on cl.oid = k.conrelid
                          join pg_class pa on pa.oid = k.confrelid
                          join pg_namespace n on n.oid = cl.relnamespace
                          where k.contype = 'f' and n.nspname = 'public'`);
  const maes = new Map(lista.map((t) => [t, new Set()]));
  for (const { filha, mae } of fks) if (filha !== mae && maes.has(filha) && maes.has(mae)) maes.get(filha).add(mae);
  const feito = new Set();
  const ordem = [];
  while (ordem.length < lista.length) {
    const prontas = lista.filter((t) => !feito.has(t) && [...maes.get(t)].every((m) => feito.has(m)));
    /* ciclo entre tabelas: segue na ordem alfabética (o modo réplica, quando permitido, cobre) */
    const vez = prontas.length ? prontas : lista.filter((t) => !feito.has(t)).slice(0, 1);
    for (const t of vez) {
      feito.add(t);
      ordem.push(t);
    }
  }
  return ordem;
}

async function chavePrimaria(c, t) {
  const r = await q(c, `select a.attname as nome from pg_index i
                        join pg_attribute a on a.attrelid = i.indrelid and a.attnum = any(i.indkey)
                        where i.indrelid = $1::regclass and i.indisprimary order by a.attnum`, [`public.${id(t)}`]);
  return r.map((x) => x.nome);
}

async function copiarTabela(t) {
  const colsDestino = (await colunas(destino, t)).filter((c) => c.gerada !== "ALWAYS");
  const nomesOrigem = new Set((await colunas(origem, t)).map((c) => c.nome));
  const cols = colsDestino.filter((c) => nomesOrigem.has(c.nome));
  const faltando = colsDestino.filter((c) => !nomesOrigem.has(c.nome)).map((c) => c.nome);
  if (faltando.length) console.log(`  ${t}: colunas só no destino (ficam com o padrão): ${faltando.join(", ")}`);
  if (!cols.length) return 0;

  const sobrepor = cols.some((c) => c.identidade === "YES" && c.geracao === "ALWAYS") ? " overriding system value" : "";
  const lista = cols.map((c) => id(c.nome)).join(", ");
  const pk = await chavePrimaria(origem, t);
  const ordem = pk.length ? pk.map(id).join(", ") : "ctid";

  let copiadas = 0;
  for (let desde = 0; ; desde += LOTE) {
    const linhas = await origem.query({ text: `select ${lista} from ${id(t)} order by ${ordem} limit ${LOTE} offset ${desde}`, rowMode: "array" });
    if (!linhas.rows.length) break;
    const valores = [];
    const tuplas = linhas.rows.map((linha) => `(${linha.map((v) => (valores.push(v), `$${valores.length}`)).join(", ")})`);
    await destino.query(`insert into ${id(t)} (${lista})${sobrepor} values ${tuplas.join(", ")}`, valores);
    copiadas += linhas.rows.length;
    if (linhas.rows.length < LOTE) break;
  }
  return copiadas;
}

async function acertarContadores() {
  const seqs = await q(destino, `select c.table_name as t, c.column_name as col,
                                        pg_get_serial_sequence(format('public.%I', c.table_name), c.column_name) as seq
                                 from information_schema.columns c
                                 where c.table_schema = 'public'
                                   and pg_get_serial_sequence(format('public.%I', c.table_name), c.column_name) is not null`);
  for (const { t, col, seq } of seqs) {
    await destino.query(`select setval($1, coalesce((select max(${id(col)}) from ${id(t)}), 0) + 1, false)`, [seq]);
  }
  return seqs.length;
}

try {
  console.log("[copiar-banco] 1/5 aplicando migrations no destino…");
  await aplicarMigracoes(DESTINO);

  await origem.connect();
  await destino.connect();

  const [migOrigem, migDestino] = [await migracoesAplicadas(origem), await migracoesAplicadas(destino)];
  if (migOrigem > migDestino) parar(`a origem tem ${migOrigem} migrations e o destino ${migDestino}. Atualize o código (drizzle/) antes de copiar.`);

  const noDestino = await tabelas(destino);
  const naOrigem = new Set(await tabelas(origem));
  const soNaOrigem = [...naOrigem].filter((t) => !noDestino.includes(t));
  if (soNaOrigem.length) parar(`tabelas que existem só na origem: ${soNaOrigem.join(", ")}.`);
  const copiaveis = noDestino.filter((t) => naOrigem.has(t));

  console.log("[copiar-banco] 2/5 conferindo se o destino está vazio…");
  const ocupadas = [];
  for (const t of copiaveis) if ((await contar(destino, t)) > 0) ocupadas.push(t);
  if (ocupadas.length && !FORCAR) parar(`o destino já tem dados em: ${ocupadas.join(", ")}. Nada foi copiado. Se tiver certeza de que ali não há dado real, rode de novo com FORCAR=1.`);

  console.log("[copiar-banco] 3/5 copiando (uma transação só)…");
  const ordem = await ordemSegura(destino, copiaveis);
  const copiadas = {};
  await destino.query("begin");
  try {
    if (ocupadas.length) {
      await destino.query(`truncate ${copiaveis.map(id).join(", ")} restart identity cascade`);
      console.log(`  destino esvaziado (FORCAR=1): ${ocupadas.length} tabela(s) tinham dados`);
    }
    await destino.query("savepoint replica");
    try {
      await destino.query("set local session_replication_role = replica");
    } catch {
      await destino.query("rollback to savepoint replica");
      console.log("  (sem permissão para o modo réplica: seguindo a ordem das chaves estrangeiras)");
    }
    for (const t of ordem) {
      copiadas[t] = await copiarTabela(t);
      console.log(`  ${t}: ${copiadas[t]}`);
    }
    console.log("[copiar-banco] 4/5 acertando os contadores de id…");
    const n = await acertarContadores();
    console.log(`  ${n} contador(es) acertado(s)`);
    await destino.query("commit");
  } catch (e) {
    await destino.query("rollback").catch(() => {});
    parar(`erro durante a cópia, nada foi gravado no destino (${erroCurto(e)}).`);
  }

  console.log("[copiar-banco] 5/5 conferindo as quantidades…");
  let diferencas = 0;
  for (const t of ordem) {
    const [a, b] = [await contar(origem, t), await contar(destino, t)];
    if (a !== b) diferencas++;
    console.log(`  ${a === b ? "ok " : "DIFERENTE"} ${t}: origem ${a}, destino ${b}`);
  }
  if (diferencas) parar(`${diferencas} tabela(s) com quantidade diferente (alguém usou a origem durante a cópia?).`);
  console.log(`\n[copiar-banco] PRONTO: ${ordem.length} tabelas copiadas e conferidas.\n`);
} catch (e) {
  parar(erroCurto(e));
} finally {
  await origem.end().catch(() => {});
  await destino.end().catch(() => {});
}
