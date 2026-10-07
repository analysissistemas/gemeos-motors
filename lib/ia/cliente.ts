import "server-only";
import { generateText, Output } from "ai";
import { openai } from "@ai-sdk/openai";
import { z } from "zod";
import { iaLigada } from "./controle";

/* ============================================================
   PORTA ÚNICA PARA A IA
   Toda chamada passa por aqui: modelo, limites e tradução de erro ficam
   num lugar só. Com OPENAI_API_KEY no ambiente (EasyPanel → Ambiente), fala
   direto com a OpenAI (modelo IA_MODELO, padrão gpt-4.1-mini). Sem a chave,
   cai no AI Gateway da Vercel (que não é mais usado desde a saída da Vercel).

   Regra de ouro dos prompts deste sistema: a IA SÓ usa os dados que
   recebe. Quando falta informação, ela diz que falta — nunca completa.
   ============================================================ */
const COM_OPENAI = !!process.env.OPENAI_API_KEY;
const NOME_OPENAI = process.env.IA_MODELO || "gpt-4.1-mini";
/** Nome do modelo em uso (aparece nos registros e em Configurações). */
export const MODELO_IA = COM_OPENAI ? `openai/${NOME_OPENAI}` : process.env.IA_MODELO || "anthropic/claude-sonnet-5";
const modelo = () => (COM_OPENAI ? openai(NOME_OPENAI) : MODELO_IA);

export class IaIndisponivel extends Error {}

/* Chave geral: com a IA desligada, nenhuma chamada ao modelo acontece, para nada. */
async function exigirIaLigada() {
  if (!(await iaLigada())) throw new IaIndisponivel("A IA está desligada. Ligue em Inteligência artificial > Controle.");
}

function traduzirErro(e: unknown): IaIndisponivel {
  const texto = String((e as { message?: string })?.message ?? e);
  if (texto.includes("insufficient_quota") || texto.includes("exceeded your current quota")) {
    return new IaIndisponivel("A conta da OpenAI está sem crédito. Coloque crédito em platform.openai.com → Billing.");
  }
  if (texto.includes("Incorrect API key") || texto.includes("invalid_api_key")) {
    return new IaIndisponivel("A chave da OpenAI (OPENAI_API_KEY) foi recusada. Confira a chave no EasyPanel → Ambiente.");
  }
  if (texto.includes("credit card") || texto.includes("customer_verification_required")) {
    return new IaIndisponivel("A IA ainda não está ativada: falta cadastrar o cartão no AI Gateway da Vercel para liberar os créditos.");
  }
  if (texto.includes("authentication") || texto.includes("OIDC") || texto.includes("API key")) {
    return new IaIndisponivel("A IA está sem credencial neste ambiente.");
  }
  if (texto.includes("aborted") || texto.includes("timeout")) {
    return new IaIndisponivel("A IA demorou demais para responder. Tente de novo.");
  }
  if (/\b429\b|rate.?limit|too many requests/i.test(texto)) {
    return new IaIndisponivel("A OpenAI recusou por limite de chamadas (muitas ao mesmo tempo). Tente de novo em instantes.");
  }
  if (/fetch failed|ECONN|ENOTFOUND|EAI_AGAIN|socket/i.test(texto)) {
    return new IaIndisponivel("Falha de conexão com a OpenAI.");
  }
  console.error("[ia]", e);
  return new IaIndisponivel(`A IA não respondeu agora (${texto.slice(0, 160)}).`);
}

export async function gerarObjeto<S extends z.ZodType>(p: { schema: S; sistema: string; prompt: string; maxTokens?: number }): Promise<z.infer<S>> {
  await exigirIaLigada();
  try {
    const r = await generateText({
      model: modelo(),
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

/* ---------------- mídia do cliente (workflow de atendimento) ---------------- */
const PEDIDOS_MIDIA = {
  imagem: "Descreva esta imagem em português do Brasil, em até 4 frases, com foco no que importa para uma loja de motos e carros (veículo, modelo, estado, documento). Não invente o que não dá para ver.",
  documento: "Resuma os dados deste documento em português do Brasil, em até 6 linhas. Não invente o que não está escrito.",
} as const;

/** Áudio vira texto; imagem e PDF viram descrição. Só com a chave da OpenAI no ambiente. */
export async function analisarMidia(tipo: "audio" | "imagem" | "documento", bytes: Buffer, mime: string): Promise<string> {
  await exigirIaLigada();
  if (!COM_OPENAI) throw new IaIndisponivel("Análise de mídia precisa da OPENAI_API_KEY no ambiente.");
  try {
    if (tipo === "audio") {
      const { experimental_transcribe } = await import("ai");
      const r = await experimental_transcribe({ model: openai.transcription("gpt-4o-mini-transcribe"), audio: bytes, providerOptions: { openai: { language: "pt" } }, abortSignal: AbortSignal.timeout(60_000) });
      return r.text.trim();
    }
    const parte = tipo === "imagem" ? { type: "image" as const, image: bytes, mediaType: mime } : { type: "file" as const, data: bytes, mediaType: mime || "application/pdf", filename: "documento.pdf" };
    const r = await generateText({
      model: modelo(),
      messages: [{ role: "user", content: [{ type: "text", text: PEDIDOS_MIDIA[tipo] }, parte] }],
      maxOutputTokens: 500,
      timeout: 60_000,
      maxRetries: 1,
    });
    return r.text.trim();
  } catch (e) {
    throw traduzirErro(e);
  }
}

/* Foto de moto que o cliente mandou: qual moto do ESTOQUE é a mais parecida (06/10/2026). Compara a foto do cliente
   com uma foto de cada moto disponível e devolve o nome de uma delas, ou null se nenhuma se parece de verdade. */
const SchemaParecida = z.object({ modelo: z.string().nullable(), confianca: z.enum(["alta", "media", "baixa"]), motivo: z.string() });
export async function motoParecidaComFoto(foto: { bytes: Buffer; mime: string }, candidatas: { nome: string; bytes: Buffer; mime: string }[]): Promise<{ modelo: string; confianca: "alta" | "media"; motivo: string } | null> {
  if (!candidatas.length) return null;
  await exigirIaLigada();
  if (!COM_OPENAI) throw new IaIndisponivel("Comparar foto precisa da OPENAI_API_KEY no ambiente.");
  const nomes = candidatas.map((c) => c.nome);
  try {
    const r = await generateText({
      model: modelo(),
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: `A PRIMEIRA imagem é uma foto que um cliente mandou numa loja de motos elétricas. As imagens seguintes são as motos que a loja tem em estoque, cada uma com o nome antes dela. Diga qual moto do estoque é a MAIS PARECIDA com a da foto do cliente (formato, tamanho dos pneus, quadro, farol, banco, proporções; ignore cor, fundo e acessórios). Se a foto não for de uma moto ou patinete, ou se nenhuma do estoque se parecer de verdade, devolva modelo null e confianca baixa. Nomes possíveis: ${nomes.join(", ")}. Responda o nome exatamente como está na lista, e o motivo em uma frase simples, sem inventar.` },
            { type: "image", image: foto.bytes, mediaType: foto.mime },
            ...candidatas.flatMap((c) => [{ type: "text" as const, text: `Moto do estoque: ${c.nome}` }, { type: "image" as const, image: c.bytes, mediaType: c.mime }]),
          ],
        },
      ],
      output: Output.object({ schema: SchemaParecida }),
      maxOutputTokens: 300,
      timeout: 60_000,
      maxRetries: 1,
    });
    const o = r.output as z.infer<typeof SchemaParecida>;
    const nome = nomes.find((n) => n.toLowerCase() === (o.modelo ?? "").trim().toLowerCase());
    if (!nome || o.confianca === "baixa") return null;
    return { modelo: nome, confianca: o.confianca, motivo: o.motivo };
  } catch (e) {
    throw traduzirErro(e);
  }
}
