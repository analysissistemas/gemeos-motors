/* Aplica as migrations de drizzle/ no banco apontado por DATABASE_URL.
   Rodar: npm run db:migrate  (lê .env.local)
   No VPS isso acontece sozinho a cada implantação (scripts/iniciar.mjs). */
import { aplicarMigracoes } from "./migracoes.mjs";

const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL não configurada");
await aplicarMigracoes(url);
console.log("migrations aplicadas");
