"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { FileText, Mic, Paperclip, Send, Sticker, StickyNote, X, Zap } from "lucide-react";
import { cn } from "@/lib/cn";
import { EMOJIS } from "./util";
import { useGravador } from "./gravador";

export type Resposta = { id: number; atalho: string; titulo: string; conteudo: string };
export type EnvioChat =
  | { modo: "mensagem"; tipo: "texto"; conteudo: string }
  | { modo: "mensagem"; tipo: "imagem" | "documento"; conteudo: string; midia: { url: string; nome: string; mime: string; tamanho: number } }
  | { modo: "mensagem"; tipo: "audio"; blob: Blob; mime: string; duracao: number }
  | { modo: "nota"; conteudo: string };

const LIMITE_ARQUIVO = 2 * 1024 * 1024;

export function Compositor({ respostas, desabilitado, aoEnviar }: { respostas: Resposta[]; simulado?: boolean; desabilitado?: boolean; aoEnviar: (e: EnvioChat) => Promise<boolean> }) {
  const [texto, setTexto] = useState("");
  const [nota, setNota] = useState(false);
  const [emoji, setEmoji] = useState(false);
  const [rapidas, setRapidas] = useState(false);
  const [anexo, setAnexo] = useState<{ url: string; nome: string; mime: string; tamanho: number } | null>(null);
  const [enviando, setEnviando] = useState(false);
  const area = useRef<HTMLTextAreaElement>(null);
  const arquivo = useRef<HTMLInputElement>(null);

  /* altura automática até ~6 linhas */
  useEffect(() => {
    const a = area.current;
    if (!a) return;
    a.style.height = "auto";
    a.style.height = `${Math.min(a.scrollHeight, 150)}px`;
  }, [texto]);

  /* ao tocar em enviar a gravação termina e o áudio segue direto para o envio */
  const gravador = useGravador(
    (msg) => toast.error(msg),
    async (g) => {
      setEnviando(true);
      await aoEnviar({ modo: "mensagem", tipo: "audio", blob: g.blob, mime: g.mime, duracao: g.duracao });
      setEnviando(false);
    },
  );
  const gravando = gravador.estado === "gravando";

  const filtroRapida = texto.startsWith("/") ? texto.slice(1).toLowerCase() : null;
  const sugestoes = useMemo(
    () => (filtroRapida != null || rapidas ? respostas.filter((r) => !filtroRapida || r.atalho.startsWith(filtroRapida) || r.titulo.toLowerCase().includes(filtroRapida)) : []),
    [filtroRapida, rapidas, respostas],
  );

  async function enviar() {
    if (enviando || desabilitado) return;
    const conteudo = texto.trim();
    let e: EnvioChat | null = null;
    if (nota) {
      if (!conteudo) return;
      e = { modo: "nota", conteudo };
    } else if (anexo) {
      e = { modo: "mensagem", tipo: anexo.mime.startsWith("image/") ? "imagem" : "documento", conteudo, midia: anexo };
    } else if (conteudo) {
      e = { modo: "mensagem", tipo: "texto", conteudo };
    }
    if (!e) return;
    setEnviando(true);
    const ok = await aoEnviar(e);
    setEnviando(false);
    if (ok) {
      setTexto("");
      setAnexo(null);
      setRapidas(false);
      area.current?.focus();
    }
  }

  function escolherArquivo(f: File | undefined) {
    if (!f) return;
    if (f.size > LIMITE_ARQUIVO) return void toast.error("Arquivo acima de 2 MB. No modo simulado o limite é 2 MB.");
    const leitor = new FileReader();
    leitor.onload = () => setAnexo({ url: String(leitor.result), nome: f.name, mime: f.type || "application/octet-stream", tamanho: f.size });
    leitor.readAsDataURL(f);
  }

  const podeEnviar = !!(texto.trim() || (anexo && !nota));

  return (
    <div className="relative border-t border-linha bg-[var(--cabecalho)] px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 backdrop-blur-xl sm:px-3">
      {sugestoes.length > 0 && (
        <ul className="absolute bottom-full left-2 right-2 mb-2 max-h-64 overflow-auto rounded-2xl border border-linha-forte bg-elevado p-1 shadow-alta" role="listbox" aria-label="Respostas rápidas">
          {sugestoes.map((r) => (
            <li key={r.id}>
              <button
                className="flex w-full flex-col rounded-xl px-3 py-2 text-left hover:bg-trilho"
                onClick={() => {
                  setTexto(r.conteudo);
                  setRapidas(false);
                  area.current?.focus();
                }}
              >
                <span className="text-[13px] font-semibold">
                  /{r.atalho} <span className="font-normal text-ink-3">· {r.titulo}</span>
                </span>
                <span className="line-clamp-2 text-[12.5px] text-ink-2">{r.conteudo}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {emoji && (
        <div className="absolute bottom-full left-2 mb-2 grid w-[280px] grid-cols-6 gap-1 rounded-2xl border border-linha-forte bg-elevado p-2 shadow-alta">
          {EMOJIS.map((em) => (
            <button
              key={em}
              className="grid size-10 place-items-center rounded-xl text-[22px] hover:bg-trilho"
              onClick={() => {
                setTexto((t) => t + em);
                area.current?.focus();
              }}
              aria-label={`Inserir ${em}`}
            >
              {em}
            </button>
          ))}
        </div>
      )}

      {nota && (
        <p className="mb-1.5 flex items-center gap-1.5 px-2 text-[12px] font-medium">
          <StickyNote className="size-3.5 text-marca" /> Nota interna — só a equipe vê, o cliente não recebe.
        </p>
      )}
      {anexo && !nota && (
        <div className="mb-2 flex items-center gap-3 rounded-2xl border border-linha bg-elevado p-2">
          {anexo.mime.startsWith("image/") ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={anexo.url} alt="" className="size-12 rounded-lg object-cover" />
          ) : (
            <span className="grid size-12 place-items-center rounded-lg bg-trilho">
              <FileText className="size-5" />
            </span>
          )}
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13px] font-medium">{anexo.nome}</span>
            <span className="text-[11.5px] text-ink-3">{Math.ceil(anexo.tamanho / 1024)} KB · adicione uma legenda se quiser</span>
          </span>
          <button className="grid size-8 place-items-center rounded-full hover:bg-trilho" onClick={() => setAnexo(null)} aria-label="Remover anexo">
            <X className="size-4" />
          </button>
        </div>
      )}

      {gravando ? (
        <div className="flex items-center gap-3 rounded-full border border-critico/40 bg-critico/10 px-4 py-2" role="status" aria-live="polite">
          <span className="size-2.5 animate-pulse rounded-full bg-critico" aria-hidden />
          <span className="num flex-1 text-[14px]">
            Gravando · {Math.floor(gravador.segundos / 60)}:{String(gravador.segundos % 60).padStart(2, "0")}
          </span>
          <button className="text-[13px] text-ink-2 hover:text-ink" onClick={gravador.cancelar}>
            Cancelar
          </button>
          <button className="grid size-10 place-items-center rounded-full bg-ink text-contra-ink" aria-label="Enviar áudio" onClick={gravador.parar}>
            <Send className="size-4" />
          </button>
        </div>
      ) : (
        <div className="flex items-end gap-1">
          <div className="flex shrink-0 items-center pb-1">
            <BotaoIcone rotulo="Emoji" ativo={emoji} onClick={() => { setEmoji((v) => !v); setRapidas(false); }}>
              <Sticker className="size-5" />
            </BotaoIcone>
            <BotaoIcone rotulo="Respostas rápidas (ou digite /)" ativo={rapidas} onClick={() => { setRapidas((v) => !v); setEmoji(false); }}>
              <Zap className="size-5" />
            </BotaoIcone>
            {!nota && (
              <BotaoIcone rotulo="Anexar imagem ou documento" onClick={() => arquivo.current?.click()} className="max-sm:hidden">
                <Paperclip className="size-5" />
              </BotaoIcone>
            )}
          </div>
          <div className={cn("flex min-w-0 flex-1 items-end rounded-3xl border px-3", nota ? "border-marca/60 bg-bolha-nota" : "border-linha bg-plano/70")}>
            <textarea
              ref={area}
              rows={1}
              value={texto}
              disabled={desabilitado}
              onChange={(e) => {
                setTexto(e.target.value);
                if (emoji) setEmoji(false);
              }}
              onKeyDown={(e) => {
                /* Enter envia no computador; no celular o Enter quebra linha e o botão envia */
                if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing && window.matchMedia("(pointer: fine)").matches) {
                  e.preventDefault();
                  enviar();
                }
                if (e.key === "Escape") {
                  setRapidas(false);
                  setEmoji(false);
                }
              }}
              placeholder={nota ? "Escreva a nota interna…" : "Mensagem"}
              aria-label={nota ? "Nota interna" : "Mensagem"}
              className="max-h-[150px] min-h-[40px] flex-1 resize-none bg-transparent py-2.5 text-[15px] leading-snug outline-none placeholder:text-ink-3"
            />
            {!nota && (
              <button className="mb-1.5 grid size-8 shrink-0 place-items-center rounded-full text-ink-3 hover:text-ink sm:hidden" onClick={() => arquivo.current?.click()} aria-label="Anexar">
                <Paperclip className="size-5" />
              </button>
            )}
          </div>
          <button
            onClick={() => setNota((v) => !v)}
            aria-pressed={nota}
            title={nota ? "Voltar para mensagem" : "Escrever nota interna"}
            aria-label={nota ? "Voltar para mensagem" : "Escrever nota interna"}
            className={cn("mb-0.5 grid size-10 shrink-0 place-items-center rounded-full transition", nota ? "bg-marca text-black" : "text-ink-2 hover:bg-trilho hover:text-ink")}
          >
            <StickyNote className="size-5" />
          </button>
          {podeEnviar || nota ? (
            <button
              onClick={enviar}
              disabled={!podeEnviar || enviando || desabilitado}
              aria-label={nota ? "Salvar nota" : "Enviar mensagem"}
              className="mb-0.5 grid size-11 shrink-0 place-items-center rounded-full bg-ink text-contra-ink transition disabled:opacity-40"
            >
              <Send className="size-5" />
            </button>
          ) : (
            <button onClick={gravador.iniciar} disabled={gravador.estado === "pedindo" || enviando || desabilitado} aria-label="Gravar áudio" title="Gravar áudio" className="mb-0.5 grid size-11 shrink-0 place-items-center rounded-full bg-ink text-contra-ink disabled:opacity-40">
              <Mic className="size-5" />
            </button>
          )}
        </div>
      )}
      <input ref={arquivo} type="file" hidden accept="image/png,image/jpeg,image/webp,application/pdf,.doc,.docx" onChange={(e) => { escolherArquivo(e.target.files?.[0]); e.target.value = ""; }} />
    </div>
  );
}

function BotaoIcone({ rotulo, ativo, onClick, children, className }: { rotulo: string; ativo?: boolean; onClick: () => void; children: React.ReactNode; className?: string }) {
  return (
    <button onClick={onClick} aria-label={rotulo} title={rotulo} aria-pressed={ativo} className={cn("grid size-10 place-items-center rounded-full transition", ativo ? "bg-trilho text-ink" : "text-ink-2 hover:bg-trilho hover:text-ink", className)}>
      {children}
    </button>
  );
}
