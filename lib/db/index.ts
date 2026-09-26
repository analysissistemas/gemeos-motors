import "server-only";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

/* PostgreSQL comum (o do EasyPanel, no próprio VPS), pelo driver `pg`: permite
   transação de verdade, que a venda e a mudança de etapa precisam. O servidor
   fica sempre ligado, então um pool só para o processo inteiro. SSL só quando o
   endereço pede (sslmode=require); o banco interno do VPS não usa. */
const globalParaPool = globalThis as unknown as { __gmPool?: Pool };

function criarPool() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL não configurada");
  const pool = new Pool({ connectionString: url, max: 10, idleTimeoutMillis: 30_000, connectionTimeoutMillis: 10_000 });
  pool.on("error", (e) => console.error("[db] conexão ociosa caiu:", e.message));
  return pool;
}

const pool = globalParaPool.__gmPool ?? criarPool();
globalParaPool.__gmPool = pool;

export const db = drizzle({ client: pool, schema, casing: "snake_case" });
export type Db = typeof db;
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
export { schema };
