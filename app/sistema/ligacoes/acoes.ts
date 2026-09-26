"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { autorizar } from "@/lib/auth/dal";
import { executar } from "@/lib/acao";
import { concluirLigacao, iniciarLigacao, reagendarLigacao } from "@/lib/servicos/ligacoes";

const volta = () => revalidatePath("/sistema/ligacoes");

export async function acaoIniciarLigacao(id: number) {
  return executar(async () => {
    const u = await autorizar("conversas.ver");
    await iniciarLigacao(u, z.number().int().positive().parse(id));
    volta();
    return null;
  });
}

const esquemaConclusao = z.object({
  resultado: z.enum(["atendida", "nao_atendida", "ocupado", "numero_errado", "reagendada"]),
  duracaoSegundos: z.number().int().min(0).max(36000).nullable().optional(),
  notas: z.string().max(1000).nullable().optional(),
  proximaAcao: z.string().max(300).nullable().optional(),
});
export async function acaoConcluirLigacao(id: number, dados: unknown) {
  return executar(async () => {
    const u = await autorizar("conversas.ver");
    await concluirLigacao(u, z.number().int().positive().parse(id), esquemaConclusao.parse(dados));
    volta();
    return null;
  }, "Ligação registrada");
}

export async function acaoReagendarLigacao(id: number, quandoIso: string) {
  return executar(async () => {
    const u = await autorizar("conversas.ver");
    await reagendarLigacao(u, z.number().int().positive().parse(id), new Date(quandoIso));
    volta();
    return null;
  }, "Ligação reagendada");
}
