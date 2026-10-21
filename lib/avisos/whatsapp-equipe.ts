import "server-only";
import { eq, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { lerConfigWhatsApp } from "@/lib/mensageria/whatsapp-config";
import { normalizarTelefone, variantesTelefone } from "@/lib/mensageria/servico";
import { obterProvedor } from "@/lib/mensageria/provedores";
import { MODELO_RELATORIO, parametrosRelatorio, textoRelatorioWhatsApp, type ResumoRelatorio } from "./relatorio-texto";

/* Relatório das 8h no WhatsApp pessoal do Milton (dono, 16/10/2026). O número fica no banco (o repositório é público).
   Fora da janela de 24 h a Meta só aceita modelo aprovado: vai o modelo "relatorio_manha" (curto, com botão para o
   relatório). Se o Milton escreveu para a loja nas últimas 24 h, vai o relatório inteiro em texto. A conversa dele fica
   sempre em Humano (a IA não responde) e a mensagem dele marca a hora (abre a janela). */

const CHAVE = "avisos.whatsapp_equipe";
type Guardado = { telefone: string; nome: string; ultimaMsgEm: string | null; ultimoEnvio: { em: string; como: string; ok: boolean; erro?: string; externoId?: string | null; entrega?: "entregue" | "lido" | "falhou"; erroEntrega?: string } | null };

export async function lerWhatsappEquipe(): Promise<Guardado | null> {
  const [l] = await db.select({ valor: schema.configuracoes.valor }).from(schema.configuracoes).where(eq(schema.configuracoes.chave, CHAVE)).limit(1);
  return (l?.valor as Guardado) ?? null;
}
async function gravar(v: Guardado) {
  await db.insert(schema.configuracoes).values({ chave: CHAVE, valor: v }).onConflictDoUpdate({ target: schema.configuracoes.chave, set: { valor: v, atualizadoEm: new Date() } });
}

export async function salvarWhatsappEquipe(telefone: string, nome: string) {
  const atual = await lerWhatsappEquipe();
  const d = telefone.replace(/\D/g, "");
  const tel = d ? normalizarTelefone(d) : "";
  await gravar({ telefone: tel, nome: nome.trim() || "Milton", ultimaMsgEm: atual?.ultimaMsgEm ?? null, ultimoEnvio: atual?.ultimoEnvio ?? null });
  if (tel) await conversaDaEquipeEmHumano(tel);
}

/** A conversa com o número da equipe fica SEMPRE em Humano (dono, 16/10/2026: "e já mudar o atendimento para humano"):
 *  a IA nunca responde ao Milton. */
async function conversaDaEquipeEmHumano(telefone: string) {
  await db
    .update(schema.conversas)
    .set({ modo: "humano", atualizadoEm: new Date() })
    .where(sql`${schema.conversas.contatoTelefone} in (${sql.join(variantesTelefone(telefone).map((v) => sql`${v}`), sql`, `)})`);
}

/** O telefone é o da equipe (Milton)? */
export async function ehDaEquipe(telefone: string | null | undefined): Promise<boolean> {
  const e = await lerWhatsappEquipe();
  if (!e?.telefone || !telefone) return false;
  const meu = new Set(variantesTelefone(e.telefone));
  return variantesTelefone(telefone).some((v) => meu.has(v));
}

/** Chegou mensagem do número da equipe: marca a hora (abre a janela de 24 h) e põe a conversa em Humano. True se era. */
export async function mensagemDaEquipe(telefone: string): Promise<boolean> {
  if (!(await ehDaEquipe(telefone))) return false;
  const e = (await lerWhatsappEquipe())!;
  await gravar({ ...e, ultimaMsgEm: new Date().toISOString() });
  await conversaDaEquipeEmHumano(e.telefone);
  return true;
}

export const graph = async (caminho: string, init?: RequestInit) => {
  const c = await lerConfigWhatsApp();
  if (!c.token || !c.wabaId) throw new Error("WhatsApp da loja não configurado (token ou WABA) em Configurações → API Oficial.");
  const versao = process.env.WHATSAPP_API_VERSAO || "v21.0";
  const r = await fetch(`https://graph.facebook.com/${versao}/${c.wabaId}${caminho}`, { ...init, headers: { Authorization: `Bearer ${c.token}`, "Content-Type": "application/json", ...(init?.headers ?? {}) } });
  const j = (await r.json().catch(() => ({}))) as Record<string, unknown> & { error?: { message?: string; error_user_msg?: string } };
  if (!r.ok) throw new Error(j.error?.error_user_msg ?? j.error?.message ?? `HTTP ${r.status}`);
  return j;
};

/** Situação do modelo na Meta: null (não existe), APPROVED, PENDING, REJECTED... */
export async function situacaoModeloRelatorio(): Promise<{ status: string; motivo: string | null } | null> {
  const j = (await graph(`/message_templates?name=${MODELO_RELATORIO.nome}&fields=name,status,language,rejected_reason`)) as { data?: { name: string; status: string; language: string; rejected_reason?: string }[] };
  const t = (j.data ?? []).find((x) => x.name === MODELO_RELATORIO.nome && x.language === MODELO_RELATORIO.idioma);
  return t ? { status: t.status, motivo: t.rejected_reason && t.rejected_reason !== "NONE" ? t.rejected_reason : null } : null;
}

/** Cria o modelo na Meta (o dono autorizou em 16/10/2026). Já existe: devolve a situação. */
export async function criarModeloRelatorio() {
  const ja = await situacaoModeloRelatorio();
  if (ja) return ja;
  const j = (await graph("/message_templates", { method: "POST", body: JSON.stringify(MODELO_RELATORIO.definicao) })) as { status?: string };
  return { status: j.status ?? "PENDING", motivo: null };
}

/** Manda o relatório para o WhatsApp do Milton: texto inteiro dentro da janela de 24 h, senão o modelo aprovado. */
export async function enviarRelatorioWhatsApp(r: ResumoRelatorio): Promise<{ ok: boolean; como: string; erro?: string }> {
  const e = await lerWhatsappEquipe();
  if (!e?.telefone) return { ok: false, como: "nenhum", erro: "número do WhatsApp não cadastrado" };
  const prov = await obterProvedor();
  if (prov.simulado) return { ok: false, como: "nenhum", erro: "WhatsApp da loja em modo simulado" };
  const janela = !!e.ultimaMsgEm && Date.now() - new Date(e.ultimaMsgEm).getTime() < 23.5 * 3_600_000;
  const res = janela
    ? await prov.enviar({ telefone: e.telefone, tipo: "texto", conteudo: textoRelatorioWhatsApp(e.nome, r) })
    : await prov.enviar({
        telefone: e.telefone,
        tipo: "texto",
        conteudo: null,
        modelo: { nome: MODELO_RELATORIO.nome, idioma: MODELO_RELATORIO.idioma, componentes: [{ type: "body", parameters: parametrosRelatorio(e.nome, r).map((text) => ({ type: "text", text })) }] },
      });
  const ok = res.status !== "failed";
  const como = janela ? "texto completo" : "modelo relatorio_manha";
  await gravar({ ...e, ultimoEnvio: { em: new Date().toISOString(), como, ok, externoId: res.externoId ?? null, ...(ok ? {} : { erro: res.erro ?? "falhou" }) } });
  return { ok, como, ...(ok ? {} : { erro: res.erro ?? "falhou" }) };
}

/** Entregue, lido ou recusado: a Meta avisa pelo webhook. O relatório não fica em conversa nenhuma, então sem isto a
 *  tela dizia "saiu" mesmo quando não chegava ao celular (dono, 20/10/2026: "o relatório não estava saindo"). */
export async function aplicarStatusRelatorio(externoId: string, status: "delivered" | "read" | "failed", erro?: string) {
  const e = await lerWhatsappEquipe();
  const u = e?.ultimoEnvio;
  if (!e || !u?.externoId || u.externoId !== externoId) return false;
  const entrega = status === "failed" ? "falhou" : status === "read" ? "lido" : "entregue";
  if (u.entrega === "lido" && entrega === "entregue") return true;
  await gravar({ ...e, ultimoEnvio: { ...u, entrega, ...(erro ? { erroEntrega: erro } : {}) } });
  return true;
}
