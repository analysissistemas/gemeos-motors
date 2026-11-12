import "server-only";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { normalizarTelefone } from "@/lib/mensageria/servico";
import { obterProvedor } from "@/lib/mensageria/provedores";
import { graph } from "./whatsapp-equipe";

/* Aviso do crédito da IA no WhatsApp (usuário, 12/11/2026: "quero que avise no meu WhatsApp, e do John — nós somos
   os programadores — e do Milton, que é o dono que faz o pagamento"). A recarga automática da OpenAI foi desligada
   nesse dia: sem este aviso a IA pararia sem ninguém saber.
   Os números ficam no banco (o repositório é público), em Minha conta → "Aviso do crédito da IA no WhatsApp".
   Fora da janela de 24 h a Meta só aceita modelo aprovado: vai o "aviso_credito_ia" (criado sozinho pelo vigia). Se o
   modelo ainda não foi aprovado, tenta em texto (só chega a quem escreveu para a loja nas últimas 24 h). */

const CHAVE = "avisos.credito_whatsapp";
export type EnvioCredito = { telefone: string; ok: boolean; como: string; erro?: string };
type Guardado = { telefones: string[]; ultimo: { em: string; frase: string; envios: EnvioCredito[] } | null };

export const MODELO_CREDITO = {
  nome: "aviso_credito_ia",
  idioma: "pt_BR",
  definicao: {
    name: "aviso_credito_ia",
    language: "pt_BR",
    category: "UTILITY",
    components: [
      {
        type: "BODY",
        text: "Aviso do sistema da Gêmeos Motors: {{1}}.\n\nPara recarregar: platform.openai.com, em Billing > Buy credits. Depois, informe o novo saldo na Visão geral do sistema.",
        example: { body_text: [["o crédito da IA está acabando (sobra US$ 0,80, cerca de 2 dias no ritmo atual)"]] },
      },
    ],
  },
} as const;

export async function lerAvisoCredito(): Promise<Guardado> {
  const [l] = await db.select({ valor: schema.configuracoes.valor }).from(schema.configuracoes).where(eq(schema.configuracoes.chave, CHAVE)).limit(1);
  return (l?.valor as Guardado) ?? { telefones: [], ultimo: null };
}
async function gravar(v: Guardado) {
  await db.insert(schema.configuracoes).values({ chave: CHAVE, valor: v }).onConflictDoUpdate({ target: schema.configuracoes.chave, set: { valor: v, atualizadoEm: new Date() } });
}

/** Números separados por vírgula, ponto e vírgula ou linha. Devolve os normalizados (sem repetir). */
export function lerListaTelefones(texto: string): { telefones: string[]; invalidos: string[] } {
  const partes = texto.split(/[\n,;]+/).map((p) => p.trim()).filter(Boolean);
  const telefones: string[] = [];
  const invalidos: string[] = [];
  for (const p of partes) {
    const d = p.replace(/\D/g, "");
    if (d.length < 10 || d.length > 13) invalidos.push(p);
    else {
      const t = normalizarTelefone(d);
      if (!telefones.includes(t)) telefones.push(t);
    }
  }
  return { telefones, invalidos };
}

export async function salvarTelefonesCredito(telefones: string[]) {
  const atual = await lerAvisoCredito();
  await gravar({ ...atual, telefones });
}

export async function situacaoModeloCredito(): Promise<{ status: string; motivo: string | null } | null> {
  const j = (await graph(`/message_templates?name=${MODELO_CREDITO.nome}&fields=name,status,language,rejected_reason`)) as { data?: { name: string; status: string; language: string; rejected_reason?: string }[] };
  const t = (j.data ?? []).find((x) => x.name === MODELO_CREDITO.nome && x.language === MODELO_CREDITO.idioma);
  return t ? { status: t.status, motivo: t.rejected_reason && t.rejected_reason !== "NONE" ? t.rejected_reason : null } : null;
}

export async function criarModeloCredito() {
  const ja = await situacaoModeloCredito();
  if (ja) return ja;
  const j = (await graph("/message_templates", { method: "POST", body: JSON.stringify(MODELO_CREDITO.definicao) })) as { status?: string };
  return { status: j.status ?? "PENDING", motivo: null };
}

/* O vigia chama a cada minuto; a Meta só é consultada de 6 em 6 h (e logo depois de o servidor subir). */
let ultimaChecagem = 0;
export async function garantirModeloCredito(agora = Date.now()) {
  if (agora - ultimaChecagem < 6 * 3_600_000) return null;
  ultimaChecagem = agora;
  if ((await obterProvedor()).simulado) return null;
  if ((await lerAvisoCredito()).telefones.length === 0) return null;
  return criarModeloCredito();
}

/** Manda o aviso para todos os números cadastrados: modelo aprovado; sem ele, texto (só chega dentro das 24 h). */
export async function enviarAvisoCreditoWhatsApp(frase: string): Promise<EnvioCredito[]> {
  const g = await lerAvisoCredito();
  if (!g.telefones.length) return [];
  const prov = await obterProvedor();
  if (prov.simulado) return g.telefones.map((telefone) => ({ telefone, ok: false, como: "nenhum", erro: "WhatsApp da loja em modo simulado" }));
  const modelo = await situacaoModeloCredito().catch(() => null);
  const aprovado = modelo?.status === "APPROVED";
  const texto = `Aviso do sistema da Gêmeos Motors: ${frase}.\n\nPara recarregar: platform.openai.com, em Billing > Buy credits. Depois, informe o novo saldo na Visão geral do sistema.`;
  const envios: EnvioCredito[] = [];
  for (const telefone of g.telefones) {
    try {
      const res = aprovado
        ? await prov.enviar({ telefone, tipo: "texto", conteudo: null, modelo: { nome: MODELO_CREDITO.nome, idioma: MODELO_CREDITO.idioma, componentes: [{ type: "body", parameters: [{ type: "text", text: frase }] }] } })
        : await prov.enviar({ telefone, tipo: "texto", conteudo: texto });
      const ok = res.status !== "failed";
      envios.push({ telefone, ok, como: aprovado ? "modelo aviso_credito_ia" : "texto (modelo ainda não aprovado)", ...(ok ? {} : { erro: res.erro ?? "falhou" }) });
    } catch (e) {
      envios.push({ telefone, ok: false, como: aprovado ? "modelo" : "texto", erro: e instanceof Error ? e.message : String(e) });
    }
  }
  await gravar({ ...g, ultimo: { em: new Date().toISOString(), frase, envios } });
  return envios;
}
