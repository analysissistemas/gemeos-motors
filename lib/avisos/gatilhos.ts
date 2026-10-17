import "server-only";
import { and, eq, gte, lte, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { sinalDeCompra } from "@/lib/followup-prioridade";
import { quandoPorExtenso } from "@/lib/ia/agenda";
import { lojaAberta } from "@/lib/ia/horario";
import { lerHorario } from "@/lib/ia/prompt";
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

/** Chamado pelo vigia a cada minuto: tarefa da retirada que chegou na hora e o resumo das 8h. */
export async function avisosAgendados(agora = new Date()) {
  /* tarefa da retirada/entrega na hora dela, uma vez. Antes da loja abrir (entrega às 10h vence às 7h) espera a
     abertura: o aviso não urgente seria descartado e não tentaria de novo */
  const aberta = lojaAberta(await lerHorario(), agora);
  const vencidas = !aberta ? [] : await db
    .select({ id: F.id, tipo: F.tipo, notas: F.notas, conversaId: F.conversaId, contexto: F.contexto })
    .from(F)
    .leftJoin(schema.conversas, eq(schema.conversas.id, F.conversaId))
    .where(and(eq(F.status, "pendente"), sql`${F.tipo} in ('retirada', 'entrega') and (${F.contexto} ? 'retiradaEm' or ${F.contexto} ? 'entregaEm')`, lte(F.agendadoPara, agora), sql`(${F.contexto}->>'avisado') is null`, sql`coalesce(${schema.conversas.demo}, false) = false`))
    .limit(10);
  for (const t of vencidas) {
    await db.update(F).set({ contexto: { ...((t.contexto as Record<string, unknown>) ?? {}), avisado: agora.toISOString() } }).where(eq(F.id, t.id));
    await enviarAviso(avisoTarefa({ followUpId: t.id, notas: t.notas ?? "Retirada na loja hoje.", conversaId: t.conversaId, entrega: t.tipo === "entrega" }));
  }

  /* resumo das 8h (hora de Recife), uma vez por dia (dono, 15/10/2026: "toda manhã às 8") */
  const local = new Date(agora.getTime() - 3 * 3_600_000);
  const minutos = local.getUTCHours() * 60 + local.getUTCMinutes();
  if (minutos < 8 * 60 || minutos > 12 * 60) return;
  const hoje = diaLocal(agora);
  const [marca] = await db.select({ valor: schema.configuracoes.valor }).from(schema.configuracoes).where(eq(schema.configuracoes.chave, "avisos.resumo")).limit(1);
  if ((marca?.valor as { dia?: string } | null)?.dia === hoje) return;
  await db.insert(schema.configuracoes).values({ chave: "avisos.resumo", valor: { dia: hoje } }).onConflictDoUpdate({ target: schema.configuracoes.chave, set: { valor: { dia: hoje }, atualizadoEm: new Date() } });

  const { relatorioDaManha, resumoParaWhatsapp } = await import("@/lib/consultas/relatorio-manha");
  const r = await relatorioDaManha(agora);
  await enviarAviso(
    avisoResumoDoDia({
      conversasOntem: r.atendimento.conversas,
      vendasOntem: r.vendas.ontem.n,
      prontos: r.vendas.prontos.length,
      esperando: r.atendimento.esperando.length,
      retiradas: r.hojeNaLoja.retiradas.length,
      testDrives: r.hojeNaLoja.testDrives.length,
      atrasados: r.hojeNaLoja.followUpsAtrasados,
      semEstoque: r.estoque.procuradosSemEstoque.length,
      sugestoes: r.ia.sugestoes.length,
    }),
  );
  /* e no WhatsApp pessoal do Milton (dono, 16/10/2026) */
  const { enviarRelatorioWhatsApp } = await import("./whatsapp-equipe");
  const w = await enviarRelatorioWhatsApp(resumoParaWhatsapp(r));
  if (!w.ok && w.como !== "nenhum") console.error("[relatorio whatsapp]", w.erro);
}
