"use server";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db, schema } from "@/lib/db";
import { autorizarConfig } from "@/lib/auth/desbloqueio";
import { executar, ErroRegra } from "@/lib/acao";
import { registrarLog } from "@/lib/logs";
import { carregarDemonstracao, limparDemonstracao } from "@/lib/mensageria/demo";
import { gerarVerifyToken, lerConfigWhatsApp, salvarConfigWhatsApp } from "@/lib/mensageria/whatsapp-config";

const texto = (max: number) => z.string().trim().max(max).nullable().optional().transform((v) => v || null);

const esquemaEmpresa = z.object({
  nomeFantasia: z.string().trim().min(2, "Informe o nome").max(120),
  razaoSocial: texto(160),
  cnpj: z
    .string()
    .nullable()
    .optional()
    .transform((v) => (v ? v.replace(/\D/g, "") : null))
    .refine((v) => !v || v.length === 14, "CNPJ com 14 números"),
  telefone: texto(20),
  whatsapp: texto(20),
  email: texto(120),
  instagram: texto(60),
  endereco: texto(200),
  cidade: texto(80),
  estado: texto(2),
  cep: texto(9),
  condicoesVenda: texto(4000),
  condicoesOs: texto(4000),
});

export async function acaoSalvarEmpresa(dados: Record<string, unknown>) {
  return executar(async () => {
    const u = await autorizarConfig();
    const d = esquemaEmpresa.parse(dados);
    await db
      .insert(schema.empresa)
      .values({ id: 1, ...d, atualizadoPor: u.id })
      .onConflictDoUpdate({ target: schema.empresa.id, set: { ...d, atualizadoEm: new Date(), atualizadoPor: u.id } });
    await registrarLog(u, { acao: "configuracao.empresa", entidade: "configuracao", descricao: "Atualizou os dados da empresa usados nos documentos" });
    revalidatePath("/sistema/configuracoes");
    return null;
  }, "Dados da empresa salvos");
}

const esquemaResposta = z.object({
  atalho: z
    .string()
    .trim()
    .toLowerCase()
    .transform((v) => v.replace(/^\//, ""))
    .pipe(z.string().regex(/^[a-z0-9_-]{2,30}$/, "Use de 2 a 30 letras minúsculas, números, _ ou -")),
  titulo: z.string().trim().min(2, "Informe o título").max(60),
  conteudo: z.string().trim().min(2, "Escreva a resposta").max(1000),
  ativo: z.boolean().default(true),
});

export async function acaoSalvarResposta(id: number | null, dados: Record<string, unknown>) {
  return executar(async () => {
    const u = await autorizarConfig();
    const d = esquemaResposta.parse(dados);
    if (id) await db.update(schema.respostasRapidas).set({ ...d, atualizadoEm: new Date() }).where(eq(schema.respostasRapidas.id, id));
    else await db.insert(schema.respostasRapidas).values(d);
    await registrarLog(u, { acao: "configuracao.resposta_rapida", entidade: "configuracao", descricao: `${id ? "Editou" : "Criou"} a resposta rápida /${d.atalho}` });
    revalidatePath("/sistema/configuracoes");
    return null;
  }, "Resposta rápida salva");
}

export async function acaoExcluirResposta(id: number) {
  return executar(async () => {
    const u = await autorizarConfig();
    const [r] = await db.delete(schema.respostasRapidas).where(eq(schema.respostasRapidas.id, id)).returning({ atalho: schema.respostasRapidas.atalho });
    if (!r) throw new ErroRegra("Resposta não encontrada.");
    await registrarLog(u, { acao: "configuracao.resposta_rapida", entidade: "configuracao", descricao: `Excluiu a resposta rápida /${r.atalho}` });
    revalidatePath("/sistema/configuracoes");
    return null;
  }, "Resposta rápida excluída");
}

export async function acaoTriagemAutomatica(ligada: boolean) {
  return executar(async () => {
    const u = await autorizarConfig();
    await db
      .insert(schema.configuracoes)
      .values({ chave: "ia.triagem_automatica", valor: ligada, atualizadoPor: u.id })
      .onConflictDoUpdate({ target: schema.configuracoes.chave, set: { valor: ligada, atualizadoEm: new Date(), atualizadoPor: u.id } });
    await registrarLog(u, { acao: "configuracao.ia", entidade: "configuracao", descricao: `${ligada ? "Ligou" : "Desligou"} a triagem automática da IA no atendimento` });
    revalidatePath("/sistema/configuracoes");
    return null;
  }, ligada ? "Triagem automática ligada" : "Triagem automática desligada");
}

export async function acaoCarregarDemo() {
  return executar(async () => {
    const u = await autorizarConfig();
    const r = await carregarDemonstracao(u);
    revalidatePath("/sistema/conversas");
    revalidatePath("/sistema/funil");
    return r;
  });
}

export async function acaoLimparDemo() {
  return executar(async () => {
    const u = await autorizarConfig();
    const r = await limparDemonstracao(u);
    revalidatePath("/sistema/conversas");
    revalidatePath("/sistema/funil");
    revalidatePath("/sistema/clientes");
    return r;
  });
}

const apenasNumeros = z.string().trim().transform((v) => v.replace(/\D/g, ""));
const esquemaApiOficial = z.object({
  ativo: z.boolean(),
  telefone: apenasNumeros.pipe(z.string().max(20)),
  phoneNumberId: apenasNumeros.pipe(z.string().max(30)),
  wabaId: apenasNumeros.pipe(z.string().max(30)),
  token: z.string().trim().max(1000).optional(),
  appSecret: z.string().trim().max(200).optional(),
});

export async function acaoSalvarApiOficial(dados: Record<string, unknown>) {
  return executar(async () => {
    const u = await autorizarConfig();
    const d = esquemaApiOficial.parse(dados);
    const atual = await lerConfigWhatsApp();
    if (d.ativo && !(d.token || atual.token)) throw new ErroRegra("Cole o token permanente antes de ativar a API Oficial.");
    if (d.ativo && !d.phoneNumberId) throw new ErroRegra("Informe o ID do número de telefone antes de ativar.");
    if (d.ativo && !(d.appSecret || atual.appSecret)) throw new ErroRegra("Informe o segredo do app da Meta antes de ativar: sem ele as mensagens recebidas não podem ser conferidas.");
    if (d.appSecret && !/^[0-9a-f]{32}$/i.test(d.appSecret)) throw new ErroRegra("Esse não parece o segredo do app: ele tem 32 letras e números (Meta for Developers > Configurações do app > Básico). Nada foi salvo.");
    // Token novo só entra se a Meta aceitar: um token errado no lugar do bom derruba o envio sem ninguém perceber.
    if (d.token) {
      const phoneNumberId = d.phoneNumberId || atual.phoneNumberId;
      if (!phoneNumberId) throw new ErroRegra("Informe o ID do número de telefone para conferir o token.");
      const erro = await conferirTokenNaMeta(d.token, phoneNumberId);
      if (erro) throw new ErroRegra(`A Meta recusou esse token (${erro}). O token anterior continua salvo.`);
    }
    await salvarConfigWhatsApp(d, u.id);
    await registrarLog(u, { acao: "configuracao.whatsapp", entidade: "configuracao", descricao: `Salvou a API Oficial do WhatsApp (${d.ativo ? "ativa" : "desativada"})` });
    revalidatePath("/sistema/configuracoes");
    revalidatePath("/sistema/conversas");
    return null;
  }, "API Oficial salva");
}

export async function acaoGerarVerifyToken() {
  return executar(async () => {
    const u = await autorizarConfig();
    const t = await gerarVerifyToken(u.id);
    await registrarLog(u, { acao: "configuracao.whatsapp", entidade: "configuracao", descricao: "Gerou um novo token de verificação do webhook do WhatsApp" });
    revalidatePath("/sistema/configuracoes");
    return t;
  }, "Novo token gerado. Cole o mesmo na Meta.");
}

async function consultarNumero(token: string, phoneNumberId: string) {
  const versao = process.env.WHATSAPP_API_VERSAO || "v21.0";
  const r = await fetch(`https://graph.facebook.com/${versao}/${phoneNumberId}?fields=display_phone_number,verified_name,quality_rating`, { headers: { Authorization: `Bearer ${token}` } });
  const j = (await r.json().catch(() => ({}))) as { display_phone_number?: string; verified_name?: string; error?: { message?: string } };
  return { ok: r.ok, erro: j.error?.message ?? `HTTP ${r.status}`, nome: j.verified_name, numero: j.display_phone_number };
}

/** Devolve o motivo da recusa, ou null se a Meta aceitou o token. */
async function conferirTokenNaMeta(token: string, phoneNumberId: string) {
  try {
    const r = await consultarNumero(token, phoneNumberId);
    return r.ok ? null : r.erro;
  } catch {
    throw new ErroRegra("Não deu para falar com a Meta agora para conferir o token. Tente de novo em instantes; nada foi salvo.");
  }
}

export async function acaoTestarApiOficial() {
  return executar(async () => {
    await autorizarConfig();
    const c = await lerConfigWhatsApp();
    if (!c.token || !c.phoneNumberId) throw new ErroRegra("Salve o token e o ID do número primeiro.");
    const r = await consultarNumero(c.token, c.phoneNumberId);
    if (!r.ok) throw new ErroRegra(`A Meta recusou: ${r.erro}`);
    return `${r.nome ?? "Número"} · ${r.numero ?? c.phoneNumberId}`;
  });
}
