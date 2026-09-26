import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { ErroRegra } from "@/lib/acao";
import { mensagemSistema } from "@/lib/mensageria/anotacoes";
import { dentroDoHorario, proximaAbertura, MENSAGEM_LIGACAO_RECEBIDA, classificarFollowUp, detectarPedidoLigacao } from "@/lib/mensageria/intencoes";
import { registrarLog } from "@/lib/logs";
type Quem = { id: number; nome: string };

/* Pedidos de ligação e follow-ups detectados na conversa. Tudo aqui só CRIA registros para a equipe;
   nenhuma mensagem é enviada ao cliente por este arquivo. */

export const STATUS_LIGACAO = { pendente: "Pendente", em_andamento: "Em andamento", concluida: "Concluída", nao_atendida: "Não atendida", reagendada: "Reagendada" } as const;
export type StatusLigacao = keyof typeof STATUS_LIGACAO;
export const RESULTADOS_LIGACAO = { atendida: "Atendida", nao_atendida: "Não atendida", ocupado: "Ocupado", numero_errado: "Número errado", reagendada: "Reagendada" } as const;
export type ResultadoLigacao = keyof typeof RESULTADOS_LIGACAO;
const ABERTAS: StatusLigacao[] = ["pendente", "em_andamento", "reagendada"];

/** Cria o pedido de ligação (um aberto por número). Devolve se é novo e se caiu fora do horário. */
export async function criarSolicitacaoLigacao(d: { conversaId: number; motivo?: string | null; preferencia?: string | null; agora?: Date }) {
  const agora = d.agora ?? new Date();
  return db.transaction(async (tx) => {
    const [c] = await tx.select().from(schema.conversas).where(eq(schema.conversas.id, d.conversaId)).limit(1);
    if (!c) return { criado: false as const, foraDoHorario: false };
    const [aberta] = await tx
      .select({ id: schema.solicitacoesLigacao.id })
      .from(schema.solicitacoesLigacao)
      .where(and(eq(schema.solicitacoesLigacao.telefone, c.contatoTelefone), inArray(schema.solicitacoesLigacao.status, ABERTAS)))
      .limit(1);
    const fora = !dentroDoHorario(agora);
    if (aberta) return { criado: false as const, id: aberta.id, foraDoHorario: fora };
    const [s] = await tx
      .insert(schema.solicitacoesLigacao)
      .values({
        conversaId: c.id,
        clienteId: c.clienteId,
        nomeContato: c.contatoNome,
        telefone: c.contatoTelefone,
        motivo: d.motivo?.slice(0, 500) ?? null,
        preferencia: d.preferencia ?? null,
        responsavelId: c.responsavelId,
        agendadoPara: fora ? proximaAbertura(agora) : null,
        foraDoHorario: fora,
        origem: "cliente",
      })
      .returning({ id: schema.solicitacoesLigacao.id });
    await mensagemSistema(
      tx,
      c.id,
      `O cliente pediu uma ligação${d.preferencia ? ` (${d.preferencia})` : ""}.${fora ? " Fora do horário de atendimento: ligar na próxima abertura." : ""} Resposta sugerida: "${MENSAGEM_LIGACAO_RECEBIDA}"`,
      { ligacaoId: s.id },
    );
    return { criado: true as const, id: s.id, foraDoHorario: fora };
  });
}

/** Lê a mensagem recebida e cria o que for preciso (ligação, follow-up). Nunca lança: falha aqui não pode derrubar o webhook. */
export async function analisarMensagemEntrante(conversaId: number, texto: string | null | undefined, agora = new Date()) {
  if (!texto?.trim()) return;
  try {
    const lig = detectarPedidoLigacao(texto);
    if (lig) await criarSolicitacaoLigacao({ conversaId, motivo: texto, preferencia: lig.preferencia, agora });
    const fu = classificarFollowUp(texto, agora);
    if (fu) {
      await db.transaction(async (tx) => {
        const [pend] = await tx
          .select({ id: schema.followUps.id })
          .from(schema.followUps)
          .where(and(eq(schema.followUps.conversaId, conversaId), eq(schema.followUps.status, "pendente")))
          .limit(1);
        if (pend) return; // já existe um retorno combinado: não duplica
        const [c] = await tx.select().from(schema.conversas).where(eq(schema.conversas.id, conversaId)).limit(1);
        if (!c) return;
        await tx.insert(schema.followUps).values({
          conversaId,
          clienteId: c.clienteId,
          negocioId: c.negocioId,
          usuarioId: c.responsavelId,
          agendadoPara: fu.quando,
          notas: `${fu.motivo}. Cliente disse: "${texto.trim().slice(0, 200)}"`,
          tipo: fu.tipo,
          motivo: fu.motivo,
          origem: "equipe",
          contexto: { detectadoPor: "regras", confianca: fu.confianca, mensagem: texto.trim().slice(0, 500) },
        });
        await mensagemSistema(tx, conversaId, `FOLLOW-UP PENDENTE: ${fu.motivo}.`);
      });
    }
  } catch (e) {
    console.error("[intencoes] falha ao analisar mensagem", e);
  }
}

/* ---------- ações da equipe ---------- */
async function buscar(id: number) {
  const [s] = await db.select().from(schema.solicitacoesLigacao).where(eq(schema.solicitacoesLigacao.id, id)).limit(1);
  if (!s) throw new ErroRegra("Pedido de ligação não encontrado.");
  return s;
}

export async function iniciarLigacao(u: Quem, id: number) {
  const s = await buscar(id);
  if (s.status === "concluida") throw new ErroRegra("Esta ligação já foi concluída.");
  await db.update(schema.solicitacoesLigacao).set({ status: "em_andamento", responsavelId: s.responsavelId ?? u.id, atualizadoEm: new Date() }).where(eq(schema.solicitacoesLigacao.id, id));
}

export async function concluirLigacao(u: Quem, id: number, d: { resultado: ResultadoLigacao; duracaoSegundos?: number | null; notas?: string | null; proximaAcao?: string | null }) {
  const s = await buscar(id);
  if (s.status === "concluida") throw new ErroRegra("Esta ligação já foi concluída.");
  if (!(d.resultado in RESULTADOS_LIGACAO)) throw new ErroRegra("Resultado inválido.");
  const status: StatusLigacao = d.resultado === "atendida" ? "concluida" : d.resultado === "reagendada" ? "reagendada" : "nao_atendida";
  await db.transaction(async (tx) => {
    await tx.insert(schema.ligacoesHistorico).values({ solicitacaoId: id, usuarioId: u.id, resultado: d.resultado, duracaoSegundos: d.duracaoSegundos ?? null, notas: d.notas?.trim() || null, proximaAcao: d.proximaAcao?.trim() || null });
    await tx.update(schema.solicitacoesLigacao).set({ status, atualizadoEm: new Date() }).where(eq(schema.solicitacoesLigacao.id, id));
    if (s.conversaId) await mensagemSistema(tx, s.conversaId, `Ligação registrada: ${RESULTADOS_LIGACAO[d.resultado]}${d.notas?.trim() ? `. ${d.notas.trim()}` : ""}`);
    await registrarLog(u, { acao: "ligacao.registrada", entidade: "conversa", entidadeId: s.conversaId ?? id, descricao: `Registrou ligação (${RESULTADOS_LIGACAO[d.resultado]})` }, tx);
  });
}

export async function reagendarLigacao(u: Quem, id: number, quando: Date) {
  if (Number.isNaN(quando.getTime()) || quando.getTime() < Date.now() - 60_000) throw new ErroRegra("Escolha uma data no futuro.");
  const s = await buscar(id);
  if (s.status === "concluida") throw new ErroRegra("Esta ligação já foi concluída.");
  await db.transaction(async (tx) => {
    await tx.update(schema.solicitacoesLigacao).set({ status: "reagendada", agendadoPara: quando, atualizadoEm: new Date() }).where(eq(schema.solicitacoesLigacao.id, id));
    await tx.insert(schema.ligacoesHistorico).values({ solicitacaoId: id, usuarioId: u.id, resultado: "reagendada", notas: null });
  });
}
