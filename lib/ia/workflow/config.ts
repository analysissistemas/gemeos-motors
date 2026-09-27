import "server-only";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { CONFIG_PADRAO, LIMITES_CONFIG, type ConfigWorkflow } from "./grafo";

const CHAVE = "ia.workflow";

/** Ajustes do workflow (aba Workflow). Sem registro, vale o padrão, com o workflow desligado. */
export async function lerConfigWorkflow(): Promise<ConfigWorkflow> {
  const [l] = await db.select({ valor: schema.configuracoes.valor }).from(schema.configuracoes).where(eq(schema.configuracoes.chave, CHAVE)).limit(1);
  return normalizarConfig((l?.valor ?? {}) as Partial<ConfigWorkflow>);
}

export function normalizarConfig(v: Partial<ConfigWorkflow>): ConfigWorkflow {
  const c = { ...CONFIG_PADRAO } as Record<string, unknown>;
  for (const [k, padrao] of Object.entries(CONFIG_PADRAO)) {
    const x = (v as Record<string, unknown>)[k];
    if (typeof padrao === "boolean" && typeof x === "boolean") c[k] = x;
    if (typeof padrao === "string" && typeof x === "string" && x.trim()) c[k] = x.trim().slice(0, 40);
    if (typeof padrao === "number" && typeof x === "number" && Number.isFinite(x)) {
      const [min, max] = LIMITES_CONFIG[k as keyof typeof LIMITES_CONFIG];
      c[k] = Math.min(max, Math.max(min, Math.round(x)));
    }
  }
  return c as ConfigWorkflow;
}

export async function salvarConfigWorkflow(c: ConfigWorkflow, usuarioId: number) {
  const valor = normalizarConfig(c);
  await db
    .insert(schema.configuracoes)
    .values({ chave: CHAVE, valor, atualizadoPor: usuarioId })
    .onConflictDoUpdate({ target: schema.configuracoes.chave, set: { valor, atualizadoEm: new Date(), atualizadoPor: usuarioId } });
}
