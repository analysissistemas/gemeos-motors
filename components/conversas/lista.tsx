"use client";
import { Bot, CalendarClock, Check, CheckCheck, FlaskConical, MessagesSquare, Search } from "lucide-react";
import type { ItemConversa } from "@/lib/consultas/conversas";
import type { FiltroConversa } from "@/lib/consultas/conversas.tipos";
import { FILTROS_CONVERSA } from "@/lib/consultas/conversas.tipos";
import { STATUS_CONVERSA } from "@/lib/dominio";
import { formatarTelefone } from "@/lib/formato";
import { cn } from "@/lib/cn";
import { Avatar, EstadoVazio } from "@/components/ui/basicos";
import { Botao } from "@/components/ui/botao";
import { ETIQUETA_ETAPA, horaLista } from "./util";

export function ListaConversas({
  itens,
  aberta,
  filtro,
  busca,
  carregando,
  temMais,
  simulado,
  usuarioId,
  aoFiltrar,
  aoBuscar,
  aoAbrir,
  aoCarregarMais,
  aoSimular,
  podeSimular,
}: {
  itens: ItemConversa[];
  aberta: number | null;
  filtro: FiltroConversa;
  busca: string;
  carregando: boolean;
  temMais: boolean;
  simulado: boolean;
  usuarioId: number;
  aoFiltrar: (f: FiltroConversa) => void;
  aoBuscar: (q: string) => void;
  aoAbrir: (id: number) => void;
  aoCarregarMais: () => void;
  aoSimular: () => void;
  /** modo simulado, ou administrador (simula mesmo com o WhatsApp real: nada sai) */
  podeSimular?: boolean;
}) {
  const naoLidas = itens.reduce((s, i) => s + i.naoLidas, 0);
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-b border-linha px-4 pb-3 pt-4">
        <div className="mb-3 flex items-center gap-2">
          <h1 className="flex-1 text-[20px] font-bold tracking-tight">Conversas</h1>
          <span className={cn("rounded-full border px-2 py-0.5 text-[11px] font-medium", simulado ? "border-atencao/50 bg-atencao/10" : "border-bom/50 bg-bom/10")} title={simulado ? "Nenhuma mensagem sai para o WhatsApp de verdade" : "Conectado ao WhatsApp Business"}>
            {simulado ? "WhatsApp — Simulado" : "WhatsApp"}
          </span>
          {(podeSimular ?? simulado) && (
            <Botao tamanho="sm" variante="fantasma" onClick={aoSimular} title="Simular mensagem de cliente" aria-label="Simular mensagem de cliente">
              <FlaskConical className="size-4" />
            </Botao>
          )}
        </div>
        <label className="relative block">
          <span className="sr-only">Buscar conversa</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-3" />
          <input
            value={busca}
            onChange={(e) => aoBuscar(e.target.value)}
            placeholder="Nome, telefone, CPF, veículo ou nº do negócio"
            className="h-10 w-full rounded-full border border-linha bg-plano/60 pl-9 pr-3 text-[14px] outline-none placeholder:text-ink-3 focus:border-ink-2"
          />
        </label>
        <div className="rolagem-fina -mx-4 mt-3 flex gap-1.5 overflow-x-auto px-4 pb-0.5" role="tablist" aria-label="Filtros">
          {(Object.keys(FILTROS_CONVERSA) as FiltroConversa[]).map((f) => (
            <button
              key={f}
              role="tab"
              aria-selected={filtro === f}
              onClick={() => aoFiltrar(f)}
              className={cn("shrink-0 rounded-full border px-3 py-1.5 text-[12.5px] transition", filtro === f ? "border-ink bg-ink font-semibold text-contra-ink" : "border-linha text-ink-2 hover:border-linha-forte")}
            >
              {FILTROS_CONVERSA[f]}
              {f === "nao_lidas" && naoLidas > 0 ? ` · ${naoLidas}` : ""}
            </button>
          ))}
        </div>
      </div>

      <ul className={cn("rolagem-fina min-h-0 flex-1 overflow-y-auto", carregando && "opacity-60")} aria-busy={carregando}>
        {itens.length === 0 && !carregando ? (
          <li>
            <EstadoVazio
              icone={<MessagesSquare />}
              titulo={busca || filtro !== "todas" ? "Nenhuma conversa com este filtro" : "Nenhuma conversa ainda"}
              texto={busca || filtro !== "todas" ? "Tente outro filtro ou limpe a busca." : simulado ? "Use o simulador (ícone do frasco) ou carregue as conversas de demonstração em Configurações." : "As conversas aparecem aqui quando os clientes mandarem mensagem."}
            />
          </li>
        ) : (
          itens.map((c) => {
            const nome = c.clienteNome ?? c.contatoNome ?? formatarTelefone(c.contatoTelefone);
            const on = c.id === aberta;
            return (
              <li key={c.id}>
                <button
                  onClick={() => aoAbrir(c.id)}
                  aria-current={on ? "true" : undefined}
                  className={cn("flex w-full items-start gap-3 border-b border-linha px-4 py-3 text-left transition", on ? "bg-vidro-forte" : "hover:bg-trilho active:bg-trilho")}
                >
                  <span className="relative shrink-0">
                    <Avatar nome={nome} foto={c.clienteFoto} tamanho="xl" />
                    {c.etapa && <span className="absolute -bottom-0.5 -right-0.5 size-3.5 rounded-full border-2 border-elevado" style={{ background: `var(--etapa-${c.etapa})` }} aria-hidden />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline gap-2">
                      <span className={cn("min-w-0 flex-1 truncate text-[15px]", c.naoLidas ? "font-bold" : "font-semibold")}>{nome}</span>
                      <span className={cn("shrink-0 text-[11.5px]", c.naoLidas ? "font-semibold text-ink" : "text-ink-3")}>{horaLista(c.ultimaMensagemEm)}</span>
                    </span>
                    <span className="mt-0.5 flex items-center gap-1.5">
                      {c.ultimaMensagemDirecao === "outgoing" && (c.naoLidas ? <Check className="size-3.5 shrink-0 text-ink-3" /> : <CheckCheck className="size-3.5 shrink-0 text-ink-3" />)}
                      <span className={cn("min-w-0 flex-1 truncate text-[13.5px]", c.naoLidas ? "text-ink" : "text-ink-2")}>{c.ultimaMensagemTexto ?? "Sem mensagens"}</span>
                      {c.naoLidas > 0 && (
                        <span className="num min-w-5 shrink-0 rounded-full bg-marca px-1.5 text-center text-[11px] font-bold leading-5 text-black" aria-label={`${c.naoLidas} não lidas`}>
                          {c.naoLidas}
                        </span>
                      )}
                    </span>
                    <span className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11.5px] text-ink-3">
                      {c.etapa && (
                        <span className="flex items-center gap-1 text-ink-2">
                          <span className="size-2 rounded-full" style={{ background: `var(--etapa-${c.etapa})` }} aria-hidden />
                          {ETIQUETA_ETAPA[c.etapa]}
                        </span>
                      )}
                      {c.modo === "ia" ? (
                        <span className={cn("flex items-center gap-1", c.triagemPronta && "font-semibold text-ink")}>
                          <Bot className="size-3" /> {c.triagemPronta ? "Aguardando consultor" : "Triagem IA"}
                        </span>
                      ) : (
                        <span>{STATUS_CONVERSA[c.status as keyof typeof STATUS_CONVERSA]}</span>
                      )}
                      <span className="flex min-w-0 items-center gap-1">
                        {c.responsavelFoto && <Avatar nome={c.responsavelNome} foto={c.responsavelFoto} tamanho="xs" />}
                        <span className="truncate">{c.responsavelId ? (c.responsavelId === usuarioId ? "Você" : c.responsavelNome) : "Sem responsável"}</span>
                      </span>
                      {c.proximoFollowUp && (
                        <span className="flex items-center gap-1" title="Follow-up agendado">
                          <CalendarClock className="size-3" /> {horaLista(c.proximoFollowUp)}
                        </span>
                      )}
                      {c.prioridade === "alta" && <span className="rounded-full bg-serio/15 px-1.5 font-semibold text-ink">Prioridade</span>}
                      {c.demo && <span className="rounded-full bg-atencao/15 px-1.5 text-ink-2">Simulado</span>}
                    </span>
                  </span>
                </button>
              </li>
            );
          })
        )}
        {temMais && (
          <li className="p-3 text-center">
            <Botao tamanho="sm" onClick={aoCarregarMais} carregando={carregando}>
              Carregar mais conversas
            </Botao>
          </li>
        )}
      </ul>
    </div>
  );
}
