/* ============================================================
   MENSAGERIA — contrato entre o sistema e qualquer provedor
   ------------------------------------------------------------
   A tela e o serviço só conhecem estes tipos. O provedor (hoje o
   simulado, amanhã a Cloud API da Meta) só traduz de e para eles.

        MessagingService (lib/mensageria/servico.ts)
                │
                ├── ProvedorSimulado   ← ativo agora (MOCK)
                │
                └── ProvedorWhatsAppCloud  ← pronto, desligado até ter credencial

   Trocar de provedor = mudar MENSAGERIA_PROVEDOR. Nenhuma tela muda.
   ============================================================ */

import type { ModeloMensagem } from "./modelos";

export type TipoMensagem = "texto" | "imagem" | "video" | "documento" | "audio" | "localizacao" | "contato" | "sistema";
export type DirecaoMensagem = "incoming" | "outgoing" | "system";
export type StatusMensagem = "pending" | "sent" | "delivered" | "read" | "failed" | "received";

export type Midia = { url: string; nome?: string | null; mime?: string | null; tamanho?: number | null };

/** Mensagem que chegou do cliente, já traduzida do formato do provedor. */
export type MensagemEntrante = {
  canal: "whatsapp";
  provedor: string;
  telefone: string; // com DDI, só dígitos
  nomeContato?: string | null;
  externoId?: string | null;
  tipo: TipoMensagem;
  conteudo?: string | null;
  midia?: Midia | null;
  metadados?: Record<string, unknown>;
  demo?: boolean;
  /** mensagem do próprio chat que o cliente respondeu (id do provedor) */
  respostaAExternoId?: string | null;
};

export type PedidoEnvio = {
  telefone: string;
  tipo: TipoMensagem;
  conteudo?: string | null;
  midia?: Midia | null;
  respostaAExternoId?: string | null;
  /** modelo aprovado pela Meta (fora da janela de 24 h); `conteudo` é o texto já preenchido */
  modelo?: { nome: string; idioma: string; componentes: unknown[] } | null;
};

export type ResultadoEnvio = { externoId: string | null; status: "sent" | "failed"; erro?: string };

/** Mudança de status vinda do provedor (entregue, lida, falhou). */
export type AtualizacaoStatus = { externoId: string; status: "delivered" | "read" | "failed"; erro?: string };

export interface ProvedorMensagens {
  readonly id: "mock" | "whatsapp_cloud";
  readonly nome: string;
  /** true = ambiente de demonstração: a tela mostra "WhatsApp — Simulado". */
  readonly simulado: boolean;
  configurado(): boolean;
  enviar(pedido: PedidoEnvio): Promise<ResultadoEnvio>;
  /** Reação a uma mensagem (emoji vazio tira a reação). */
  reagir(telefone: string, externoId: string, emoji: string): Promise<{ ok: true } | { ok: false; erro: string }>;
  /** Modelos de mensagem aprovados pela Meta (lib/mensageria/modelos.ts). */
  listarModelos(): Promise<{ ok: true; modelos: ModeloMensagem[] } | { ok: false; erro: string }>;
}
