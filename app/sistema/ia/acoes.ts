"use server";
import { and, desc, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { z } from "zod";
import { db, schema } from "@/lib/db";
import { autorizarConfig } from "@/lib/auth/desbloqueio";
import { executar, ErroRegra } from "@/lib/acao";
import { registrarLog } from "@/lib/logs";
import { fontesAutorizadas, proximaVersao, salvarHorario } from "@/lib/ia/prompt";
import { gerarObjeto } from "@/lib/ia/cliente";
import { normalizarHorario, textoHorario } from "@/lib/ia/horario";
import { salvarConfigWorkflow } from "@/lib/ia/workflow/config";
import { CONFIG_PADRAO } from "@/lib/ia/workflow/grafo";
import { rodarWorkflowAtendimento } from "@/lib/ia/workflow/executar";
import { apagarMemoria } from "@/lib/ia/workflow/nos";
import { receberMensagem } from "@/lib/mensageria/servico";
import { mensagemSistema } from "@/lib/mensageria/anotacoes";
import { CHAVES_SECOES, secaoPorChave } from "@/lib/ia/secoes";
import { iaLigada, salvarControle } from "@/lib/ia/controle";
import { PERMISSOES_IA } from "@/lib/ia/permissoes";
import { validarResposta } from "@/lib/ia/validador";

const secaoValida = z.string().refine((s) => CHAVES_SECOES.includes(s), "Setor inválido");
const P = schema.iaPromptVersoes;

/* ---------------- prompt por setor ---------------- */

export async function acaoSalvarRascunho(secao: string, conteudo: string, nota?: string) {
  return executar(async () => {
    const u = await autorizarConfig("ia");
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
    const u = await autorizarConfig("ia");
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
    const u = await autorizarConfig("ia");
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
    const u = await autorizarConfig("ia");
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
    const u = await autorizarConfig("ia");
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
    const u = await autorizarConfig("ia");
    const [r] = await db.delete(schema.iaConhecimento).where(eq(schema.iaConhecimento.id, id)).returning({ titulo: schema.iaConhecimento.titulo });
    if (!r) throw new ErroRegra("Item não encontrado.");
    await registrarLog(u, { acao: "ia.conhecimento", entidade: "configuracao", descricao: `Excluiu o item de conhecimento "${r.titulo}"` });
    revalidatePath("/sistema/ia");
    return null;
  }, "Item excluído");
}

export async function acaoAlternarConhecimento(id: number, ativo: boolean) {
  return executar(async () => {
    const u = await autorizarConfig("ia");
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

/** Palavra que o dono pediu para desligar a IA (pedido de 27/09/2026): evita desligar sem querer. */
const PALAVRA_DESLIGAR = "DESLIGAR";

export async function acaoSalvarControle(dados: unknown, confirmacao?: string) {
  return executar(async () => {
    const u = await autorizarConfig("ia");
    const c = esquemaControle.parse(dados);
    /* desligar a IA (que estava ligada) só com a palavra digitada; conferido aqui no servidor */
    if (!c.ligada && (await iaLigada()) && confirmacao !== PALAVRA_DESLIGAR)
      throw new ErroRegra(`Para desligar a IA, digite ${PALAVRA_DESLIGAR} na confirmação.`);
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
    await autorizarConfig("ia");
    return validarResposta(z.string().max(4000).parse(texto), { fontesAutorizadas: await fontesAutorizadas() });
  });
}

/* ---------------- workflow de atendimento ---------------- */

const esquemaConfigWorkflow = z.object(
  Object.fromEntries(Object.entries(CONFIG_PADRAO).map(([k, v]) => [k, typeof v === "boolean" ? z.boolean() : typeof v === "number" ? z.number() : z.string().trim().min(1).max(40)])),
);

export async function acaoSalvarConfigWorkflow(dados: unknown) {
  return executar(async () => {
    const u = await autorizarConfig("ia");
    const c = esquemaConfigWorkflow.parse(dados) as typeof CONFIG_PADRAO;
    await salvarConfigWorkflow(c, u.id);
    await registrarLog(u, { acao: "ia.workflow", entidade: "configuracao", descricao: `${c.ativo ? "Ligou" : "Desligou"} o workflow de atendimento da IA e salvou os ajustes dos nós` });
    revalidatePath("/sistema/ia");
    return null;
  }, "Workflow salvo");
}

const E = schema.iaWorkflowExecucoes;

/** Lista das últimas execuções (a aba Execuções consulta de novo enquanto alguma está rodando). */
export async function acaoListarExecucoes() {
  return executar(async () => {
    await autorizarConfig("ia");
    return db
      .select({ id: E.id, status: E.status, gatilho: E.gatilho, conversaId: E.conversaId, contato: schema.conversas.contatoNome, telefone: schema.conversas.contatoTelefone, noAtual: E.noAtual, paradoEm: E.paradoEm, motivo: E.motivo, iniciadoEm: E.iniciadoEm, duracaoMs: E.duracaoMs })
      .from(E)
      .leftJoin(schema.conversas, eq(schema.conversas.id, E.conversaId))
      .orderBy(desc(E.id))
      .limit(60);
  });
}

/** Uma execução com todos os passos e a memória atual da conversa. */
export async function acaoCarregarExecucao(id: number) {
  return executar(async () => {
    await autorizarConfig("ia");
    const [ex] = await db.select().from(E).where(eq(E.id, z.number().int().parse(id))).limit(1);
    if (!ex) throw new ErroRegra("Execução não encontrada (execuções com mais de 30 dias são apagadas).");
    const [memoria] = ex.conversaId ? await db.select().from(schema.iaMemorias).where(eq(schema.iaMemorias.conversaId, ex.conversaId)).limit(1) : [];
    return { ...ex, memoria: memoria ?? null };
  });
}

export async function acaoApagarMemoria(conversaId: number) {
  return executar(async () => {
    const u = await autorizarConfig("ia");
    const id = z.number().int().parse(conversaId);
    await apagarMemoria(id);
    await mensagemSistema(db, id, `Memória da IA apagada por ${u.nome}.`);
    await registrarLog(u, { acao: "ia.memoria_apagada", entidade: "conversa", entidadeId: id, descricao: "Apagou a memória da IA de uma conversa" });
    return null;
  }, "Memória apagada");
}

/* conversa de teste do painel: sempre simulada (nada sai para o WhatsApp) */
const TELEFONE_TESTE = "5500900000001";

export async function acaoTestarWorkflow(texto: string) {
  return executar(async () => {
    await autorizarConfig("ia");
    const t = z.string().trim().min(1, "Escreva a mensagem do cliente").max(2000).parse(texto);
    const r = await receberMensagem({ canal: "whatsapp", provedor: "mock", telefone: TELEFONE_TESTE, nomeContato: "Teste do workflow", tipo: "texto", conteudo: t, externoId: `teste-wf-${crypto.randomUUID()}`, demo: true });
    if (!r.conversaId || !r.mensagemId) throw new ErroRegra("Não foi possível registrar a mensagem de teste.");
    const e = { conversaId: r.conversaId, mensagemId: r.mensagemId };
    after(() => rodarWorkflowAtendimento({ ...e, gatilho: "teste", simulado: true }).then(() => {}));
    return e;
  });
}

/** Devolve a conversa de teste para a IA e apaga a memória dela (recomeça do zero). */
export async function acaoReiniciarTeste() {
  return executar(async () => {
    await autorizarConfig("ia");
    const [c] = await db.select({ id: schema.conversas.id }).from(schema.conversas).where(and(eq(schema.conversas.contatoTelefone, TELEFONE_TESTE), eq(schema.conversas.demo, true))).limit(1);
    if (!c) return null;
    await db.update(schema.conversas).set({ modo: "ia", responsavelId: null, atualizadoEm: new Date() }).where(eq(schema.conversas.id, c.id));
    await apagarMemoria(c.id);
    return null;
  }, "Teste reiniciado: conversa de volta para a IA e memória apagada");
}

/** Mensagens da conversa de teste, para o chat do painel. */
export async function acaoConversaDeTeste() {
  return executar(async () => {
    await autorizarConfig("ia");
    const [c] = await db.select({ id: schema.conversas.id, modo: schema.conversas.modo }).from(schema.conversas).where(and(eq(schema.conversas.contatoTelefone, TELEFONE_TESTE), eq(schema.conversas.demo, true))).limit(1);
    if (!c) return { modo: "ia", mensagens: [] };
    const m = schema.mensagens;
    const msgs = await db.select({ id: m.id, autor: m.autor, conteudo: m.conteudo, respostaA: m.respostaA, criadoEm: m.criadoEm }).from(m).where(eq(m.conversaId, c.id)).orderBy(desc(m.id)).limit(40);
    return { modo: c.modo, mensagens: msgs.reverse() };
  });
}

/* ---------------- horário de funcionamento ---------------- */
export async function acaoSalvarHorario(dados: unknown) {
  return executar(async () => {
    const u = await autorizarConfig("ia");
    const h = normalizarHorario(dados);
    await salvarHorario(h, u.id);
    await registrarLog(u, { acao: "ia.horario", entidade: "configuracao", descricao: `Horário de funcionamento: ${textoHorario(h).replace(/\n/g, " ")}` });
    revalidatePath("/sistema/ia");
    return null;
  }, "Horário salvo: a IA já usa o novo horário");
}

/* ---------------- ajuste do prompt com ajuda da IA ---------------- */
export async function acaoSugerirAjustePrompt(secao: string, textoAtual: string, pedido: string) {
  return executar(async () => {
    await autorizarConfig("ia");
    const s = secaoValida.parse(secao);
    const atual = z.string().max(8000).parse(textoAtual);
    const p = z.string().trim().min(5, "Diga o que quer mudar").max(1000).parse(pedido);
    return gerarObjeto({
      schema: z.object({ texto: z.string(), explicacao: z.string() }),
      maxTokens: 2000,
      sistema: `Você ajuda o dono de uma loja de motos (Gêmeos Motors) a ajustar o prompt da IA de atendimento no WhatsApp.
Reescreva SOMENTE o setor "${secaoPorChave(s)?.titulo}" aplicando o pedido do dono. Mantenha o que não foi pedido para mudar.
Nunca acrescente preço, prazo, horário, endereço ou condição que o dono não escreveu: dados da loja ficam na base de conhecimento.
Escreva em português do Brasil, frases curtas e diretas. Em "explicacao", diga em 1 ou 2 frases simples o que mudou.`,
      prompt: `TEXTO ATUAL DO SETOR:\n${atual}\n\nPEDIDO DO DONO:\n${p}`,
    });
  });
}

/* ---------------- falhas da IA (aba Falhas) ---------------- */
export async function acaoListarFalhas() {
  return executar(async () => {
    await autorizarConfig("ia");
    return db
      .select({ id: E.id, status: E.status, gatilho: E.gatilho, contato: schema.conversas.contatoNome, telefone: schema.conversas.contatoTelefone, iniciadoEm: E.iniciadoEm, falhas: E.falhas })
      .from(E)
      .leftJoin(schema.conversas, eq(schema.conversas.id, E.conversaId))
      .where(sql`jsonb_array_length(${E.falhas}) > 0`)
      .orderBy(desc(E.id))
      .limit(80);
  });
}
