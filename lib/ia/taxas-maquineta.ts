import "server-only";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { FAIXAS, normalizarTaxas, TAXAS_PADRAO, type TaxasMaquineta } from "@/lib/ia/simulacao-cartao";

/* Taxas da maquineta (dono, 10/10/2026: "quero ter um local para editar as taxas"): Configurações → Taxas da maquineta.
   Guardadas em `configuracoes`; sem nada salvo, valem as do relatório (TAXAS_PADRAO). A simulação da IA lê daqui. */
const CHAVE = "vendas.taxas_maquineta";

export async function lerTaxas(): Promise<TaxasMaquineta> {
  const [l] = await db.select({ valor: schema.configuracoes.valor }).from(schema.configuracoes).where(eq(schema.configuracoes.chave, CHAVE)).limit(1);
  return l ? normalizarTaxas(l.valor) : TAXAS_PADRAO;
}

/** Grava e devolve o que mudou ("Master/Visa 12x: 15% → 16%"), para o histórico. */
export async function salvarTaxas(t: TaxasMaquineta, usuarioId: number): Promise<string[]> {
  const antes = await lerTaxas();
  const valor = normalizarTaxas(t);
  const pct = (x: number) => `${x.toLocaleString("pt-BR")}%`;
  const mudou: string[] = [];
  for (const n of FAIXAS) {
    if (antes.visaMaster[n] !== valor.visaMaster[n]) mudou.push(`Master/Visa ${n}x: ${pct(antes.visaMaster[n])} → ${pct(valor.visaMaster[n])}`);
    if (antes.eloAmex[n] !== valor.eloAmex[n]) mudou.push(`Elo/Amex ${n}x: ${pct(antes.eloAmex[n])} → ${pct(valor.eloAmex[n])}`);
  }
  if (antes.debito.visaMaster !== valor.debito.visaMaster) mudou.push(`Débito Master/Visa: ${pct(antes.debito.visaMaster)} → ${pct(valor.debito.visaMaster)}`);
  if (antes.debito.eloAmex !== valor.debito.eloAmex) mudou.push(`Débito Elo/Amex: ${pct(antes.debito.eloAmex)} → ${pct(valor.debito.eloAmex)}`);
  await db
    .insert(schema.configuracoes)
    .values({ chave: CHAVE, valor, atualizadoPor: usuarioId })
    .onConflictDoUpdate({ target: schema.configuracoes.chave, set: { valor, atualizadoEm: new Date(), atualizadoPor: usuarioId } });
  return mudou;
}
