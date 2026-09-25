import "server-only";
import { generateText, Output } from "ai";
import type { z } from "zod";
import { iaLigada } from "./controle";

/* ============================================================
   PORTA ÚNICA PARA A IA
   Toda chamada passa por aqui: modelo, limites e tradução de erro ficam
   num lugar só. Hoje o provedor é o AI Gateway da Vercel (autenticado
   pelo OIDC do próprio projeto); trocar de modelo é mudar IA_MODELO.

   Regra de ouro dos prompts deste sistema: a IA SÓ usa os dados que
   recebe. Quando falta informação, ela diz que falta — nunca completa.
   ============================================================ */
export const MODELO_IA = process.env.IA_MODELO || "anthropic/claude-sonnet-5";

export class IaIndisponivel extends Error {}

/* Chave geral: com a IA desligada, nenhuma chamada ao modelo acontece, para nada. */
async function exigirIaLigada() {
  if (!(await iaLigada())) throw new IaIndisponivel("A IA está desligada. Ligue em Inteligência artificial > Controle.");
}

function traduzirErro(e: unknown): IaIndisponivel {
  const texto = String((e as { message?: string })?.message ?? e);
  if (texto.includes("credit card") || texto.includes("customer_verification_required")) {
    return new IaIndisponivel("A IA ainda não está ativada: falta cadastrar o cartão no AI Gateway da Vercel para liberar os créditos.");
  }
  if (texto.includes("authentication") || texto.includes("OIDC") || texto.includes("API key")) {
    return new IaIndisponivel("A IA está sem credencial neste ambiente.");
  }
  if (texto.includes("aborted") || texto.includes("timeout")) {
    return new IaIndisponivel("A IA demorou demais para responder. Tente de novo.");
  }
  console.error("[ia]", e);
  return new IaIndisponivel("A IA não respondeu agora. Tente de novo em instantes.");
}

export async function gerarObjeto<S extends z.ZodType>(p: { schema: S; sistema: string; prompt: string; maxTokens?: number }): Promise<z.infer<S>> {
  await exigirIaLigada();
  try {
    const r = await generateText({
      model: MODELO_IA,
      system: p.sistema,
      prompt: p.prompt,
      output: Output.object({ schema: p.schema }),
      maxOutputTokens: p.maxTokens ?? 1800,
      timeout: 60_000,
      maxRetries: 1,
    });
    return r.output as z.infer<S>;
  } catch (e) {
    throw traduzirErro(e);
  }
}

/** Texto do atendimento em formato de transcrição, sem dados sensíveis. */
export function transcrever(msgs: { autor: string; conteudo: string | null; tipo: string; criadoEm: Date }[]) {
  return msgs
    .map((m) => {
      const quem = m.autor === "cliente" ? "CLIENTE" : m.autor === "ia" ? "ASSISTENTE VIRTUAL" : m.autor === "sistema" ? "SISTEMA" : "CONSULTOR";
      const corpo = m.tipo === "texto" || m.tipo === "sistema" ? m.conteudo : `[${m.tipo}${m.conteudo ? `: ${m.conteudo}` : ""}]`;
      return `${m.criadoEm.toISOString().slice(0, 16).replace("T", " ")} ${quem}: ${corpo ?? ""}`;
    })
    .join("\n");
}
