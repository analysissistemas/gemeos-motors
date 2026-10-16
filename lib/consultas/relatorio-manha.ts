import "server-only";
import { and, desc, eq, gte, inArray, lt, ne, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { diaDaLoja } from "@/lib/ia/analista-regras";
import { naoClientes, prontosParaVendedor } from "@/lib/consultas/followups";
import type { ResumoRelatorio } from "@/lib/avisos/relatorio-texto";

/* Relatório da manhã (dono, 15/10/2026: "toda manhã às 8, separado por área: como está o estoque, como está vendas, o
   que a IA sugere, plano de ação, como está o atendimento"). Números de ontem e do mês, o que tem para hoje e o que o
   Analista sugeriu. Só dado registrado: sem ficha do Analista, a parte da qualidade fica vazia (não inventa). Sem
   conversa do Simulador nem veículo de teste. */

const H = 3_600_000;
const inicioDoDia = (dia: string) => new Date(`${dia}T00:00:00-03:00`);

export async function relatorioDaManha(agora = new Date()) {
  const hoje = diaDaLoja(agora);
  const ontem = diaDaLoja(new Date(agora.getTime() - 24 * H));
  const iniOntem = inicioDoDia(ontem);
  const iniHoje = inicioDoDia(hoje);
  const fimHoje = new Date(iniHoje.getTime() + 24 * H);
  const iniMes = inicioDoDia(`${hoje.slice(0, 7)}-01`);
  const C = schema.conversas;
  const M = schema.mensagens;
  const N = schema.negocios;
  const V = schema.vendas;
  const F = schema.followUps;
  const VE = schema.veiculos;

  const [atend, esperando, vendasOntem, vendasMes, funil, perdidasOntem, estoque, procuradosSemEstoque, retiradasHoje, testDrivesHoje, atrasados, chamados, fichas] = await Promise.all([
    /* atendimento de ontem */
    db
      .select({
        conversas: sql<number>`count(distinct ${M.conversaId})::int`,
        novas: sql<number>`count(distinct ${M.conversaId}) filter (where ${C.criadoEm} >= ${iniOntem})::int`,
        doCliente: sql<number>`count(*) filter (where ${M.direcao} = 'incoming')::int`,
        daIa: sql<number>`count(*) filter (where ${M.autor} = 'ia')::int`,
        daEquipe: sql<number>`count(*) filter (where ${M.autor} = 'usuario')::int`,
      })
      .from(M)
      .innerJoin(C, eq(C.id, M.conversaId))
      .where(and(eq(C.demo, false), gte(M.criadoEm, iniOntem), lt(M.criadoEm, iniHoje), ne(M.direcao, "system"))),
    /* agora: cliente escreveu por último e a conversa está em Humano */
    db
      .select({ id: C.id, nome: sql<string>`coalesce(${C.contatoNome}, ${C.contatoTelefone})`, telefone: C.contatoTelefone, desde: C.ultimaMensagemEm })
      .from(C)
      .where(and(eq(C.demo, false), eq(C.modo, "humano"), eq(C.ultimaMensagemDirecao, "incoming"), sql`${C.status} not in ('resolvida', 'encerrada')`, gte(C.ultimaMensagemEm, sql`now() - interval '3 days'`)))
      .orderBy(C.ultimaMensagemEm)
      .limit(10),
    /* vendas: fechadas no funil ontem e no mês (venda não cancelada) */
    db.select({ n: sql<number>`count(*)::int`, valor: sql<number>`coalesce(sum(${V.valorVendido}), 0)::float` }).from(V).innerJoin(N, eq(N.id, V.negocioId)).where(and(ne(V.status, "cancelada"), eq(N.demo, false), gte(N.fechadoEm, iniOntem), lt(N.fechadoEm, iniHoje))),
    db.select({ n: sql<number>`count(*)::int`, valor: sql<number>`coalesce(sum(${V.valorVendido}), 0)::float`, finalizadas: sql<number>`count(*) filter (where ${V.status} = 'finalizada')::int` }).from(V).leftJoin(N, eq(N.id, V.negocioId)).where(and(ne(V.status, "cancelada"), sql`coalesce(${N.demo}, false) = false`, gte(V.criadoEm, iniMes))),
    db.select({ etapa: N.etapa, n: sql<number>`count(*)::int` }).from(N).where(and(eq(N.demo, false), sql`${N.etapa} not in ('fechada', 'perdida')`)).groupBy(N.etapa),
    db.select({ n: sql<number>`count(*)::int` }).from(N).where(and(eq(N.demo, false), eq(N.etapa, "perdida"), gte(N.etapaDesde, iniOntem), lt(N.etapaDesde, iniHoje))),
    /* estoque disponível por modelo */
    db
      .select({ modelo: VE.modelo, disponiveis: sql<number>`count(*) filter (where ${VE.status} = 'disponivel')::int`, reservados: sql<number>`count(*) filter (where ${VE.status} = 'reservado')::int`, cores: sql<string>`string_agg(distinct ${VE.cor}, ', ') filter (where ${VE.status} = 'disponivel')` })
      .from(VE)
      .where(and(eq(VE.teste, false), inArray(VE.status, ["disponivel", "reservado"])))
      .groupBy(VE.modelo)
      .orderBy(VE.modelo),
    /* procurados sem unidade: interesse em aberto (a IA ou a equipe anotou) */
    db
      .select({ modelo: schema.modelos.nome, n: sql<number>`count(*)::int` })
      .from(schema.interessesModelo)
      .innerJoin(schema.modelos, eq(schema.modelos.id, schema.interessesModelo.modeloId))
      .innerJoin(C, eq(C.id, schema.interessesModelo.conversaId))
      .where(and(sql`${schema.interessesModelo.avisadoEm} is null`, eq(C.demo, false)))
      .groupBy(schema.modelos.nome)
      .orderBy(desc(sql`count(*)`))
      .limit(8),
    /* hoje */
    db
      .select({ conversaId: F.conversaId, notas: F.notas, quando: sql<string | null>`${F.contexto}->>'retiradaEm'` })
      .from(F)
      .leftJoin(C, eq(C.id, F.conversaId))
      .where(and(eq(F.status, "pendente"), eq(F.tipo, "retirada"), sql`coalesce(${C.demo}, false) = false`, sql`(${F.contexto}->>'retiradaEm')::timestamptz >= ${iniHoje} and (${F.contexto}->>'retiradaEm')::timestamptz < ${fimHoje}`)),
    db
      .select({ nome: sql<string>`coalesce(${schema.clientes.nome}, ${schema.testDrives.nomeContato})`, descricao: schema.testDrives.veiculoDescricao, quando: schema.testDrives.agendadoPara, conversaId: schema.testDrives.conversaId })
      .from(schema.testDrives)
      .leftJoin(schema.clientes, eq(schema.clientes.id, schema.testDrives.clienteId))
      .where(and(inArray(schema.testDrives.status, ["agendado", "confirmado"]), gte(schema.testDrives.agendadoPara, iniHoje), lt(schema.testDrives.agendadoPara, fimHoje)))
      .orderBy(schema.testDrives.agendadoPara),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(F)
      .leftJoin(C, eq(C.id, F.conversaId))
      .where(and(eq(F.status, "pendente"), lt(F.agendadoPara, iniHoje), sql`coalesce(${F.tipo}, '') not in ('aquecimento', 'lembrete_retirada', 'lembrete_visita')`, sql`coalesce(${C.demo}, false) = false`)),
    /* o que a IA (Analista) sugere e o plano aprovado */
    db
      .select({ id: schema.chamadosMelhoria.id, tipo: schema.chamadosMelhoria.tipo, area: schema.chamadosMelhoria.area, titulo: schema.chamadosMelhoria.titulo, problema: schema.chamadosMelhoria.problema, clientes: schema.chamadosMelhoria.clientes, status: schema.chamadosMelhoria.status })
      .from(schema.chamadosMelhoria)
      .where(inArray(schema.chamadosMelhoria.status, ["novo", "plano"]))
      .orderBy(desc(schema.chamadosMelhoria.clientes), desc(schema.chamadosMelhoria.atualizadoEm))
      .limit(12),
    /* qualidade do atendimento de ontem (fichas do Analista) */
    import("@/lib/ia/chamados").then((m) => m.relatorioDoDia(ontem)).catch(() => null),
  ]);

  const todosProntos = await prontosParaVendedor(null);
  const fora = await naoClientes(todosProntos.map((p) => p.conversaId));
  const prontos = todosProntos.filter((p) => !fora.has(p.conversaId));
  const qualidade = fichas && fichas.conversas > 0 ? fichas : null;
  /* o próprio Milton (número da equipe) não é cliente esperando */
  const { ehDaEquipe } = await import("@/lib/avisos/whatsapp-equipe");
  const esperandoClientes = [];
  for (const e of esperando) if (!(await ehDaEquipe(e.telefone))) esperandoClientes.push(e);

  return {
    hoje,
    ontem,
    atendimento: { ...atend[0], esperando: esperandoClientes, qualidade },
    vendas: { ontem: vendasOntem[0], mes: vendasMes[0], perdidasOntem: perdidasOntem[0]?.n ?? 0, funil, prontos },
    estoque: { modelos: estoque, procuradosSemEstoque: procuradosSemEstoque.filter((p) => !estoque.some((e) => e.disponiveis > 0 && e.modelo.toLowerCase() === p.modelo.toLowerCase())) },
    hojeNaLoja: { retiradas: retiradasHoje, testDrives: testDrivesHoje, followUpsAtrasados: atrasados[0]?.n ?? 0 },
    ia: { sugestoes: chamados.filter((c) => c.status === "novo"), plano: chamados.filter((c) => c.status === "plano") },
  };
}

export type RelatorioManha = Awaited<ReturnType<typeof relatorioDaManha>>;

/** Plano de ação do dia: o que fazer primeiro, em ordem, só com o que está registrado. */
export function planoDeAcao(r: RelatorioManha): { texto: string; href: string }[] {
  const acoes: { texto: string; href: string }[] = [];
  for (const p of r.vendas.prontos.slice(0, 5)) acoes.push({ texto: `Fechar com ${p.cliente ?? "o cliente"}${p.interesse ? ` (${p.interesse})` : ""}: ${p.porque.toLowerCase()}`, href: `/sistema/conversas?c=${p.conversaId}` });
  for (const e of r.atendimento.esperando.slice(0, 5)) acoes.push({ texto: `Responder ${e.nome}: está esperando a loja`, href: `/sistema/conversas?c=${e.id}` });
  for (const t of r.hojeNaLoja.retiradas) acoes.push({ texto: (t.notas ?? "Separar a moto da retirada").split(".")[0], href: t.conversaId ? `/sistema/conversas?c=${t.conversaId}` : "/sistema/follow-ups" });
  if (r.hojeNaLoja.testDrives.length) acoes.push({ texto: `Preparar ${r.hojeNaLoja.testDrives.length} test drive${r.hojeNaLoja.testDrives.length === 1 ? "" : "s"}/visita${r.hojeNaLoja.testDrives.length === 1 ? "" : "s"} de hoje`, href: "/sistema/test-drives" });
  if (r.hojeNaLoja.followUpsAtrasados) acoes.push({ texto: `Resolver ${r.hojeNaLoja.followUpsAtrasados} follow-up${r.hojeNaLoja.followUpsAtrasados === 1 ? "" : "s"} atrasado${r.hojeNaLoja.followUpsAtrasados === 1 ? "" : "s"}`, href: "/sistema/follow-ups" });
  for (const p of r.estoque.procuradosSemEstoque.slice(0, 3)) acoes.push({ texto: `Repor ${p.modelo}: ${p.n} cliente${p.n === 1 ? "" : "s"} esperando unidade`, href: "/sistema/estoque" });
  for (const c of r.ia.plano.slice(0, 3)) acoes.push({ texto: `Plano aprovado: ${c.titulo}`, href: "/sistema/melhorias" });
  return acoes;
}

/** O que vai no WhatsApp do Milton (lib/avisos/relatorio-texto.ts). */
export function resumoParaWhatsapp(r: RelatorioManha): ResumoRelatorio {
  return {
    conversasOntem: r.atendimento.conversas,
    vendasOntem: r.vendas.ontem.n,
    valorOntem: r.vendas.ontem.valor,
    vendasMes: r.vendas.mes.n,
    valorMes: r.vendas.mes.valor,
    prontos: r.vendas.prontos.map((p) => ({ nome: p.cliente ?? "Cliente", porque: p.porque })),
    esperando: r.atendimento.esperando.map((e) => e.nome),
    retiradas: r.hojeNaLoja.retiradas.map((t) => (t.notas ?? "Retirada").split(".")[0]),
    testDrives: r.hojeNaLoja.testDrives.map((t) => `${t.nome ?? "Cliente"} · ${t.descricao ?? "visita"}`),
    atrasados: r.hojeNaLoja.followUpsAtrasados,
    disponiveis: r.estoque.modelos.reduce((x, m) => x + m.disponiveis, 0),
    semUnidade: r.estoque.modelos.filter((m) => !m.disponiveis).map((m) => m.modelo),
    procuradosSemEstoque: r.estoque.procuradosSemEstoque.map((p) => `${p.modelo} (${p.n})`),
    nota: r.atendimento.qualidade?.notaMedia ?? null,
    maiorEsperaMin: r.atendimento.qualidade?.maiorEsperaMin ?? null,
    sugestoes: r.ia.sugestoes.map((c) => c.titulo),
    plano: planoDeAcao(r).map((p) => p.texto),
  };
}
