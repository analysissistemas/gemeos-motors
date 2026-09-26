"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { autorizar } from "@/lib/auth/dal";
import { executar } from "@/lib/acao";
import { apagarFotoCatalogo, guardarFotoCatalogo } from "@/lib/fotos";
import { alternarAtivo, alternarSite, excluirModelo, modeloPorId, moverModelo, salvarModelo, trocarFotoModelo } from "@/lib/servicos/catalogo";

/* Aba "Catálogo" do estoque: quem edita o estoque edita o catálogo do site.
   Permissão conferida aqui em cada ação; o histórico é gravado no serviço. */

const idValido = z.coerce.number().int().positive();
const atualizarTelas = () => revalidatePath("/sistema/estoque");

export async function acaoSalvarModelo(id: number | null, entrada: unknown) {
  return executar(async () => {
    const u = await autorizar("estoque.editar");
    const novoId = await salvarModelo(u, id ? idValido.parse(id) : null, entrada);
    atualizarTelas();
    return { id: novoId };
  }, id ? "Modelo atualizado" : "Modelo criado no catálogo");
}

export async function acaoEnviarFotoModelo(id: number, dados: FormData) {
  return executar(async () => {
    const u = await autorizar("estoque.editar");
    const modelo = await modeloPorId(idValido.parse(id));
    const url = await guardarFotoCatalogo(dados.get("foto"), modelo.id);
    try {
      const r = await trocarFotoModelo(u, modelo.id, url);
      atualizarTelas();
      return r;
    } catch (e) {
      await apagarFotoCatalogo(url);
      throw e;
    }
  }, "Foto do modelo atualizada");
}

export async function acaoRemoverFotoModelo(id: number) {
  return executar(async () => {
    const u = await autorizar("estoque.editar");
    const r = await trocarFotoModelo(u, idValido.parse(id), null);
    atualizarTelas();
    return r;
  }, "Foto do modelo removida");
}

export async function acaoMoverModelo(id: number, direcao: "cima" | "baixo") {
  return executar(async () => {
    const u = await autorizar("estoque.editar");
    await moverModelo(u, idValido.parse(id), z.enum(["cima", "baixo"]).parse(direcao));
    atualizarTelas();
    return null;
  });
}

export async function acaoAlternarSite(id: number, mostrar: boolean) {
  return executar(async () => {
    const u = await autorizar("estoque.editar");
    await alternarSite(u, idValido.parse(id), z.boolean().parse(mostrar));
    atualizarTelas();
    return null;
  }, mostrar ? "Voltou a aparecer no site" : "Tirado do site");
}

export async function acaoAlternarAtivo(id: number, ativo: boolean) {
  return executar(async () => {
    const u = await autorizar("estoque.editar");
    await alternarAtivo(u, idValido.parse(id), z.boolean().parse(ativo));
    atualizarTelas();
    return null;
  }, ativo ? "Modelo reativado" : "Modelo desativado");
}

export async function acaoExcluirModelo(id: number) {
  return executar(async () => {
    const u = await autorizar("estoque.editar");
    await excluirModelo(u, idValido.parse(id));
    atualizarTelas();
    return null;
  }, "Modelo apagado do catálogo");
}
