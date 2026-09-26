import { NextResponse } from "next/server";
import { and, eq, gt, lte } from "drizzle-orm";
import { db, schema } from "@/lib/db";

/* Público de propósito (a vitrine lê daqui): só o que o cliente pode ver, das promoções em vigor agora.
   Nunca custo, estoque nem dados de venda. */
export const dynamic = "force-dynamic";

export async function GET() {
  const agora = new Date();
  const linhas = await db
    .select({ modelo: schema.modelos.nome, precoNormal: schema.modelos.precoTabela, precoPromocional: schema.promocoes.precoPromocional, inicioEm: schema.promocoes.inicioEm, fimEm: schema.promocoes.fimEm })
    .from(schema.promocoes)
    .innerJoin(schema.modelos, eq(schema.modelos.id, schema.promocoes.modeloId))
    .where(and(eq(schema.promocoes.ativo, true), lte(schema.promocoes.inicioEm, agora), gt(schema.promocoes.fimEm, agora)));
  const validas = linhas.filter((l) => l.precoNormal != null && l.precoPromocional < l.precoNormal);
  return NextResponse.json({ agora: agora.toISOString(), promocoes: validas }, { headers: { "Cache-Control": "public, max-age=30, s-maxage=30" } });
}
