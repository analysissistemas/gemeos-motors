import "server-only";
import { eq } from "drizzle-orm";
import { db, schema, type Tx } from "@/lib/db";

/** Mensagem de sistema dentro da conversa ("Atendimento humano iniciado por…"). */
export async function mensagemSistema(tx: Tx | typeof db, conversaId: number, texto: string, dados?: Record<string, unknown>) {
  await tx.insert(schema.mensagens).values({ conversaId, direcao: "system", autor: "sistema", tipo: "sistema", conteudo: texto, status: "sent", metadados: dados });
  /* aviso no celular do Milton para as anotações que pedem a equipe (dados do pedido, pediu uma pessoa, esperando) */
  void import("@/lib/avisos/gatilhos").then((m) => m.avisarAnotacao(conversaId, texto)).catch(() => null);
}

/** Anota no chat as mudanças do negócio feitas em outra tela (funil, venda). */
export async function anotarNegocioNaConversa(tx: Tx | typeof db, negocioId: number, texto: string) {
  const [c] = await tx.select({ id: schema.conversas.id }).from(schema.conversas).where(eq(schema.conversas.negocioId, negocioId)).limit(1);
  if (c) {
    await mensagemSistema(tx, c.id, texto);
    await tx.update(schema.conversas).set({ atualizadoEm: new Date() }).where(eq(schema.conversas.id, c.id));
  }
}
