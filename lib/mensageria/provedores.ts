import "server-only";
import { randomUUID } from "node:crypto";
import type { PedidoEnvio, ProvedorMensagens, ResultadoEnvio } from "./tipos";
import { lerConfigWhatsApp, type ConfigWhatsApp } from "./whatsapp-config";
import { lerBytes } from "./midia";
import { mimeBase, vaiParaWhatsApp } from "./audio-formatos";

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

  private async subirMidia(m: NonNullable<PedidoEnvio["midia"]>): Promise<{ id: string } | { erro: string }> {
    const arq = await lerBytes(m.url);
    if (!arq) return { erro: "Arquivo não encontrado para envio." };
    const mime = m.mime ?? arq.mime;
    const form = new FormData();
    form.append("messaging_product", "whatsapp");
    form.append("type", mime);
    form.append("file", new Blob([new Uint8Array(arq.bytes)], { type: mime }), m.nome ?? "arquivo");
    const r = await fetch(`https://graph.facebook.com/${this.versao}/${this.cfg.phoneNumberId}/media`, { method: "POST", headers: { Authorization: `Bearer ${this.cfg.token}` }, body: form });
    const j = (await r.json().catch(() => ({}))) as { id?: string; error?: { message?: string } };
    if (!r.ok || !j.id) return { erro: j.error?.message ?? `Falha ao enviar o arquivo (HTTP ${r.status})` };
    return { id: j.id };
  }

  /** Baixa uma mídia recebida (a Meta manda só o id) e devolve os bytes. */
  async baixarMidia(mediaId: string): Promise<{ bytes: Buffer; mime: string } | null> {
    const h = { Authorization: `Bearer ${this.cfg.token}` };
    const meta = await fetch(`https://graph.facebook.com/${this.versao}/${mediaId}`, { headers: h });
    if (!meta.ok) return null;
    const { url, mime_type } = (await meta.json()) as { url?: string; mime_type?: string };
    if (!url) return null;
    const arq = await fetch(url, { headers: h });
    if (!arq.ok) return null;
    return { bytes: Buffer.from(await arq.arrayBuffer()), mime: mime_type ?? arq.headers.get("content-type") ?? "application/octet-stream" };
  }

  async enviar(pedido: PedidoEnvio): Promise<ResultadoEnvio> {
    if (!this.configurado()) return { externoId: null, status: "failed", erro: "WhatsApp Business não configurado" };
    const corpo: Record<string, unknown> = { messaging_product: "whatsapp", to: pedido.telefone };
    if (pedido.respostaAExternoId) corpo.context = { message_id: pedido.respostaAExternoId };
    if (pedido.tipo === "texto") Object.assign(corpo, { type: "text", text: { body: pedido.conteudo ?? "", preview_url: true } });
    else if (pedido.tipo === "audio" && pedido.midia) {
      if (!vaiParaWhatsApp(pedido.midia.mime ?? "")) return { externoId: null, status: "failed", erro: "Este formato de áudio não é aceito pelo WhatsApp." };
      const up = await this.subirMidia({ ...pedido.midia, mime: mimeBase(pedido.midia.mime ?? "") });
      if ("erro" in up) return { externoId: null, status: "failed", erro: up.erro };
      Object.assign(corpo, { type: "audio", audio: { id: up.id } });
    }
    else if ((pedido.tipo === "imagem" || pedido.tipo === "documento") && pedido.midia) {
      const up = await this.subirMidia(pedido.midia);
      if ("erro" in up) return { externoId: null, status: "failed", erro: up.erro };
      if (pedido.tipo === "imagem") Object.assign(corpo, { type: "image", image: { id: up.id, caption: pedido.conteudo ?? undefined } });
      else Object.assign(corpo, { type: "document", document: { id: up.id, filename: pedido.midia.nome ?? undefined, caption: pedido.conteudo ?? undefined } });
    }
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
  /* Modo de teste: nada sai para fora, mesmo que o banco tenha a API Oficial ativa. */
  if (process.env.MENSAGERIA_PROVEDOR === "teste") return new ProvedorSimulado();
  const cfg = await lerConfigWhatsApp();
  const ativo = cfg.ativo || process.env.MENSAGERIA_PROVEDOR === "whatsapp_cloud";
  const real = new ProvedorWhatsAppCloud(cfg);
  return ativo && real.configurado() ? real : new ProvedorSimulado();
}
