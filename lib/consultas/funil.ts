import "server-only";
import { and, asc, desc, eq, gt, ne, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db, schema } from "@/lib/db";

export async function listarNegociosFunil(f: { responsavelId?: number; q?: string; diasEncerrados?: number }) {
  const n = schema.negocios;
  const c = schema.clientes;
  const v = schema.veiculos;
  const u = alias(schema.usuarios, "resp");
  const termo = f.q?.trim();
  const dias = f.diasEncerrados ?? 30;
  return db
    .select({
      id: n.id,
      etapa: n.etapa,
      clienteId: c.id,
      cliente: c.nome,
      veiculoId: n.veiculoId,
      veiculo: sql<string | null>`case when ${v.id} is null then null else concat_ws(' ', ${v.marca}, ${v.modelo}, ${v.cor}, ${v.anoModelo}) end`,
      veiculoInteresse: n.veiculoInteresse,
      responsavelId: n.responsavelId,
      responsavel: u.nome,
      responsavelFoto: u.fotoUrl,
      valorAnunciado: n.valorAnunciado,
      valorProposta: n.valorProposta,
      origem: n.origem,
      temTroca: n.temTroca,
      etapaDesde: n.etapaDesde,
      ultimaInteracaoEm: n.ultimaInteracaoEm,
      criadoEm: n.criadoEm,
      demo: n.demo,
      temDiagnostico: sql<boolean>`${n.diagnosticoIa} is not null`,
      atendimentoIa: sql<boolean>`${n.triagemIa} is not null`,
      vendaId: sql<number | null>`(select vd.id from vendas vd where vd.negocio_id = ${n.id} and vd.status <> 'cancelada' order by vd.id desc limit 1)`,
      vendaStatus: sql<string | null>`(select vd.status from vendas vd where vd.negocio_id = ${n.id} and vd.status <> 'cancelada' order by vd.id desc limit 1)`,
      conversaId: sql<number | null>`(select cv.id from conversas cv where cv.negocio_id = ${n.id} limit 1)`,
      naoLidas: sql<number>`coalesce((select cv.nao_lidas from conversas cv where cv.negocio_id = ${n.id} limit 1), 0)`,
    })
    .from(n)
    .innerJoin(c, eq(c.id, n.clienteId))
    .leftJoin(v, eq(v.id, n.veiculoId))
    .leftJoin(u, eq(u.id, n.responsavelId))
    .where(
      and(
        or(sql`${n.etapa} in ('whatsapp','proposta','negociando')`, gt(n.etapaDesde, sql`now() - make_interval(days => ${dias})`)),
        f.responsavelId ? eq(n.responsavelId, f.responsavelId) : undefined,
        termo
          ? or(
              sql`${c.nome} ilike ${"%" + termo + "%"}`,
              sql`${n.veiculoInteresse} ilike ${"%" + termo + "%"}`,
              sql`concat_ws(' ', ${v.marca}, ${v.modelo}) ilike ${"%" + termo + "%"}`,
            )
          : undefined,
      ),
    )
    .orderBy(asc(n.etapaDesde))
    .limit(500);
}
export type CardNegocio = Awaited<ReturnType<typeof listarNegociosFunil>>[number];

export async function obterNegocio(id: number) {
  const n = schema.negocios;
  const resp = alias(schema.usuarios, "resp");
  const humano = alias(schema.usuarios, "humano");
  const [linha] = await db
    .select({
      negocio: n,
      cliente: { id: schema.clientes.id, nome: schema.clientes.nome, whatsapp: schema.clientes.whatsapp, telefone: schema.clientes.telefone, email: schema.clientes.email },
      responsavel: resp.nome,
      responsavelFoto: resp.fotoUrl,
      atendimentoHumano: humano.nome,
      veiculo: schema.veiculos,
    })
    .from(n)
    .innerJoin(schema.clientes, eq(schema.clientes.id, n.clienteId))
    .leftJoin(resp, eq(resp.id, n.responsavelId))
    .leftJoin(humano, eq(humano.id, n.atendimentoHumanoId))
    .leftJoin(schema.veiculos, eq(schema.veiculos.id, n.veiculoId))
    .where(eq(n.id, id))
    .limit(1);
  if (!linha) return null;
  const u = schema.usuarios;
  const [eventos, interacoes, venda, conversa, followups] = await Promise.all([
    db
      .select({ id: schema.negocioEventos.id, tipo: schema.negocioEventos.tipo, descricao: schema.negocioEventos.descricao, criadoEm: schema.negocioEventos.criadoEm, usuario: u.nome })
      .from(schema.negocioEventos)
      .leftJoin(u, eq(u.id, schema.negocioEventos.usuarioId))
      .where(eq(schema.negocioEventos.negocioId, id))
      .orderBy(desc(schema.negocioEventos.criadoEm)),
    db
      .select({ id: schema.interacoes.id, canal: schema.interacoes.canal, resumo: schema.interacoes.resumo, criadoEm: schema.interacoes.criadoEm, usuario: u.nome })
      .from(schema.interacoes)
      .leftJoin(u, eq(u.id, schema.interacoes.usuarioId))
      .where(eq(schema.interacoes.negocioId, id))
      .orderBy(desc(schema.interacoes.criadoEm)),
    db
      .select({ id: schema.vendas.id, status: schema.vendas.status, valorVendido: schema.vendas.valorVendido })
      .from(schema.vendas)
      .where(and(eq(schema.vendas.negocioId, id), ne(schema.vendas.status, "cancelada")))
      .limit(1),
    db.select({ id: schema.conversas.id, status: schema.conversas.status }).from(schema.conversas).where(eq(schema.conversas.negocioId, id)).limit(1),
    db
      .select({ id: schema.followUps.id, agendadoPara: schema.followUps.agendadoPara, status: schema.followUps.status, notas: schema.followUps.notas })
      .from(schema.followUps)
      .where(and(eq(schema.followUps.negocioId, id), eq(schema.followUps.status, "pendente")))
      .orderBy(asc(schema.followUps.agendadoPara)),
  ]);
  return { ...linha, eventos, interacoes, venda: venda[0] ?? null, conversa: conversa[0] ?? null, followups };
}
export type DetalheNegocio = NonNullable<Awaited<ReturnType<typeof obterNegocio>>>;
