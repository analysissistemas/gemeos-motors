/* ============================================================
   MOTOR DO WORKFLOW (puro, sem banco e sem rede)
   Anda pelo grafo a partir do gatilho: roda o nó, grava o passo (entrada,
   saída, ramo, tempo) e segue a ligação do ramo que o nó escolheu. Sem ligação
   para o ramo = fim. Nó que quebra = fim com erro, e o passo mostra a mensagem.
   Quem persiste a trilha é `aoPasso` (executar.ts grava no banco a cada nó, então
   o painel vê a execução andando e sabe exatamente onde parou).
   ============================================================ */
import type { Ligacao, PassoExecucao, StatusExecucao } from "./grafo.ts";
import type { Tentativa } from "./falhas.ts";

export type ResultadoNo<C> = {
  /** ramo de saída; padrão "ok" */
  ramo?: string;
  ctx?: Partial<C>;
  entrada?: unknown;
  saida?: unknown;
  detalhe?: string;
  /** encerra aqui com este status (ex.: "parou" no buffer, "sucesso" no fim) */
  fim?: Exclude<StatusExecucao, "rodando" | "erro">;
};

/** info.ultima = esta é a última tentativa (o nó pode, por exemplo, gravar a falha só nela) */
export type ImplNo<C> = (ctx: C, info: { tentativa: number; ultima: boolean }) => Promise<ResultadoNo<C>> | ResultadoNo<C>;

export type FimExecucao<C> = { ctx: C; status: Exclude<StatusExecucao, "rodando">; paradoEm: string | null; motivo: string | null; passos: PassoExecucao[] };

const LIMITE_PASSOS = 300;

/** Corta textos e listas grandes para o registro não crescer demais. */
export function resumirDado(v: unknown, profundidade = 0): unknown {
  if (typeof v === "string") return v.length > 1500 ? `${v.slice(0, 1500)}… (+${v.length - 1500})` : v;
  if (v == null || typeof v !== "object") return v;
  if (v instanceof Date) return v.toISOString();
  if (profundidade > 4) return "…";
  if (Array.isArray(v)) return v.slice(0, 40).map((x) => resumirDado(x, profundidade + 1));
  return Object.fromEntries(Object.entries(v as Record<string, unknown>).slice(0, 40).map(([k, x]) => [k, resumirDado(x, profundidade + 1)]));
}

export async function executarGrafo<C>(p: {
  inicio: string;
  ligacoes: Ligacao[];
  nos: Record<string, ImplNo<C>>;
  ctx: C;
  aoPasso?: (passos: PassoExecucao[], proximo: string | null) => Promise<void> | void;
  /** esperas (ms) antes de cada nova tentativa, por nó; nó fora da lista não tenta de novo */
  retentativas?: Record<string, number[]>;
  /** avisa cada tentativa que falhou (a tela mostra "tentando de novo em X s") */
  aoTentar?: (no: string, t: Tentativa) => Promise<void> | void;
  /** esgotou as tentativas e o nó tem ligação "erro": ajusta o contexto para seguir por ela */
  aoEsgotar?: (no: string, erro: string, ctx: C) => Promise<Partial<C>> | Partial<C>;
  esperar?: (ms: number) => Promise<void>;
}): Promise<FimExecucao<C>> {
  const esperar = p.esperar ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  let ctx = p.ctx;
  let atual: string | null = p.inicio;
  const passos: PassoExecucao[] = [];
  const gravar = async (proximo: string | null) => {
    try {
      await p.aoPasso?.(passos, proximo);
    } catch {
      /* falha ao gravar a trilha não derruba o atendimento */
    }
  };

  while (atual) {
    if (passos.length >= LIMITE_PASSOS) return { ctx, status: "erro", paradoEm: atual, motivo: "Limite de passos atingido (laço no workflow)", passos };
    const impl: ImplNo<C> | undefined = p.nos[atual];
    const inicio = new Date();
    if (!impl) {
      passos.push({ no: atual, status: "erro", detalhe: "Nó sem implementação", inicio: inicio.toISOString(), ms: 0 });
      await gravar(null);
      return { ctx, status: "erro", paradoEm: atual, motivo: "Nó sem implementação", passos };
    }
    /* roda o nó; se quebrar e ele estiver em retentativas, espera e tenta de novo */
    const esperas: number[] = p.retentativas?.[atual] ?? [];
    const tentativas: Tentativa[] = [];
    let r: ResultadoNo<C> | null = null;
    let msg = "";
    for (let i = 0; ; i++) {
      try {
        r = await impl(ctx, { tentativa: i + 1, ultima: i >= esperas.length });
        break;
      } catch (e) {
        msg = e instanceof Error ? e.message.slice(0, 300) : "erro desconhecido";
        const espera = esperas[i] ?? null;
        const t: Tentativa = { n: i + 1, em: new Date().toISOString(), erro: msg, esperaMs: espera };
        tentativas.push(t);
        try {
          await p.aoTentar?.(atual, t);
        } catch {
          /* aviso é só informativo */
        }
        if (espera == null) break;
        await esperar(espera);
      }
    }
    const extra = tentativas.length ? { tentativas } : {};
    if (!r) {
      const saidaDeErro = p.ligacoes.find((l) => l.de === atual && l.ramo === "erro");
      if (saidaDeErro && p.aoEsgotar) {
        /* falhou todas as vezes, mas o desenho tem um caminho para isso (ex.: passar para humano) */
        ctx = { ...ctx, ...(await p.aoEsgotar(atual, msg, ctx)) };
        passos.push({ no: atual, status: "erro", ramo: "erro", detalhe: msg, inicio: inicio.toISOString(), ms: Date.now() - inicio.getTime(), ...extra });
        await gravar(saidaDeErro.para);
        atual = saidaDeErro.para;
        continue;
      }
      passos.push({ no: atual, status: "erro", detalhe: msg, inicio: inicio.toISOString(), ms: Date.now() - inicio.getTime(), ...extra });
      await gravar(null);
      return { ctx, status: "erro", paradoEm: atual, motivo: msg, passos };
    }
    if (r.ctx) ctx = { ...ctx, ...r.ctx };
    const ramo = r.ramo ?? "ok";
    const proximo: string | null = r.fim ? null : (p.ligacoes.find((l) => l.de === atual && l.ramo === ramo)?.para ?? null);
    passos.push({
      no: atual,
      status: r.fim === "parou" ? "parou" : "ok",
      ramo: r.fim ? undefined : ramo,
      detalhe: r.detalhe,
      entrada: resumirDado(r.entrada),
      saida: resumirDado(r.saida),
      inicio: inicio.toISOString(),
      ms: Date.now() - inicio.getTime(),
      ...extra,
    });
    await gravar(proximo);
    if (r.fim) return { ctx, status: r.fim, paradoEm: r.fim === "parou" ? atual : null, motivo: r.detalhe ?? null, passos };
    if (!proximo) return { ctx, status: "sucesso", paradoEm: null, motivo: null, passos };
    atual = proximo;
  }
  return { ctx, status: "sucesso", paradoEm: null, motivo: null, passos };
}
