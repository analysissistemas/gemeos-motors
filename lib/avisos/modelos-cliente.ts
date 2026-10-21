import "server-only";
import { definicaoParaMeta, MODELOS_DO_CLIENTE } from "@/lib/ia/contato-do-dia";
import { graph } from "./whatsapp-equipe";

/* Modelos da Meta para falar com o cliente no dia combinado fora da janela de 24 h (dono, 20/10/2026: "disparar
   automaticamente"): confirmar_visita ("talvez sábado", visita sem hora) e lembrete_visita (visita/test drive com hora).
   Criados sozinhos pelo sistema (garantirModelosCliente, abaixo); o botão em Minha conta cria na hora. O envio está em lib/ia/workflow/aquecimento.ts (enviarLembretesRetirada). */

export type SituacaoModelo = { nome: string; status: string | null; motivo: string | null };

/** Situação de cada modelo na Meta: status null = ainda não criado. */
export async function situacaoModelosCliente(): Promise<SituacaoModelo[]> {
  const j = (await graph(`/message_templates?fields=name,status,language,rejected_reason&limit=200`)) as { data?: { name: string; status: string; language: string; rejected_reason?: string }[] };
  return MODELOS_DO_CLIENTE.map((m) => {
    const t = (j.data ?? []).find((x) => x.name === m.nome && x.language === m.idioma);
    return { nome: m.nome, status: t?.status ?? null, motivo: t?.rejected_reason && t.rejected_reason !== "NONE" ? t.rejected_reason : null };
  });
}

/** Cria na Meta os que ainda não existem (o dono autorizou em 20/10/2026). */
export async function criarModelosCliente(): Promise<SituacaoModelo[]> {
  const atuais = await situacaoModelosCliente();
  for (const m of MODELOS_DO_CLIENTE) {
    if (atuais.find((a) => a.nome === m.nome)?.status) continue;
    await graph("/message_templates", { method: "POST", body: JSON.stringify(definicaoParaMeta(m)) });
  }
  return situacaoModelosCliente();
}

/* Criação automática (dono, 20/10/2026: "quero que esses modelos sejam criados no automático"): o vigia chama a cada
   minuto, mas a Meta só é consultada de 6 em 6 h (e logo depois de o servidor subir). Só com o WhatsApp real ligado;
   modelo recusado pela Meta não é reenviado sozinho (aparece em Minha conta com o motivo). */
let ultimaChecagem = 0;
export async function garantirModelosCliente(agora = Date.now()) {
  if (agora - ultimaChecagem < 6 * 3_600_000) return null;
  ultimaChecagem = agora;
  const { obterProvedor } = await import("@/lib/mensageria/provedores");
  if ((await obterProvedor()).simulado) return null;
  const antes = await situacaoModelosCliente();
  if (antes.every((m) => m.status)) return antes;
  const depois = await criarModelosCliente();
  const { registrarLog } = await import("@/lib/logs");
  await registrarLog(null, { acao: "avisos.modelo", entidade: "configuracao", entidadeId: 0, descricao: `Criou sozinho os modelos de lembrete ao cliente na Meta (${depois.map((m) => `${m.nome}: ${m.status ?? "não criado"}`).join(", ")})` });
  return depois;
}
