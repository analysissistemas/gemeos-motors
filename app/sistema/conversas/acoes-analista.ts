"use server";
import { desc, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { autorizar } from "@/lib/auth/dal";
import { executar, ErroRegra } from "@/lib/acao";
import { analisarConversa, fichasDaConversa } from "@/lib/ia/analista";
import { IaIndisponivel } from "@/lib/ia/cliente";
import { diaDaLoja } from "@/lib/ia/analista-regras";

/* Ficha do Analista na conversa: só o administrador vê (dono, 15/10/2026). */
export async function acaoFichasAnalista(conversaId: number) {
  return executar(async () => {
    await autorizar("config.gerenciar");
    return fichasDaConversa(conversaId);
  });
}

/** Analisa agora o último dia com mensagem da conversa (não espera as 18:30). */
export async function acaoAnalisarAgora(conversaId: number) {
  return executar(async () => {
    await autorizar("config.gerenciar");
    const [ultima] = await db
      .select({ criadoEm: schema.mensagens.criadoEm })
      .from(schema.mensagens)
      .where(eq(schema.mensagens.conversaId, conversaId))
      .orderBy(desc(schema.mensagens.id))
      .limit(1);
    if (!ultima) throw new ErroRegra("Esta conversa ainda não tem mensagens.");
    const r = await analisarConversa(conversaId, diaDaLoja(ultima.criadoEm)).catch((e) => {
      if (e instanceof IaIndisponivel) throw new ErroRegra(e.message);
      throw e;
    });
    if (!r.ok) throw new ErroRegra(r.motivo);
    return fichasDaConversa(conversaId);
  }, "Conversa analisada");
}
