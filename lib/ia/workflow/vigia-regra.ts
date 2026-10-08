/* Regra do vigia do atendente (pedido do dono, 27/09/2026: "se o atendente esquecer de responder, a
   IA continua ou notifica"). Pura, sem banco, para os testes rodarem direto no Node. */

export type DecisaoVigia = "nada" | "avisar" | "assumir" | "responder_fechada" | "tentar_de_novo";

/** Pedido do dono (27/09/2026): o cliente SEMPRE tem resposta, em qualquer horário. Se a IA devia ter
    respondido e nada saiu (servidor reiniciou no meio, falha da OpenAI, etc.), tenta de novo. */
export const ESPERA_NOVA_TENTATIVA_MIN = 3;
export const MAX_TENTATIVAS = 3;

export function decidirNovaTentativa(p: {
  iaPodeResponder: boolean;
  /** minutos desde a última mensagem do cliente sem resposta */
  esperaMin: number;
  /** tentativas do vigia para esta mensagem e minutos desde a última delas (null = nenhuma) */
  tentativas: number;
  minDesdeTentativa: number | null;
}): boolean {
  if (!p.iaPodeResponder || p.tentativas >= MAX_TENTATIVAS) return false;
  if (p.minDesdeTentativa !== null) return p.minDesdeTentativa >= ESPERA_NOVA_TENTATIVA_MIN;
  return p.esperaMin >= ESPERA_NOVA_TENTATIVA_MIN;
}

export function decidirVigia(p: {
  /** minutos desde a primeira mensagem do cliente sem resposta */
  esperaMin: number;
  lojaAberta: boolean;
  /** IA ligada (Controle) E workflow ligado */
  iaPodeResponder: boolean;
  avisoMin: number;
  /** 0 = a IA nunca assume */
  assumeMin: number;
  jaAvisado: boolean;
  /** o vigia já mandou a IA responder esta mensagem com a loja fechada */
  jaRespondidaFechada: boolean;
}): DecisaoVigia {
  /* loja fechada: ninguém vai responder, a IA responde (uma vez por mensagem) */
  if (!p.lojaAberta) return p.iaPodeResponder && !p.jaRespondidaFechada ? "responder_fechada" : "nada";
  if (p.assumeMin > 0 && p.esperaMin >= p.assumeMin && p.iaPodeResponder) return "assumir";
  if (p.esperaMin >= p.avisoMin && !p.jaAvisado) return "avisar";
  return "nada";
}

/** Token da rota interna do vigia: só quem tem o SESSION_SECRET (o próprio servidor) chama. */
export async function tokenDoVigia(segredo: string) {
  const { createHash } = await import("node:crypto");
  return createHash("sha256").update(`vigia-atendente:${segredo}`).digest("hex");
}

/** Tarefa que a IA prometeu ao cliente (simulação, entrega) e ninguém da equipe respondeu (Beatriz, 07/10/2026:
    pediu a simulação em 20x às 16h25 e ficou sem resposta). Com a loja aberta, depois de COBRAR_TAREFA_MIN, avisa a
    equipe na conversa uma vez e sobe a prioridade. */
export const COBRAR_TAREFA_MIN = 10;
export function deveCobrarTarefa(p: { lojaAberta: boolean; minDesdeCriada: number; jaCobrada: boolean; equipeRespondeuDepois: boolean }): boolean {
  return p.lojaAberta && !p.jaCobrada && !p.equipeRespondeuDepois && p.minDesdeCriada >= COBRAR_TAREFA_MIN;
}
