import "server-only";
import { and, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { sinalDeCompra } from "@/lib/followup-prioridade";
import { quandoPorExtenso } from "@/lib/ia/agenda";
import { enviarAviso, quemEDaConversa } from "./push";
import { avisoDaAnotacao, avisoLembreteNaoSaiu, avisoProntoParaFechar, avisoResumoDoDia, avisoTarefa, avisoVisitaMarcada } from "./regras";

/* Quem dispara cada aviso do celular (lib/avisos/regras.ts tem os textos). Tudo "dispara e esquece": aviso nunca
   atrasa nem derruba o atendimento. Conversa do Simulador não avisa. */

const F = schema.followUps;
const fundo = (p: Promise<unknown>) => void p.catch((e) => console.error("[avisos]", e));

/** Anotação do sistema na conversa (dados do pedido, passou para a equipe, reclamou, esperando em Humano). */
export function avisarAnotacao(conversaId: number, texto: string) {
  if (!/^(Dados do pedido|REVISAR ATENDIMENTO|Transferido para atendimento humano|Cliente esperando resposta)/u.test(texto)) return;
  fundo(
    (async () => {
      /* a anotação pode estar dentro de uma transação: espera ela gravar */
      await new Promise((r) => setTimeout(r, 1500));
      const q = await quemEDaConversa(conversaId);
      if (!q || q.demo) return;
      const a = avisoDaAnotacao(texto, { conversaId, nome: q.nome });
      if (a) await enviarAviso(a);
    })(),
  );
}

/** Mensagem do cliente: se ele respondeu a um follow-up (da IA ou da equipe, últimos 7 dias) com sinal de compra, é o
 *  cliente pronto para o vendedor ("Prontos para o vendedor" do painel). */
export function avisarRespostaDoCliente(conversaId: number, texto: string | null) {
  const sinal = sinalDeCompra(texto);
  if (!sinal || !texto) return;
  fundo(
    (async () => {
      const [f] = await db
        .select({ id: F.id })
        .from(F)
        .where(and(eq(F.conversaId, conversaId), eq(F.status, "concluido"), gte(F.concluidoEm, sql`now() - interval '7 days'`), sql`(${F.tipo} is distinct from 'aquecimento' or ${F.notas} like 'Aquecimento % enviado pela IA%')`, sql`coalesce(${F.tipo}, '') not in ('lembrete_retirada', 'lembrete_visita')`))
        .limit(1);
      if (!f) return;
      const [cv] = await db
        .select({ etapa: schema.negocios.etapa, interesse: sql<string | null>`coalesce(${schema.negocios.veiculoInteresse}, ${schema.conversas.triagemIa}->>'veiculo')` })
        .from(schema.conversas)
        .leftJoin(schema.negocios, eq(schema.negocios.id, schema.conversas.negocioId))
        .where(eq(schema.conversas.id, conversaId))
        .limit(1);
      if (cv?.etapa === "fechada" || cv?.etapa === "perdida") return;
      const q = await quemEDaConversa(conversaId);
      if (!q || q.demo) return;
      await enviarAviso(avisoProntoParaFechar({ conversaId, nome: q.nome, sinal, texto, interesse: cv?.interesse ?? null }));
    })(),
  );
}

/** Visita / test drive que a IA marcou. */
export function avisarVisitaMarcada(p: { conversaId: number | null; nome: string | null; descricao: string | null; quando: Date }) {
  fundo(
    (async () => {
      const q = p.conversaId ? await quemEDaConversa(p.conversaId) : null;
      if (q?.demo) return;
      await enviarAviso(avisoVisitaMarcada({ conversaId: p.conversaId, nome: q?.nome ?? p.nome ?? "Cliente", descricao: p.descricao, quandoExtenso: quandoPorExtenso(p.quando) }));
    })(),
  );
}

/** Lembrete automático que não saiu (vira tarefa): a equipe precisa avisar o cliente. */
export function avisarLembreteNaoSaiu(conversaId: number, doQue: string) {
  fundo(
    (async () => {
      const q = await quemEDaConversa(conversaId);
      if (!q || q.demo) return;
      await enviarAviso(avisoLembreteNaoSaiu({ conversaId, nome: q.nome, doQue }));
    })(),
  );
}

const diaLocal = (d: Date) => new Date(d.getTime() - 3 * 3_600_000).toISOString().slice(0, 10);

/** Chamado pelo vigia a cada minuto: tarefa da retirada que chegou na hora e o resumo das 7h30. */
export async function avisosAgendados(agora = new Date()) {
  /* tarefa da retirada (separar a moto) na hora dela, uma vez */
  const vencidas = await db
    .select({ id: F.id, notas: F.notas, conversaId: F.conversaId, contexto: F.contexto })
    .from(F)
    .leftJoin(schema.conversas, eq(schema.conversas.id, F.conversaId))
    .where(and(eq(F.status, "pendente"), eq(F.tipo, "retirada"), lte(F.agendadoPara, agora), sql`(${F.contexto}->>'avisado') is null`, sql`coalesce(${schema.conversas.demo}, false) = false`))
    .limit(10);
  for (const t of vencidas) {
    await db.update(F).set({ contexto: { ...((t.contexto as Record<string, unknown>) ?? {}), avisado: agora.toISOString() } }).where(eq(F.id, t.id));
    await enviarAviso(avisoTarefa({ followUpId: t.id, notas: t.notas ?? "Retirada na loja hoje.", conversaId: t.conversaId }));
  }

  /* resumo das 7h30 (hora de Recife), uma vez por dia */
  const local = new Date(agora.getTime() - 3 * 3_600_000);
  const minutos = local.getUTCHours() * 60 + local.getUTCMinutes();
  if (minutos < 7 * 60 + 30 || minutos > 12 * 60) return;
  const hoje = diaLocal(agora);
  const [marca] = await db.select({ valor: schema.configuracoes.valor }).from(schema.configuracoes).where(eq(schema.configuracoes.chave, "avisos.resumo")).limit(1);
  if ((marca?.valor as { dia?: string } | null)?.dia === hoje) return;
  await db.insert(schema.configuracoes).values({ chave: "avisos.resumo", valor: { dia: hoje } }).onConflictDoUpdate({ target: schema.configuracoes.chave, set: { valor: { dia: hoje }, atualizadoEm: new Date() } });

  const inicio = new Date(`${hoje}T00:00:00-03:00`);
  const fim = new Date(inicio.getTime() + 24 * 3_600_000);
  const real = sql`not exists (select 1 from conversas cv where cv.id = ${F.conversaId} and cv.demo)`;
  const conta = async (q: Promise<{ n: number }[]>) => (await q)[0]?.n ?? 0;
  const [retiradas, testDrives, followUps, esperando] = await Promise.all([
    conta(db.select({ n: sql<number>`count(*)::int` }).from(F).where(and(eq(F.status, "pendente"), eq(F.tipo, "retirada"), sql`(${F.contexto}->>'retiradaEm')::timestamptz >= ${inicio} and (${F.contexto}->>'retiradaEm')::timestamptz < ${fim}`, real))),
    conta(db.select({ n: sql<number>`count(*)::int` }).from(schema.testDrives).where(and(inArray(schema.testDrives.status, ["agendado", "confirmado"]), gte(schema.testDrives.agendadoPara, inicio), lte(schema.testDrives.agendadoPara, fim)))),
    conta(db.select({ n: sql<number>`count(*)::int` }).from(F).where(and(eq(F.status, "pendente"), lte(F.agendadoPara, fim), sql`coalesce(${F.tipo}, '') not in ('aquecimento', 'lembrete_retirada', 'lembrete_visita', 'retirada')`, real))),
    conta(db.select({ n: sql<number>`count(*)::int` }).from(schema.conversas).where(and(eq(schema.conversas.demo, false), eq(schema.conversas.modo, "humano"), eq(schema.conversas.ultimaMensagemDirecao, "incoming"), sql`${schema.conversas.status} not in ('resolvida', 'encerrada')`, gte(schema.conversas.ultimaMensagemEm, sql`now() - interval '3 days'`)))),
  ]);
  const { prontosParaVendedor, naoClientes } = await import("@/lib/consultas/followups");
  const todos = await prontosParaVendedor(null);
  const fora = await naoClientes(todos.map((x) => x.conversaId));
  const a = avisoResumoDoDia({ retiradas, testDrives, followUps, prontos: todos.filter((x) => !fora.has(x.conversaId)).length, esperando });
  if (a) await enviarAviso(a);
}
