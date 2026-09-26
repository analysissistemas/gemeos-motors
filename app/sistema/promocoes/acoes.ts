"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { autorizar } from "@/lib/auth/dal";
import { executar } from "@/lib/acao";
import { criarPromocao, encerrarPromocao } from "@/lib/servicos/promocoes";

const esquema = z.object({
  modeloId: z.number().int().positive(),
  precoPromocional: z.number().positive("Informe o preço promocional"),
  inicioEm: z.string().min(1, "Informe o início"),
  fimEm: z.string().min(1, "Informe o fim"),
});

/* os campos de data chegam como hora de Recife (UTC-3, sem horário de verão) */
const recife = (v: string) => new Date(`${v}:00-03:00`);

export async function acaoCriarPromocao(dados: unknown) {
  return executar(async () => {
    const u = await autorizar("estoque.editar");
    const d = esquema.parse(dados);
    const id = await criarPromocao(u, { modeloId: d.modeloId, precoPromocional: d.precoPromocional, inicioEm: recife(d.inicioEm), fimEm: recife(d.fimEm) });
    revalidatePath("/sistema/promocoes");
    return { id };
  }, "Promoção criada");
}

export async function acaoEncerrarPromocao(id: number) {
  return executar(async () => {
    const u = await autorizar("estoque.editar");
    await encerrarPromocao(u, z.number().int().positive().parse(id));
    revalidatePath("/sistema/promocoes");
    return null;
  }, "Promoção encerrada");
}
