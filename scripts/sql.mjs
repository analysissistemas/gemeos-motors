/* Ajudante dos scripts: o mesmo jeito de escrever consulta que o driver da Neon
   tinha (sql`select ... where id = ${x}`), agora sobre o `pg` comum, que fala com
   qualquer PostgreSQL (o do EasyPanel, no VPS). Os valores viram parâmetros
   ($1, $2...), nunca texto colado na consulta.

   const sql = criarSql(url);
   const linhas = await sql`select id from clientes where nome like ${"E2E %"}`;
   await sql.transaction([sql`delete ...`, sql`delete ...`]);  // tudo ou nada
   await sql.query("select count(*) from t");                  // texto pronto
   await sql.end();                                             // sempre no fim */
import pg from "pg";

export function criarPool(url, max = 3) {
  if (!url) throw new Error("DATABASE_URL não configurada");
  return new pg.Pool({ connectionString: url, max, connectionTimeoutMillis: 15_000 });
}

export function criarSql(url) {
  const pool = criarPool(url);

  function sql(partes, ...valores) {
    let texto = partes[0];
    valores.forEach((_, i) => (texto += `$${i + 1}` + partes[i + 1]));
    const consulta = { texto, valores };
    /* só executa quando alguém espera o resultado (await); dentro de sql.transaction
       fica guardada para rodar na mesma conexão */
    consulta.then = (ok, falha) => pool.query(texto, valores).then((r) => r.rows).then(ok, falha);
    return consulta;
  }

  sql.query = (texto, valores = []) => pool.query(texto, valores).then((r) => r.rows);

  sql.transaction = async (consultas) => {
    const c = await pool.connect();
    try {
      await c.query("begin");
      const saida = [];
      for (const q of consultas) saida.push((await c.query(q.texto, q.valores)).rows);
      await c.query("commit");
      return saida;
    } catch (e) {
      await c.query("rollback").catch(() => {});
      throw e;
    } finally {
      c.release();
    }
  };

  sql.end = () => pool.end();
  return sql;
}
