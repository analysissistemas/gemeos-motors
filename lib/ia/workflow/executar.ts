import "server-only";
import { eq, lt, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { lerConfigWorkflow } from "./config";
import { LIGACOES } from "./grafo";
import { executarGrafo } from "./motor";
import { aoEsgotarTentativas, NOS_ATENDIMENTO, type CtxWorkflow } from "./nos";
import { RETENTATIVAS, resumirFalhas } from "./falhas";

/* ============================================================
   RODA O WORKFLOW DE ATENDIMENTO PARA UMA MENSAGEM
   Uma linha em ia_workflow_execucoes por mensagem recebida. A trilha é gravada
   a cada nó (noAtual = o nó rodando agora), então a aba Execuções mostra a
   execução andando e, no fim, onde parou e por quê. Nunca lança: erro vira
   status "erro" na própria execução.
   ============================================================ */
export async function rodarWorkflowAtendimento(p: { conversaId: number; mensagemId: number | null; gatilho: "whatsapp" | "teste"; simulado?: boolean }) {
  const config = await lerConfigWorkflow();
  const [linha] = await db
    .insert(schema.iaWorkflowExecucoes)
    .values({ conversaId: p.conversaId, mensagemId: p.mensagemId, gatilho: p.gatilho, noAtual: "gatilho" })
    .returning({ id: schema.iaWorkflowExecucoes.id, iniciadoEm: schema.iaWorkflowExecucoes.iniciadoEm });
  /* guarda 30 dias de execuções */
  await db.delete(schema.iaWorkflowExecucoes).where(lt(schema.iaWorkflowExecucoes.iniciadoEm, sql`now() - interval '30 days'`)).catch(() => {});

  const ctx: CtxWorkflow = {
    conversaId: p.conversaId,
    mensagemId: p.mensagemId,
    gatilho: p.gatilho,
    simulado: !!p.simulado,
    config,
    conversa: null,
    mensagem: null,
    textoEntrada: "",
    textoBuffer: "",
    primeiraDoBuffer: null,
    memoria: { historico: "", fatos: {}, resumo: null, limpaEm: null },
    pipe: null,
    aprendido: { fatos: {}, resumo: null },
    motivoTransferencia: null,
    saudacao: null,
    blocos: [],
    citar: -1,
    indice: 0,
    enviados: 0,
    midia: null,
    momento: null,
    intencao: null,
    aguardaEquipe: false,
    modeloDaConversa: null,
    ultimaDaLoja: "",
  };

  try {
    const fim = await executarGrafo({
      inicio: "gatilho",
      ligacoes: LIGACOES,
      nos: NOS_ATENDIMENTO,
      ctx,
      aoPasso: (passos, proximo) =>
        db.update(schema.iaWorkflowExecucoes).set({ passos, noAtual: proximo, falhas: resumirFalhas(passos) }).where(eq(schema.iaWorkflowExecucoes.id, linha.id)).then(() => {}),
      retentativas: RETENTATIVAS,
      /* enquanto tenta de novo, o motivo mostra a tentativa (a tela acompanha) */
      aoTentar: (no, t) =>
        db
          .update(schema.iaWorkflowExecucoes)
          .set({ noAtual: no, motivo: t.esperaMs != null ? `Tentativa ${t.n} falhou (${t.erro}). Tentando de novo em ${Math.round(t.esperaMs / 1000)} s.` : `Tentativa ${t.n} falhou (${t.erro}).` })
          .where(eq(schema.iaWorkflowExecucoes.id, linha.id))
          .then(() => {}),
      aoEsgotar: aoEsgotarTentativas,
    });
    await db
      .update(schema.iaWorkflowExecucoes)
      .set({ status: fim.status, noAtual: null, paradoEm: fim.status === "sucesso" ? null : fim.paradoEm, motivo: fim.motivo, passos: fim.passos, falhas: resumirFalhas(fim.passos), finalizadoEm: new Date(), duracaoMs: Date.now() - linha.iniciadoEm.getTime() })
      .where(eq(schema.iaWorkflowExecucoes.id, linha.id));
    return { id: linha.id, status: fim.status };
  } catch (e) {
    console.error("[workflow]", e);
    await db
      .update(schema.iaWorkflowExecucoes)
      .set({ status: "erro", noAtual: null, motivo: e instanceof Error ? e.message.slice(0, 300) : "erro", finalizadoEm: new Date(), duracaoMs: Date.now() - linha.iniciadoEm.getTime() })
      .where(eq(schema.iaWorkflowExecucoes.id, linha.id))
      .catch(() => {});
    return { id: linha.id, status: "erro" as const };
  }
}

export async function workflowAtivo() {
  return (await lerConfigWorkflow()).ativo;
}
