import "server-only";
import { eq } from "drizzle-orm";
import { db, schema, type Tx } from "@/lib/db";
import { obterProvedor } from "@/lib/mensageria/provedores";
import { lerControle } from "./controle";
import { montarPromptSistema } from "./prompt";
import { validarResposta, type Violacao } from "./validador";

export type ResultadoEnvioIa = { enviada: boolean; motivo: "sem_permissao" | "validador" | "falha_envio" | null; violacoes: Violacao[]; explicacao: string | null };

/* ============================================================
   ÚNICO CAMINHO PELO QUAL UMA RESPOSTA DA IA PODE CHEGAR AO CLIENTE
   chave geral ligada → permissão de envio → validador → envio.
   Qualquer etapa que falhe impede o envio. Toda tentativa, enviada ou
   bloqueada, fica registrada em ia_execucoes para consulta na Central de IA.
   Nenhum outro código deve chamar o provedor com texto escrito pela IA.
   ============================================================ */
export async function enviarRespostaDaIa(tx: Tx | typeof db, p: { conversaId: number; telefone: string; texto: string; origem: string }): Promise<ResultadoEnvioIa> {
  const controle = await lerControle();
  const validacao = validarResposta(p.texto, { promptSistema: await montarPromptSistema() });

  let motivo: ResultadoEnvioIa["motivo"] = null;
  let explicacao: string | null = null;
  let externoId: string | null = null;
  let statusEnvio: "sent" | "failed" = "sent";

  if (!controle.ligada || !controle.permissoes.enviarMensagem) {
    motivo = "sem_permissao";
    explicacao = "a IA não tem permissão de envio";
  } else if (!validacao.aprovada) {
    motivo = "validador";
    explicacao = `o validador reprovou (${validacao.violacoes.map((v) => v.rotulo.toLowerCase()).join("; ")})`;
  } else {
    const env = await (await obterProvedor()).enviar({ telefone: p.telefone, tipo: "texto", conteudo: p.texto });
    externoId = env.externoId;
    statusEnvio = env.status;
    if (env.status === "failed") {
      motivo = "falha_envio";
      explicacao = env.erro ?? "o WhatsApp recusou o envio";
    }
    await tx.insert(schema.mensagens).values({ conversaId: p.conversaId, direcao: "outgoing", autor: "ia", tipo: "texto", conteudo: p.texto, status: statusEnvio, externoId, metadados: env.erro ? { erro: env.erro } : undefined });
    await tx
      .update(schema.conversas)
      .set({ ultimaMensagemEm: new Date(), ultimaMensagemTexto: p.texto.slice(0, 160), ultimaMensagemDirecao: "outgoing" })
      .where(eq(schema.conversas.id, p.conversaId));
  }

  const enviada = motivo === null;
  await db.insert(schema.iaExecucoes).values({ conversaId: p.conversaId, origem: p.origem, texto: p.texto, aprovada: validacao.aprovada, enviada, motivo, violacoes: validacao.violacoes });
  return { enviada, motivo, violacoes: validacao.violacoes, explicacao };
}
