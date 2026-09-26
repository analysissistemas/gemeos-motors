"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { autorizar, type UsuarioAtual } from "@/lib/auth/dal";
import { ErroRegra, executar } from "@/lib/acao";
import { pode } from "@/lib/dominio";
import { enviarMensagem } from "@/lib/mensageria/servico";
import { criarTestDrive, listarTestDrives, mudarStatusTestDrive, opcoesTestDrive, reagendarTestDrive } from "@/lib/servicos/test-drive";
import { STATUS_ABERTOS, textoConfirmacao } from "@/lib/test-drive";

const volta = () => revalidatePath("/sistema/test-drives");
const idValido = z.number().int().positive();

/* A confirmação no WhatsApp é um extra: se falhar, o test drive continua
   agendado e a tela avisa que a mensagem não saiu. */
async function confirmarNoWhatsapp(u: UsuarioAtual, conversaId: number | null, texto: string) {
  if (!conversaId) return "Sem conversa de WhatsApp com este cliente: a confirmação não foi enviada.";
  if (!pode(u.papel, "conversas.ver")) return "Seu perfil não envia mensagem no atendimento: a confirmação não foi enviada.";
  try {
    await enviarMensagem(u, conversaId, { tipo: "texto", conteudo: texto });
    return null;
  } catch (e) {
    return e instanceof ErroRegra ? e.message : "A confirmação no WhatsApp não foi enviada. Mande pelo chat.";
  }
}

export async function acaoAgendarTestDrive(dados: unknown, enviarConfirmacao: boolean) {
  return executar(async () => {
    const u = await autorizar("testdrives.editar");
    const r = await criarTestDrive(u, dados);
    const aviso = enviarConfirmacao ? await confirmarNoWhatsapp(u, r.conversaId, textoConfirmacao({ quando: r.quando })) : null;
    volta();
    return { id: r.id, aviso };
  }, "Test drive agendado");
}

export async function acaoReagendarTestDrive(id: number, quandoIso: string, enviarConfirmacao: boolean) {
  return executar(async () => {
    const u = await autorizar("testdrives.editar");
    const r = await reagendarTestDrive(u, idValido.parse(id), new Date(quandoIso));
    const aviso = enviarConfirmacao ? await confirmarNoWhatsapp(u, r.conversaId, textoConfirmacao({ quando: r.quando, remarcado: true })) : null;
    volta();
    return { id: r.id, aviso };
  }, "Test drive remarcado");
}

export async function acaoStatusTestDrive(id: number, dados: unknown) {
  return executar(async () => {
    const u = await autorizar("testdrives.editar");
    await mudarStatusTestDrive(u, idValido.parse(id), dados);
    volta();
    return null;
  }, "Test drive atualizado");
}

/** Modelos e veículos para o formulário (carregados só quando a janela abre). */
export async function acaoOpcoesTestDrive() {
  return executar(async () => {
    await autorizar("testdrives.editar");
    return opcoesTestDrive();
  });
}

/** Próximos test drives da conversa, para o painel lateral do atendimento. */
export async function acaoTestDrivesDaConversa(conversaId: number) {
  return executar(async () => {
    await autorizar("testdrives.ver");
    return listarTestDrives({ conversaId: idValido.parse(conversaId), status: STATUS_ABERTOS, limite: 5 });
  });
}
