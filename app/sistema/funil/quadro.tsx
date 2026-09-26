"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  pointerWithin,
  type DragEndEvent,
} from "@dnd-kit/core";
import { Bot, Clock, Plus, Repeat, Search, Sparkles } from "lucide-react";
import type { CardNegocio, DetalheNegocio } from "@/lib/consultas/funil";
import { ETAPAS, ORIGENS, STATUS_VENDA, type Etapa } from "@/lib/dominio";
import { brl, diasDesde, iniciais, relativo, tempoDesde } from "@/lib/formato";
import { cn } from "@/lib/cn";
import { CabecalhoPagina, Selo } from "@/components/ui/basicos";
import { Botao } from "@/components/ui/botao";
import { DialogoPerda } from "@/components/negocios/dialogo-perda";
import { DialogoFecharVenda } from "@/components/negocios/dialogo-fechar-venda";
import { FormularioNegocio, negocioVazio, type NegocioForm } from "@/components/negocios/formulario-negocio";
import { DetalheNegocioGaveta } from "@/components/negocios/detalhe-negocio";
import { acaoMoverNegocio } from "./acoes";

type Alvo = { id: number; cliente: string; responsavelId: number | null; veiculoId: number | null; valorAnunciado: number | null; valorProposta: number | null };

/* quanto tempo parado numa etapa já pede atenção */
const LIMITE_DIAS: Partial<Record<Etapa, number>> = { whatsapp: 1, proposta: 3, negociando: 7 };

export function QuadroFunil({
  cards,
  equipe,
  usuarioId,
  filtros,
  novoCliente,
  negocioInicial,
}: {
  cards: CardNegocio[];
  equipe: { id: number; nome: string }[];
  usuarioId: number;
  filtros: { q?: string; resp?: string; dias?: string };
  novoCliente: { id: number; nome: string } | null;
  negocioInicial: number | null;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [itens, setItens] = useState(cards);
  const [cardsAntes, setCardsAntes] = useState(cards);
  if (cards !== cardsAntes) {
    setCardsAntes(cards);
    setItens(cards);
  }
  const [ativo, setAtivo] = useState<CardNegocio | null>(null);
  const [perda, setPerda] = useState<Alvo | null>(null);
  const [fechar, setFechar] = useState<Alvo | null>(null);
  const [form, setForm] = useState<NegocioForm | null>(novoCliente ? negocioVazio(novoCliente) : null);
  const [detalhe, setDetalhe] = useState<number | null>(negocioInicial);
  const [versao, setVersao] = useState(0);
  const [busca, setBusca] = useState(filtros.q ?? "");
  const [filtrando, iniciarFiltro] = useTransition();
  /* no celular não se arrasta: uma etapa por vez e o "Mover para..." do detalhe */
  const [movel, setMovel] = useState(false);
  const [etapaMovel, setEtapaMovel] = useState<Etapa>(ETAPAS[0].id);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const ler = () => setMovel(mq.matches);
    ler();
    mq.addEventListener("change", ler);
    return () => mq.removeEventListener("change", ler);
  }, []);

  const sensoresAtivos = [
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 6 } }),
    /* Espaço pega e solta o card; Enter abre o detalhe */
    useSensor(KeyboardSensor, { keyboardCodes: { start: ["Space"], cancel: ["Escape"], end: ["Space"] } }),
  ];
  const sensores = useSensors(...(movel ? [] : sensoresAtivos));

  const porEtapa = useMemo(() => {
    const m = Object.fromEntries(ETAPAS.map((e) => [e.id, [] as CardNegocio[]])) as Record<Etapa, CardNegocio[]>;
    for (const c of itens) m[c.etapa as Etapa]?.push(c);
    return m;
  }, [itens]);

  const filtrar = (k: string, v?: string) => {
    const p = new URLSearchParams(params.toString());
    if (v) p.set(k, v);
    else p.delete(k);
    p.delete("novo");
    p.delete("negocio");
    iniciarFiltro(() => router.push(`/sistema/funil?${p}`));
  };

  /* ?novo= e ?negocio= só servem para abrir a tela certa na chegada. Saem do
     endereço logo ao abrir a página (o formulário/gaveta já nasceu aberto),
     senão recarregar depois de salvar abre tudo de novo. */
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    if (!p.has("novo") && !p.has("negocio")) return;
    p.delete("novo");
    p.delete("negocio");
    window.history.replaceState(null, "", `/sistema/funil${p.size ? `?${p}` : ""}`);
  }, []);

  const atualizar = () => {
    router.refresh();
    setVersao((v) => v + 1);
  };

  const alvoDe = (c: { id: number; cliente: string; responsavelId: number | null; veiculoId: number | null; valorAnunciado: number | null; valorProposta: number | null }): Alvo => ({
    id: c.id,
    cliente: c.cliente,
    responsavelId: c.responsavelId,
    veiculoId: c.veiculoId,
    valorAnunciado: c.valorAnunciado,
    valorProposta: c.valorProposta,
  });

  async function pedirEtapa(alvo: Alvo, etapaAtual: string, destino: Etapa) {
    if (destino === etapaAtual) return;
    if (destino === "perdida") return setPerda(alvo);
    if (destino === "fechada") return setFechar(alvo);
    const antes = itens;
    setItens((xs) => xs.map((x) => (x.id === alvo.id ? { ...x, etapa: destino, etapaDesde: new Date() } : x)));
    const r = await acaoMoverNegocio(alvo.id, destino);
    if (!r.ok) {
      setItens(antes);
      toast.error(r.erro);
      return;
    }
    toast.success(`Movido para "${ETAPAS.find((e) => e.id === destino)?.rotulo}"`);
    atualizar();
  }

  function aoSoltar(e: DragEndEvent) {
    setAtivo(null);
    const card = itens.find((x) => x.id === Number(e.active.id));
    const destino = e.over?.id as Etapa | undefined;
    if (!card || !destino) return;
    pedirEtapa(alvoDe(card), card.etapa, destino);
  }

  return (
    <>
      <CabecalhoPagina
        titulo="Funil de vendas"
        subtitulo={movel ? "Toque no negócio e use Mover para... Fechar e perder a venda abrem o fluxo de encerramento." : "Arraste o negócio entre as etapas. Fechar e perder a venda abrem o fluxo de encerramento."}
        acoes={
          <Botao variante="primario" onClick={() => setForm(negocioVazio())}>
            <Plus className="size-4" /> Novo negócio
          </Botao>
        }
      />

      <div className={cn("mb-4 flex flex-col gap-2 transition-opacity sm:flex-row sm:items-center", filtrando && "opacity-60")} aria-busy={filtrando}>
        <form
          className="relative flex-1"
          onSubmit={(e) => {
            e.preventDefault();
            filtrar("q", busca);
          }}
        >
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-3" />
          <input
            type="search"
            enterKeyHint="search"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar cliente ou veículo"
            className="h-10 w-full rounded-full border border-linha bg-plano/60 pl-9 pr-4 text-[14px] outline-none placeholder:text-ink-3 focus:border-ink-2"
          />
        </form>
        <div className="flex gap-2">
          <select value={filtros.resp ?? ""} onChange={(e) => filtrar("resp", e.target.value)} className="h-10 flex-1 rounded-full border border-linha bg-plano/60 px-4 text-[13.5px] sm:flex-none">
            <option value="">Todos os consultores</option>
            <option value={usuarioId}>Meus negócios</option>
            {equipe
              .filter((p) => p.id !== usuarioId)
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nome}
                </option>
              ))}
          </select>
          <select value={filtros.dias ?? "30"} onChange={(e) => filtrar("dias", e.target.value)} className="h-10 rounded-full border border-linha bg-plano/60 px-4 text-[13.5px]" aria-label="Encerrados nos últimos">
            <option value="7">Encerrados: 7 dias</option>
            <option value="30">Encerrados: 30 dias</option>
            <option value="90">Encerrados: 90 dias</option>
          </select>
        </div>
      </div>

      <DndContext id="funil" sensors={sensores} collisionDetection={pointerWithin} onDragStart={(e) => setAtivo(itens.find((x) => x.id === Number(e.active.id)) ?? null)} onDragCancel={() => setAtivo(null)} onDragEnd={aoSoltar}>
        <div className="md:hidden">
          <p className="mb-2 text-[12.5px] text-ink-2">
            Etapa {ETAPAS.findIndex((e) => e.id === etapaMovel) + 1} de {ETAPAS.length}
          </p>
          <div className="rolagem-fina -mx-4 mb-3 flex gap-1.5 overflow-x-auto px-4" role="tablist" aria-label="Etapas do funil">
            {ETAPAS.map((e) => (
              <button
                key={e.id}
                type="button"
                role="tab"
                aria-selected={etapaMovel === e.id}
                onClick={() => setEtapaMovel(e.id)}
                className={cn("flex min-h-10 shrink-0 items-center gap-1.5 rounded-full border px-4 text-[13px]", etapaMovel === e.id ? "border-ink bg-ink font-semibold text-contra-ink" : "border-linha text-ink-2")}
              >
                {e.rotulo} <span className="num text-[11.5px] opacity-70">{porEtapa[e.id].length}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="rolagem-fina -mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-4 max-md:block sm:-mx-6 sm:px-6">
          {ETAPAS.map((etapa) => (
            <Coluna key={etapa.id} etapa={etapa.id} rotulo={etapa.rotulo} cards={porEtapa[etapa.id]} aoAbrir={(id) => setDetalhe(id)} oculta={movel && etapa.id !== etapaMovel} movel={movel} />
          ))}
        </div>
        <DragOverlay dropAnimation={null}>{ativo ? <Cartao c={ativo} flutuando /> : null}</DragOverlay>
      </DndContext>

      <DialogoPerda
        negocio={perda}
        equipe={equipe}
        aoMudar={(v) => !v && setPerda(null)}
        aoConcluir={() => {
          setPerda(null);
          atualizar();
        }}
      />
      <DialogoFecharVenda
        negocio={fechar}
        aoMudar={(v) => !v && setFechar(null)}
        aoConcluir={() => {
          setFechar(null);
          atualizar();
        }}
      />
      <FormularioNegocio
        inicial={form}
        aoMudar={(v) => !v && setForm(null)}
        equipe={equipe}
        aoSalvar={(id) => {
          atualizar();
          setDetalhe(id);
        }}
      />
      <DetalheNegocioGaveta
        negocioId={detalhe}
        versao={versao}
        aoMudar={(v) => !v && setDetalhe(null)}
        aoEditar={(f) => setForm(f)}
        aoPedirEtapa={(id, destino, d: DetalheNegocio) =>
          pedirEtapa(
            alvoDe({ id, cliente: d.cliente.nome, responsavelId: d.negocio.responsavelId, veiculoId: d.negocio.veiculoId, valorAnunciado: d.negocio.valorAnunciado, valorProposta: d.negocio.valorProposta }),
            d.negocio.etapa,
            destino,
          )
        }
      />
    </>
  );
}

function Coluna({ etapa, rotulo, cards, aoAbrir, oculta, movel }: { etapa: Etapa; rotulo: string; cards: CardNegocio[]; aoAbrir: (id: number) => void; oculta?: boolean; movel?: boolean }) {
  const { setNodeRef, isOver } = useDroppable({ id: etapa });
  const total = cards.reduce((s, c) => s + (c.valorProposta ?? c.valorAnunciado ?? 0), 0);
  return (
    <section
      ref={setNodeRef}
      aria-label={rotulo}
      className={cn(
        "flex w-full shrink-0 snap-start flex-col rounded-[20px] border bg-vidro transition md:w-[290px] md:max-w-[320px] xl:w-auto xl:max-w-none xl:flex-1",
        oculta && "hidden",
        isOver ? "border-linha-forte bg-vidro-forte" : "border-vidro-borda",
      )}
    >
      <header className="relative px-4 pb-3 pt-4">
        <span className="absolute inset-x-4 top-0 h-[3px] rounded-b-full" style={{ background: `var(--etapa-${etapa})` }} aria-hidden />
        <div className="flex items-center gap-2">
          <span className="size-2.5 rounded-full" style={{ background: `var(--etapa-${etapa})` }} aria-hidden />
          <h2 className="flex-1 text-[13.5px] font-semibold">{rotulo}</h2>
          <span className="num rounded-full bg-trilho px-2 text-[12px] leading-5 text-ink-2">{cards.length}</span>
        </div>
        <p className="num mt-1 text-[12px] text-ink-3">{total ? brl(total) : "Sem valores"}</p>
      </header>
      <div className="flex min-h-[120px] flex-1 flex-col gap-2 px-2.5 pb-3">
        {cards.length === 0 ? (
          <p className={cn("m-1 grid flex-1 place-items-center rounded-2xl border border-dashed px-3 py-6 text-center text-[12.5px] text-ink-3", isOver ? "border-linha-forte" : "border-linha")}>
            {isOver ? "Solte aqui" : "Nenhum negócio nesta etapa"}
          </p>
        ) : (
          cards.map((c) => <CartaoArrastavel key={c.id} c={c} aoAbrir={aoAbrir} movel={movel} />)
        )}
      </div>
    </section>
  );
}

function CartaoArrastavel({ c, aoAbrir, movel }: { c: CardNegocio; aoAbrir: (id: number) => void; movel?: boolean }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: String(c.id), disabled: movel });
  return (
    <div ref={setNodeRef} {...(movel ? {} : { ...listeners, ...attributes })} className={cn("touch-manipulation outline-none", isDragging && "opacity-30")}>
      <Cartao c={c} aoAbrir={() => aoAbrir(c.id)} />
    </div>
  );
}

function Cartao({ c, aoAbrir, flutuando }: { c: CardNegocio; aoAbrir?: () => void; flutuando?: boolean }) {
  const limite = LIMITE_DIAS[c.etapa as Etapa];
  const diasParado = diasDesde(c.etapaDesde);
  const atrasado = limite != null && diasParado > limite;
  const veiculo = c.veiculo ?? c.veiculoInteresse;
  return (
    <article
      onClick={aoAbrir}
      onKeyDown={(e) => e.key === "Enter" && aoAbrir?.()}
      className={cn(
        "md:cursor-grab rounded-2xl border border-linha bg-elevado p-3 text-left shadow-sm transition hover:border-linha-forte md:active:cursor-grabbing",
        flutuando && "rotate-2 cursor-grabbing shadow-alta",
      )}
      style={{ borderLeft: `3px solid var(--etapa-${c.etapa})` }}
    >
      <div className="flex items-start gap-2">
        <p className="min-w-0 flex-1 truncate text-[14px] font-semibold">{c.cliente}</p>
        {c.naoLidas > 0 && <span className="num rounded-full bg-marca px-1.5 text-[11px] font-bold leading-5 text-black">{c.naoLidas}</span>}
      </div>
      <p className="mt-0.5 truncate text-[12.5px] text-ink-2">{veiculo ?? "Veículo não definido"}</p>

      <div className="mt-2 flex items-baseline justify-between gap-2">
        {c.valorProposta != null ? (
          <p className="num text-[15px] font-bold tracking-tight">
            {brl(c.valorProposta)} <span className="text-[11px] font-normal text-ink-3">proposta</span>
          </p>
        ) : c.valorAnunciado != null ? (
          <p className="num text-[15px] font-bold tracking-tight">
            {brl(c.valorAnunciado)} <span className="text-[11px] font-normal text-ink-3">anunciado</span>
          </p>
        ) : (
          <p className="text-[12.5px] text-ink-3">Sem valor</p>
        )}
      </div>
      {c.valorProposta != null && c.valorAnunciado != null && <p className="num hidden text-[11.5px] text-ink-3 md:block">Anunciado {brl(c.valorAnunciado)}</p>}

      <div className="mt-2 flex flex-wrap gap-1">
        {c.demo && <Selo tom="atencao">Simulado</Selo>}
        <span className="hidden flex-wrap gap-1 md:flex">
          {c.origem && (
            <Selo tom="neutro" ponto={false}>
              {ORIGENS[c.origem as keyof typeof ORIGENS]}
            </Selo>
          )}
          {c.temTroca && (
            <Selo tom="info" ponto={false}>
              <Repeat className="size-3" /> Troca
            </Selo>
          )}
          {c.atendimentoIa && (
            <Selo tom="info" ponto={false}>
              <Bot className="size-3" /> Triagem IA
            </Selo>
          )}
        </span>
        {c.etapa === "fechada" && c.vendaStatus && <Selo tom={c.vendaStatus === "finalizada" ? "bom" : "atencao"}>{STATUS_VENDA[c.vendaStatus as keyof typeof STATUS_VENDA]}</Selo>}
        {c.etapa === "perdida" &&
          (c.temDiagnostico ? (
            <Selo tom="info" ponto={false}>
              <Sparkles className="size-3" /> Diagnóstico
            </Selo>
          ) : (
            <span className="hidden md:inline-flex">
              <Selo tom="neutro">Sem diagnóstico</Selo>
            </span>
          ))}
      </div>

      <div className="mt-2.5 flex items-center gap-2 border-t border-linha pt-2 text-[11.5px] text-ink-3">
        <span className={cn("size-5 place-items-center rounded-full bg-trilho text-[9.5px] font-semibold text-ink-2", c.responsavel ? "grid" : "hidden md:grid")} title={c.responsavel ?? "Sem responsável"}>
          {c.responsavel ? iniciais(c.responsavel) : "?"}
        </span>
        <span className="min-w-0 flex-1 truncate">{c.responsavel ?? "Sem responsável"}</span>
        <span className={cn("flex items-center gap-1", atrasado && "font-semibold text-serio")} title={c.ultimaInteracaoEm ? `Última interação ${relativo(c.ultimaInteracaoEm)}` : "Sem interação registrada"}>
          <Clock className="size-3" /> {tempoDesde(c.etapaDesde)}
        </span>
      </div>
    </article>
  );
}
