import "server-only";
import { and, asc, desc, eq, ne, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db, schema } from "@/lib/db";
import { ETAPAS_ABERTAS } from "@/lib/dominio";

export async function listarVeiculos(f: { q?: string; status?: string; tipo?: string; verCusto: boolean; verTeste?: boolean }) {
  const v = schema.veiculos;
  const un = schema.unidades;
  const termo = f.q?.trim();
  const linhas = await db
    .select({
      id: v.id,
      teste: v.teste,
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
      negociosAbertos: sql<number>`(select count(*)::int from negocios n where n.veiculo_id = ${v.id} and n.etapa in (${sql.join(ETAPAS_ABERTAS.map((e) => sql`${e}`), sql`, `)}))`,
    })
    .from(v)
    .leftJoin(un, eq(un.id, v.unidadeId))
    .where(
      and(
        f.status ? eq(v.status, f.status) : ne(v.status, "inativo"),
        /* veículo de teste: só o administrador vê */
        f.verTeste ? undefined : eq(v.teste, false),
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
    .from(v)
    .where(eq(v.teste, false));
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
      fotoVitrineUrl: m.fotoVitrineUrl,
      fotoEnquadre: m.fotoEnquadre,
      videoUrl: m.videoUrl,
      fotoWhatsappUrl: m.fotoWhatsappUrl,
      mostrarNoSite: m.mostrarNoSite,
      quantidade: m.quantidade,
      disponibilidade: m.disponibilidade,
      lancamento: m.lancamento,
      lancamentoTexto: m.lancamentoTexto,
      reposicaoEm: m.reposicaoEm,
      reposicaoQtd: m.reposicaoQtd,
      /* a reposição ainda vale (data de hoje em diante, horário de Recife) */
      chegando: sql<boolean>`coalesce("modelos"."reposicao_em" >= (now() at time zone 'America/Recife')::date, false)`,
      ordem: m.ordem,
      ativo: m.ativo,
      /* unidades que dá para vender agora (o "veiculos" conta também as vendidas) */
      disponiveis: sql<number>`(select count(*)::int from veiculos v where v.status = 'disponivel' and not v.teste and (v.modelo_id = "modelos"."id" or (v.modelo_id is null and lower(trim(v.modelo)) = lower(trim("modelos"."nome")))))`,
      /* fila de espera: quem pediu e ainda não foi avisado */
      naFila: sql<number>`(select count(*)::int from interesses_modelo i join conversas c on c.id = i.conversa_id where i.modelo_id = "modelos"."id" and i.avisado_em is null and not c.demo)`,
      veiculos: sql<number>`(select count(*)::int from veiculos v where v.modelo_id = "modelos"."id" and not v.teste)`,
      reservas: sql<number>`(select count(*)::int from reservas_lancamento r where r.modelo_id = "modelos"."id" and r.status <> 'cancelada')`,
      reservasNovas: sql<number>`(select count(*)::int from reservas_lancamento r where r.modelo_id = "modelos"."id" and r.status = 'nova')`,
    })
    .from(m)
    .orderBy(desc(m.ativo), asc(m.ordem), asc(m.nome));
}
export type ItemCatalogo = Awaited<ReturnType<typeof listarCatalogo>>[number];

/** Fila de espera (dono, 18/10/2026): quem pediu uma moto sem estoque, por modelo. Aceitou ser avisado = recebe o
 *  aviso automático quando chegar; só perguntou = vira tarefa para a equipe. Conversa do Simulador fica de fora. */
export async function listarFilaEspera() {
  const i = schema.interessesModelo;
  const c = schema.conversas;
  const linhas = await db
    .select({
      id: i.id,
      modeloId: i.modeloId,
      modelo: schema.modelos.nome,
      conversaId: i.conversaId,
      telefone: i.telefone,
      contato: c.contatoNome,
      cliente: schema.clientes.nome,
      origem: i.origem,
      criadoEm: i.criadoEm,
      consentiuEm: i.consentiuEm,
      avisadoEm: i.avisadoEm,
      mensagemEm: i.mensagemEm,
    })
    .from(i)
    .innerJoin(c, eq(c.id, i.conversaId))
    .innerJoin(schema.modelos, eq(schema.modelos.id, i.modeloId))
    .leftJoin(schema.clientes, eq(schema.clientes.id, i.clienteId))
    .where(eq(c.demo, false))
    .orderBy(asc(schema.modelos.nome), desc(i.criadoEm))
    .limit(500);
  return linhas;
}
export type LinhaFila = Awaited<ReturnType<typeof listarFilaEspera>>[number];

/** Veículos que podem entrar num negócio ou venda. */
/** Veículos que podem entrar numa venda ou negócio. Os de teste só entram no funil do admin
    (para testar a IA num negócio simulado), marcados com "[TESTE]"; venda nunca. */
export async function listarVeiculosVendaveis(opcoes: { incluirTeste?: boolean } = {}) {
  const v = schema.veiculos;
  return db
    .select({
      id: v.id,
      rotulo: sql<string>`concat_ws(' ', case when ${v.teste} then '[TESTE]' end, ${v.marca}, ${v.modelo}, ${v.versao}, ${v.cor}, case when ${v.anoModelo} is not null then ${v.anoModelo}::text end, case when ${v.placa} is not null then '· ' || ${v.placa} end)`,
      valorAnunciado: v.valorAnunciado,
      status: v.status,
      condicao: v.condicao,
    })
    .from(v)
    .where(and(or(eq(v.status, "disponivel"), eq(v.status, "reservado")), opcoes.incluirTeste ? undefined : eq(v.teste, false)))
    .orderBy(asc(v.teste), asc(v.modelo));
}

/** Cores cadastradas em cada modelo (inclusive as escondidas da vitrine), na ordem de exibição. */
export async function listarCoresModelos() {
  const c = schema.modeloCores;
  return db
    .select({ id: c.id, modeloId: c.modeloId, nome: c.nome, hex: c.hex, fotoUrl: c.fotoUrl, fotoVitrineUrl: c.fotoVitrineUrl, fotoEnquadre: c.fotoEnquadre, ordem: c.ordem, ativo: c.ativo })
    .from(c)
    .orderBy(asc(c.modeloId), asc(c.ordem), asc(c.id));
}
export type CorModelo = Awaited<ReturnType<typeof listarCoresModelos>>[number];
