"use server";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, schema } from "@/lib/db";
import { autorizar } from "@/lib/auth/dal";
import { executar, ErroRegra } from "@/lib/acao";
import { registrarLog } from "@/lib/logs";
import { esquemaVeiculo } from "@/lib/validacao";
import { ehEletrico, pode, STATUS_VEICULO } from "@/lib/dominio";
import { brl } from "@/lib/formato";
import { dispararFollowUpsDeEstoque } from "@/lib/servicos/interesses";

/* modelo voltou ao estoque: avisa a equipe dos interessados. Falha aqui nunca desfaz o cadastro. */
async function avisarInteressados(modeloId: number | null | undefined) {
  try {
    await dispararFollowUpsDeEstoque(modeloId);
  } catch (e) {
    console.error("[estoque] follow-up de estoque falhou", e);
  }
}

export async function salvarVeiculo(entrada: { id?: number } & Record<string, unknown>) {
  return executar(async () => {
    const u = await autorizar("estoque.editar");
    const d = esquemaVeiculo.parse(entrada);
    const podeCusto = pode(u.papel, "custo.ver");
    /* elétrica não tem placa, Renavam nem ano-modelo: não guardar o que não existe */
    if (ehEletrico(d.tipo)) {
      d.placa = null;
      d.renavam = null;
    }
    if (d.status === "vendido") throw new ErroRegra("Veículo vira vendido pela finalização da venda, não pelo cadastro.");
    const nome = [d.marca, d.modelo, d.cor].filter(Boolean).join(" ");

    if (entrada.id) {
      const id = Number(entrada.id);
      const [antes] = await db.select().from(schema.veiculos).where(eq(schema.veiculos.id, id)).limit(1);
      if (!antes) throw new ErroRegra("Veículo não encontrado.");
      if (antes.status === "vendido") throw new ErroRegra("Veículo vendido não pode ser editado. Cancele a venda antes, se for o caso.");
      const valores = { ...d, entradaEm: d.entradaEm ?? antes.entradaEm, custo: podeCusto ? d.custo : antes.custo, atualizadoEm: new Date() };
      const campos = Object.keys(d).filter((k) => k !== "custo" || podeCusto).filter((k) => (antes as Record<string, unknown>)[k] !== (valores as Record<string, unknown>)[k]);
      await db.transaction(async (tx) => {
        await tx.update(schema.veiculos).set(valores).where(eq(schema.veiculos.id, id));
        if (campos.length)
          await registrarLog(u, {
            acao: campos.includes("valorAnunciado") ? "veiculo.preco_alterado" : "veiculo.editado",
            entidade: "veiculo",
            entidadeId: id,
            descricao: campos.includes("valorAnunciado")
              ? `Alterou o preço de ${nome} de ${brl(antes.valorAnunciado)} para ${brl(d.valorAnunciado)}`
              : `Editou o veículo ${nome}`,
            dados: { campos },
          }, tx);
      });
      if (d.status === "disponivel") await avisarInteressados(valores.modeloId ?? antes.modeloId);
      revalidatePath("/sistema/estoque");
      return { id };
    }

    const id = await db.transaction(async (tx) => {
      const [novo] = await tx
        .insert(schema.veiculos)
        .values({ ...d, entradaEm: d.entradaEm ?? undefined, custo: podeCusto ? d.custo : null, criadoPor: u.id })
        .returning({ id: schema.veiculos.id });
      await registrarLog(u, { acao: "veiculo.criado", entidade: "veiculo", entidadeId: novo.id, descricao: `Deu entrada no veículo ${nome}${d.valorAnunciado ? ` (${brl(d.valorAnunciado)})` : ""}` }, tx);
      return novo.id;
    });
    if (d.status === "disponivel") {
      const [novo] = await db.select({ modeloId: schema.veiculos.modeloId }).from(schema.veiculos).where(eq(schema.veiculos.id, id)).limit(1);
      await avisarInteressados(novo?.modeloId);
    }
    revalidatePath("/sistema/estoque");
    return { id };
  }, entrada.id ? "Veículo atualizado" : "Veículo cadastrado no estoque");
}

export async function mudarStatusVeiculo(id: number, status: "disponivel" | "reservado" | "inativo") {
  return executar(async () => {
    const u = await autorizar("estoque.editar");
    if (!(status in STATUS_VEICULO) || status === ("vendido" as string)) throw new ErroRegra("Situação inválida.");
    const [v] = await db.select().from(schema.veiculos).where(eq(schema.veiculos.id, id)).limit(1);
    if (!v) throw new ErroRegra("Veículo não encontrado.");
    if (v.status === "vendido") throw new ErroRegra("Veículo vendido não muda de situação por aqui.");
    await db.transaction(async (tx) => {
      await tx.update(schema.veiculos).set({ status, atualizadoEm: new Date() }).where(eq(schema.veiculos.id, id));
      await registrarLog(u, { acao: "veiculo.status", entidade: "veiculo", entidadeId: id, descricao: `Mudou ${v.modelo} de "${STATUS_VEICULO[v.status as keyof typeof STATUS_VEICULO]}" para "${STATUS_VEICULO[status]}"` }, tx);
    });
    if (status === "disponivel") await avisarInteressados(v.modeloId);
    revalidatePath("/sistema/estoque");
    return null;
  }, "Situação atualizada");
}
