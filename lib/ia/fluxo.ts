/* ============================================================
   EXECUTOR DE FLUXO — a menor peça possível
   Um fluxo é só uma lista de etapas. Cada etapa é uma função com nome, que
   recebe o contexto e devolve o que mudou (ou encerra o fluxo). O executor:
   - roda as etapas em ordem;
   - registra a trilha (etapa, resultado, tempo) para auditoria;
   - se uma etapa quebrar, encerra o fluxo (falha fechada) e registra o erro.
   Não tem interface, configuração nem condicionais: quem decide é o código
   das etapas. Trocar uma etapa é trocar um item da lista.
   ============================================================ */

export type ResultadoEtapa<C> = {
  /** o que esta etapa mudou no contexto */
  ctx?: Partial<C>;
  /** presente = encerra o fluxo com este resultado final */
  encerrar?: string;
  /** frase curta para a trilha de auditoria (ex.: o motivo) */
  detalhe?: string;
};

export type Etapa<C> = { nome: string; rodar: (ctx: C) => Promise<ResultadoEtapa<C>> | ResultadoEtapa<C> };

export type PassoDaTrilha = { etapa: string; resultado: "seguiu" | "encerrou" | "erro"; detalhe?: string; ms: number };

export type ExecucaoDeFluxo<C> = { ctx: C; fim: string | null; encerradoEm: string | null; trilha: PassoDaTrilha[] };

export async function executarFluxo<C>(etapas: Etapa<C>[], inicial: C): Promise<ExecucaoDeFluxo<C>> {
  let ctx = inicial;
  const trilha: PassoDaTrilha[] = [];
  for (const e of etapas) {
    const t0 = Date.now();
    try {
      const r = await e.rodar(ctx);
      if (r.ctx) ctx = { ...ctx, ...r.ctx };
      trilha.push({ etapa: e.nome, resultado: r.encerrar ? "encerrou" : "seguiu", detalhe: r.detalhe ?? r.encerrar, ms: Date.now() - t0 });
      if (r.encerrar) return { ctx, fim: r.encerrar, encerradoEm: e.nome, trilha };
    } catch (erro) {
      trilha.push({ etapa: e.nome, resultado: "erro", detalhe: erro instanceof Error ? erro.message.slice(0, 200) : "erro desconhecido", ms: Date.now() - t0 });
      return { ctx, fim: "erro_etapa", encerradoEm: e.nome, trilha };
    }
  }
  return { ctx, fim: null, encerradoEm: null, trilha };
}
