/* Regra do vigia do atendente (pedido do dono, 27/09/2026: "se o atendente esquecer de responder, a
   IA continua ou notifica"). Pura, sem banco, para os testes rodarem direto no Node. */

export type DecisaoVigia = "nada" | "avisar" | "assumir" | "responder_fechada";

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
