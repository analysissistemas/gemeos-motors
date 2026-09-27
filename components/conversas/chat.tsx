"use client";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowLeft, Ban, Bot, Check, CheckCheck, ChevronDown, CircleAlert, Clock, Copy, FileText, Info, MapPin, MessageCircle, Phone, Reply, StickyNote, Trash2, UserCheck, UserRound } from "lucide-react";
import { toast } from "sonner";
import type { MensagemChat, NotaChat } from "@/lib/consultas/conversas";
import type { ContextoConversa } from "@/lib/consultas/conversas";
import { formatarTelefone, hora } from "@/lib/formato";
import { cn } from "@/lib/cn";
import { Avatar } from "@/components/ui/avatar";
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
  usuarioId,
  respostas,
  simulado,
  aoVoltar,
  aoInfo,
  painelAberto,
  aoCarregarAntigas,
  aoEnviar,
  respondendo,
  aoResponder,
  aoReagir,
  aoApagar,
  aoConversarCom,
  aoAssumir,
  iaDigitando,
}: {
  contexto: ContextoConversa;
  mensagens: MensagemChat[];
  notas: NotaChat[];
  temMais: boolean;
  carregando: boolean;
  usuarioId: number;
  respostas: Resposta[];
  simulado: boolean;
  aoVoltar: () => void;
  aoInfo: () => void;
  painelAberto: boolean;
  aoCarregarAntigas: () => Promise<void>;
  aoEnviar: (e: EnvioChat) => Promise<boolean>;
  respondendo: MensagemChat | null;
  aoResponder: (m: MensagemChat | null) => void;
  aoReagir: (m: MensagemChat, emoji: string) => void;
  aoApagar: (m: MensagemChat) => void;
  aoConversarCom: (telefone: string, nome: string | null) => void;
  aoAssumir: () => void;
  /** a IA está preparando a resposta: balão "digitando…" no fim do chat */
  iaDigitando?: boolean;
}) {
  const c = contexto.conversa;
  const nome = contexto.cliente?.nome ?? c.contatoNome ?? formatarTelefone(c.contatoTelefone);
  const rolagem = useRef<HTMLDivElement>(null);
  const [perto, setPerto] = useState(true);
  const [novas, setNovas] = useState(0);
  const alturaAntes = useRef<number | null>(null);
  const ultimoId = mensagens[mensagens.length - 1]?.id;
  const qtdAntes = useRef(mensagens.length);
  /* janela de 24 h da Meta: conta a última mensagem do cliente (do banco ou recém-chegada) */
  const ultimaDoCliente = Math.max(
    contexto.ultimaDoClienteEm ? new Date(contexto.ultimaDoClienteEm).getTime() : 0,
    ...mensagens.filter((m) => m.direcao === "incoming").map((m) => new Date(m.criadoEm).getTime()),
  );
  /* relógio da tela: a janela fecha sozinha com a conversa aberta (confere a cada minuto) */
  const [agora, setAgora] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setAgora(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);
  const janelaFechada = agora - ultimaDoCliente > 24 * 60 * 60 * 1000;
  /* clique na citação: rola até a mensagem original (carrega as antigas se ela ainda não veio) */
  const irPara = useRef<{ id: number; tentativas: number } | null>(null);
  const buscarCitada = useCallback(() => {
    const alvo = irPara.current;
    if (!alvo) return;
    const el = document.getElementById(`msg-${alvo.id}`);
    if (el) {
      irPara.current = null;
      el.scrollIntoView({ block: "center", behavior: "smooth" });
      el.querySelector("[data-bolha]")?.animate(
        [{ boxShadow: "0 0 0 3px var(--marca)" }, { boxShadow: "0 0 0 3px var(--marca)", offset: 0.6 }, { boxShadow: "0 0 0 0 transparent" }],
        { duration: 1800 },
      );
    } else if (temMais && alvo.tentativas < 20) {
      alvo.tentativas++;
      alturaAntes.current = rolagem.current?.scrollHeight ?? null;
      void aoCarregarAntigas();
    } else {
      irPara.current = null;
      toast.info("Não achei a mensagem original: ela pode ter sido apagada.");
    }
  }, [temMais, aoCarregarAntigas]);
  const aoIrPara = useCallback(
    (id: number) => {
      irPara.current = { id, tentativas: 0 };
      buscarCitada();
    },
    [buscarCitada],
  );
  useEffect(() => {
    if (irPara.current && !carregando) buscarCitada();
  }, [mensagens, carregando, buscarCitada]);

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
        <button className="flex min-w-0 flex-1 items-center gap-3 rounded-xl px-1 py-1 text-left hover:bg-trilho" onClick={aoInfo}>
          <Avatar nome={nome} foto={contexto.cliente?.fotoUrl} className="shrink-0" />
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
        {!souResponsavel && (
          <Botao tamanho="sm" variante="primario" onClick={aoAssumir}>
            <UserCheck className="size-4" /> Assumir
          </Botao>
        )}
        <button className={cn("grid size-10 place-items-center rounded-full text-ink-2 hover:bg-trilho", painelAberto && "xl:bg-trilho xl:text-ink")} onClick={aoInfo} aria-label={painelAberto ? "Recolher dados do cliente e negócio" : "Mostrar dados do cliente e negócio"} aria-expanded={painelAberto}>
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
              <Bolha key={i.chave} m={i.m} nomeCliente={nome} acoes={{ aoResponder, aoReagir, aoApagar, aoConversarCom, aoIrPara }} />
            ),
          )}
          {iaDigitando && (
            <li className="flex justify-end" aria-live="polite">
              <div className="flex items-center gap-2 rounded-2xl rounded-br-md bg-bolha-saida px-3 py-2 text-[12.5px] text-ink-2 shadow-sm">
                <Bot className="size-3.5" /> Assistente virtual está digitando
                <span className="flex gap-0.5" aria-hidden>
                  <span className="size-1.5 animate-bounce rounded-full bg-ink-3 [animation-delay:-0.3s]" />
                  <span className="size-1.5 animate-bounce rounded-full bg-ink-3 [animation-delay:-0.15s]" />
                  <span className="size-1.5 animate-bounce rounded-full bg-ink-3" />
                </span>
              </div>
            </li>
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

      <Compositor
        respostas={respostas}
        simulado={simulado}
        aoEnviar={aoEnviar}
        respondendo={respondendo ? { quem: quemEscreveu(respondendo, nome), texto: resumoCurto(respondendo.tipo, respondendo.conteudo) } : null}
        aoCancelarResposta={() => aoResponder(null)}
        janelaFechada={janelaFechada}
        nomeCliente={contexto.cliente?.nome ?? c.contatoNome ?? null}
      />
    </div>
  );
}

type AcoesBolha = {
  aoResponder: (m: MensagemChat) => void;
  aoReagir: (m: MensagemChat, emoji: string) => void;
  aoApagar: (m: MensagemChat) => void;
  aoConversarCom: (telefone: string, nome: string | null) => void;
  aoIrPara: (id: number) => void;
};
type Meta = {
  duracao?: number;
  erro?: string;
  reacoes?: { cliente?: string; equipe?: string };
  apagada?: { por?: string };
  apagadaPeloCliente?: string;
  figurinha?: boolean;
  latitude?: number;
  longitude?: number;
  contatos?: { nome: string | null; telefones: { numero: string; rotulo: string | null }[] }[];
};

const REACOES_RAPIDAS = ["👍", "❤️", "😂", "😮", "😢", "🙏"];

function resumoCurto(tipo: string, conteudo: string | null) {
  if (conteudo) return conteudo.slice(0, 140);
  return tipo === "audio" ? "Áudio" : tipo === "imagem" ? "Foto" : tipo === "video" ? "Vídeo" : tipo === "documento" ? "Documento" : tipo === "contato" ? "Contato" : tipo === "localizacao" ? "Localização" : "Mensagem";
}

function quemEscreveu(m: { direcao: string; autor: string; usuarioNome?: string | null }, nomeCliente: string) {
  if (m.direcao === "incoming") return nomeCliente;
  if (m.autor === "ia") return "Assistente virtual";
  return m.usuarioNome ?? "Loja";
}

function Bolha({ m, nomeCliente, acoes }: { m: MensagemChat; nomeCliente: string; acoes: AcoesBolha }) {
  const [menu, setMenu] = useState(false);
  const caixa = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!menu) return;
    const fora = (e: MouseEvent | TouchEvent) => {
      if (caixa.current && !caixa.current.contains(e.target as Node)) setMenu(false);
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenu(false);
    };
    document.addEventListener("mousedown", fora);
    document.addEventListener("touchstart", fora);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", fora);
      document.removeEventListener("touchstart", fora);
      document.removeEventListener("keydown", esc);
    };
  }, [menu]);

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
  const meta = (m.metadados ?? {}) as Meta;
  const lado = cn("flex", saida ? "justify-end" : "justify-start");

  /* apagada pela equipe: some o conteúdo (continua no histórico do sistema) */
  if (meta.apagada) {
    return (
      <li className={lado}>
        <div className={cn("flex max-w-[85%] items-center gap-1.5 rounded-2xl px-3 py-2 text-[13px] italic text-ink-3 ring-1 ring-linha sm:max-w-[70%]", saida ? "bg-bolha-saida/60" : "bg-bolha-entrada/60")}>
          <Ban className="size-3.5 shrink-0" /> Mensagem apagada{meta.apagada.por ? ` por ${meta.apagada.por}` : ""} · {hora(m.criadoEm)}
        </div>
      </li>
    );
  }

  const reacoes = [meta.reacoes?.cliente, meta.reacoes?.equipe].filter(Boolean) as string[];
  const minhaReacao = meta.reacoes?.equipe ?? "";
  const real = m.id > 0;

  return (
    <li id={real ? `msg-${m.id}` : undefined} className={cn(lado, reacoes.length > 0 && "mb-3")}>
      {/* a setinha do menu fica do lado de fora da bolha (à esquerda na da loja, à direita na do cliente) */}
      <div ref={caixa} className={cn("group relative flex max-w-[85%] items-start gap-1 sm:max-w-[70%]", !saida && "flex-row-reverse")}>
        {real && (
          <button
            className={cn(
              "mt-1 grid size-6 shrink-0 place-items-center rounded-full bg-elevado/90 text-ink-2 shadow-sm ring-1 ring-linha transition-opacity hover:text-ink",
              menu ? "opacity-100" : "opacity-0 focus:opacity-100 group-hover:opacity-100 [@media(hover:none)]:opacity-70",
            )}
            onClick={() => setMenu((v) => !v)}
            aria-label="Opções da mensagem"
            aria-expanded={menu}
          >
            <ChevronDown className="size-3.5" />
          </button>
        )}
        {menu && (
          <div className={cn("absolute top-8 z-30 w-56 rounded-2xl border border-linha-forte bg-elevado p-1.5 shadow-alta", saida ? "right-0" : "left-0")} role="menu">
          <div className="mb-1 flex justify-between px-1">
            {REACOES_RAPIDAS.map((em) => (
              <button
                key={em}
                className={cn("grid size-8 place-items-center rounded-full text-[18px] hover:bg-trilho", minhaReacao === em && "bg-trilho ring-1 ring-linha-forte")}
                onClick={() => {
                  setMenu(false);
                  acoes.aoReagir(m, minhaReacao === em ? "" : em);
                }}
                aria-label={minhaReacao === em ? `Tirar reação ${em}` : `Reagir com ${em}`}
              >
                {em}
              </button>
            ))}
          </div>
          <ItemMenu
            icone={<Reply className="size-4" />}
            onClick={() => {
              setMenu(false);
              acoes.aoResponder(m);
            }}
          >
            Responder
          </ItemMenu>
          {m.conteudo && (
            <ItemMenu
              icone={<Copy className="size-4" />}
              onClick={async () => {
                setMenu(false);
                await navigator.clipboard.writeText(m.conteudo ?? "");
                toast.success("Texto copiado");
              }}
            >
              Copiar texto
            </ItemMenu>
          )}
          <ItemMenu
            icone={<Trash2 className="size-4" />}
            perigo
            onClick={() => {
              setMenu(false);
              acoes.aoApagar(m);
            }}
          >
            Apagar para mim
          </ItemMenu>
          <p className="px-2.5 pb-1 pt-0.5 text-[11px] leading-snug text-ink-3">
            {saida ? "A Meta não deixa apagar do celular do cliente: some só do chat da equipe." : "Some só do chat da equipe; fica no histórico do sistema."}
          </p>
          </div>
        )}
        <div
          data-bolha
          title={real ? "Dois cliques para responder" : undefined}
          onDoubleClick={(e) => {
            if (!real || (e.target as HTMLElement).closest("a,button,audio,video")) return;
            window.getSelection()?.removeAllRanges();
            acoes.aoResponder(m);
          }}
          className={cn(
            "relative min-w-0 rounded-2xl px-3 py-2 text-[14.5px] leading-snug shadow-sm",
            saida ? "rounded-br-md bg-bolha-saida" : "rounded-bl-md bg-bolha-entrada ring-1 ring-linha",
            meta.figurinha && "bg-transparent shadow-none ring-0",
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
          {meta.apagadaPeloCliente && (
            <p className="mb-1 flex items-center gap-1 text-[11px] font-semibold text-critico">
              <Ban className="size-3" /> O cliente apagou esta mensagem
            </p>
          )}
          {m.citada && (
            <button
              type="button"
              className="-mx-1 mb-1.5 block w-[calc(100%+0.5rem)] rounded-lg border-l-2 border-marca bg-trilho/70 px-2 py-1 text-left text-[12.5px] hover:bg-trilho"
              onClick={() => m.respostaA && acoes.aoIrPara(m.respostaA)}
              title="Ir para a mensagem respondida"
            >
              <p className="font-semibold text-marca">{quemEscreveu({ direcao: m.citada.direcao, autor: m.citada.autor }, nomeCliente)}</p>
              <p className="line-clamp-2 text-ink-2">{m.citada.apagada ? "Mensagem apagada" : resumoCurto(m.citada.tipo, m.citada.conteudo)}</p>
            </button>
          )}
          <div className={cn(meta.apagadaPeloCliente && "opacity-60")}>
            {m.tipo === "imagem" && m.midiaUrl && (
              <a href={m.midiaUrl} target="_blank" rel="noreferrer" className={cn("block overflow-hidden rounded-xl", meta.figurinha ? "w-32" : "-mx-1 mb-1")}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={m.midiaUrl} alt={meta.figurinha ? "Figurinha" : (m.conteudo ?? "Imagem")} className={cn("w-full object-contain", !meta.figurinha && "max-h-72 bg-white")} loading="lazy" />
              </a>
            )}
            {m.tipo === "video" &&
              (m.midiaUrl ? (
                <video src={m.midiaUrl} controls preload="metadata" className="-mx-1 mb-1 max-h-72 w-full rounded-xl bg-black" />
              ) : (
                <p className="text-[13px] italic text-ink-3">Vídeo não disponível. Veja no celular.</p>
              ))}
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
            {m.tipo === "contato" && <CartoesContato contatos={meta.contatos ?? []} aoConversarCom={acoes.aoConversarCom} />}
            {m.tipo === "localizacao" && (
              <a
                href={
                  meta.latitude != null && meta.longitude != null
                    ? `https://www.google.com/maps/search/?api=1&query=${meta.latitude},${meta.longitude}`
                    : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(m.conteudo ?? "")}`
                }
                target="_blank"
                rel="noreferrer"
                className="mb-1 flex items-center gap-3 rounded-xl bg-trilho px-3 py-2 hover:underline"
              >
                <MapPin className="size-6 shrink-0 text-critico" />
                <span className="min-w-0">
                  <span className="block text-[13.5px] font-medium">{m.conteudo || "Localização"}</span>
                  <span className="text-[11.5px] text-ink-3">Abrir no mapa</span>
                </span>
              </a>
            )}
            {m.conteudo && (m.tipo === "texto" || m.tipo === "imagem" || m.tipo === "documento" || m.tipo === "video") && (
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
          </div>
          <p className="mt-0.5 flex items-center justify-end gap-1 text-[10.5px] text-ink-3">
            {hora(m.criadoEm)}
            {saida && <Tiques status={m.status} />}
          </p>
          {m.status === "failed" && <p className="mt-1 text-[11.5px] text-critico">Não enviada{meta.erro ? `: ${meta.erro}` : ""}</p>}
          {reacoes.length > 0 && (
            <button
              className={cn("absolute -bottom-3.5 flex items-center gap-0.5 rounded-full border border-linha bg-elevado px-1.5 py-0.5 text-[13px] shadow-sm", saida ? "right-2" : "left-2")}
              onClick={() => {
                if (minhaReacao) acoes.aoReagir(m, "");
              }}
              title={[meta.reacoes?.cliente && `${nomeCliente}: ${meta.reacoes.cliente}`, meta.reacoes?.equipe && `Loja: ${meta.reacoes.equipe} (toque para tirar)`].filter(Boolean).join(" · ")}
              aria-label="Reações"
            >
              {reacoes.map((r, i) => (
                <span key={i}>{r}</span>
              ))}
            </button>
          )}
        </div>
      </div>
    </li>
  );
}

function ItemMenu({ icone, children, onClick, perigo }: { icone: React.ReactNode; children: React.ReactNode; onClick: () => void; perigo?: boolean }) {
  return (
    <button className={cn("flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-[13.5px] hover:bg-trilho", perigo && "text-critico")} onClick={onClick} role="menuitem">
      {icone}
      {children}
    </button>
  );
}

/* Contato que o cliente mandou: nome, número e como falar com ele (sem aparecer "[contacts]"). */
function CartoesContato({ contatos, aoConversarCom }: { contatos: NonNullable<Meta["contatos"]>; aoConversarCom: AcoesBolha["aoConversarCom"] }) {
  if (!contatos.length) return <p className="text-[13px] italic text-ink-3">Contato sem número.</p>;
  return (
    <div className="mb-1 flex flex-col gap-2">
      {contatos.map((c, i) => (
        <div key={i} className="min-w-[220px] rounded-xl bg-trilho p-2.5">
          <p className="flex items-center gap-2 text-[13.5px] font-semibold">
            <span className="grid size-8 shrink-0 place-items-center rounded-full bg-vidro-forte ring-1 ring-linha">
              <UserRound className="size-4" />
            </span>
            {c.nome ?? "Contato"}
          </p>
          {c.telefones.length === 0 && <p className="mt-1 text-[12px] text-ink-3">Sem número no contato.</p>}
          {c.telefones.map((t) => (
            <div key={t.numero} className="mt-2">
              <p className="num text-[12.5px] text-ink-2">
                {formatarTelefone(t.numero)}
                {t.rotulo ? <span className="text-ink-3"> · {t.rotulo}</span> : null}
              </p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                <Botao tamanho="sm" variante="primario" onClick={() => aoConversarCom(t.numero, c.nome)}>
                  <MessageCircle className="size-4" /> Conversar
                </Botao>
                <a href={`tel:+${t.numero}`} className="inline-flex h-8 items-center gap-1.5 rounded-full border border-linha px-3 text-[12.5px] hover:bg-trilho">
                  <Phone className="size-3.5" /> Ligar
                </a>
                <button
                  className="inline-flex h-8 items-center gap-1.5 rounded-full border border-linha px-3 text-[12.5px] hover:bg-trilho"
                  onClick={async () => {
                    await navigator.clipboard.writeText(t.numero);
                    toast.success("Número copiado");
                  }}
                >
                  <Copy className="size-3.5" /> Copiar
                </button>
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function Tiques({ status }: { status: string }) {
  if (status === "pending") return <Clock className="size-3" aria-label="Enviando" />;
  if (status === "failed") return <CircleAlert className="size-3.5 text-critico" aria-label="Falhou" />;
  if (status === "sent") return <Check className="size-3.5" aria-label="Enviada" />;
  return <CheckCheck className={cn("size-3.5", status === "read" && "text-[#34b7f1]")} aria-label={status === "read" ? "Lida" : "Entregue"} />;
}
