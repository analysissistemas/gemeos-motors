import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { FUSO } from "@/lib/formato";
import { ETAPAS_ABERTAS } from "@/lib/dominio";

export type Periodo = "hoje" | "7d" | "30d" | "mes" | "custom";

/** Início e fim do período no fuso da loja. */
export function intervalo(p: Periodo, de?: string, ate?: string) {
  const hojeTxt = new Intl.DateTimeFormat("en-CA", { timeZone: FUSO, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const dia = (s: string) => new Date(`${s}T00:00:00-03:00`);
  const somaDias = (d: Date, n: number) => new Date(d.getTime() + n * 86400000);
  const fimHoje = somaDias(dia(hojeTxt), 1);
  switch (p) {
    case "hoje":
      return { inicio: dia(hojeTxt), fim: fimHoje, rotulo: "Hoje" };
    case "7d":
      return { inicio: somaDias(fimHoje, -7), fim: fimHoje, rotulo: "Últimos 7 dias" };
    case "mes":
      return { inicio: dia(`${hojeTxt.slice(0, 7)}-01`), fim: fimHoje, rotulo: "Este mês" };
    case "custom": {
      const i = de && /^\d{4}-\d{2}-\d{2}$/.test(de) ? dia(de) : somaDias(fimHoje, -30);
      const f = ate && /^\d{4}-\d{2}-\d{2}$/.test(ate) ? somaDias(dia(ate), 1) : fimHoje;
      return { inicio: i, fim: f > i ? f : somaDias(i, 1), rotulo: "Período personalizado" };
    }
    default:
      return { inicio: somaDias(fimHoje, -30), fim: fimHoje, rotulo: "Últimos 30 dias" };
  }
}

type Linha = Record<string, unknown>;
const q = async <T extends Linha>(consulta: ReturnType<typeof sql>) => (await db.execute(consulta)).rows as T[];

/* Tudo com demo = false: conversa simulada nunca vira número de gestão. */
export async function carregarPainel(inicio: Date, fim: Date, verLucro: boolean) {
  const ini = inicio.toISOString();
  const fi = fim.toISOString();
  const dias = Math.max(1, Math.round((fim.getTime() - inicio.getTime()) / 86400000));
  const agrupar = dias > 62 ? "week" : "day";

  const [kpi, abertos, serie, porConsultor, origens, funil, motivos, maisVendidos, atencao, perdasPorConsultor] = await Promise.all([
    q<{ vendas: number; faturamento: number; lucro: number | null; comCusto: number; leads: number; propostas: number; perdidas: number; disponiveis: number; aguardandoAssinatura: number }>(sql`
      select
        (select count(*) from vendas v left join negocios n on n.id = v.negocio_id where v.status = 'finalizada' and v.finalizada_em >= ${ini} and v.finalizada_em < ${fi} and coalesce(n.demo,false) = false)::int as vendas,
        (select coalesce(sum(v.valor_vendido),0) from vendas v left join negocios n on n.id = v.negocio_id where v.status = 'finalizada' and v.finalizada_em >= ${ini} and v.finalizada_em < ${fi} and coalesce(n.demo,false) = false)::float as faturamento,
        (select sum(v.valor_vendido - ve.custo) from vendas v join veiculos ve on ve.id = v.veiculo_id left join negocios n on n.id = v.negocio_id where v.status = 'finalizada' and ve.custo is not null and v.finalizada_em >= ${ini} and v.finalizada_em < ${fi} and coalesce(n.demo,false) = false)::float as lucro,
        (select count(*) from vendas v join veiculos ve on ve.id = v.veiculo_id where v.status = 'finalizada' and ve.custo is not null and v.finalizada_em >= ${ini} and v.finalizada_em < ${fi})::int as "comCusto",
        (select count(*) from negocios where demo = false and criado_em >= ${ini} and criado_em < ${fi})::int as leads,
        (select count(distinct e.negocio_id) from negocio_eventos e join negocios n on n.id = e.negocio_id where n.demo = false and e.criado_em >= ${ini} and e.criado_em < ${fi} and (e.tipo = 'proposta' or (e.tipo = 'etapa' and e.dados->>'para' = 'proposta')))::int as propostas,
        (select count(*) from negocios where demo = false and etapa = 'perdida' and perdido_em >= ${ini} and perdido_em < ${fi})::int as perdidas,
        (select count(*) from veiculos where status = 'disponivel' and not teste)::int as disponiveis,
        (select count(*) from vendas where status in ('aguardando_assinatura','assinada'))::int as "aguardandoAssinatura"
    `),
    q<{ qtd: number; valor: number }>(sql`
      select count(*)::int as qtd, coalesce(sum(coalesce(valor_proposta, valor_anunciado)),0)::float as valor
      from negocios where demo = false and etapa in (${sql.join(ETAPAS_ABERTAS.map((e) => sql`${e}`), sql`, `)})
    `),
    q<{ periodo: string; vendas: number; faturamento: number }>(sql`
      with base as (
        select generate_series(date_trunc(${agrupar}, ${ini}::timestamptz at time zone 'America/Recife'), date_trunc(${agrupar}, (${fi}::timestamptz - interval '1 second') at time zone 'America/Recife'), ('1 ' || ${agrupar})::interval) as p
      )
      select to_char(b.p, 'YYYY-MM-DD') as periodo,
        count(v.id)::int as vendas,
        coalesce(sum(v.valor_vendido),0)::float as faturamento
      from base b
      left join vendas v on v.status = 'finalizada' and date_trunc(${agrupar}, v.finalizada_em at time zone 'America/Recife') = b.p
        and not exists (select 1 from negocios n where n.id = v.negocio_id and n.demo)
      group by b.p order by b.p
    `),
    q<{ id: number; nome: string; vendas: number; faturamento: number }>(sql`
      select u.id, u.nome, count(v.id)::int as vendas, coalesce(sum(v.valor_vendido),0)::float as faturamento
      from vendas v join usuarios u on u.id = v.vendedor_id
      where v.status = 'finalizada' and v.finalizada_em >= ${ini} and v.finalizada_em < ${fi}
        and not exists (select 1 from negocios n where n.id = v.negocio_id and n.demo)
      group by u.id, u.nome order by faturamento desc
    `),
    q<{ origem: string | null; qtd: number }>(sql`
      select origem, count(*)::int as qtd from negocios
      where demo = false and criado_em >= ${ini} and criado_em < ${fi}
      group by origem order by qtd desc
    `),
    q<{ etapa: string; qtd: number }>(sql`
      select etapa, count(*)::int as qtd from negocios
      where demo = false and (etapa in (${sql.join(ETAPAS_ABERTAS.map((e) => sql`${e}`), sql`, `)}) or (etapa = 'fechada' and fechado_em >= ${ini} and fechado_em < ${fi}) or (etapa = 'perdida' and perdido_em >= ${ini} and perdido_em < ${fi}))
      group by etapa
    `),
    q<{ motivo: string; qtd: number }>(sql`
      select perda_motivo as motivo, count(*)::int as qtd from negocios
      where demo = false and etapa = 'perdida' and perdido_em >= ${ini} and perdido_em < ${fi}
      group by perda_motivo order by qtd desc
    `),
    q<{ modelo: string; qtd: number; faturamento: number }>(sql`
      select concat_ws(' ', ve.marca, ve.modelo) as modelo, count(*)::int as qtd, coalesce(sum(v.valor_vendido),0)::float as faturamento
      from vendas v join veiculos ve on ve.id = v.veiculo_id
      where v.status = 'finalizada' and v.finalizada_em >= ${ini} and v.finalizada_em < ${fi}
      group by 1 order by qtd desc, faturamento desc limit 6
    `),
    q<{ followAtrasados: number; followHoje: number; naoLidas: number; semResponsavel: number; parados: number; osVencidas: number }>(sql`
      select
        (select count(*) from follow_ups where status = 'pendente' and agendado_para < now())::int as "followAtrasados",
        (select count(*) from follow_ups where status = 'pendente' and agendado_para >= now() and agendado_para < (date_trunc('day', now() at time zone 'America/Recife') + interval '1 day') at time zone 'America/Recife')::int as "followHoje",
        (select coalesce(sum(nao_lidas),0) from conversas where status <> 'encerrada')::int as "naoLidas",
        (select count(*) from conversas where responsavel_id is null and status not in ('resolvida','encerrada'))::int as "semResponsavel",
        (select count(*) from negocios where demo = false and ((etapa = 'whatsapp' and etapa_desde < now() - interval '1 day') or (etapa = 'proposta' and etapa_desde < now() - interval '3 days') or (etapa = 'negociando' and etapa_desde < now() - interval '7 days')))::int as parados,
        (select count(*) from ordens_servico where status not in ('finalizada','entregue','cancelada') and previsao_entrega < current_date)::int as "osVencidas"
    `),
    q<{ id: number; leads: number; propostas: number; perdidas: number }>(sql`
      select u.id,
        (select count(*) from negocios n where n.demo = false and n.responsavel_id = u.id and n.criado_em >= ${ini} and n.criado_em < ${fi})::int as leads,
        (select count(distinct e.negocio_id) from negocio_eventos e join negocios n on n.id = e.negocio_id where n.demo = false and n.responsavel_id = u.id and e.criado_em >= ${ini} and e.criado_em < ${fi} and (e.tipo = 'proposta' or (e.tipo = 'etapa' and e.dados->>'para' = 'proposta')))::int as propostas,
        (select count(*) from negocios n where n.demo = false and n.responsavel_id = u.id and n.etapa = 'perdida' and n.perdido_em >= ${ini} and n.perdido_em < ${fi})::int as perdidas
      from usuarios u where u.ativo and u.papel in ('admin','vendedor')
    `),
  ]);

  const k = kpi[0];
  const consultores = perdasPorConsultor
    .map((p) => {
      const v = porConsultor.find((x) => x.id === p.id);
      const nome = v?.nome;
      return { id: p.id, nome, leads: p.leads, propostas: p.propostas, perdidas: p.perdidas, vendas: v?.vendas ?? 0, faturamento: v?.faturamento ?? 0 };
    })
    .filter((c) => c.leads || c.propostas || c.perdidas || c.vendas);
  const nomes = await q<{ id: number; nome: string }>(sql`select id, nome from usuarios`);
  for (const c of consultores) c.nome ??= nomes.find((n) => n.id === c.id)?.nome;

  return {
    agrupamento: agrupar as "day" | "week",
    kpi: {
      vendas: k.vendas,
      faturamento: k.faturamento,
      ticketMedio: k.vendas ? k.faturamento / k.vendas : null,
      lucro: verLucro && k.comCusto ? k.lucro : null,
      margem: verLucro && k.comCusto && k.faturamento ? (k.lucro ?? 0) / k.faturamento : null,
      leads: k.leads,
      propostas: k.propostas,
      perdidas: k.perdidas,
      disponiveis: k.disponiveis,
      emNegociacao: abertos[0].qtd,
      valorEmNegociacao: abertos[0].valor,
      conversao: k.vendas + k.perdidas ? k.vendas / (k.vendas + k.perdidas) : null,
      aguardandoAssinatura: k.aguardandoAssinatura,
    },
    serie,
    porConsultor: consultores.map((c) => ({ ...c, nome: c.nome ?? "—" })),
    origens,
    funil,
    motivos,
    maisVendidos,
    atencao: atencao[0],
  };
}
export type DadosPainel = Awaited<ReturnType<typeof carregarPainel>>;
