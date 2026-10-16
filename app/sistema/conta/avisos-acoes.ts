"use server";
import { z } from "zod";
import { ErroAcesso, obterUsuario } from "@/lib/auth/dal";
import { executar, ErroRegra } from "@/lib/acao";
import { chavePublica, desinscrever, enviarAviso, inscrever, inscricoes } from "@/lib/avisos/push";
import { registrarLog } from "@/lib/logs";

/* Avisos no celular (Minha conta): cada pessoa ativa no próprio aparelho. */

const eu = async () => {
  const u = await obterUsuario();
  if (!u) throw new ErroAcesso("Sua sessão expirou. Entre de novo.");
  return u;
};

export async function acaoChavePublicaAvisos() {
  return executar(async () => {
    await eu();
    return await chavePublica();
  });
}

const esquemaInscricao = z.object({ endpoint: z.string().url().max(1000), keys: z.object({ p256dh: z.string().min(10).max(300), auth: z.string().min(8).max(100) }) });

export async function acaoAtivarAvisos(inscricao: unknown, aparelho: string | null) {
  return executar(async () => {
    const u = await eu();
    const s = esquemaInscricao.parse(inscricao);
    await inscrever(u.id, s, aparelho);
    await registrarLog(u, { acao: "avisos.ativados", entidade: "usuario", entidadeId: u.id, descricao: `Ativou os avisos no celular (${aparelho ?? "aparelho"})` });
    return true;
  }, "Avisos ativados neste aparelho");
}

export async function acaoDesativarAvisos(endpoint: string) {
  return executar(async () => {
    const u = await eu();
    await desinscrever(endpoint);
    await registrarLog(u, { acao: "avisos.desativados", entidade: "usuario", entidadeId: u.id, descricao: "Desativou os avisos neste aparelho" });
    return true;
  }, "Avisos desativados neste aparelho");
}

export async function acaoAvisoDeTeste() {
  return executar(async () => {
    const u = await eu();
    if (!(await inscricoes()).some((i) => i.usuarioId === u.id)) throw new ErroRegra("Ative os avisos neste aparelho primeiro.");
    const r = await enviarAviso(
      { titulo: "🔔 Aviso de teste", corpo: "Os avisos da Gêmeos Motors estão chegando neste celular.", tag: `teste-${Date.now()}`, urgente: true, url: "/sistema/conta" },
      { soPara: [u.id], ignorarHorario: true },
    );
    if (!r.enviados) throw new ErroRegra(`O aviso não saiu (${r.motivo ?? "o celular recusou"}). Desative e ative de novo.`);
    return r.enviados;
  }, "Aviso de teste enviado");
}
