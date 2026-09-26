"use server";
import { headers } from "next/headers";
import { ipConfiavel } from "@/lib/ip";
import { executar } from "@/lib/acao";
import { assinarPublico } from "@/lib/servicos/vendas";

export async function assinarDocumento(token: string, dados: { nome: string; cpf: string; aceite: boolean; imagem: string }) {
  return executar(async () => {
    const h = await headers();
    const ip = ipConfiavel(h);
    await assinarPublico(token, dados, ip, h.get("user-agent"));
    return null;
  }, "Documento assinado");
}
