import "server-only";
import { and, eq, isNull, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { mensagemSistema } from "@/lib/mensageria/anotacoes";

/* Interesse em modelo sem estoque. Quando um veículo do modelo volta a ficar
   disponível, cada interessado vira um follow-up PENDENTE PARA A EQUIPE, com pedido
   de aprovação. O sistema nunca manda mensagem comercial por conta própria aqui:
   quem decide enviar é uma pessoa (ou, no futuro, uma regra configurada e permitida). */

type Origem = "ia" | "equipe";

/** Registra (uma vez por conversa e modelo) que o cliente quer um modelo sem estoque. */
export async function registrarInteresse(d: { conversaId: number; telefone: string; modeloId: number; origem: Origem; clienteId?: number | null }) {
  const [c] = await db.select({ clienteId: schema.conversas.clienteId }).from(schema.conversas).where(eq(schema.conversas.id, d.conversaId)).limit(1);
  if (!c) return { criado: false as const };
  const r = await db
    .insert(schema.interessesModelo)
    .values({ conversaId: d.conversaId, telefone: d.telefone, modeloId: d.modeloId, origem: d.origem, clienteId: d.clienteId ?? c.clienteId })
    .onConflictDoNothing()
    .returning({ id: schema.interessesModelo.id });
  return { criado: r.length > 0 };
}

/** Chamar quando um veículo do modelo passa a "disponivel". Idempotente: cada interesse é avisado uma vez. */
export async function dispararFollowUpsDeEstoque(modeloId: number | null | undefined): Promise<{ criados: number }> {
  if (!modeloId) return { criados: 0 };
  const [{ n }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.veiculos)
    .where(and(eq(schema.veiculos.modeloId, modeloId), eq(schema.veiculos.status, "disponivel")));
  if (!n) return { criados: 0 };

  return db.transaction(async (tx) => {
    const [modelo] = await tx.select({ nome: schema.modelos.nome }).from(schema.modelos).where(eq(schema.modelos.id, modeloId)).limit(1);
    const abertos = await tx
      .select()
      .from(schema.interessesModelo)
      .where(and(eq(schema.interessesModelo.modeloId, modeloId), isNull(schema.interessesModelo.avisadoEm)))
      .for("update", { skipLocked: true });
    let criados = 0;
    for (const i of abertos) {
      const [c] = await tx.select().from(schema.conversas).where(eq(schema.conversas.id, i.conversaId)).limit(1);
      if (!c) continue;
      const motivo = `${modelo?.nome ?? "O modelo"} que o cliente pediu voltou ao estoque`;
      const [f] = await tx
        .insert(schema.followUps)
        .values({
          conversaId: c.id,
          clienteId: i.clienteId ?? c.clienteId,
          negocioId: c.negocioId,
          usuarioId: c.responsavelId,
          agendadoPara: new Date(),
          notas: `Avisar o cliente: ${motivo}. Confira o consentimento antes de enviar qualquer mensagem.`,
          tipo: "estoque",
          motivo,
          origem: "estoque",
          modeloId,
          exigeAprovacao: true,
          contexto: { interesseId: i.id, origemInteresse: i.origem, interessadoDesde: i.criadoEm },
        })
        .returning({ id: schema.followUps.id });
      await tx.update(schema.interessesModelo).set({ avisadoEm: new Date(), followUpId: f.id }).where(eq(schema.interessesModelo.id, i.id));
      await mensagemSistema(tx, c.id, `Follow-up de estoque criado: ${motivo}.`);
      criados++;
    }
    return { criados };
  });
}
