/* Aplica as migrations de drizzle/ num banco. Usado por:
   - scripts/migrar.mjs  (npm run db:migrate, no computador)
   - scripts/iniciar.mjs (toda vez que o container sobe no VPS)
   - scripts/copiar-banco.mjs (antes de copiar os dados para o banco novo)
   Migration já aplicada não roda de novo: o Drizzle guarda o que já foi feito
   na tabela drizzle.__drizzle_migrations do próprio banco. */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { criarPool } from "./sql.mjs";

/** Pasta drizzle/ ao lado da pasta scripts/ (no projeto e dentro do container). */
export const PASTA_MIGRACOES = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "drizzle");

export async function aplicarMigracoes(url, pasta = PASTA_MIGRACOES) {
  const pool = criarPool(url, 1);
  try {
    await migrate(drizzle({ client: pool }), { migrationsFolder: pasta });
  } finally {
    await pool.end();
  }
}
