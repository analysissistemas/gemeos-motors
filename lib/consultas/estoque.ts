import "server-only";
import { and, asc, desc, eq, ne, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db, schema } from "@/lib/db";

export async function listarVeiculos(f: { q?: string; status?: string; tipo?: string; verCusto: boolean }) {
  const v = schema.veiculos;
  const un = schema.unidades;
  const termo = f.q?.trim();
  const linhas = await db
    .select({
      id: v.id,
      modeloId: v.modeloId,
      tipo: v.tipo,
      marca: v.marca,
      modelo: v.modelo,
      versao: v.versao,
      cor: v.cor,
      anoFabricacao: v.anoFabricacao,
      anoModelo: v.anoModelo,
      placa: v.placa,
      chassi: v.chassi,
      renavam: v.renavam,
      km: v.km,
      condicao: v.condicao,
      valorAnunciado: v.valorAnunciado,
      custo: f.verCusto ? v.custo : sql<number | null>`null`,
      status: v.status,
      unidadeId: v.unidadeId,
      unidade: un.nome,
      origemEntrada: v.origemEntrada,
      observacoes: v.observacoes,
      entradaEm: v.entradaEm,
      vendidoEm: v.vendidoEm,
      negociosAbertos: sql<number>`(select count(*)::int from negocios n where n.veiculo_id = ${v.id} and n.etapa in ('whatsapp','proposta','negociando'))`,
    })
    .from(v)
    .leftJoin(un, eq(un.id, v.unidadeId))
    .where(
      and(
        f.status ? eq(v.status, f.status) : ne(v.status, "inativo"),
        f.tipo ? eq(v.tipo, f.tipo) : undefined,
        termo
          ? or(
              sql`concat_ws(' ', ${v.marca}, ${v.modelo}, ${v.versao}, ${v.cor}) ilike ${"%" + termo + "%"}`,
              sql`${v.placa} ilike ${"%" + termo.replace(/[^a-zA-Z0-9]/g, "") + "%"}`,
              sql`${v.chassi} ilike ${"%" + termo + "%"}`,
            )
          : undefined,
      ),
    )
    .orderBy(sql`case ${v.status} when 'disponivel' then 0 when 'reservado' then 1 when 'vendido' then 2 else 3 end`, desc(v.entradaEm), desc(v.id))
    .limit(300);
  return linhas;
}
export type VeiculoLinha = Awaited<ReturnType<typeof listarVeiculos>>[number];

export async function resumoEstoque(verCusto: boolean) {
  const v = schema.veiculos;
  const [r] = await db
    .select({
      disponiveis: sql<number>`count(*) filter (where ${v.status} = 'disponivel')::int`,
      reservados: sql<number>`count(*) filter (where ${v.status} = 'reservado')::int`,
      vendidos30: sql<number>`count(*) filter (where ${v.status} = 'vendido' and ${v.vendidoEm} > now() - interval '30 days')::int`,
      valorAnunciado: sql<number>`coalesce(sum(${v.valorAnunciado}) filter (where ${v.status} in ('disponivel','reservado')),0)::float`,
      custoParado: verCusto ? sql<number>`coalesce(sum(${v.custo}) filter (where ${v.status} in ('disponivel','reservado')),0)::float` : sql<number>`0`,
      semValor: sql<number>`count(*) filter (where ${v.status} = 'disponivel' and ${v.valorAnunciado} is null)::int`,
      paradosMais60: sql<number>`count(*) filter (where ${v.status} = 'disponivel' and ${v.entradaEm} < current_date - 60)::int`,
    })
    .from(v);
  return r;
}

export async function listarMovimentacoes() {
  const v = schema.veiculos;
  const vd = schema.vendas;
  const cl = schema.clientes;
  const quem = alias(schema.usuarios, "quem");
  const [entradas, saidas] = await Promise.all([
    db
      .select({ id: v.id, quando: v.criadoEm, entradaEm: v.entradaEm, descricao: sql<string>`concat_ws(' ', ${v.marca}, ${v.modelo}, ${v.cor})`, origem: v.origemEntrada, quem: quem.nome, placa: v.placa })
      .from(v)
      .leftJoin(quem, eq(quem.id, v.criadoPor))
      .orderBy(desc(v.criadoEm))
      .limit(100),
    db
      .select({ id: vd.id, quando: vd.finalizadaEm, veiculoId: v.id, descricao: sql<string>`concat_ws(' ', ${v.marca}, ${v.modelo}, ${v.cor})`, cliente: cl.nome, valor: vd.valorVendido, quem: quem.nome, placa: v.placa })
      .from(vd)
      .innerJoin(v, eq(v.id, vd.veiculoId))
      .leftJoin(cl, eq(cl.id, vd.clienteId))
      .leftJoin(quem, eq(quem.id, vd.vendedorId))
      .where(eq(vd.status, "finalizada"))
      .orderBy(desc(vd.finalizadaEm))
      .limit(100),
  ]);
  return { entradas, saidas };
}

/** Modelos que viram veículo no estoque (acessório fica de fora: é por quantidade). */
export async function listarModelos() {
  return db
    .select({ id: schema.modelos.id, nome: schema.modelos.nome, tipo: schema.modelos.tipo, marca: schema.modelos.marca, precoTabela: schema.modelos.precoTabela, ficha: schema.modelos.ficha })
    .from(schema.modelos)
    .where(and(eq(schema.modelos.ativo, true), ne(schema.modelos.tipo, "acessorio")))
    .orderBy(asc(schema.modelos.nome));
}

/** Aba "Catálogo": todos os itens (inclusive desativados), na ordem do site, com
 *  o que a tela precisa para decidir o que pode (veículos ligados, reservas). */
export async function listarCatalogo() {
  const m = schema.modelos;
  return db
    .select({
      id: m.id,
      nome: m.nome,
      tipo: m.tipo,
      marca: m.marca,
      precoTabela: m.precoTabela,
      ficha: m.ficha,
      descricao: m.descricao,
      fotoUrl: m.fotoUrl,
      mostrarNoSite: m.mostrarNoSite,
      disponibilidade: m.disponibilidade,
      lancamento: m.lancamento,
      lancamentoTexto: m.lancamentoTexto,
      ordem: m.ordem,
      ativo: m.ativo,
      veiculos: sql<number>`(select count(*)::int from veiculos v where v.modelo_id = ${m.id})`,
      reservas: sql<number>`(select count(*)::int from reservas_lancamento r where r.modelo_id = ${m.id} and r.status <> 'cancelada')`,
      reservasNovas: sql<number>`(select count(*)::int from reservas_lancamento r where r.modelo_id = ${m.id} and r.status = 'nova')`,
    })
    .from(m)
    .orderBy(desc(m.ativo), asc(m.ordem), asc(m.nome));
}
export type ItemCatalogo = Awaited<ReturnType<typeof listarCatalogo>>[number];

/** Veículos que podem entrar num negócio ou venda. */
export async function listarVeiculosVendaveis() {
  const v = schema.veiculos;
  return db
    .select({
      id: v.id,
      rotulo: sql<string>`concat_ws(' ', ${v.marca}, ${v.modelo}, ${v.versao}, ${v.cor}, case when ${v.anoModelo} is not null then ${v.anoModelo}::text end, case when ${v.placa} is not null then '· ' || ${v.placa} end)`,
      valorAnunciado: v.valorAnunciado,
      status: v.status,
      condicao: v.condicao,
    })
    .from(v)
    .where(or(eq(v.status, "disponivel"), eq(v.status, "reservado")))
    .orderBy(asc(v.modelo));
}

/** Cores cadastradas em cada modelo (inclusive as escondidas da vitrine), na ordem de exibição. */
export async function listarCoresModelos() {
  const c = schema.modeloCores;
  return db
    .select({ id: c.id, modeloId: c.modeloId, nome: c.nome, hex: c.hex, fotoUrl: c.fotoUrl, ordem: c.ordem, ativo: c.ativo })
    .from(c)
    .orderBy(asc(c.modeloId), asc(c.ordem), asc(c.id));
}
export type CorModelo = Awaited<ReturnType<typeof listarCoresModelos>>[number];
