import { NextResponse } from "next/server";
import { and, asc, eq, inArray, ne, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { CAMPOS_FICHA, DISPONIBILIDADES, valorFichaVazio } from "@/lib/dominio";

/* Catálogo do site, PÚBLICO (a vitrine lê daqui, sem login): o que a equipe
   cadastrou em Estoque → Catálogo, só `ativo && mostrarNoSite`, na ordem da
   equipe. Nunca custo, estoque, placa ou chassi — só o que o cliente vê no card.
   Contrato usado por public/catalogo-sistema.js (não mudar sem mudar lá):
   { modelos: [{ id, nome, tipo, marca, preco, ficha, descricao, foto, cores,
                 disponibilidade, lancamento, lancamentoTexto, reservas, ordem }] } */
export const dynamic = "force-dynamic";

export async function GET() {
  const m = schema.modelos;
  const c = schema.modeloCores;
  try {
    const modelos = await db
      .select({
        id: m.id,
        nome: m.nome,
        tipo: m.tipo,
        marca: m.marca,
        preco: m.precoTabela,
        ficha: m.ficha,
        descricao: m.descricao,
        foto: m.fotoUrl,
        disponibilidade: m.disponibilidade,
        lancamento: m.lancamento,
        lancamentoTexto: m.lancamentoTexto,
        ordem: m.ordem,
        /* só o número de reservas em aberto ("12 pessoas já reservaram"), nunca quem */
        reservas: sql<number>`(select count(*)::int from reservas_lancamento r where r.modelo_id = "modelos"."id" and r.status <> 'cancelada')`,
      })
      .from(m)
      .where(and(eq(m.ativo, true), eq(m.mostrarNoSite, true)))
      .orderBy(asc(m.ordem), asc(m.nome));

    const ids = modelos.map((x) => x.id);
    const cores = ids.length
      ? await db
          .select({ modeloId: c.modeloId, nome: c.nome, hex: c.hex, foto: c.fotoUrl })
          .from(c)
          .where(and(inArray(c.modeloId, ids), eq(c.ativo, true), ne(c.nome, "")))
          .orderBy(asc(c.ordem), asc(c.id))
      : [];

    const saida = modelos.map((x) => {
      /* ficha: só as chaves conhecidas e preenchidas, para o site esconder o chip vazio */
      const ficha: Record<string, string> = {};
      if (x.tipo !== "acessorio" && x.ficha)
        for (const { chave } of CAMPOS_FICHA) if (!valorFichaVazio(x.ficha[chave])) ficha[chave] = String(x.ficha[chave]).trim();
      return {
        id: x.id,
        nome: x.nome,
        tipo: x.tipo,
        marca: x.marca,
        preco: x.preco != null && x.preco > 0 ? Number(x.preco) : null,
        ficha: Object.keys(ficha).length ? ficha : null,
        descricao: x.descricao,
        foto: x.foto?.startsWith("/api/vitrine/foto/") ? x.foto : null,
        cores: cores.filter((k) => k.modeloId === x.id).map((k) => ({ nome: k.nome, hex: k.hex, foto: k.foto })),
        disponibilidade: x.disponibilidade in DISPONIBILIDADES ? x.disponibilidade : "consultar",
        lancamento: x.lancamento,
        lancamentoTexto: x.lancamento ? x.lancamentoTexto : null,
        reservas: x.lancamento ? x.reservas : 0,
        ordem: x.ordem,
      };
    });
    return NextResponse.json({ modelos: saida }, { headers: { "Cache-Control": "public, max-age=60, s-maxage=60, stale-while-revalidate=300" } });
  } catch (e) {
    console.error("[vitrine/catalogo]", e);
    return NextResponse.json({ erro: "indisponível" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
