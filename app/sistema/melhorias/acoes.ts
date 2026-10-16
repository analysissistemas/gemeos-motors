"use server";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db, schema } from "@/lib/db";
import { autorizar } from "@/lib/auth/dal";
import { autorizarConfig } from "@/lib/auth/desbloqueio";
import { executar, ErroRegra } from "@/lib/acao";
import { IaIndisponivel } from "@/lib/ia/cliente";
import { aprovarChamado, concluirPlano, desfazerChamado, diasComFichas, gerarChamados, listarChamados, recusarChamado, relatorioDoDia } from "@/lib/ia/chamados";
import { aplicaSozinho, type TipoChamado } from "@/lib/ia/chamados-regras";

/* Tela Melhorias (só administrador). O que muda a IA (aprovar ou desfazer resposta e regra) pede a mesma senha da
   tela da IA (dono, por segurança); ver o relatório e mexer no plano de ação, não. */

const texto = z.string().trim().max(4000).optional();
const esquemaProposta = z.object({ categoria: z.string().trim().max(60).optional(), titulo: z.string().trim().max(120).optional(), conteudo: texto, regra: z.string().trim().max(400).optional(), acao: texto });

async function quemPode(id: number) {
  const [c] = await db.select({ tipo: schema.chamadosMelhoria.tipo }).from(schema.chamadosMelhoria).where(eq(schema.chamadosMelhoria.id, id)).limit(1);
  if (!c) throw new ErroRegra("Chamado não encontrado.");
  return aplicaSozinho(c.tipo as TipoChamado) ? autorizarConfig("ia") : autorizar("config.gerenciar");
}

export async function acaoAprovarChamado(id: number, proposta: unknown, observacao?: string) {
  return executar(async () => {
    const u = await quemPode(id);
    const r = await aprovarChamado(u, id, esquemaProposta.parse(proposta), texto.parse(observacao) || null);
    revalidatePath("/sistema/melhorias");
    return r;
  }, "Chamado aprovado");
}

export async function acaoRecusarChamado(id: number, observacao?: string) {
  return executar(async () => {
    const u = await autorizar("config.gerenciar");
    await recusarChamado(u, id, texto.parse(observacao) || null);
    revalidatePath("/sistema/melhorias");
    return null;
  }, "Chamado recusado");
}

export async function acaoDesfazerChamado(id: number) {
  return executar(async () => {
    const u = await quemPode(id);
    await desfazerChamado(u, id);
    revalidatePath("/sistema/melhorias");
    return null;
  }, "Desfeito: a IA voltou a ser como antes deste chamado");
}

export async function acaoConcluirPlano(id: number, observacao?: string) {
  return executar(async () => {
    const u = await autorizar("config.gerenciar");
    await concluirPlano(u, id, texto.parse(observacao) || null);
    revalidatePath("/sistema/melhorias");
    return null;
  }, "Marcado como feito");
}

/** Gera os chamados de um dia agora, sem esperar as 18:45. */
export async function acaoGerarChamados(dia: string) {
  return executar(async () => {
    await autorizar("config.gerenciar");
    const d = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).parse(dia);
    const r = await gerarChamados(d).catch((e) => {
      if (e instanceof IaIndisponivel) throw new ErroRegra(e.message);
      throw e;
    });
    revalidatePath("/sistema/melhorias");
    return { r, chamados: await listarChamados() };
  });
}

export async function acaoRelatorio(dia: string) {
  return executar(async () => {
    await autorizar("config.gerenciar");
    return relatorioDoDia(z.string().regex(/^\d{4}-\d{2}-\d{2}$/).parse(dia));
  });
}

export async function acaoDiasRelatorio() {
  return executar(async () => {
    await autorizar("config.gerenciar");
    return diasComFichas();
  });
}
