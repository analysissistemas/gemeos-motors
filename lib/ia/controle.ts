import "server-only";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { CONTROLE_PADRAO, type ChavePermissaoIa, type ControleIa } from "./permissoes";

const CHAVE = "ia.controle";

/** Lê a chave geral e as permissões. Sem registro (ou com erro de leitura), tudo desligado. */
export async function lerControle(): Promise<ControleIa> {
  const [l] = await db.select({ valor: schema.configuracoes.valor }).from(schema.configuracoes).where(eq(schema.configuracoes.chave, CHAVE)).limit(1);
  const v = (l?.valor ?? {}) as Partial<ControleIa>;
  return {
    ligada: v.ligada === true,
    permissoes: { ...CONTROLE_PADRAO.permissoes, ...Object.fromEntries(Object.entries(v.permissoes ?? {}).filter(([, x]) => typeof x === "boolean")) },
  };
}

export async function iaLigada() {
  return (await lerControle()).ligada;
}

/** Só é verdadeiro com a chave geral ligada E a permissão específica marcada. */
export async function iaPode(chave: ChavePermissaoIa) {
  const c = await lerControle();
  return c.ligada && c.permissoes[chave] === true;
}

export async function salvarControle(c: ControleIa, usuarioId: number) {
  await db
    .insert(schema.configuracoes)
    .values({ chave: CHAVE, valor: c, atualizadoPor: usuarioId })
    .onConflictDoUpdate({ target: schema.configuracoes.chave, set: { valor: c, atualizadoEm: new Date(), atualizadoPor: usuarioId } });
}
