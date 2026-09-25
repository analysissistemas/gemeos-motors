"use server";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db, schema } from "@/lib/db";
import { autorizar } from "@/lib/auth/dal";
import { executar, ErroRegra } from "@/lib/acao";
import { registrarLog } from "@/lib/logs";
import { proximaVersao } from "@/lib/ia/prompt";
import { CHAVES_SECOES, secaoPorChave } from "@/lib/ia/secoes";
import { salvarControle } from "@/lib/ia/controle";
import { PERMISSOES_IA } from "@/lib/ia/permissoes";
import { validarResposta } from "@/lib/ia/validador";

const secaoValida = z.string().refine((s) => CHAVES_SECOES.includes(s), "Setor inválido");
const P = schema.iaPromptVersoes;

/* ---------------- prompt por setor ---------------- */

export async function acaoSalvarRascunho(secao: string, conteudo: string, nota?: string) {
  return executar(async () => {
    const u = await autorizar("config.gerenciar");
    const s = secaoValida.parse(secao);
    const texto = z.string().trim().min(10, "Escreva pelo menos uma frase").max(8000, "Texto longo demais (máximo 8.000 caracteres)").parse(conteudo);
    const anotacao = z.string().trim().max(200).optional().parse(nota) || null;
    await db.transaction(async (tx) => {
      const [r] = await tx.select({ id: P.id }).from(P).where(and(eq(P.secao, s), eq(P.status, "rascunho"))).limit(1);
      if (r) await tx.update(P).set({ conteudo: texto, nota: anotacao, criadoPor: u.id }).where(eq(P.id, r.id));
      else await tx.insert(P).values({ secao: s, versao: await proximaVersao(s, tx), conteudo: texto, status: "rascunho", nota: anotacao, criadoPor: u.id });
    });
    await registrarLog(u, { acao: "ia.prompt_rascunho", entidade: "configuracao", descricao: `Salvou rascunho do setor "${secaoPorChave(s)?.titulo}" da IA` });
    revalidatePath("/sistema/ia");
    return null;
  }, "Rascunho salvo");
}

export async function acaoPublicar(secao: string) {
  return executar(async () => {
    const u = await autorizar("config.gerenciar");
    const s = secaoValida.parse(secao);
    const v = await db.transaction(async (tx) => {
      const [rasc] = await tx.select().from(P).where(and(eq(P.secao, s), eq(P.status, "rascunho"))).limit(1);
      if (!rasc) throw new ErroRegra("Não há rascunho para publicar neste setor.");
      await tx.update(P).set({ status: "arquivada" }).where(and(eq(P.secao, s), eq(P.status, "publicada")));
      await tx.update(P).set({ status: "publicada", publicadoEm: new Date() }).where(eq(P.id, rasc.id));
      return rasc.versao;
    });
    await registrarLog(u, { acao: "ia.prompt_publicado", entidade: "configuracao", descricao: `Publicou a versão ${v} do setor "${secaoPorChave(s)?.titulo}" da IA` });
    revalidatePath("/sistema/ia");
    return null;
  }, "Publicado: a IA já usa esta versão");
}

export async function acaoDescartarRascunho(secao: string) {
  return executar(async () => {
    const u = await autorizar("config.gerenciar");
    const s = secaoValida.parse(secao);
    await db.delete(P).where(and(eq(P.secao, s), eq(P.status, "rascunho")));
    await registrarLog(u, { acao: "ia.prompt_descartado", entidade: "configuracao", descricao: `Descartou o rascunho do setor "${secaoPorChave(s)?.titulo}" da IA` });
    revalidatePath("/sistema/ia");
    return null;
  }, "Rascunho descartado");
}

/** Copia uma versão antiga (ou o texto padrão) para o rascunho; publicar continua sendo um passo à parte. */
export async function acaoRestaurarComoRascunho(secao: string, versaoId: number | null) {
  return executar(async () => {
    const u = await autorizar("config.gerenciar");
    const s = secaoValida.parse(secao);
    let conteudo: string;
    let nota: string;
    if (versaoId == null) {
      conteudo = secaoPorChave(s)!.padrao;
      nota = "Texto padrão do sistema";
    } else {
      const [v] = await db.select().from(P).where(and(eq(P.id, versaoId), eq(P.secao, s))).limit(1);
      if (!v) throw new ErroRegra("Versão não encontrada.");
      conteudo = v.conteudo;
      nota = `Restaurada da versão ${v.versao}`;
    }
    await db.transaction(async (tx) => {
      const [r] = await tx.select({ id: P.id }).from(P).where(and(eq(P.secao, s), eq(P.status, "rascunho"))).limit(1);
      if (r) await tx.update(P).set({ conteudo, nota, criadoPor: u.id }).where(eq(P.id, r.id));
      else await tx.insert(P).values({ secao: s, versao: await proximaVersao(s, tx), conteudo, status: "rascunho", nota, criadoPor: u.id });
    });
    await registrarLog(u, { acao: "ia.prompt_restaurado", entidade: "configuracao", descricao: `Restaurou uma versão do setor "${secaoPorChave(s)?.titulo}" da IA como rascunho` });
    revalidatePath("/sistema/ia");
    return null;
  }, "Restaurado como rascunho. Revise e publique.");
}

/* ---------------- base de conhecimento ---------------- */

const esquemaConhecimento = z.object({
  categoria: z.string().trim().min(2, "Escolha a categoria").max(60),
  titulo: z.string().trim().min(3, "Informe um título").max(120),
  conteudo: z.string().trim().min(3, "Escreva o conteúdo").max(4000, "Máximo de 4.000 caracteres"),
  ativo: z.boolean().default(true),
});

export async function acaoSalvarConhecimento(id: number | null, dados: Record<string, unknown>) {
  return executar(async () => {
    const u = await autorizar("config.gerenciar");
    const d = esquemaConhecimento.parse(dados);
    if (id) {
      const [r] = await db.update(schema.iaConhecimento).set({ ...d, atualizadoEm: new Date(), atualizadoPor: u.id }).where(eq(schema.iaConhecimento.id, id)).returning({ id: schema.iaConhecimento.id });
      if (!r) throw new ErroRegra("Item não encontrado.");
    } else {
      await db.insert(schema.iaConhecimento).values({ ...d, atualizadoPor: u.id });
    }
    await registrarLog(u, { acao: "ia.conhecimento", entidade: "configuracao", descricao: `${id ? "Editou" : "Criou"} o item de conhecimento "${d.titulo}"` });
    revalidatePath("/sistema/ia");
    return null;
  }, "Item salvo");
}

export async function acaoExcluirConhecimento(id: number) {
  return executar(async () => {
    const u = await autorizar("config.gerenciar");
    const [r] = await db.delete(schema.iaConhecimento).where(eq(schema.iaConhecimento.id, id)).returning({ titulo: schema.iaConhecimento.titulo });
    if (!r) throw new ErroRegra("Item não encontrado.");
    await registrarLog(u, { acao: "ia.conhecimento", entidade: "configuracao", descricao: `Excluiu o item de conhecimento "${r.titulo}"` });
    revalidatePath("/sistema/ia");
    return null;
  }, "Item excluído");
}

export async function acaoAlternarConhecimento(id: number, ativo: boolean) {
  return executar(async () => {
    const u = await autorizar("config.gerenciar");
    const [r] = await db.update(schema.iaConhecimento).set({ ativo, atualizadoEm: new Date(), atualizadoPor: u.id }).where(eq(schema.iaConhecimento.id, id)).returning({ titulo: schema.iaConhecimento.titulo });
    if (!r) throw new ErroRegra("Item não encontrado.");
    await registrarLog(u, { acao: "ia.conhecimento", entidade: "configuracao", descricao: `${ativo ? "Ativou" : "Desativou"} o item de conhecimento "${r.titulo}"` });
    revalidatePath("/sistema/ia");
    return null;
  });
}

/* ---------------- controle: chave geral, permissões e validador ---------------- */

const esquemaControle = z.object({
  ligada: z.boolean(),
  permissoes: z.object(Object.fromEntries(PERMISSOES_IA.map((p) => [p.chave, z.boolean()])) as Record<(typeof PERMISSOES_IA)[number]["chave"], z.ZodBoolean>),
});

export async function acaoSalvarControle(dados: unknown) {
  return executar(async () => {
    const u = await autorizar("config.gerenciar");
    const c = esquemaControle.parse(dados);
    await salvarControle(c, u.id);
    const ativas = PERMISSOES_IA.filter((p) => c.permissoes[p.chave]).map((p) => p.rotulo);
    await registrarLog(u, {
      acao: "ia.controle",
      entidade: "configuracao",
      descricao: `${c.ligada ? "Ligou" : "Desligou"} a IA. Permissões ativas: ${ativas.length ? ativas.join(", ") : "nenhuma"}`,
    });
    revalidatePath("/sistema/ia");
    return null;
  }, "Controle da IA salvo");
}

/** Testa um texto contra o validador, sem enviar nada. */
export async function acaoValidarTexto(texto: string) {
  return executar(async () => {
    await autorizar("config.gerenciar");
    return validarResposta(z.string().max(4000).parse(texto));
  });
}
