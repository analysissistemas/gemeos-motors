import "server-only";
import { and, eq, gt, lt } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { ErroRegra } from "@/lib/acao";
import { registrarLog } from "@/lib/logs";
import { brl } from "@/lib/formato";

type Quem = { id: number; nome: string };

export async function criarPromocao(u: Quem, d: { modeloId: number; precoPromocional: number; inicioEm: Date; fimEm: Date }) {
  if (Number.isNaN(d.inicioEm.getTime()) || Number.isNaN(d.fimEm.getTime())) throw new ErroRegra("Datas inválidas.");
  if (d.fimEm.getTime() <= d.inicioEm.getTime()) throw new ErroRegra("O fim da promoção precisa ser depois do início.");
  if (d.fimEm.getTime() <= Date.now()) throw new ErroRegra("O fim da promoção precisa estar no futuro.");
  return db.transaction(async (tx) => {
    const [m] = await tx.select().from(schema.modelos).where(eq(schema.modelos.id, d.modeloId)).limit(1);
    if (!m) throw new ErroRegra("Modelo não encontrado.");
    if (m.precoTabela == null) throw new ErroRegra("Este modelo não tem preço de tabela: cadastre o preço normal antes de criar promoção.");
    if (!(d.precoPromocional > 0) || d.precoPromocional >= m.precoTabela) throw new ErroRegra(`O preço promocional precisa ser menor que o normal (${brl(m.precoTabela)}).`);
    const [choque] = await tx
      .select({ id: schema.promocoes.id })
      .from(schema.promocoes)
      .where(and(eq(schema.promocoes.modeloId, d.modeloId), eq(schema.promocoes.ativo, true), lt(schema.promocoes.inicioEm, d.fimEm), gt(schema.promocoes.fimEm, d.inicioEm)))
      .limit(1);
    if (choque) throw new ErroRegra("Já existe promoção deste modelo nesse período. Encerre a anterior primeiro.");
    const [p] = await tx.insert(schema.promocoes).values({ ...d, criadoPor: u.id }).returning({ id: schema.promocoes.id });
    await registrarLog(u, { acao: "promocao.criada", entidade: "modelo", entidadeId: d.modeloId, descricao: `Criou promoção de ${m.nome}: ${brl(m.precoTabela)} por ${brl(d.precoPromocional)} até ${d.fimEm.toISOString()}` }, tx);
    return p.id;
  });
}

export async function encerrarPromocao(u: Quem, id: number) {
  const [p] = await db.select().from(schema.promocoes).where(eq(schema.promocoes.id, id)).limit(1);
  if (!p) throw new ErroRegra("Promoção não encontrada.");
  await db.transaction(async (tx) => {
    await tx.update(schema.promocoes).set({ ativo: false }).where(eq(schema.promocoes.id, id));
    await registrarLog(u, { acao: "promocao.encerrada", entidade: "modelo", entidadeId: p.modeloId, descricao: "Encerrou a promoção antes do fim" }, tx);
  });
}
