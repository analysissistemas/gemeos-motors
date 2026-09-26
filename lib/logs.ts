import "server-only";
import { headers } from "next/headers";
import { ipConfiavel } from "@/lib/ip";
import { db, schema, type Tx } from "@/lib/db";

export type EntradaLog = {
  acao: string; // ex.: negocio.movido
  entidade: string; // cliente | negocio | venda | os | usuario | conversa | ...
  entidadeId?: string | number | null;
  descricao: string; // frase pronta para ler: "Moveu o negócio X de A para B"
  dados?: Record<string, unknown>;
  origem?: "sistema" | "assinatura_publica" | "webhook";
};

async function ipAtual() {
  try {
    const h = await headers();
    return ipConfiavel(h);
  } catch {
    return null;
  }
}

/** Grava no histórico geral. Recebe a transação quando a ação tem uma, para
 *  o log nunca existir sem a mudança (nem a mudança sem o log). */
export async function registrarLog(
  quem: { id: number; nome: string } | null,
  e: EntradaLog,
  tx?: Tx,
) {
  const alvo = tx ?? db;
  await alvo.insert(schema.logs).values({
    usuarioId: quem?.id ?? null,
    usuarioNome:
      quem?.nome ?? (e.origem === "assinatura_publica" ? "Cliente (assinatura)" : e.origem === "webhook" ? "WhatsApp" : "Sistema"),
    acao: e.acao,
    entidade: e.entidade,
    entidadeId: e.entidadeId == null ? null : String(e.entidadeId),
    descricao: e.descricao,
    dados: e.dados,
    origem: e.origem ?? "sistema",
    ip: await ipAtual(),
  });
}
