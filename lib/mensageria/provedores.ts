import "server-only";
import { randomUUID } from "node:crypto";
import type { PedidoEnvio, ProvedorMensagens, ResultadoEnvio } from "./tipos";
import { lerConfigWhatsApp, type ConfigWhatsApp } from "./whatsapp-config";
import { lerBytes } from "./midia";
import { MIME_OGG_OPUS, nomeOgg, paraOggOpus } from "./transcodificar";
import { camposDoTexto, converterModeloMeta, type ModeloMensagem, type ModeloMeta } from "./modelos";

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
  async reagir() {
    return { ok: true as const };
  }
  async digitando() {}
  /* no modo simulado não há conta da Meta: dois modelos de exemplo, só para a tela funcionar */
  async listarModelos() {
    const exemplo = (nome: string, corpo: string): ModeloMensagem => ({
      nome, idioma: "pt_BR", categoria: "MARKETING", cabecalho: null, corpo, rodape: "Gêmeos Motors", botoes: [],
      campos: camposDoTexto(corpo),
      suportado: true, motivo: null,
    });
    return {
      ok: true as const,
      modelos: [
        exemplo("simulado_retomar_contato", "Olá, {{1}}! Aqui é da Gêmeos Motors. Podemos continuar o seu atendimento por aqui?"),
        exemplo("simulado_interesse_modelo", "Oi, {{1}}! Passando para saber se você ainda tem interesse na {{2}}. Qualquer dúvida, é só responder."),
      ],
    };
  }
}

/* ============================================================
   PROVEDOR WHATSAPP CLOUD API (Meta)
   Só é usado quando a API Oficial está ATIVA em Configurações e o token e o
   ID do número estão salvos. Sem isso, o sistema continua no simulado e não
   finge conexão. (As variáveis WHATSAPP_* do ambiente ainda servem de reserva.)
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
    return this.subirBytes(arq.bytes, m.mime ?? arq.mime, m.nome ?? "arquivo");
  }

  private async subirBytes(bytes: Uint8Array, mime: string, nome: string): Promise<{ id: string } | { erro: string }> {
    const form = new FormData();
    form.append("messaging_product", "whatsapp");
    form.append("type", mime);
    form.append("file", new Blob([new Uint8Array(bytes)], { type: mime }), nome);
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
    if (pedido.modelo)
      Object.assign(corpo, { type: "template", template: { name: pedido.modelo.nome, language: { code: pedido.modelo.idioma }, components: pedido.modelo.componentes } });
    else if (pedido.tipo === "texto") Object.assign(corpo, { type: "text", text: { body: pedido.conteudo ?? "", preview_url: true } });
    else if (pedido.tipo === "audio" && pedido.midia) {
      /* Todo áudio vira OGG/Opus mono antes de subir: o MP4 fragmentado que o Chrome grava é
         aceito pela Meta mas não chega ao cliente. O arquivo guardado no chat não muda. */
      const arq = await lerBytes(pedido.midia.url);
      if (!arq) return { externoId: null, status: "failed", erro: "Arquivo de áudio não encontrado para envio." };
      let ogg: Buffer;
      try {
        ogg = await paraOggOpus(arq.bytes);
      } catch (e) {
        return { externoId: null, status: "failed", erro: `Não foi possível preparar o áudio para o WhatsApp: ${(e as Error).message}` };
      }
      const up = await this.subirBytes(ogg, MIME_OGG_OPUS, nomeOgg(pedido.midia.nome));
      if ("erro" in up) return { externoId: null, status: "failed", erro: up.erro };
      // voice: o cliente vê mensagem de voz (foto da loja com microfone), não arquivo de áudio com fone
      Object.assign(corpo, { type: "audio", audio: { id: up.id, voice: true } });
    }
    else if ((pedido.tipo === "imagem" || pedido.tipo === "documento" || pedido.tipo === "video") && (pedido.midia || pedido.arquivo)) {
      const up = pedido.arquivo ? await this.subirBytes(pedido.arquivo.bytes, pedido.arquivo.mime, pedido.arquivo.nome) : await this.subirMidia(pedido.midia!);
      if ("erro" in up) return { externoId: null, status: "failed", erro: up.erro };
      if (pedido.tipo === "imagem") Object.assign(corpo, { type: "image", image: { id: up.id, caption: pedido.conteudo ?? undefined } });
      /* vídeo: a Meta aceita MP4 (H.264 + AAC) até 16 MB */
      else if (pedido.tipo === "video") Object.assign(corpo, { type: "video", video: { id: up.id, caption: pedido.conteudo ?? undefined } });
      else Object.assign(corpo, { type: "document", document: { id: up.id, filename: pedido.midia?.nome ?? pedido.arquivo?.nome ?? undefined, caption: pedido.conteudo ?? undefined } });
    }
    else return { externoId: null, status: "failed", erro: `Tipo ${pedido.tipo} ainda não suportado no envio real` };

    const r = await fetch(`https://graph.facebook.com/${this.versao}/${this.cfg.phoneNumberId}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${this.cfg.token}`, "Content-Type": "application/json" },
      body: JSON.stringify(corpo),
    });
    const j = (await r.json().catch(() => ({}))) as { messages?: { id: string }[]; error?: { message?: string; code?: number } };
    if (!r.ok) return { externoId: null, status: "failed", erro: explicarErroMeta(j.error) ?? `HTTP ${r.status}` };
    return { externoId: j.messages?.[0]?.id ?? null, status: "sent" };
  }

  /** Três pontinhos "digitando…" para o cliente (some sozinho ao enviar a resposta ou em ~25 s)
      e a mensagem dele fica lida. Melhor esforço: erro aqui não atrapalha a resposta. */
  async digitando(externoIdDoCliente: string) {
    try {
      await fetch(`https://graph.facebook.com/${this.versao}/${this.cfg.phoneNumberId}/messages`, {
        method: "POST",
        headers: { Authorization: `Bearer ${this.cfg.token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ messaging_product: "whatsapp", status: "read", message_id: externoIdDoCliente, typing_indicator: { type: "text" } }),
        signal: AbortSignal.timeout(5000),
      });
    } catch {
      /* sem o sinal, a resposta sai do mesmo jeito */
    }
  }

  /** Modelos aprovados da conta do WhatsApp Business (WABA), todas as páginas. */
  async listarModelos() {
    if (!this.cfg.token) return { ok: false as const, erro: "WhatsApp Business não configurado." };
    if (!this.cfg.wabaId) return { ok: false as const, erro: "Falta o ID da conta do WhatsApp Business (WABA) em Configurações → API Oficial." };
    const modelos: ModeloMensagem[] = [];
    let url: string | null = `https://graph.facebook.com/${this.versao}/${this.cfg.wabaId}/message_templates?fields=name,language,status,category,components&limit=100`;
    for (let pagina = 0; url && pagina < 10; pagina++) {
      const r: Response = await fetch(url, { headers: { Authorization: `Bearer ${this.cfg.token}` } });
      const j = (await r.json().catch(() => ({}))) as { data?: ModeloMeta[]; paging?: { next?: string }; error?: { message?: string; code?: number } };
      if (!r.ok) return { ok: false as const, erro: explicarErroMeta(j.error) ?? `HTTP ${r.status}` };
      for (const m of j.data ?? []) {
        const c = converterModeloMeta(m);
        if (c) modelos.push(c);
      }
      url = j.paging?.next ?? null;
    }
    modelos.sort((a, b) => Number(b.suportado) - Number(a.suportado) || a.nome.localeCompare(b.nome));
    return { ok: true as const, modelos };
  }

  async reagir(telefone: string, externoId: string, emoji: string) {
    const r = await fetch(`https://graph.facebook.com/${this.versao}/${this.cfg.phoneNumberId}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${this.cfg.token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ messaging_product: "whatsapp", recipient_type: "individual", to: telefone, type: "reaction", reaction: { message_id: externoId, emoji } }),
    });
    if (r.ok) return { ok: true as const };
    const j = (await r.json().catch(() => ({}))) as { error?: { message?: string; code?: number } };
    return { ok: false as const, erro: explicarErroMeta(j.error) ?? `HTTP ${r.status}` };
  }
}

/* Os erros da Meta que a equipe mais vai ver, em português. */
function explicarErroMeta(e?: { message?: string; code?: number }) {
  if (!e) return null;
  if (e.code === 131047 || e.code === 470)
    return "Passaram mais de 24 horas desde a última mensagem do cliente. A Meta só deixa a loja escrever de novo com um modelo de mensagem aprovado, ou depois que o cliente mandar mensagem.";
  if (e.code === 190) return "A Meta recusou o token (Authentication Error). Confira o token em Configurações → API Oficial.";
  return e.message ?? null;
}

export async function obterProvedor(opcoes: { demo?: boolean } = {}): Promise<ProvedorMensagens> {
  /* Modo de teste: nada sai para fora, mesmo que o banco tenha a API Oficial ativa. */
  if (process.env.MENSAGERIA_PROVEDOR === "teste") return new ProvedorSimulado();
  /* conversa simulada (simulador do admin): NADA sai para o WhatsApp, com a API Oficial ligada ou não */
  if (opcoes.demo) return new ProvedorSimulado();
  const cfg = await lerConfigWhatsApp();
  const ativo = cfg.ativo || process.env.MENSAGERIA_PROVEDOR === "whatsapp_cloud";
  const real = new ProvedorWhatsAppCloud(cfg);
  return ativo && real.configurado() ? real : new ProvedorSimulado();
}
