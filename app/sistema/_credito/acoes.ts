"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { autorizar } from "@/lib/auth/dal";
import { executar } from "@/lib/acao";
import { registrarLog } from "@/lib/logs";
import { salvarSaldo } from "@/lib/ia/consumo";

/** Saldo que aparece em platform.openai.com → Billing (em dólar). */
export async function acaoSalvarSaldoIa(valor: string) {
  return executar(async () => {
    const u = await autorizar("config.gerenciar");
    const usd = z.coerce.number({ message: "Digite o saldo em dólar, ex.: 25,40" }).min(0, "O saldo não pode ser negativo").max(10_000, "Valor alto demais").parse(valor.replace(/[^\d,.-]/g, "").replace(",", "."));
    await salvarSaldo(usd, u.id);
    await registrarLog(u, { acao: "ia.saldo", entidade: "configuracao", descricao: `Informou o saldo da OpenAI: US$ ${usd.toFixed(2)}` });
    revalidatePath("/sistema");
    return null;
  }, "Saldo salvo: o sistema desconta o gasto da IA a partir de agora");
}
