import "server-only";
import { and, asc, desc, eq, gt, inArray, isNull, lt, or, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db, schema } from "@/lib/db";
import { lerControle } from "@/lib/ia/controle";
import { lerConfigWorkflow } from "@/lib/ia/workflow/config";

import type { FiltroConversa } from "./conversas.tipos";
export { FILTROS_CONVERSA, type FiltroConversa } from "./conversas.tipos";

const POR_PAGINA = 40;

function camposLista() {
  const c = schema.conversas;
  const cli = schema.clientes;
  const n = schema.negocios;
  const resp = alias(schema.usuarios, "resp_c");
  return {
    tabelas: { c, cli, n, resp },
    campos: {
      id: c.id,
      canal: c.canal,
      provedor: c.provedor,
      contatoNome: c.contatoNome,
      contatoTelefone: c.contatoTelefone,
      clienteId: c.clienteId,
      clienteNome: cli.nome,
      clienteFoto: cli.fotoUrl,
      negocioId: c.negocioId,
      etapa: n.etapa,
      veiculoInteresse: n.veiculoInteresse,
      responsavelId: c.responsavelId,
      responsavelNome: resp.nome,
      responsavelFoto: resp.fotoUrl,
      status: c.status,
      prioridade: c.prioridade,
      modo: c.modo,
      ultimaMensagemEm: c.ultimaMensagemEm,
      ultimaMensagemTexto: c.ultimaMensagemTexto,
      ultimaMensagemDirecao: c.ultimaMensagemDirecao,
      naoLidas: c.naoLidas,
      demo: c.demo,
      triagemPronta: sql<boolean>`coalesce((${c.triagemIa}->>'prontoParaHumano')::boolean, false)`,
      /* temperatura do lead (qualificação automática da IA): alta = quente, media = morno */
      intencaoCompra: sql<string | null>`${c.triagemIa}->>'intencaoCompra'`,
      atualizadoEm: c.atualizadoEm,
      proximoFollowUp: sql<Date | null>`(select min(f.agendado_para) from follow_ups f where f.conversa_id = ${c.id} and f.status = 'pendente')`,
    },
  };
}

export async function listarConversas(f: { filtro?: FiltroConversa; q?: string; usuarioId: number; antesDe?: Date | null }) {
  const { tabelas, campos } = camposLista();
  const { c, cli, n, resp } = tabelas;
  const termo = f.q?.trim();
  const dig = termo?.replace(/\D/g, "") ?? "";
  const filtros: (SQL | undefined)[] = [];
  switch (f.filtro) {
    case "nao_lidas": filtros.push(gt(c.naoLidas, 0)); break;
    case "minhas": filtros.push(eq(c.responsavelId, f.usuarioId)); break;
    case "sem_responsavel": filtros.push(isNull(c.responsavelId)); break;
    case "em_atendimento": filtros.push(inArray(c.status, ["nova", "em_atendimento"])); break;
    case "aguardando_cliente": filtros.push(eq(c.status, "aguardando_cliente")); break;
    case "follow_up": filtros.push(sql`exists (select 1 from follow_ups f where f.conversa_id = ${c.id} and f.status = 'pendente')`); break;
    case "negociando": filtros.push(inArray(n.etapa, ["whatsapp", "proposta", "negociando"])); break;
    case "fechada": filtros.push(eq(n.etapa, "fechada")); break;
    case "perdida": filtros.push(eq(n.etapa, "perdida")); break;
  }
  if (!f.filtro || f.filtro === "todas") filtros.push(sql`${c.status} <> 'encerrada'`);
  if (termo)
    filtros.push(
      or(
        sql`${c.contatoNome} ilike ${"%" + termo + "%"}`,
        sql`${cli.nome} ilike ${"%" + termo + "%"}`,
        sql`${n.veiculoInteresse} ilike ${"%" + termo + "%"}`,
        sql`exists (select 1 from veiculos v where v.id = ${n.veiculoId} and concat_ws(' ', v.marca, v.modelo) ilike ${"%" + termo + "%"})`,
        dig.length >= 3 ? sql`${c.contatoTelefone} like ${"%" + dig + "%"}` : undefined,
        dig.length >= 3 ? sql`${cli.cpf} like ${dig + "%"}` : undefined,
        /^\d+$/.test(termo) ? sql`${c.negocioId}::text = ${termo}` : undefined,
      ),
    );
  if (f.antesDe) filtros.push(lt(c.ultimaMensagemEm, f.antesDe));
  const linhas = await db
    .select(campos)
    .from(c)
    .leftJoin(cli, eq(cli.id, c.clienteId))
    .leftJoin(n, eq(n.id, c.negocioId))
    .leftJoin(resp, eq(resp.id, c.responsavelId))
    .where(and(...filtros))
    .orderBy(sql`${c.ultimaMensagemEm} desc nulls last`, desc(c.id))
    .limit(POR_PAGINA + 1);
  return { itens: linhas.slice(0, POR_PAGINA), temMais: linhas.length > POR_PAGINA };
}
export type ItemConversa = Awaited<ReturnType<typeof listarConversas>>["itens"][number];

/** Conversas que mudaram desde um instante (para a lista ao vivo). */
export async function conversasAlteradas(desde: Date) {
  const { tabelas, campos } = camposLista();
  const { c, cli, n, resp } = tabelas;
  return db
    .select(campos)
    .from(c)
    .leftJoin(cli, eq(cli.id, c.clienteId))
    .leftJoin(n, eq(n.id, c.negocioId))
    .leftJoin(resp, eq(resp.id, c.responsavelId))
    .where(or(gt(c.atualizadoEm, desde), gt(c.ultimaMensagemEm, desde), gt(n.atualizadoEm, desde)))
    .limit(100);
}

export async function mensagensDaConversa(conversaId: number, f: { antesDeId?: number; depoisDeId?: number; alteradasDesde?: Date; limite?: number }) {
  const m = schema.mensagens;
  const u = schema.usuarios;
  /* a mensagem respondida vem junto, para a bolha mostrar a citação */
  const citada = alias(schema.mensagens, "citada");
  const limite = f.limite ?? 40;
  const selecionar = () => db
    .select({
      id: m.id,
      direcao: m.direcao,
      autor: m.autor,
      usuarioNome: u.nome,
      tipo: m.tipo,
      conteudo: m.conteudo,
      midiaUrl: m.midiaUrl,
      midiaNome: m.midiaNome,
      midiaMime: m.midiaMime,
      midiaTamanho: m.midiaTamanho,
      status: m.status,
      respostaA: m.respostaA,
      citada: sql<{ direcao: string; autor: string; tipo: string; conteudo: string | null; apagada: boolean } | null>`case when ${citada.id} is null then null else json_build_object('direcao', ${citada.direcao}, 'autor', ${citada.autor}, 'tipo', ${citada.tipo}, 'conteudo', left(${citada.conteudo}, 200), 'apagada', ${citada.metadados} ? 'apagada') end`,
      metadados: m.metadados,
      criadoEm: m.criadoEm,
    })
    .from(m)
    .leftJoin(u, eq(u.id, m.usuarioId))
    .leftJoin(citada, eq(citada.id, m.respostaA));
  if (f.alteradasDesde) {
    return selecionar().where(and(eq(m.conversaId, conversaId), gt(m.alteradaEm, f.alteradasDesde))).orderBy(asc(m.id)).limit(200);
  }
  if (f.depoisDeId != null) {
    return selecionar().where(and(eq(m.conversaId, conversaId), gt(m.id, f.depoisDeId))).orderBy(asc(m.id)).limit(200);
  }
  const linhas = await selecionar()
    .where(and(eq(m.conversaId, conversaId), f.antesDeId ? lt(m.id, f.antesDeId) : undefined))
    .orderBy(desc(m.id))
    .limit(limite);
  return linhas.reverse();
}
export type MensagemChat = Awaited<ReturnType<typeof mensagensDaConversa>>[number];

/** Status recentes de mensagens enviadas (entregue/lida) para atualizar os tiques. */
export async function statusRecentes(conversaId: number) {
  const m = schema.mensagens;
  return db
    .select({ id: m.id, status: m.status, metadados: m.metadados })
    .from(m)
    .where(and(eq(m.conversaId, conversaId), eq(m.direcao, "outgoing"), gt(m.criadoEm, sql`now() - interval '1 day'`)))
    .orderBy(desc(m.id))
    .limit(60);
}

export async function temMaisAntigas(conversaId: number, primeiroId: number) {
  const [x] = await db.select({ id: schema.mensagens.id }).from(schema.mensagens).where(and(eq(schema.mensagens.conversaId, conversaId), lt(schema.mensagens.id, primeiroId))).limit(1);
  return !!x;
}

export async function notasDaConversa(conversaId: number) {
  return db
    .select({ id: schema.conversaNotas.id, conteudo: schema.conversaNotas.conteudo, criadoEm: schema.conversaNotas.criadoEm, usuarioNome: schema.usuarios.nome })
    .from(schema.conversaNotas)
    .leftJoin(schema.usuarios, eq(schema.usuarios.id, schema.conversaNotas.usuarioId))
    .where(eq(schema.conversaNotas.conversaId, conversaId))
    .orderBy(asc(schema.conversaNotas.criadoEm));
}
export type NotaChat = Awaited<ReturnType<typeof notasDaConversa>>[number];

/** Tudo que o painel lateral mostra: cliente, negócio, follow-up e histórico. */
export async function contextoDaConversa(conversaId: number) {
  const c = schema.conversas;
  const humano = alias(schema.usuarios, "humano");
  const respConv = alias(schema.usuarios, "resp_conv");
  const [conv] = await db
    .select({ conversa: c, atendimentoHumano: humano.nome, responsavel: { nome: respConv.nome, fotoUrl: respConv.fotoUrl } })
    .from(c)
    .leftJoin(humano, eq(humano.id, c.atendimentoHumanoPor))
    .leftJoin(respConv, eq(respConv.id, c.responsavelId))
    .where(eq(c.id, conversaId))
    .limit(1);
  if (!conv) return null;
  const conversa = conv.conversa;
  const resp = alias(schema.usuarios, "resp_n");
  const [cliente, negocio, followups] = await Promise.all([
    conversa.clienteId
      ? db
          .select({ id: schema.clientes.id, nome: schema.clientes.nome, cpf: schema.clientes.cpf, whatsapp: schema.clientes.whatsapp, telefone: schema.clientes.telefone, email: schema.clientes.email, nascimento: schema.clientes.nascimento, origem: schema.clientes.origem, cidade: schema.clientes.cidade, criadoEm: schema.clientes.criadoEm, demo: schema.clientes.demo, fotoUrl: schema.clientes.fotoUrl })
          .from(schema.clientes)
          .where(eq(schema.clientes.id, conversa.clienteId))
          .limit(1)
      : Promise.resolve([]),
    conversa.negocioId
      ? db
          .select({
            id: schema.negocios.id,
            etapa: schema.negocios.etapa,
            veiculoId: schema.negocios.veiculoId,
            veiculoInteresse: schema.negocios.veiculoInteresse,
            veiculo: sql<string | null>`(select concat_ws(' ', v.marca, v.modelo, v.cor, v.ano_modelo) from veiculos v where v.id = ${schema.negocios.veiculoId})`,
            valorAnunciado: schema.negocios.valorAnunciado,
            valorProposta: schema.negocios.valorProposta,
            temTroca: schema.negocios.temTroca,
            trocaDescricao: schema.negocios.trocaDescricao,
            trocaValor: schema.negocios.trocaValor,
            responsavelId: schema.negocios.responsavelId,
            responsavel: resp.nome,
            responsavelFoto: resp.fotoUrl,
            origem: schema.negocios.origem,
            criadoEm: schema.negocios.criadoEm,
            etapaDesde: schema.negocios.etapaDesde,
            vendaId: sql<number | null>`(select vd.id from vendas vd where vd.negocio_id = ${schema.negocios.id} and vd.status <> 'cancelada' order by vd.id desc limit 1)`,
            vendaStatus: sql<string | null>`(select vd.status from vendas vd where vd.negocio_id = ${schema.negocios.id} and vd.status <> 'cancelada' order by vd.id desc limit 1)`,
          })
          .from(schema.negocios)
          .leftJoin(resp, eq(resp.id, schema.negocios.responsavelId))
          .where(eq(schema.negocios.id, conversa.negocioId))
          .limit(1)
      : Promise.resolve([]),
    db
      .select({ id: schema.followUps.id, agendadoPara: schema.followUps.agendadoPara, status: schema.followUps.status, notas: schema.followUps.notas, usuario: schema.usuarios.nome })
      .from(schema.followUps)
      .leftJoin(schema.usuarios, eq(schema.usuarios.id, schema.followUps.usuarioId))
      .where(eq(schema.followUps.conversaId, conversaId))
      .orderBy(desc(schema.followUps.agendadoPara))
      .limit(10),
  ]);
  const cli = cliente[0] ?? null;
  const historico = cli
    ? await db
        .select({
          negocios: sql<number>`(select count(*)::int from negocios x where x.cliente_id = ${cli.id})`,
          propostas: sql<number>`(select count(*)::int from negocio_eventos e join negocios x on x.id = e.negocio_id where x.cliente_id = ${cli.id} and e.tipo = 'proposta')`,
          vendas: sql<number>`(select count(*)::int from vendas v where v.cliente_id = ${cli.id} and v.status = 'finalizada')`,
          os: sql<number>`(select count(*)::int from ordens_servico o where o.cliente_id = ${cli.id})`,
          conversas: sql<number>`(select count(*)::int from conversas cv where cv.cliente_id = ${cli.id})`,
          followups: sql<number>`(select count(*)::int from follow_ups f where f.cliente_id = ${cli.id})`,
        })
        .from(sql`(select 1) as um`)
    : [null];
  /* última mensagem do cliente: define a janela de 24 h da Meta (fora dela, só modelo aprovado) */
  const [ult] = await db
    .select({ em: sql<Date | null>`max(${schema.mensagens.criadoEm})` })
    .from(schema.mensagens)
    .where(and(eq(schema.mensagens.conversaId, conversaId), eq(schema.mensagens.direcao, "incoming")));
  /* responsavel: quem atende a conversa (nome e foto), para o cabeçalho do chat */
  /* botão IA ⇄ Humano: com a chave geral ou o atendimento da IA desligado, ninguém responde no modo IA */
  const [controle, workflow] = await Promise.all([lerControle(), lerConfigWorkflow()]);
  return {
    conversa,
    atendimentoHumano: conv.atendimentoHumano,
    responsavel: conv.responsavel?.nome ? conv.responsavel : null,
    cliente: cli,
    negocio: negocio[0] ?? null,
    followups,
    historico: historico[0],
    ultimaDoClienteEm: ult?.em ? new Date(ult.em) : null,
    iaPodeResponder: controle.ligada && workflow.ativo,
  };
}
export type ContextoConversa = NonNullable<Awaited<ReturnType<typeof contextoDaConversa>>>;
