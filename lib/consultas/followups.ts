import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { mensagemAutomatica, ofertaDeServico } from "@/lib/ia/nao-cliente";
import { sinalDeCompra } from "@/lib/followup-prioridade";

/* Painel de Follow-ups (dono, 15/10/2026: "o vendedor/gestor tem que bater o olho e tomar a decisão"; "saber se dos
   follow-ups que eu fiz eu consegui converter algum em interesse pronto para fechar"). Tudo sem conversa simulada. */

type Linha = Record<string, unknown>;
const q = async <T extends Linha>(consulta: ReturnType<typeof sql>) => (await db.execute(consulta)).rows as T[];
const real = sql`coalesce(cv.demo, cl.demo, false) = false`;
/* "Meus": do usuário ou sem dono */
const doUsuario = (usuarioId: number | null) => (usuarioId ? sql`and (f.usuario_id = ${usuarioId} or f.usuario_id is null)` : sql``);

export type PendenteFollowUp = {
  id: number;
  agendadoPara: Date;
  tipo: string | null;
  notas: string | null;
  motivo: string | null;
  origem: string | null;
  exigeAprovacao: boolean;
  conversaId: number | null;
  contexto: Record<string, unknown> | null;
  cliente: string | null;
  telefone: string | null;
  responsavel: string | null;
  etapa: string | null;
  interesse: string | null;
  intencao: string | null;
  clienteEsperando: boolean;
  ultimaDoClienteEm: Date | null;
  ultimaDoCliente: string | null;
  /** hora (0–23, Recife) em que o cliente mais escreveu; null com menos de 3 mensagens */
  horaPreferida: number | null;
};

export async function pendentesFollowUp(usuarioId: number | null) {
  return q<PendenteFollowUp>(sql`
    select f.id, f.agendado_para as "agendadoPara", f.tipo, f.notas, f.motivo, f.origem, f.exige_aprovacao as "exigeAprovacao",
      f.conversa_id as "conversaId", f.contexto,
      coalesce(cl.nome, cv.contato_nome) as cliente, cv.contato_telefone as telefone, u.nome as responsavel,
      n.etapa, coalesce(n.veiculo_interesse, cv.triagem_ia->>'veiculo', cv.triagem_ia->>'interesse') as interesse,
      cv.triagem_ia->>'intencaoCompra' as intencao,
      coalesce(cv.ultima_mensagem_direcao = 'incoming', false) as "clienteEsperando",
      ult.criado_em as "ultimaDoClienteEm", ult.conteudo as "ultimaDoCliente",
      hp.hora as "horaPreferida"
    from follow_ups f
    left join conversas cv on cv.id = f.conversa_id
    left join clientes cl on cl.id = coalesce(f.cliente_id, cv.cliente_id)
    left join negocios n on n.id = coalesce(f.negocio_id, cv.negocio_id)
    left join usuarios u on u.id = f.usuario_id
    left join lateral (
      select m.criado_em, m.conteudo from mensagens m
      where m.conversa_id = f.conversa_id and m.direcao = 'incoming' order by m.id desc limit 1
    ) ult on true
    left join lateral (
      select extract(hour from m.criado_em at time zone 'America/Recife')::int as hora from mensagens m
      where m.conversa_id = f.conversa_id and m.direcao = 'incoming'
      group by 1 having (select count(*) from mensagens x where x.conversa_id = f.conversa_id and x.direcao = 'incoming') >= 3
      order by count(*) desc limit 1
    ) hp on true
    where f.status = 'pendente' and ${real} ${doUsuario(usuarioId)}
    order by f.agendado_para asc
    limit 300
  `);
}

export type ProntoParaVendedor = {
  conversaId: number;
  cliente: string | null;
  telefone: string | null;
  etapa: string | null;
  interesse: string | null;
  intencao: string | null;
  respondeuEm: Date;
  resposta: string | null;
  deQuem: "ia" | "equipe";
  tentativa: number | null;
  /** a última mensagem é do cliente: ninguém da loja respondeu ainda */
  esperandoLoja: boolean;
  /** por que está aqui: o sinal de compra no que ele escreveu, ou a etapa do funil */
  porque: string;
};

/** Respondeu a um follow-up (da IA ou da equipe) nos últimos 7 dias COM SINAL DE COMPRA no que escreveu (pagamento,
 *  preço, "quero", vir à loja, entrega, pergunta do produto), ou está em visita/proposta/negociação. Figurinha, "ok" e
 *  recusa não contam; operadora/robô sai na página (naoClientes). Sem venda fechada nem perdida. */
export async function prontosParaVendedor(usuarioId: number | null): Promise<ProntoParaVendedor[]> {
  const linhas = await q<Omit<ProntoParaVendedor, "porque"> & { textos: string | null }>(sql`
    select distinct on (cv.id) cv.id as "conversaId", coalesce(cl.nome, cv.contato_nome) as cliente, cv.contato_telefone as telefone,
      n.etapa, coalesce(n.veiculo_interesse, cv.triagem_ia->>'veiculo', cv.triagem_ia->>'interesse') as interesse,
      cv.triagem_ia->>'intencaoCompra' as intencao,
      r.criado_em as "respondeuEm", r.conteudo as resposta, r.textos,
      case when f.tipo = 'aquecimento' then 'ia' else 'equipe' end as "deQuem",
      (f.contexto->>'etapa')::int as tentativa,
      coalesce(cv.ultima_mensagem_direcao = 'incoming', false) as "esperandoLoja"
    from follow_ups f
    join conversas cv on cv.id = f.conversa_id
    left join clientes cl on cl.id = cv.cliente_id
    left join negocios n on n.id = cv.negocio_id
    join lateral (
      select max(m.criado_em) as criado_em,
        (array_agg(m.conteudo order by m.id desc) filter (where m.tipo = 'texto' and m.conteudo not like 'Mensagem de um tipo%'))[1] as conteudo,
        string_agg(m.conteudo, ' | ' order by m.id) filter (where m.tipo = 'texto' and m.conteudo not like 'Mensagem de um tipo%') as textos
      from mensagens m
      where m.conversa_id = cv.id and m.direcao = 'incoming' and m.criado_em > f.concluido_em
      having count(*) > 0
    ) r on true
    where f.status = 'concluido' and f.concluido_em > now() - interval '7 days'
      and (f.tipo <> 'aquecimento' or f.notas like 'Aquecimento % enviado pela IA%') and coalesce(f.tipo, '') not in ('lembrete_retirada', 'lembrete_visita')
      and ${real} ${usuarioId ? sql`and (cv.responsavel_id = ${usuarioId} or cv.responsavel_id is null)` : sql``}
      and coalesce(n.etapa, '') not in ('fechada', 'perdida')
    order by cv.id, f.concluido_em desc
  `);
  const ETAPA_QUENTE: Record<string, string> = { visita: "Marcou visita / test drive", proposta: "Proposta enviada", negociando: "Negociando" };
  return linhas
    .map(({ textos, ...l }) => ({ ...l, porque: sinalDeCompra(textos) ?? (l.etapa ? ETAPA_QUENTE[l.etapa] : undefined) ?? "" }))
    .filter((l) => l.porque)
    .sort((a, b) => Number(b.esperandoLoja) - Number(a.esperandoLoja) || new Date(b.respondeuEm).getTime() - new Date(a.respondeuEm).getTime());
}

export type Esquecido = { conversaId: number; cliente: string | null; telefone: string | null; etapa: string | null; interesse: string | null; intencao: string | null; ultimaEm: Date | null; responsavel: string | null };

/** Quente ou em negociação, sem follow-up pendente e há mais de 24 h sem conversa: ninguém marcou o retorno. */
export async function quentesSemRetorno(usuarioId: number | null) {
  return q<Esquecido>(sql`
    select cv.id as "conversaId", coalesce(cl.nome, cv.contato_nome) as cliente, cv.contato_telefone as telefone, n.etapa,
      coalesce(n.veiculo_interesse, cv.triagem_ia->>'veiculo', cv.triagem_ia->>'interesse') as interesse,
      cv.triagem_ia->>'intencaoCompra' as intencao, cv.ultima_mensagem_em as "ultimaEm", u.nome as responsavel
    from conversas cv
    left join clientes cl on cl.id = cv.cliente_id
    left join negocios n on n.id = cv.negocio_id
    left join usuarios u on u.id = cv.responsavel_id
    where ${real} and cv.status not in ('resolvida', 'encerrada')
      and coalesce(n.etapa, '') not in ('fechada', 'perdida')
      and (cv.triagem_ia->>'intencaoCompra' = 'alta' or n.etapa in ('proposta', 'negociando', 'visita'))
      and cv.ultima_mensagem_em < now() - interval '24 hours' and cv.ultima_mensagem_em > now() - interval '30 days'
      and not exists (select 1 from follow_ups f where f.conversa_id = cv.id and f.status = 'pendente')
      ${usuarioId ? sql`and (cv.responsavel_id = ${usuarioId} or cv.responsavel_id is null)` : sql``}
    order by (cv.triagem_ia->>'intencaoCompra' = 'alta') desc, cv.ultima_mensagem_em desc
    limit 30
  `);
}

export type Resultado = { quem: "ia" | "equipe"; chamados: number; responderam: number; avancaram: number; compraram: number };
export type ResultadoTentativa = { tentativa: number; enviados: number; responderam: number };

/** Últimos 30 dias, por cliente (a 1ª chamada de cada um na janela): respondeu em até 48 h, avançou no funil em até
 *  7 dias (visita, equipe, proposta, negociando ou fechada) e comprou em até 30 dias. */
export async function resultadoFollowUps(usuarioId: number | null) {
  const [porQuem, porTentativa] = await Promise.all([
    q<Resultado>(sql`
      with chamadas as (
        select distinct on (f.conversa_id, quem) f.conversa_id, f.concluido_em as em, cv.negocio_id,
          case when f.tipo = 'aquecimento' then 'ia' else 'equipe' end as quem
        from follow_ups f
        join conversas cv on cv.id = f.conversa_id
        left join clientes cl on cl.id = cv.cliente_id
        where f.status = 'concluido' and f.concluido_em > now() - interval '30 days'
          and (f.tipo <> 'aquecimento' or f.notas like 'Aquecimento % enviado pela IA%') and coalesce(f.tipo, '') not in ('lembrete_retirada', 'lembrete_visita')
          and ${real} ${usuarioId ? sql`and (f.usuario_id = ${usuarioId} or (f.tipo = 'aquecimento' and cv.responsavel_id = ${usuarioId}))` : sql``}
        order by f.conversa_id, quem, f.concluido_em asc
      )
      select quem, count(*)::int as chamados,
        count(*) filter (where exists (select 1 from mensagens m where m.conversa_id = c.conversa_id and m.direcao = 'incoming' and m.criado_em > c.em and m.criado_em < c.em + interval '48 hours'))::int as responderam,
        count(*) filter (where exists (select 1 from negocio_eventos e where e.negocio_id = c.negocio_id and e.tipo = 'etapa' and e.dados->>'para' in ('visita','equipe','proposta','negociando','fechada') and e.criado_em > c.em and e.criado_em < c.em + interval '7 days'))::int as avancaram,
        count(*) filter (where exists (select 1 from negocios n where n.id = c.negocio_id and n.etapa = 'fechada' and n.fechado_em > c.em and n.fechado_em < c.em + interval '30 days'))::int as compraram
      from chamadas c group by quem
    `),
    q<ResultadoTentativa>(sql`
      select (f.contexto->>'etapa')::int as tentativa, count(*)::int as enviados,
        count(*) filter (where exists (select 1 from mensagens m where m.conversa_id = f.conversa_id and m.direcao = 'incoming' and m.criado_em > f.concluido_em and m.criado_em < f.concluido_em + interval '24 hours'))::int as responderam
      from follow_ups f
      join conversas cv on cv.id = f.conversa_id
      left join clientes cl on cl.id = cv.cliente_id
      where f.tipo = 'aquecimento' and f.status = 'concluido' and f.notas like 'Aquecimento % enviado pela IA%'
        and f.concluido_em > now() - interval '30 days' and ${real}
        ${usuarioId ? sql`and (cv.responsavel_id = ${usuarioId} or cv.responsavel_id is null)` : sql``}
      group by 1 order by 1
    `),
  ]);
  const vazio = (quem: "ia" | "equipe"): Resultado => ({ quem, chamados: 0, responderam: 0, avancaram: 0, compraram: 0 });
  return { ia: porQuem.find((r) => r.quem === "ia") ?? vazio("ia"), equipe: porQuem.find((r) => r.quem === "equipe") ?? vazio("equipe"), porTentativa };
}

export type LinhaVendedor = { id: number; nome: string; pendentes: number; atrasados: number; feitos7d: number; responderam7d: number };

/** Gestor: como está cada vendedor (follow-ups da equipe, sem os da IA). */
export async function placarVendedores() {
  return q<LinhaVendedor>(sql`
    select u.id, u.nome,
      count(f.*) filter (where f.status = 'pendente')::int as pendentes,
      count(f.*) filter (where f.status = 'pendente' and f.agendado_para < now())::int as atrasados,
      count(f.*) filter (where f.status = 'concluido' and f.concluido_em > now() - interval '7 days')::int as "feitos7d",
      count(f.*) filter (where f.status = 'concluido' and f.concluido_em > now() - interval '7 days'
        and exists (select 1 from mensagens m where m.conversa_id = f.conversa_id and m.direcao = 'incoming' and m.criado_em > f.concluido_em and m.criado_em < f.concluido_em + interval '48 hours'))::int as "responderam7d"
    from usuarios u
    left join follow_ups f on f.usuario_id = u.id and coalesce(f.tipo, '') not in ('aquecimento', 'lembrete_retirada', 'lembrete_visita')
      and not exists (select 1 from conversas cv where cv.id = f.conversa_id and cv.demo)
    where u.ativo and u.papel in ('admin', 'vendedor')
    group by u.id, u.nome
    order by atrasados desc, pendentes desc
  `);
}

/** Conversas que não são de cliente (operadora oferecendo serviço, robô de menu: dono, 15/10/2026, o "Luis" da TIM
 *  apareceu em Prontos para o vendedor). Vale a marca da IA ("IA parada nesta conversa") ou o próprio texto recebido. */
export async function naoClientes(ids: number[]): Promise<Set<number>> {
  const unicos = [...new Set(ids)];
  if (!unicos.length) return new Set();
  const lista = sql.join(unicos.map((id) => sql`${id}`), sql`, `);
  const linhas = await q<{ conversaId: number; autor: string; conteudo: string | null }>(sql`
    select m.conversa_id as "conversaId", m.autor, m.conteudo from mensagens m
    where m.conversa_id in (${lista}) and m.criado_em > now() - interval '60 days'
      and (m.direcao = 'incoming' or (m.autor = 'sistema' and m.conteudo like 'IA parada nesta conversa.%'))
  `);
  const fora = new Set<number>();
  for (const l of linhas) {
    const t = l.conteudo ?? "";
    if (l.autor === "sistema" || ofertaDeServico(t) || mensagemAutomatica(t)) fora.add(l.conversaId);
  }
  return fora;
}
