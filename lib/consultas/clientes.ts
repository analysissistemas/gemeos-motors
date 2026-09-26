import "server-only";
import { and, desc, eq, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db, schema } from "@/lib/db";
import { ETAPAS_ABERTAS } from "@/lib/dominio";

export const POR_PAGINA = 30;

export async function listarClientes(f: { q?: string; origem?: string; responsavelId?: number; pagina?: number }) {
  const c = schema.clientes;
  const resp = alias(schema.usuarios, "resp");
  const termo = f.q?.trim();
  const dig = termo?.replace(/\D/g, "") ?? "";
  const filtro = and(
    termo
      ? or(
          sql`${c.nome} ilike ${"%" + termo + "%"}`,
          sql`${c.email} ilike ${"%" + termo + "%"}`,
          sql`${c.cidade} ilike ${"%" + termo + "%"}`,
          dig.length >= 3 ? sql`${c.whatsapp} like ${"%" + dig + "%"}` : undefined,
          dig.length >= 3 ? sql`${c.telefone} like ${"%" + dig + "%"}` : undefined,
          dig.length >= 3 ? sql`${c.cpf} like ${dig + "%"}` : undefined,
        )
      : undefined,
    f.origem ? eq(c.origem, f.origem) : undefined,
    f.responsavelId ? eq(c.responsavelId, f.responsavelId) : undefined,
  );
  const pagina = Math.max(1, f.pagina ?? 1);
  const abertas = sql.join(ETAPAS_ABERTAS.map((e) => sql`${e}`), sql`, `);
  const [linhas, [{ total }]] = await Promise.all([
    db
      .select({
        id: c.id,
        nome: c.nome,
        whatsapp: c.whatsapp,
        telefone: c.telefone,
        cidade: c.cidade,
        estado: c.estado,
        origem: c.origem,
        demo: c.demo,
        fotoUrl: c.fotoUrl,
        responsavel: resp.nome,
        responsavelFoto: resp.fotoUrl,
        criadoEm: c.criadoEm,
        negociosAbertos: sql<number>`(select count(*)::int from negocios n where n.cliente_id = ${c.id} and n.etapa in (${abertas}))`,
        compras: sql<number>`(select count(*)::int from vendas v where v.cliente_id = ${c.id} and v.status = 'finalizada')`,
        ultimaAtividade: sql<Date | null>`greatest(
          ${c.atualizadoEm},
          (select max(i.criado_em) from interacoes i where i.cliente_id = ${c.id}),
          (select max(n.atualizado_em) from negocios n where n.cliente_id = ${c.id}),
          (select max(cv.ultima_mensagem_em) from conversas cv where cv.cliente_id = ${c.id})
        )`,
      })
      .from(c)
      .leftJoin(resp, eq(resp.id, c.responsavelId))
      .where(filtro)
      .orderBy(desc(c.criadoEm))
      .limit(POR_PAGINA)
      .offset((pagina - 1) * POR_PAGINA),
    db.select({ total: sql<number>`count(*)::int` }).from(c).where(filtro),
  ]);
  return { linhas, total, pagina, paginas: Math.max(1, Math.ceil(total / POR_PAGINA)) };
}

export async function obterPerfilCliente(id: number) {
  const c = schema.clientes;
  const resp = alias(schema.usuarios, "resp");
  const [cliente] = await db
    .select({ cliente: c, responsavel: resp.nome, responsavelFoto: resp.fotoUrl })
    .from(c)
    .leftJoin(resp, eq(resp.id, c.responsavelId))
    .where(eq(c.id, id))
    .limit(1);
  if (!cliente) return null;

  const n = schema.negocios;
  const u = schema.usuarios;
  const v = schema.vendas;
  const veic = schema.veiculos;
  const vendedor = alias(schema.usuarios, "vendedor");
  const tecnico = alias(schema.usuarios, "tecnico");

  const [negocios, vendas, ordens, interacoes, conversas, followups, historico, eventosProposta] = await Promise.all([
    db
      .select({
        id: n.id,
        etapa: n.etapa,
        veiculoInteresse: n.veiculoInteresse,
        veiculo: sql<string | null>`case when ${veic.id} is null then null else concat_ws(' ', ${veic.marca}, ${veic.modelo}, ${veic.anoModelo}) end`,
        valorAnunciado: n.valorAnunciado,
        valorProposta: n.valorProposta,
        temTroca: n.temTroca,
        responsavel: u.nome,
        criadoEm: n.criadoEm,
        etapaDesde: n.etapaDesde,
        perdaMotivo: n.perdaMotivo,
        diagnosticoEm: n.diagnosticoEm,
      })
      .from(n)
      .leftJoin(u, eq(u.id, n.responsavelId))
      .leftJoin(veic, eq(veic.id, n.veiculoId))
      .where(eq(n.clienteId, id))
      .orderBy(desc(n.criadoEm)),
    db
      .select({
        id: v.id,
        status: v.status,
        valorVendido: v.valorVendido,
        veiculo: sql<string | null>`concat_ws(' ', ${veic.marca}, ${veic.modelo}, ${veic.anoModelo})`,
        vendedor: vendedor.nome,
        criadoEm: v.criadoEm,
        finalizadaEm: v.finalizadaEm,
        documentoGeradoEm: v.documentoGeradoEm,
      })
      .from(v)
      .leftJoin(veic, eq(veic.id, v.veiculoId))
      .leftJoin(vendedor, eq(vendedor.id, v.vendedorId))
      .where(eq(v.clienteId, id))
      .orderBy(desc(v.criadoEm)),
    db
      .select({
        id: schema.ordensServico.id,
        tipo: schema.ordensServico.tipo,
        status: schema.ordensServico.status,
        veiculoDescricao: schema.ordensServico.veiculoDescricao,
        problemaRelatado: schema.ordensServico.problemaRelatado,
        tecnico: tecnico.nome,
        abertaEm: schema.ordensServico.abertaEm,
      })
      .from(schema.ordensServico)
      .leftJoin(tecnico, eq(tecnico.id, schema.ordensServico.tecnicoId))
      .where(eq(schema.ordensServico.clienteId, id))
      .orderBy(desc(schema.ordensServico.abertaEm)),
    db
      .select({ id: schema.interacoes.id, canal: schema.interacoes.canal, resumo: schema.interacoes.resumo, criadoEm: schema.interacoes.criadoEm, usuario: u.nome, negocioId: schema.interacoes.negocioId })
      .from(schema.interacoes)
      .leftJoin(u, eq(u.id, schema.interacoes.usuarioId))
      .where(eq(schema.interacoes.clienteId, id))
      .orderBy(desc(schema.interacoes.criadoEm))
      .limit(100),
    db
      .select({
        id: schema.conversas.id,
        canal: schema.conversas.canal,
        status: schema.conversas.status,
        ultimaMensagemEm: schema.conversas.ultimaMensagemEm,
        ultimaMensagemTexto: schema.conversas.ultimaMensagemTexto,
        demo: schema.conversas.demo,
      })
      .from(schema.conversas)
      .where(eq(schema.conversas.clienteId, id)),
    db
      .select({ id: schema.followUps.id, agendadoPara: schema.followUps.agendadoPara, status: schema.followUps.status, notas: schema.followUps.notas, usuario: u.nome })
      .from(schema.followUps)
      .leftJoin(u, eq(u.id, schema.followUps.usuarioId))
      .where(eq(schema.followUps.clienteId, id))
      .orderBy(desc(schema.followUps.agendadoPara))
      .limit(50),
    db
      .select({ id: schema.logs.id, descricao: schema.logs.descricao, usuarioNome: schema.logs.usuarioNome, criadoEm: schema.logs.criadoEm, acao: schema.logs.acao })
      .from(schema.logs)
      .where(and(eq(schema.logs.entidade, "cliente"), eq(schema.logs.entidadeId, String(id))))
      .orderBy(desc(schema.logs.criadoEm))
      .limit(100),
    db
      .select({ negocioId: schema.negocioEventos.negocioId, descricao: schema.negocioEventos.descricao, dados: schema.negocioEventos.dados, criadoEm: schema.negocioEventos.criadoEm, usuario: u.nome })
      .from(schema.negocioEventos)
      .innerJoin(n, eq(n.id, schema.negocioEventos.negocioId))
      .leftJoin(u, eq(u.id, schema.negocioEventos.usuarioId))
      .where(and(eq(n.clienteId, id), sql`${schema.negocioEventos.tipo} in ('proposta', 'criado')`))
      .orderBy(desc(schema.negocioEventos.criadoEm)),
  ]);

  const assinaturas = vendas.length
    ? await db
        .select({ id: schema.assinaturas.id, documentoId: schema.assinaturas.documentoId, documentoTipo: schema.assinaturas.documentoTipo, status: schema.assinaturas.status, assinadoEm: schema.assinaturas.assinadoEm, modo: schema.assinaturas.modo })
        .from(schema.assinaturas)
        .where(and(eq(schema.assinaturas.documentoTipo, "venda"), sql`${schema.assinaturas.documentoId} in (${sql.join(vendas.map((x) => sql`${x.id}`), sql`, `)})`))
    : [];

  return { ...cliente, negocios, vendas, ordens, interacoes, conversas, followups, historico, eventosProposta, assinaturas };
}
export type PerfilCliente = NonNullable<Awaited<ReturnType<typeof obterPerfilCliente>>>;
