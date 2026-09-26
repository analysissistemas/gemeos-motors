import { NextResponse } from "next/server";
import { and, asc, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";

/* Público de propósito (a vitrine lê daqui, sem login): as cores ativas de cada
   modelo ativo, na ordem escolhida pela equipe, com a foto da moto naquela cor.
   Só nome, tom e foto — nunca custo, estoque ou quem cadastrou.
   Formato: { modelos: { "MM3": [{ nome, hex, foto }] } } — foto é um endereço
   do próprio site (/api/vitrine/foto/...) ou null. Modelo sem cor cadastrada
   não aparece: a vitrine continua com as cores do estoque.js. */
export const dynamic = "force-dynamic";

export async function GET() {
  const c = schema.modeloCores;
  const m = schema.modelos;
  try {
    const linhas = await db
      .select({ modelo: m.nome, nome: c.nome, hex: c.hex, foto: c.fotoUrl })
      .from(c)
      .innerJoin(m, eq(m.id, c.modeloId))
      .where(and(eq(c.ativo, true), eq(m.ativo, true)))
      .orderBy(asc(m.nome), asc(c.ordem), asc(c.id));
    const modelos: Record<string, { nome: string; hex: string; foto: string | null }[]> = {};
    for (const l of linhas) (modelos[l.modelo] ??= []).push({ nome: l.nome, hex: l.hex, foto: l.foto });
    return NextResponse.json({ modelos }, { headers: { "Cache-Control": "public, max-age=60, s-maxage=60, stale-while-revalidate=300" } });
  } catch (e) {
    console.error("[vitrine/cores]", e);
    return NextResponse.json({ erro: "indisponível" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
