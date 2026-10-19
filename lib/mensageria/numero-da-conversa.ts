import "server-only";
import { and, desc, eq, gt, ne, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";

/* ============================================================
   DE QUAL NÚMERO DA LOJA RESPONDER
   A conta da Meta tem mais de um número (troca para o 81 98388-1281 em
   18/10/2026) e o webhook entrega as mensagens dos dois. A janela de 24 h é
   por número: responder pelo número novo a quem escreveu no antigo dá
   "código 131047" mesmo com o cliente falando agora (dono, 19/10/2026).
   Regra: responde pelo número em que o cliente escreveu por último
   (metadados.numeroId, gravado pelo webhook desde 19/10/2026).
   ============================================================ */

const numeroIdSql = sql<string | null>`${schema.mensagens.metadados}->>'numeroId'`;

/** Número da loja (phone_number_id) que deve responder a este telefone. */
export async function numeroParaResponder(telefone: string, atual: string): Promise<string> {
  try {
    const [ultima] = await db
      .select({ id: schema.mensagens.id, conversaId: schema.mensagens.conversaId, numeroId: numeroIdSql })
      .from(schema.mensagens)
      .innerJoin(schema.conversas, eq(schema.conversas.id, schema.mensagens.conversaId))
      .where(and(eq(schema.conversas.contatoTelefone, telefone), eq(schema.mensagens.direcao, "incoming")))
      .orderBy(desc(schema.mensagens.id))
      .limit(1);
    if (!ultima) return atual;
    if (ultima.numeroId) return ultima.numeroId;
    /* mensagem de antes do registro do número: se a resposta pelo número atual já voltou com 131047, ele escreveu no outro */
    const [falhou] = await db
      .select({ id: schema.mensagens.id })
      .from(schema.mensagens)
      .where(and(eq(schema.mensagens.conversaId, ultima.conversaId), gt(schema.mensagens.id, ultima.id), sql`${schema.mensagens.metadados}->>'erro' like '%131047%'`))
      .limit(1);
    if (!falhou) return atual;
    return (await outroNumeroConhecido(atual)) ?? atual;
  } catch {
    return atual;
  }
}

/** Número em que chegou uma mensagem do cliente (para "lida", "digitando…" e reação). */
export async function numeroDaMensagem(externoId: string): Promise<string | null> {
  try {
    const [m] = await db.select({ numeroId: numeroIdSql }).from(schema.mensagens).where(eq(schema.mensagens.externoId, externoId)).limit(1);
    return m?.numeroId ?? null;
  } catch {
    return null;
  }
}

/** O outro número da conta: o mais recente em que algum cliente escreveu, diferente do atual. */
async function outroNumeroConhecido(atual: string) {
  const [m] = await db
    .select({ numeroId: numeroIdSql })
    .from(schema.mensagens)
    .where(and(eq(schema.mensagens.direcao, "incoming"), sql`${numeroIdSql} is not null`, ne(numeroIdSql, atual)))
    .orderBy(desc(schema.mensagens.id))
    .limit(1);
  return m?.numeroId ?? null;
}
