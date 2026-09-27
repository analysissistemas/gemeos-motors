"use client";
import { useRef, useState } from "react";
import { Bot, Brain, Database, Flag, GitBranch, Maximize2, Paperclip, Send, ShieldCheck, Split, Timer, Webhook, Wrench, ZoomIn, ZoomOut, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";
import { LIGACOES, NOS, ROTULOS_RAMO, type CategoriaNo, type PassoExecucao } from "@/lib/ia/workflow/grafo";

/* ============================================================
   DESENHO DO WORKFLOW (como no n8n)
   Caixas = nós, linhas = ligações, rótulo = ramo. Com uma execução
   selecionada, pinta o caminho que ela percorreu: verde (passou),
   amarelo (parou aqui), vermelho (erro), azul pulsando (rodando agora).
   Arraste para mover; use os botões para aproximar.
   ============================================================ */

const W = 196;
const H = 66;
const PAD = 40;

export const CATEGORIAS: Record<CategoriaNo, { cor: string; icone: LucideIcon; rotulo: string }> = {
  gatilho: { cor: "#f5b400", icone: Webhook, rotulo: "Gatilho" },
  dados: { cor: "#64748b", icone: Database, rotulo: "Dados" },
  logica: { cor: "#8b5cf6", icone: GitBranch, rotulo: "Lógica" },
  midia: { cor: "#0ea5e9", icone: Paperclip, rotulo: "Mídia" },
  buffer: { cor: "#f97316", icone: Timer, rotulo: "Buffer" },
  memoria: { cor: "#10b981", icone: Brain, rotulo: "Memória" },
  ia: { cor: "#ec4899", icone: Bot, rotulo: "IA" },
  ferramenta: { cor: "#a855f7", icone: Wrench, rotulo: "Ferramenta" },
  seguranca: { cor: "#ef4444", icone: ShieldCheck, rotulo: "Segurança" },
  roteamento: { cor: "#3b82f6", icone: Split, rotulo: "Roteamento" },
  envio: { cor: "#22c55e", icone: Send, rotulo: "Envio" },
  fim: { cor: "#94a3b8", icone: Flag, rotulo: "Fim" },
};

const COR_STATUS = { ok: "#16a34a", recuperou: "#fb923c", parou: "#f59e0b", erro: "#dc2626", rodando: "#3b82f6" } as const;
type EstadoNo = keyof typeof COR_STATUS;

const largura = Math.max(...NOS.map((n) => n.x)) + W + PAD * 2;
const altura = Math.max(...NOS.map((n) => n.y)) + H + PAD * 2;
const pos = (id: string) => {
  const n = NOS.find((x) => x.id === id)!;
  return { x: n.x + PAD, y: n.y + PAD, aux: !!n.auxiliarDe };
};

function caminho(de: string, para: string) {
  const a = pos(de);
  const b = pos(para);
  if (a.aux) {
    /* auxiliar (modelo, prompt, ferramentas) sobe até o agente */
    const sx = a.x + W / 2, sy = a.y, tx = b.x + W / 2, ty = b.y + H;
    return { d: `M ${sx} ${sy} C ${sx} ${sy - 40}, ${tx} ${ty + 40}, ${tx} ${ty}`, mx: (sx + tx) / 2, my: (sy + ty) / 2 };
  }
  const sx = a.x + W, sy = a.y + H / 2, tx = b.x, ty = b.y + H / 2;
  if (tx > sx) {
    const dx = Math.max(40, (tx - sx) / 2);
    const c1 = [sx + dx, sy], c2 = [tx - dx, ty];
    const mx = 0.125 * sx + 0.375 * c1[0] + 0.375 * c2[0] + 0.125 * tx;
    const my = 0.125 * sy + 0.375 * c1[1] + 0.375 * c2[1] + 0.125 * ty;
    return { d: `M ${sx} ${sy} C ${c1[0]} ${c1[1]}, ${c2[0]} ${c2[1]}, ${tx} ${ty}`, mx, my };
  }
  /* ligação que volta (laço do envio, volta para IA OFF): passa por baixo */
  const baixo = Math.max(sy, ty) + H + 30;
  return { d: `M ${sx} ${sy} C ${sx + 90} ${baixo}, ${tx - 90} ${baixo}, ${tx} ${ty}`, mx: (sx + tx) / 2, my: baixo - 22 };
}

export type Destaque = { nos: Map<string, EstadoNo>; ligacoes: Set<string> };

/** Transforma os passos de uma execução no que o desenho acende. */
export function destaqueDaExecucao(passos: PassoExecucao[], noAtual: string | null): Destaque {
  const nos = new Map<string, EstadoNo>();
  const ligacoes = new Set<string>();
  for (const p of passos) {
    nos.set(p.no, p.status === "erro" ? "erro" : p.status === "parou" ? "parou" : p.tentativas?.length ? "recuperou" : "ok");
    if (p.ramo) {
      const l = LIGACOES.find((x) => x.de === p.no && x.ramo === p.ramo);
      if (l) ligacoes.add(`${l.de}>${l.para}:${l.ramo}`);
    }
    const ferramentas = (p.saida as { ferramentas?: string[] } | undefined)?.ferramentas;
    if (p.no === "agente" && Array.isArray(ferramentas))
      for (const f of ferramentas) {
        nos.set(f, "ok");
        ligacoes.add(`${f}>agente:${LIGACOES.find((x) => x.de === f)?.ramo}`);
      }
  }
  if (noAtual) nos.set(noAtual, "rodando");
  return { nos, ligacoes };
}

export function Canvas({ destaque, selecionado, aoSelecionar, className }: { destaque?: Destaque; selecionado?: string | null; aoSelecionar?: (id: string) => void; className?: string }) {
  const [zoom, setZoom] = useState(0.62);
  const caixa = useRef<HTMLDivElement>(null);
  const arrasto = useRef<{ x: number; y: number; l: number; t: number; moveu: boolean } | null>(null);
  const acesaAlguma = !!destaque && destaque.nos.size > 0;

  return (
    <div className={cn("relative overflow-hidden rounded-2xl border border-linha bg-fundo", className)}>
      <div className="absolute right-2 top-2 z-10 flex gap-1 rounded-full border border-linha bg-superficie p-1 shadow-sm">
        <button type="button" aria-label="Afastar" className="rounded-full p-1.5 text-ink-2 hover:bg-trilho" onClick={() => setZoom((z) => Math.max(0.3, +(z - 0.1).toFixed(2)))}>
          <ZoomOut className="size-4" />
        </button>
        <button type="button" aria-label="Aproximar" className="rounded-full p-1.5 text-ink-2 hover:bg-trilho" onClick={() => setZoom((z) => Math.min(1.3, +(z + 0.1).toFixed(2)))}>
          <ZoomIn className="size-4" />
        </button>
        <button type="button" aria-label="Ver tudo" className="rounded-full p-1.5 text-ink-2 hover:bg-trilho" onClick={() => caixa.current && setZoom(Math.max(0.3, +(caixa.current.clientWidth / largura).toFixed(2)))}>
          <Maximize2 className="size-4" />
        </button>
      </div>
      <div
        ref={caixa}
        className="rolagem-fina h-full cursor-grab overflow-auto active:cursor-grabbing"
        style={{ backgroundImage: "radial-gradient(color-mix(in oklab, var(--ink) 14%, transparent) 1px, transparent 1px)", backgroundSize: `${22 * zoom}px ${22 * zoom}px` }}
        onPointerDown={(e) => {
          if (e.button !== 0 || !caixa.current) return;
          arrasto.current = { x: e.clientX, y: e.clientY, l: caixa.current.scrollLeft, t: caixa.current.scrollTop, moveu: false };
        }}
        onPointerMove={(e) => {
          const a = arrasto.current;
          if (!a || !caixa.current) return;
          if (Math.abs(e.clientX - a.x) + Math.abs(e.clientY - a.y) > 4) a.moveu = true;
          caixa.current.scrollLeft = a.l - (e.clientX - a.x);
          caixa.current.scrollTop = a.t - (e.clientY - a.y);
        }}
        onPointerUp={() => setTimeout(() => (arrasto.current = null))}
        onPointerLeave={() => (arrasto.current = null)}
      >
        <div style={{ width: largura * zoom, height: altura * zoom }}>
          <div className="relative origin-top-left" style={{ width: largura, height: altura, transform: `scale(${zoom})` }}>
            <svg width={largura} height={altura} className="absolute inset-0" aria-hidden>
              <defs>
                <marker id="seta" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                  <path d="M 0 0 L 10 5 L 0 10 z" fill="context-stroke" />
                </marker>
              </defs>
              {LIGACOES.map((l) => {
                const { d, mx, my } = caminho(l.de, l.para);
                const chave = `${l.de}>${l.para}:${l.ramo}`;
                const acesa = destaque?.ligacoes.has(chave);
                const aux = pos(l.de).aux;
                const rotulo = !aux && l.ramo !== "ok" ? (ROTULOS_RAMO[l.ramo] ?? l.ramo) : null;
                const cor = acesa ? COR_STATUS.ok : "color-mix(in oklab, var(--ink) 30%, transparent)";
                return (
                  <g key={chave} opacity={acesaAlguma && !acesa ? 0.35 : 1}>
                    <path d={d} fill="none" stroke={cor} strokeWidth={acesa ? 3 : 1.6} strokeDasharray={aux ? "5 5" : undefined} markerEnd={aux ? undefined : "url(#seta)"} />
                    {rotulo && (
                      <g transform={`translate(${mx}, ${my})`}>
                        <rect x={-rotulo.length * 3.6 - 8} y={-10} width={rotulo.length * 7.2 + 16} height={20} rx={10} fill="var(--superficie)" stroke={cor} strokeWidth={1} />
                        <text textAnchor="middle" dy={4} fontSize={11} fill="var(--ink)" fontWeight={600}>
                          {rotulo}
                        </text>
                      </g>
                    )}
                  </g>
                );
              })}
            </svg>
            {NOS.map((n) => {
              const cat = CATEGORIAS[n.categoria];
              const Icone = cat.icone;
              const estado = destaque?.nos.get(n.id);
              const p = pos(n.id);
              const apagado = acesaAlguma && !estado;
              return (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => !arrasto.current?.moveu && aoSelecionar?.(n.id)}
                  className={cn(
                    "absolute flex items-center gap-2.5 rounded-2xl border-2 bg-superficie px-2.5 text-left shadow-sm transition hover:shadow-md",
                    n.auxiliarDe && "rounded-full",
                    selecionado === n.id && "ring-4 ring-[color-mix(in_oklab,var(--ink)_25%,transparent)]",
                    apagado && "opacity-40",
                    estado === "rodando" && "animate-pulse",
                  )}
                  style={{ left: p.x, top: p.y, width: W, height: n.auxiliarDe ? H - 18 : H, borderColor: estado ? COR_STATUS[estado] : `color-mix(in oklab, ${cat.cor} 55%, transparent)` }}
                  title={n.descricao}
                >
                  <span className="grid size-9 shrink-0 place-items-center rounded-xl text-white" style={{ background: cat.cor }}>
                    <Icone className="size-[18px]" />
                  </span>
                  <span className="min-w-0">
                    <span className="line-clamp-2 text-[12.5px] font-semibold leading-tight text-ink">{n.nome}</span>
                    {!n.auxiliarDe && <span className="block text-[10.5px] uppercase tracking-wide text-ink-3">{cat.rotulo}</span>}
                  </span>
                  {estado && estado !== "rodando" && <span className="absolute -right-2 -top-2 size-4 rounded-full border-2 border-superficie" style={{ background: COR_STATUS[estado] }} />}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

export function LegendaStatus() {
  const itens: [EstadoNo, string][] = [
    ["ok", "passou"],
    ["recuperou", "falhou e deu certo tentando de novo"],
    ["parou", "parou aqui"],
    ["erro", "erro"],
    ["rodando", "rodando agora"],
  ];
  return (
    <div className="flex flex-wrap gap-3 text-[12px] text-ink-3">
      {itens.map(([k, r]) => (
        <span key={k} className="inline-flex items-center gap-1.5">
          <span className="size-2.5 rounded-full" style={{ background: COR_STATUS[k] }} />
          {r}
        </span>
      ))}
    </div>
  );
}
