import "server-only";
import { eq, gte, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { situacaoDoCredito, type SaldoInformado, type SituacaoCredito } from "./credito";

/* ============================================================
   GASTO E CRÉDITO DA IA (a conta fica em lib/ia/credito.ts)
   - cada chamada à OpenAI grava o que custou (ia_consumo);
   - o saldo é o que o dono digita da tela de Billing da OpenAI (ia.credito);
   - quando a OpenAI recusa por falta de crédito, fica marcado (ia.sem_credito)
     até a próxima chamada dar certo.
   Nada aqui pode derrubar o atendimento: erro de gravação só vai para o log.
   ============================================================ */
const CHAVE_SALDO = "ia.credito";
const CHAVE_SEM_CREDITO = "ia.sem_credito";
const C = schema.iaConsumo;

/* evita uma escrita no banco a cada chamada só para limpar uma marca que não existe */
let semCreditoMarcado: boolean | null = null;

export function registrarConsumo(p: { modelo: string; tipo: "texto" | "imagem" | "audio"; tokensEntrada?: number | null; tokensSaida?: number | null; custoUsd: number }) {
  void db
    .insert(C)
    .values({ modelo: p.modelo, tipo: p.tipo, tokensEntrada: p.tokensEntrada ?? null, tokensSaida: p.tokensSaida ?? null, custoUsd: p.custoUsd })
    .then(() => (semCreditoMarcado === false ? undefined : db.delete(schema.configuracoes).where(eq(schema.configuracoes.chave, CHAVE_SEM_CREDITO))))
    .then(() => {
      semCreditoMarcado = false;
    })
    .catch((e) => console.error("[ia.consumo]", e));
}

export function marcarSemCredito() {
  semCreditoMarcado = true;
  void db
    .insert(schema.configuracoes)
    .values({ chave: CHAVE_SEM_CREDITO, valor: { em: new Date().toISOString() } })
    .onConflictDoNothing()
    .catch((e) => console.error("[ia.sem_credito]", e));
}

async function lerChave<T>(chave: string): Promise<T | null> {
  const [l] = await db.select({ valor: schema.configuracoes.valor }).from(schema.configuracoes).where(eq(schema.configuracoes.chave, chave)).limit(1);
  return (l?.valor as T) ?? null;
}

const somaDesde = async (desde: Date) => {
  const [r] = await db.select({ total: sql<string | null>`sum(${C.custoUsd})` }).from(C).where(gte(C.criadoEm, desde));
  return Number(r?.total ?? 0);
};

export async function lerSituacaoCredito(agora = new Date()): Promise<SituacaoCredito> {
  const [saldo, semCredito] = await Promise.all([lerChave<SaldoInformado>(CHAVE_SALDO), lerChave<{ em: string }>(CHAVE_SEM_CREDITO)]);
  const [gastoDesdeSaldo, gasto7Dias] = await Promise.all([saldo ? somaDesde(new Date(saldo.em)) : 0, somaDesde(new Date(agora.getTime() - 7 * 86_400_000))]);
  return situacaoDoCredito({ saldo, gastoDesdeSaldo, gasto7Dias, agora, semCreditoDesde: semCredito?.em ?? null });
}

/** O dono digitou o saldo que está na OpenAI agora: a conta recomeça daqui. Recarregou = crédito de volta, sai a marca. */
export async function salvarSaldo(usd: number, usuarioId: number) {
  const valor: SaldoInformado = { usd, em: new Date().toISOString() };
  await db
    .insert(schema.configuracoes)
    .values({ chave: CHAVE_SALDO, valor, atualizadoPor: usuarioId })
    .onConflictDoUpdate({ target: schema.configuracoes.chave, set: { valor, atualizadoEm: new Date(), atualizadoPor: usuarioId } });
  if (usd > 0) {
    await db.delete(schema.configuracoes).where(eq(schema.configuracoes.chave, CHAVE_SEM_CREDITO));
    semCreditoMarcado = false;
  }
}
