"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { autorizar } from "@/lib/auth/dal";
import { executar } from "@/lib/acao";
import { STATUS_RESERVA, type StatusReserva } from "@/lib/dominio";
import { anotarReserva, mudarStatusReserva } from "@/lib/servicos/reservas";

const id = z.coerce.number().int().positive();
const status = z.enum(Object.keys(STATUS_RESERVA) as [StatusReserva, ...StatusReserva[]]);

export async function acaoStatusReserva(reservaId: number, novo: StatusReserva) {
  return executar(async () => {
    const u = await autorizar("reservas.editar");
    await mudarStatusReserva(u, id.parse(reservaId), status.parse(novo));
    revalidatePath("/sistema/reservas");
    return null;
  }, `Reserva marcada como ${STATUS_RESERVA[novo] ?? novo}`);
}

export async function acaoAnotarReserva(reservaId: number, texto: string) {
  return executar(async () => {
    const u = await autorizar("reservas.editar");
    await anotarReserva(u, id.parse(reservaId), texto);
    revalidatePath("/sistema/reservas");
    return null;
  }, "Anotação salva");
}
