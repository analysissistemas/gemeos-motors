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

/* Selo do site pelo estoque de verdade (dono, 18/10/2026: "no site tem vários produtos que não estão no estoque...
   colocar esgotado"): tem unidade disponível (ou acessório com quantidade) → Pronta entrega; reposição cadastrada →
   Chegando dd/mm; sem nada → Esgotado. "Sob encomenda" escolhido pela equipe vale no lugar do Esgotado. Acessório
   sem quantidade contada fica com o que a equipe escolheu. */
function situacaoNoSite(x: { tipo: string; quantidade: number | null; disponibilidade: string; reposicaoEm: string | null }, unidades: number, hoje: string) {
  const manual = x.disponibilidade in DISPONIBILIDADES ? x.disponibilidade : "consultar";
  const acessorio = x.tipo === "acessorio";
  if (acessorio && x.quantidade == null) return { disponibilidade: manual, chegaEm: null };
  const tem = acessorio ? (x.quantidade ?? 0) > 0 : unidades > 0;
  if (tem) return { disponibilidade: "pronta_entrega", chegaEm: null };
  if (x.reposicaoEm && x.reposicaoEm >= hoje) return { disponibilidade: "chegando", chegaEm: x.reposicaoEm.split("-").reverse().slice(0, 2).join("/") };
  if (manual === "sob_encomenda") return { disponibilidade: manual, chegaEm: null };
  return { disponibilidade: "esgotado", chegaEm: null };
}

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
        /* o card mostra a foto enquadrada só na moto; sem enquadrar, a original */
        foto: sql<string | null>`coalesce(${m.fotoVitrineUrl}, ${m.fotoUrl})`,
        disponibilidade: m.disponibilidade,
        lancamento: m.lancamento,
        lancamentoTexto: m.lancamentoTexto,
        ordem: m.ordem,
        quantidade: m.quantidade,
        reposicaoEm: m.reposicaoEm,
        /* só o número de reservas em aberto ("12 pessoas já reservaram"), nunca quem */
        reservas: sql<number>`(select count(*)::int from reservas_lancamento r where r.modelo_id = "modelos"."id" and r.status <> 'cancelada')`,
      })
      .from(m)
      .where(and(eq(m.ativo, true), eq(m.mostrarNoSite, true)))
      .orderBy(asc(m.ordem), asc(m.nome));

    const ids = modelos.map((x) => x.id);
    /* unidades disponíveis por modelo (só para o selo; a quantidade não sai na resposta) */
    const v = schema.veiculos;
    const unidades = ids.length
      ? await db
          .select({ modeloId: v.modeloId, modelo: v.modelo })
          .from(v)
          .where(and(eq(v.status, "disponivel"), eq(v.teste, false)))
      : [];
    const hoje = new Date(Date.now() - 3 * 3_600_000).toISOString().slice(0, 10);
    const cores = ids.length
      ? await db
          .select({ modeloId: c.modeloId, nome: c.nome, hex: c.hex, foto: sql<string | null>`coalesce(${c.fotoVitrineUrl}, ${c.fotoUrl})` })
          .from(c)
          .where(and(inArray(c.modeloId, ids), eq(c.ativo, true), ne(c.nome, "")))
          .orderBy(asc(c.ordem), asc(c.id))
      : [];

    const saida = modelos.map((x) => {
      const situacao = situacaoNoSite(x, unidades.filter((u) => u.modeloId === x.id || (!u.modeloId && u.modelo.trim().toLowerCase() === x.nome.trim().toLowerCase())).length, hoje);
      /* lançamento que já chegou ao estoque deixa de ser lançamento no site sozinho: some a faixa e o "Quero reservar"
         e volta o botão normal (dono, 20/10/2026: "automaticamente quando coloca no estoque tem que mudar") */
      const lancamento = x.lancamento && situacao.disponibilidade !== "pronta_entrega";
      /* ficha: só as chaves conhecidas e preenchidas, para o site esconder o chip vazio */
      const ficha: Record<string, string> = {};
      if (x.tipo !== "acessorio" && x.ficha)
        for (const c of CAMPOS_FICHA) if (!("foraDoSite" in c) && !valorFichaVazio(x.ficha[c.chave])) ficha[c.chave] = String(x.ficha[c.chave]).trim();
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
        ...situacao,
        lancamento,
        lancamentoTexto: lancamento ? x.lancamentoTexto : null,
        reservas: lancamento ? x.reservas : 0,
        ordem: x.ordem,
      };
    });
    return NextResponse.json({ modelos: saida }, { headers: { "Cache-Control": "public, max-age=60, s-maxage=60, stale-while-revalidate=300" } });
  } catch (e) {
    console.error("[vitrine/catalogo]", e);
    return NextResponse.json({ erro: "indisponível" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
