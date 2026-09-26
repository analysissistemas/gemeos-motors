"use client";
import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowLeft, Bot, Check, CheckCheck, CircleAlert, Clock, FileText, Info, StickyNote, UserCheck } from "lucide-react";
import type { MensagemChat, NotaChat } from "@/lib/consultas/conversas";
import type { ContextoConversa } from "@/lib/consultas/conversas";
import { STATUS_CONVERSA } from "@/lib/dominio";
import { formatarTelefone, hora, iniciais } from "@/lib/formato";
import { cn } from "@/lib/cn";
import { Botao } from "@/components/ui/botao";
import { AudioMensagem } from "./audio-mensagem";
import { Compositor, type EnvioChat, type Resposta } from "./compositor";
import { comLinks, ETIQUETA_ETAPA, rotuloDia } from "./util";

type ItemTimeline = { tipo: "msg"; chave: string; quando: Date; m: MensagemChat } | { tipo: "nota"; chave: string; quando: Date; n: NotaChat } | { tipo: "dia"; chave: string; rotulo: string };

export function Chat({
  contexto,
  mensagens,
  notas,
  temMais,
  carregando,
  equipe,
  usuarioId,
  respostas,
  simulado,
  aoVoltar,
  aoInfo,
  aoCarregarAntigas,
  aoEnviar,
  aoAssumir,
  aoAtribuir,
  aoStatus,
}: {
  contexto: ContextoConversa;
  mensagens: MensagemChat[];
  notas: NotaChat[];
  temMais: boolean;
  carregando: boolean;
  equipe: { id: number; nome: string }[];
  usuarioId: number;
  respostas: Resposta[];
  simulado: boolean;
  aoVoltar: () => void;
  aoInfo: () => void;
  aoCarregarAntigas: () => Promise<void>;
  aoEnviar: (e: EnvioChat) => Promise<boolean>;
  aoAssumir: () => void;
  aoAtribuir: (id: number | null) => void;
  aoStatus: (s: string) => void;
}) {
  const c = contexto.conversa;
  const nome = contexto.cliente?.nome ?? c.contatoNome ?? formatarTelefone(c.contatoTelefone);
  const rolagem = useRef<HTMLDivElement>(null);
  const [perto, setPerto] = useState(true);
  const [novas, setNovas] = useState(0);
  const alturaAntes = useRef<number | null>(null);
  const ultimoId = mensagens[mensagens.length - 1]?.id;
  const qtdAntes = useRef(mensagens.length);

  const timeline = useMemo<ItemTimeline[]>(() => {
    const itens = [
      ...mensagens.map((m) => ({ tipo: "msg" as const, chave: `m${m.id}`, quando: new Date(m.criadoEm), m })),
      ...notas.map((n) => ({ tipo: "nota" as const, chave: `n${n.id}`, quando: new Date(n.criadoEm), n })),
    ].sort((a, b) => a.quando.getTime() - b.quando.getTime());
    /* só mostra notas dentro do intervalo já carregado de mensagens */
    const primeira = mensagens[0] ? new Date(mensagens[0].criadoEm).getTime() : 0;
    const out: ItemTimeline[] = [];
    let dia = "";
    for (const i of itens) {
      if (temMais && i.tipo === "nota" && i.quando.getTime() < primeira) continue;
      const r = rotuloDia(i.quando);
      if (r !== dia) {
        out.push({ tipo: "dia", chave: `d${r}${i.chave}`, rotulo: r });
        dia = r;
      }
      out.push(i);
    }
    return out;
  }, [mensagens, notas, temMais]);

  /* abre no fim; mensagem nova com o usuário no fim = acompanha; lendo o histórico = avisa */
  useLayoutEffect(() => {
    const el = rolagem.current;
    if (!el) return;
    if (alturaAntes.current != null) {
      el.scrollTop = el.scrollHeight - alturaAntes.current;
      alturaAntes.current = null;
    } else if (perto || qtdAntes.current === 0) {
      el.scrollTop = el.scrollHeight;
    } else if (mensagens.length > qtdAntes.current) {
      setNovas((n) => n + (mensagens.length - qtdAntes.current));
    }
    qtdAntes.current = mensagens.length;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ultimoId, notas.length]);

  const souResponsavel = c.responsavelId === usuarioId;

  return (
    <div className="relative flex h-full min-h-0 flex-col">
      {/* cabeçalho */}
      <header className="flex items-center gap-2 border-b border-linha bg-[var(--cabecalho)] px-2 pb-2 pt-[max(0.5rem,env(safe-area-inset-top))] backdrop-blur-xl sm:px-3">
        <button className="grid size-10 place-items-center rounded-full text-ink-2 hover:bg-trilho lg:hidden" onClick={aoVoltar} aria-label="Voltar para a lista">
          <ArrowLeft className="size-5" />
        </button>
        <button className="flex min-w-0 flex-1 items-center gap-3 rounded-xl px-1 py-1 text-left hover:bg-trilho xl:pointer-events-none" onClick={aoInfo}>
          <span className="grid size-10 shrink-0 place-items-center rounded-full bg-vidro-forte text-[14px] font-semibold ring-1 ring-linha">{iniciais(nome)}</span>
          <span className="min-w-0">
            <span className="block truncate text-[15px] font-semibold">{nome}</span>
            <span className="flex items-center gap-2 truncate text-[12px] text-ink-3">
              <span className="num">{formatarTelefone(c.contatoTelefone)}</span>
              {contexto.negocio && (
                <span className="flex items-center gap-1 text-ink-2">
                  <span className="size-2 rounded-full" style={{ background: `var(--etapa-${contexto.negocio.etapa})` }} aria-hidden />
                  {ETIQUETA_ETAPA[contexto.negocio.etapa]}
                </span>
              )}
            </span>
          </span>
        </button>
        <div className="hidden items-center gap-2 md:flex">
          <select value={c.status} onChange={(e) => aoStatus(e.target.value)} className="h-9 rounded-full border border-linha bg-plano/60 px-3 text-[12.5px]" aria-label="Status da conversa">
            {Object.entries(STATUS_CONVERSA).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
          <select value={c.responsavelId ?? ""} onChange={(e) => aoAtribuir(e.target.value ? Number(e.target.value) : null)} className="h-9 max-w-[160px] rounded-full border border-linha bg-plano/60 px-3 text-[12.5px]" aria-label="Responsável">
            <option value="">Sem responsável</option>
            {equipe.map((p) => (
              <option key={p.id} value={p.id}>
                {p.id === usuarioId ? `${p.nome} (você)` : p.nome}
              </option>
            ))}
          </select>
        </div>
        {!souResponsavel && (
          <Botao tamanho="sm" variante="primario" onClick={aoAssumir}>
            <UserCheck className="size-4" /> Assumir
          </Botao>
        )}
        <button className="grid size-10 place-items-center rounded-full text-ink-2 hover:bg-trilho xl:hidden" onClick={aoInfo} aria-label="Dados do cliente e negócio">
          <Info className="size-5" />
        </button>
      </header>

      {c.modo === "ia" && (
        <div className="flex items-center gap-2 border-b border-linha bg-vidro px-4 py-2 text-[12.5px]">
          <Bot className="size-4 shrink-0" />
          <span className="flex-1">
            {c.triagemIa?.prontoParaHumano ? <b>Triagem concluída — aguardando consultor.</b> : "A IA está fazendo a primeira triagem."} Ao responder ou assumir, o atendimento passa a ser humano.
          </span>
        </div>
      )}

      {/* mensagens */}
      <div
        ref={rolagem}
        className="rolagem-fina relative min-h-0 flex-1 overflow-y-auto px-3 py-4 sm:px-6"
        style={{ backgroundImage: "radial-gradient(var(--trilho) 1px, transparent 1px)", backgroundSize: "18px 18px" }}
        onScroll={(e) => {
          const el = e.currentTarget;
          const p = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
          setPerto(p);
          if (p) setNovas(0);
        }}
        aria-live="polite"
      >
        {temMais && (
          <div className="mb-3 text-center">
            <Botao
              tamanho="sm"
              carregando={carregando}
              onClick={async () => {
                alturaAntes.current = rolagem.current?.scrollHeight ?? null;
                await aoCarregarAntigas();
              }}
            >
              Carregar mensagens anteriores
            </Botao>
          </div>
        )}
        {timeline.length === 0 && !carregando && <p className="py-10 text-center text-[13px] text-ink-3">Nenhuma mensagem ainda.</p>}
        <ol className="mx-auto flex max-w-3xl flex-col gap-1.5">
          {timeline.map((i) =>
            i.tipo === "dia" ? (
              <li key={i.chave} className="sticky top-0 z-10 my-2 text-center">
                <span className="rounded-full border border-linha bg-elevado px-3 py-1 text-[11.5px] text-ink-2 shadow-sm">{i.rotulo}</span>
              </li>
            ) : i.tipo === "nota" ? (
              <li key={i.chave} className="my-1 flex justify-center">
                <div className="max-w-[88%] rounded-2xl border border-marca/40 bg-bolha-nota px-3 py-2 text-[13.5px]">
                  <p className="mb-0.5 flex items-center gap-1.5 text-[11px] font-semibold">
                    <StickyNote className="size-3.5 text-marca" /> Nota interna · {i.n.usuarioNome ?? "Equipe"}
                  </p>
                  <p className="whitespace-pre-wrap break-words">{i.n.conteudo}</p>
                  <p className="mt-0.5 text-right text-[10.5px] text-ink-3">{hora(i.n.criadoEm)}</p>
                </div>
              </li>
            ) : (
              <Bolha key={i.chave} m={i.m} />
            ),
          )}
        </ol>
      </div>
      {novas > 0 && (
        <button
          className="absolute bottom-24 right-5 z-20 flex items-center gap-1.5 rounded-full bg-ink px-3 py-2 text-[12.5px] font-semibold text-contra-ink shadow-alta"
          onClick={() => {
            const el = rolagem.current;
            if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
            setNovas(0);
          }}
        >
          <ArrowDown className="size-4" /> {novas} {novas === 1 ? "nova mensagem" : "novas mensagens"}
        </button>
      )}

      <Compositor respostas={respostas} simulado={simulado} aoEnviar={aoEnviar} />
    </div>
  );
}

function Bolha({ m }: { m: MensagemChat }) {
  if (m.direcao === "system") {
    return (
      <li className="my-1 flex justify-center">
        <span className="max-w-[90%] rounded-xl bg-vidro-forte px-3 py-1.5 text-center text-[12px] text-ink-2 ring-1 ring-linha">
          {m.conteudo} · {hora(m.criadoEm)}
        </span>
      </li>
    );
  }
  const saida = m.direcao === "outgoing";
  const ia = m.autor === "ia";
  const meta = (m.metadados ?? {}) as { duracao?: number; erro?: string };
  return (
    <li className={cn("flex", saida ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "relative max-w-[85%] rounded-2xl px-3 py-2 text-[14.5px] leading-snug shadow-sm sm:max-w-[70%]",
          saida ? "rounded-br-md bg-bolha-saida" : "rounded-bl-md bg-bolha-entrada ring-1 ring-linha",
        )}
      >
        {saida && (
          <p className="mb-0.5 flex items-center gap-1 text-[11px] font-semibold text-ink-2">
            {ia ? (
              <>
                <Bot className="size-3" /> Assistente virtual
              </>
            ) : (
              m.usuarioNome
            )}
          </p>
        )}
        {m.tipo === "imagem" && m.midiaUrl && (
          <a href={m.midiaUrl} target="_blank" rel="noreferrer" className="-mx-1 mb-1 block overflow-hidden rounded-xl">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={m.midiaUrl} alt={m.conteudo ?? "Imagem"} className="max-h-72 w-full bg-white object-contain" loading="lazy" />
          </a>
        )}
        {m.tipo === "documento" && (
          <a href={m.midiaUrl ?? "#"} download={m.midiaNome ?? undefined} target="_blank" rel="noreferrer" className="mb-1 flex items-center gap-3 rounded-xl bg-trilho px-3 py-2 hover:underline">
            <FileText className="size-6 shrink-0" />
            <span className="min-w-0">
              <span className="block truncate text-[13.5px] font-medium">{m.midiaNome ?? "Documento"}</span>
              <span className="text-[11.5px] text-ink-3">{m.midiaTamanho ? `${Math.ceil(m.midiaTamanho / 1024)} KB · ` : ""}Abrir</span>
            </span>
          </a>
        )}
        {m.tipo === "audio" && <AudioMensagem url={m.midiaUrl} duracaoGuardada={typeof meta.duracao === "number" ? meta.duracao : null} />}
        {m.conteudo && (m.tipo === "texto" || m.tipo === "imagem" || m.tipo === "documento") && (
          <p className="whitespace-pre-wrap break-words">
            {comLinks(m.conteudo).map((p, i) =>
              p.link ? (
                <a key={i} href={p.t} target="_blank" rel="noreferrer" className="underline underline-offset-2">
                  {p.t}
                </a>
              ) : (
                <span key={i}>{p.t}</span>
              ),
            )}
          </p>
        )}
        <p className="mt-0.5 flex items-center justify-end gap-1 text-[10.5px] text-ink-3">
          {hora(m.criadoEm)}
          {saida && <Tiques status={m.status} />}
        </p>
        {m.status === "failed" && <p className="mt-1 text-[11.5px] text-critico">Não enviada{meta.erro ? `: ${meta.erro}` : ""}</p>}
      </div>
    </li>
  );
}

function Tiques({ status }: { status: string }) {
  if (status === "pending") return <Clock className="size-3" aria-label="Enviando" />;
  if (status === "failed") return <CircleAlert className="size-3.5 text-critico" aria-label="Falhou" />;
  if (status === "sent") return <Check className="size-3.5" aria-label="Enviada" />;
  return <CheckCheck className={cn("size-3.5", status === "read" && "text-[#34b7f1]")} aria-label={status === "read" ? "Lida" : "Entregue"} />;
}
