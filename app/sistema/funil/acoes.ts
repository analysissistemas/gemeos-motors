"use server";
import { revalidatePath } from "next/cache";
import { autorizar } from "@/lib/auth/dal";
import { executar } from "@/lib/acao";
import { ETAPAS, type Etapa } from "@/lib/dominio";
import { obterNegocio } from "@/lib/consultas/funil";
import { listarVeiculosVendaveis } from "@/lib/consultas/estoque";
import {
  atualizarNegocio,
  criarNegocio,
  fecharNegocioComVenda,
  gerarDiagnosticoPerda,
  marcarPerdido,
  moverEtapa,
} from "@/lib/servicos/negocios";

const revalidar = () => {
  revalidatePath("/sistema/funil");
  revalidatePath("/sistema");
};

export async function acaoCriarNegocio(dados: Record<string, unknown>) {
  return executar(async () => {
    const u = await autorizar("funil.editar");
    const id = await criarNegocio(u, dados);
    revalidar();
    return { id };
  }, "Negócio criado");
}

export async function acaoAtualizarNegocio(id: number, dados: Record<string, unknown>) {
  return executar(async () => {
    const u = await autorizar("funil.editar");
    await atualizarNegocio(u, id, dados);
    revalidar();
    return null;
  }, "Negócio atualizado");
}

export async function acaoMoverNegocio(id: number, etapa: string) {
  return executar(async () => {
    const u = await autorizar("funil.editar");
    if (!ETAPAS.some((e) => e.id === etapa)) throw new Error("etapa inválida");
    const r = await moverEtapa(u, id, etapa as Etapa);
    revalidar();
    return r;
  });
}

export async function acaoMarcarPerdido(dados: Record<string, unknown>) {
  return executar(async () => {
    const u = await autorizar("funil.editar");
    const id = await marcarPerdido(u, dados);
    revalidar();
    return { id };
  }, "Negócio encerrado como venda perdida");
}

export async function acaoGerarDiagnostico(negocioId: number) {
  return executar(async () => {
    const u = await autorizar("funil.editar");
    const d = await gerarDiagnosticoPerda(u, negocioId);
    revalidar();
    return d;
  }, "Diagnóstico gerado");
}

export async function acaoFecharVenda(dados: Record<string, unknown>) {
  return executar(async () => {
    const u = await autorizar("vendas.editar");
    const vendaId = await fecharNegocioComVenda(u, dados);
    revalidar();
    revalidatePath("/sistema/vendas");
    revalidatePath("/sistema/estoque");
    return { vendaId };
  }, "Venda registrada");
}

export async function acaoDetalheNegocio(id: number) {
  await autorizar("funil.ver");
  return obterNegocio(id);
}

export async function acaoVeiculosVendaveis() {
  const u = await autorizar("funil.ver");
  /* o admin vê também os veículos de teste ("[TESTE]"), para montar um negócio de teste da IA */
  return listarVeiculosVendaveis({ incluirTeste: u.papel === "admin" });
}
