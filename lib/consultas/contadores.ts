import "server-only";
import { and, inArray, isNull, lte, ne, or, eq, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { pode } from "@/lib/dominio";
import type { UsuarioAtual } from "@/lib/auth/dal";

export async function contarPendencias(u: UsuarioAtual) {
  const fimDoDia = sql`(date_trunc('day', now() at time zone 'America/Recife') + interval '1 day') at time zone 'America/Recife'`;
  const [conversas, followups, os, ligacoes] = await Promise.all([
    pode(u.papel, "conversas.ver")
      ? db
          .select({ n: sql<number>`coalesce(sum(${schema.conversas.naoLidas}),0)::int` })
          .from(schema.conversas)
          .where(and(ne(schema.conversas.status, "encerrada"), eq(schema.conversas.demo, false)))
      : Promise.resolve([{ n: 0 }]),
    pode(u.papel, "conversas.ver")
      ? db
          .select({ n: sql<number>`count(*)::int` })
          .from(schema.followUps)
          .where(
            and(
              eq(schema.followUps.status, "pendente"),
              lte(schema.followUps.agendadoPara, fimDoDia),
              /* o aquecimento a IA envia sozinha: não é tarefa da equipe */
              sql`coalesce(${schema.followUps.tipo}, '') not in ('aquecimento', 'lembrete_retirada')`,
              /* teste do Simulador não conta (dono, 15/10/2026) */
              sql`not exists (select 1 from conversas cv where cv.id = ${schema.followUps.conversaId} and cv.demo)`,
              u.papel === "admin" ? undefined : or(eq(schema.followUps.usuarioId, u.id), isNull(schema.followUps.usuarioId)),
            ),
          )
      : Promise.resolve([{ n: 0 }]),
    pode(u.papel, "os.ver")
      ? db
          .select({ n: sql<number>`count(*)::int` })
          .from(schema.ordensServico)
          .where(inArray(schema.ordensServico.status, ["aberta", "aguardando"]))
      : Promise.resolve([{ n: 0 }]),
    pode(u.papel, "conversas.ver")
      ? db
          .select({ n: sql<number>`count(*)::int` })
          .from(schema.solicitacoesLigacao)
          .where(inArray(schema.solicitacoesLigacao.status, ["pendente", "em_andamento", "reagendada"]))
      : Promise.resolve([{ n: 0 }]),
  ]);
  return { conversas: conversas[0].n, followups: followups[0].n, os: os[0].n, ligacoes: ligacoes[0].n };
}
