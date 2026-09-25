import "server-only";
import { randomUUID } from "node:crypto";
import type { PedidoEnvio, ProvedorMensagens, ResultadoEnvio } from "./tipos";
import { lerConfigWhatsApp, type ConfigWhatsApp } from "./whatsapp-config";

/* ============================================================
   PROVEDOR SIMULADO (MOCK)
   Não fala com ninguém de fora. "Envia" na hora, e a entrega e a
   leitura são simuladas pelo serviço (simularAndamento), para a tela
   se comportar como um WhatsApp de verdade.
   ============================================================ */
export class ProvedorSimulado implements ProvedorMensagens {
  readonly id = "mock" as const;
  readonly nome = "WhatsApp — Simulado";
  readonly simulado = true;
  configurado() {
    return true;
  }
  async enviar(pedido: PedidoEnvio): Promise<ResultadoEnvio> {
    void pedido;
    return { externoId: `mock-${randomUUID()}`, status: "sent" };
  }
}

/* ============================================================
   PROVEDOR WHATSAPP CLOUD API (Meta)
   Só é usado quando a API Oficial está ATIVA em Configurações e o token e o
   ID do número estão salvos. Sem isso, o sistema continua no simulado e não
   finge conexão. (As variáveis WHATSAPP_* da Vercel ainda servem de reserva.)
   ============================================================ */
export class ProvedorWhatsAppCloud implements ProvedorMensagens {
  readonly id = "whatsapp_cloud" as const;
  readonly nome = "WhatsApp Business";
  readonly simulado = false;
  private versao = process.env.WHATSAPP_API_VERSAO || "v21.0";

  constructor(private cfg: ConfigWhatsApp) {}

  configurado() {
    return !!(this.cfg.token && this.cfg.phoneNumberId);
  }

  async enviar(pedido: PedidoEnvio): Promise<ResultadoEnvio> {
    if (!this.configurado()) return { externoId: null, status: "failed", erro: "WhatsApp Business não configurado" };
    const corpo: Record<string, unknown> = { messaging_product: "whatsapp", to: pedido.telefone };
    if (pedido.respostaAExternoId) corpo.context = { message_id: pedido.respostaAExternoId };
    if (pedido.tipo === "texto") Object.assign(corpo, { type: "text", text: { body: pedido.conteudo ?? "", preview_url: true } });
    else if (pedido.tipo === "imagem" && pedido.midia) Object.assign(corpo, { type: "image", image: { link: pedido.midia.url, caption: pedido.conteudo ?? undefined } });
    else if (pedido.tipo === "documento" && pedido.midia) Object.assign(corpo, { type: "document", document: { link: pedido.midia.url, filename: pedido.midia.nome ?? undefined, caption: pedido.conteudo ?? undefined } });
    else return { externoId: null, status: "failed", erro: `Tipo ${pedido.tipo} ainda não suportado no envio real` };

    const r = await fetch(`https://graph.facebook.com/${this.versao}/${this.cfg.phoneNumberId}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${this.cfg.token}`, "Content-Type": "application/json" },
      body: JSON.stringify(corpo),
    });
    const j = (await r.json().catch(() => ({}))) as { messages?: { id: string }[]; error?: { message?: string } };
    if (!r.ok) return { externoId: null, status: "failed", erro: j.error?.message ?? `HTTP ${r.status}` };
    return { externoId: j.messages?.[0]?.id ?? null, status: "sent" };
  }
}

export async function obterProvedor(): Promise<ProvedorMensagens> {
  const cfg = await lerConfigWhatsApp();
  const ativo = cfg.ativo || process.env.MENSAGERIA_PROVEDOR === "whatsapp_cloud";
  const real = new ProvedorWhatsAppCloud(cfg);
  return ativo && real.configurado() ? real : new ProvedorSimulado();
}
