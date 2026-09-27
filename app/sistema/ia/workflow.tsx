"use client";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { Eraser, Play, RotateCcw } from "lucide-react";
import { EstadoVazio, Painel, Selo, TituloSecao } from "@/components/ui/basicos";
import { Botao } from "@/components/ui/botao";
import { Alternar, Campo, Entrada } from "@/components/ui/campos";
import { cn } from "@/lib/cn";
import { LIMITES_CONFIG, NOS, ROTULOS_CONFIG, ROTULOS_RAMO, ROTULOS_STATUS, noPorId, type ConfigWorkflow, type PassoExecucao, type StatusExecucao } from "@/lib/ia/workflow/grafo";
import { CATEGORIAS, Canvas, LegendaStatus, destaqueDaExecucao } from "./canvas";
import { LinhaTentativas } from "./falhas";
import { TIPOS_FALHA, classificarFalha } from "@/lib/ia/workflow/falhas";
import { acaoApagarMemoria, acaoCarregarExecucao, acaoConversaDeTeste, acaoListarExecucoes, acaoReiniciarTeste, acaoSalvarConfigWorkflow, acaoTestarWorkflow } from "./acoes";

const hora = (d: Date | string | null) => (d ? new Date(d).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "");
const duracao = (ms: number | null) => (ms == null ? "" : ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`);

/* ============================================================
   ABA WORKFLOW — o desenho, os ajustes de cada nó e o teste
   ============================================================ */
export function AbaWorkflow({ config, irParaPrompt, irParaExecucoes }: { config: ConfigWorkflow; irParaPrompt: () => void; irParaExecucoes: (id?: number) => void }) {
  const router = useRouter();
  const [c, setC] = useState(config);
  const [sel, setSel] = useState<string | null>("buffer_espera");
  const [pendente, iniciar] = useTransition();
  const mudou = JSON.stringify(c) !== JSON.stringify(config);
  const no = sel ? noPorId(sel) : null;

  const salvar = () =>
    iniciar(async () => {
      const r = await acaoSalvarConfigWorkflow(c);
      if (!r.ok) return void toast.error(r.erro);
      toast.success(r.mensagem);
      router.refresh();
    });

  return (
    <div className="flex flex-col gap-4">
      <Painel className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <TituloSecao className="mb-0">Workflow de atendimento</TituloSecao>
            {config.ativo ? <Selo tom="bom">Ligado</Selo> : <Selo tom="atencao">Desligado</Selo>}
          </div>
          <p className="mt-1 text-[13px] text-ink-2">
            {NOS.filter((n) => !n.auxiliarDe).length} nós + {NOS.filter((n) => n.auxiliarDe).length} auxiliares do agente. Buffer de mensagens, roteamento IA/HUMANO, memória, travas de segurança e envio em blocos. Clique num nó para ver o que ele faz e ajustar.
          </p>
        </div>
        <div className="flex shrink-0 flex-col gap-2 sm:w-[300px]">
          <Alternar marcado={c.ativo} aoMudar={(v) => setC({ ...c, ativo: v })} rotulo={ROTULOS_CONFIG.ativo.rotulo} descricao={c.ativo ? "Toda mensagem do WhatsApp passa por aqui." : "Desligado: vale a triagem antiga."} />
          <Botao variante="primario" disabled={!mudou} carregando={pendente} onClick={salvar}>
            Salvar workflow
          </Botao>
        </div>
      </Painel>

      <div className="grid gap-4 xl:grid-cols-[1fr_340px]">
        <Canvas className="h-[520px]" selecionado={sel} aoSelecionar={setSel} />
        <Painel className="p-4">
          {!no ? (
            <p className="text-[13px] text-ink-3">Clique num nó do desenho.</p>
          ) : (
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <span className="size-3 rounded-full" style={{ background: CATEGORIAS[no.categoria].cor }} />
                <span className="text-[11px] uppercase tracking-wide text-ink-3">{CATEGORIAS[no.categoria].rotulo}</span>
              </div>
              <h3 className="text-[16px] font-semibold text-ink">{no.nome}</h3>
              <p className="text-[13px] text-ink-2">{no.descricao}</p>
              {(no.id === "agente" || no.id === "prompt") && (
                <Botao tamanho="sm" onClick={irParaPrompt}>
                  Ajustar o prompt do agente
                </Botao>
              )}
              {no.config?.map((k) => <CampoConfig key={k} chave={k} valor={c[k]} aoMudar={(v) => setC({ ...c, [k]: v })} />)}
              {!!no.config?.length && mudou && <p className="text-[12px] text-ink-3">Clique em Salvar workflow para aplicar.</p>}
            </div>
          )}
        </Painel>
      </div>

      <TesteDoWorkflow ativo={config.ativo} irParaExecucoes={irParaExecucoes} />
    </div>
  );
}

function CampoConfig({ chave, valor, aoMudar }: { chave: keyof ConfigWorkflow; valor: ConfigWorkflow[keyof ConfigWorkflow]; aoMudar: (v: boolean | number | string) => void }) {
  const r = ROTULOS_CONFIG[chave];
  if (typeof valor === "boolean") return <Alternar marcado={valor} aoMudar={aoMudar} rotulo={r.rotulo} descricao={r.ajuda} />;
  if (typeof valor === "number") {
    const [min, max] = LIMITES_CONFIG[chave as keyof typeof LIMITES_CONFIG];
    return (
      <Campo rotulo={r.rotulo} dica={`${r.ajuda} (de ${min} a ${max})`}>
        <Entrada type="number" min={min} max={max} value={valor} onChange={(e) => aoMudar(Math.min(max, Math.max(min, Number(e.target.value) || 0)))} />
      </Campo>
    );
  }
  return (
    <Campo rotulo={r.rotulo} dica={r.ajuda}>
      <Entrada value={valor} maxLength={40} onChange={(e) => aoMudar(e.target.value)} />
    </Campo>
  );
}

/* ---------------- teste: um chat simulado que roda o workflow de verdade ---------------- */
type MsgTeste = { id: number; autor: string; conteudo: string | null; respostaA: number | null; criadoEm: Date };

function TesteDoWorkflow({ ativo, irParaExecucoes }: { ativo: boolean; irParaExecucoes: (id?: number) => void }) {
  const [texto, setTexto] = useState("");
  const [msgs, setMsgs] = useState<MsgTeste[]>([]);
  const [modo, setModo] = useState("ia");
  const [rodando, setRodando] = useState(false);
  const [pendente, iniciar] = useTransition();
  const fim = useRef<HTMLDivElement>(null);

  const carregar = useCallback(async () => {
    const r = await acaoConversaDeTeste();
    if (r.ok) {
      setMsgs(r.dados.mensagens as MsgTeste[]);
      setModo(r.dados.modo);
    }
    const l = await acaoListarExecucoes();
    if (l.ok) setRodando(l.dados.some((e) => e.gatilho === "teste" && e.status === "rodando" && Date.now() - new Date(e.iniciadoEm).getTime() < 10 * 60_000));
  }, []);

  /* primeira leitura fora do corpo do efeito (setState só no retorno da consulta) */
  useEffect(() => {
    const t = setTimeout(() => void carregar(), 0);
    return () => clearTimeout(t);
  }, [carregar]);
  useEffect(() => {
    if (!rodando) return;
    const t = setInterval(() => void carregar(), 2000);
    return () => clearInterval(t);
  }, [rodando, carregar]);
  useEffect(() => {
    fim.current?.scrollIntoView({ block: "nearest" });
  }, [msgs.length]);

  const enviar = () =>
    iniciar(async () => {
      const r = await acaoTestarWorkflow(texto);
      if (!r.ok) return void toast.error(r.erro);
      setTexto("");
      setRodando(true);
      await carregar();
    });

  return (
    <Painel className="p-4">
      <TituloSecao
        acao={
          <div className="flex gap-2">
            <Botao tamanho="sm" variante="fantasma" onClick={() => irParaExecucoes()}>
              Ver execuções
            </Botao>
            <Botao
              tamanho="sm"
              onClick={() =>
                iniciar(async () => {
                  const r = await acaoReiniciarTeste();
                  if (!r.ok) return void toast.error(r.erro);
                  toast.success(r.mensagem);
                  await carregar();
                })
              }
            >
              <RotateCcw className="size-4" /> Reiniciar teste
            </Botao>
          </div>
        }
      >
        Testar o workflow
      </TituloSecao>
      <p className="mb-3 text-[13px] text-ink-2">
        Escreva como se fosse o cliente. O workflow roda de verdade (buffer, memória, agente, travas), mas nada sai para o WhatsApp.
        {!ativo && " Funciona mesmo com o workflow desligado."} Mande duas mensagens seguidas para ver o buffer juntando as duas.
      </p>
      <div className="rolagem-fina mb-3 flex max-h-[360px] min-h-[160px] flex-col gap-2 overflow-y-auto rounded-2xl border border-linha bg-fundo p-3">
        {msgs.length === 0 && <p className="m-auto text-[13px] text-ink-3">Nenhuma mensagem de teste ainda.</p>}
        {msgs.map((m) =>
          m.autor === "sistema" ? (
            <p key={m.id} className="mx-auto max-w-[90%] rounded-full bg-trilho px-3 py-1 text-center text-[11.5px] text-ink-3">
              {m.conteudo}
            </p>
          ) : (
            <div key={m.id} className={cn("max-w-[80%] whitespace-pre-line rounded-2xl px-3 py-2 text-[13.5px]", m.autor === "cliente" ? "self-end bg-bolha-saida" : "self-start bg-bolha-entrada")}>
              {m.respostaA && <span className="mb-1 block border-l-2 border-marca pl-2 text-[12px] text-ink-3">{msgs.find((x) => x.id === m.respostaA)?.conteudo ?? "mensagem"}</span>}
              {m.conteudo}
            </div>
          ),
        )}
        {rodando && <p className="self-start text-[12px] text-ink-3">workflow rodando…</p>}
        <div ref={fim} />
      </div>
      {modo === "humano" && <p className="mb-2 text-[12.5px] text-ink-2">Esta conversa de teste foi passada para HUMANO: a IA não responde mais até você clicar em Reiniciar teste.</p>}
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (texto.trim()) enviar();
        }}
      >
        <Entrada value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Ex.: Olá boa noite, vi no site a Tank, tenho interesse" maxLength={2000} />
        <Botao variante="primario" type="submit" carregando={pendente} disabled={!texto.trim()}>
          <Play className="size-4" /> Enviar
        </Botao>
      </form>
    </Painel>
  );
}

/* ============================================================
   ABA EXECUÇÕES — onde começou, por onde passou e onde parou
   ============================================================ */
type ItemLista = { id: number; status: string; gatilho: string; conversaId: number | null; contato: string | null; telefone: string | null; noAtual: string | null; paradoEm: string | null; motivo: string | null; iniciadoEm: Date; duracaoMs: number | null };
type Detalhe = ItemLista & { passos: PassoExecucao[]; finalizadoEm: Date | null; memoria: { fatos: Record<string, string | null>; resumo: string | null; limpaEm: Date | null } | null };

const interrompida = (e: { status: string; iniciadoEm: Date }) => e.status === "rodando" && Date.now() - new Date(e.iniciadoEm).getTime() > 10 * 60_000;
const TOM: Record<StatusExecucao, "bom" | "atencao" | "critico" | "info"> = { sucesso: "bom", parou: "atencao", erro: "critico", rodando: "info" };

function SeloStatus({ e }: { e: { status: string; iniciadoEm: Date } }) {
  if (interrompida(e)) return <Selo tom="critico">Interrompida</Selo>;
  const s = e.status as StatusExecucao;
  return <Selo tom={TOM[s] ?? "neutro"}>{ROTULOS_STATUS[s] ?? s}</Selo>;
}

export function AbaExecucoes({ inicial }: { inicial: number | null }) {
  const [lista, setLista] = useState<ItemLista[] | null>(null);
  const [selId, setSelId] = useState<number | null>(inicial);
  const [det, setDet] = useState<Detalhe | null>(null);
  const [filtro, setFiltro] = useState<"todas" | StatusExecucao>("todas");
  const [erro, setErro] = useState<string | null>(null);

  const carregarLista = useCallback(async () => {
    const r = await acaoListarExecucoes();
    if (!r.ok) return setErro(r.erro);
    setLista(r.dados as ItemLista[]);
    setSelId((s) => s ?? (r.dados[0]?.id as number | undefined) ?? null);
  }, []);
  const carregarDet = useCallback(async (id: number) => {
    const r = await acaoCarregarExecucao(id);
    if (r.ok) setDet(r.dados as unknown as Detalhe);
  }, []);

  useEffect(() => {
    const primeira = setTimeout(() => void carregarLista(), 0);
    const t = setInterval(() => void carregarLista(), 4000);
    return () => {
      clearTimeout(primeira);
      clearInterval(t);
    };
  }, [carregarLista]);
  useEffect(() => {
    if (selId == null) return;
    const t = setTimeout(() => void carregarDet(selId), 0);
    return () => clearTimeout(t);
  }, [selId, carregarDet]);
  /* enquanto a execução aberta roda, acompanha nó a nó */
  useEffect(() => {
    if (!det || det.status !== "rodando" || interrompida(det)) return;
    const t = setInterval(() => void carregarDet(det.id), 1500);
    return () => clearInterval(t);
  }, [det, carregarDet]);

  if (erro) return <EstadoVazio titulo="Não foi possível carregar" texto={erro} />;
  if (!lista) return <p className="text-[13px] text-ink-3">Carregando execuções…</p>;
  const visiveis = lista.filter((e) => filtro === "todas" || e.status === filtro);
  const contagem = (s: StatusExecucao) => lista.filter((e) => e.status === s).length;

  return (
    <div className="grid gap-4 xl:grid-cols-[360px_1fr]">
      <Painel className="flex h-fit flex-col gap-2 p-3">
        <div className="flex flex-wrap gap-1">
          {(["todas", "sucesso", "parou", "erro", "rodando"] as const).map((f) => (
            <button key={f} type="button" onClick={() => setFiltro(f)} className={cn("rounded-full px-3 py-1 text-[12px]", filtro === f ? "bg-ink font-semibold text-contra-ink" : "text-ink-2 hover:bg-trilho")}>
              {f === "todas" ? `Todas (${lista.length})` : `${ROTULOS_STATUS[f]} (${contagem(f)})`}
            </button>
          ))}
        </div>
        {visiveis.length === 0 ? (
          <p className="p-3 text-[13px] text-ink-3">Nenhuma execução {filtro === "todas" ? "ainda. Use o teste da aba Workflow ou ligue o workflow." : "com este status."}</p>
        ) : (
          <ul className="rolagem-fina flex max-h-[640px] flex-col gap-1 overflow-y-auto">
            {visiveis.map((e) => (
              <li key={e.id}>
                <button type="button" onClick={() => setSelId(e.id)} className={cn("w-full rounded-xl border px-3 py-2 text-left text-[12.5px] transition", selId === e.id ? "border-ink bg-trilho" : "border-linha hover:border-linha-forte")}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-ink">#{e.id} · {e.contato ?? e.telefone ?? "conversa apagada"}</span>
                    <SeloStatus e={e} />
                  </div>
                  <div className="mt-0.5 text-ink-3">
                    {hora(e.iniciadoEm)} · {e.gatilho === "teste" ? "teste" : "WhatsApp"} {e.duracaoMs != null && `· ${duracao(e.duracaoMs)}`}
                  </div>
                  {e.status === "rodando" && e.noAtual && !interrompida(e) && (
                    <div className="mt-0.5 text-ink-2">
                      Agora em: {noPorId(e.noAtual)?.nome}
                      {e.motivo ? <span className="block text-[#fb923c]">{e.motivo}</span> : null}
                    </div>
                  )}
                  {e.paradoEm && (
                    <div className="mt-0.5 text-ink-2">
                      Parou em <b>{noPorId(e.paradoEm)?.nome ?? e.paradoEm}</b>
                      {e.motivo ? `: ${e.motivo}` : ""}
                    </div>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </Painel>
      {det ? <DetalheExecucao det={det} aoApagarMemoria={() => carregarDet(det.id)} /> : <EstadoVazio titulo="Selecione uma execução" texto="Cada mensagem recebida gera uma execução com o caminho completo pelo workflow." />}
    </div>
  );
}

function DetalheExecucao({ det, aoApagarMemoria }: { det: Detalhe; aoApagarMemoria: () => void }) {
  const [aberto, setAberto] = useState<number | null>(null);
  const [selNo, setSelNo] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();
  const destaque = destaqueDaExecucao(det.passos, det.status === "rodando" && !interrompida(det) ? det.noAtual : null);
  const inicio = det.passos[0];
  const ultimo = det.passos.at(-1);
  const fatos = Object.entries(det.memoria?.fatos ?? {}).filter(([, v]) => v);

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <Painel className="p-4">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <h3 className="text-[16px] font-semibold text-ink">Execução #{det.id}</h3>
          <SeloStatus e={det} />
          <span className="text-[12.5px] text-ink-3">
            {det.contato ?? det.telefone} · {det.gatilho === "teste" ? "teste do painel" : "WhatsApp"}
          </span>
        </div>
        <div className="mb-3 grid gap-2 text-[12.5px] sm:grid-cols-3">
          <div className="rounded-xl border border-linha p-2">
            <div className="text-ink-3">Começou</div>
            <div className="font-semibold text-ink">{hora(det.iniciadoEm)}</div>
            <div className="text-ink-3">no nó {inicio ? noPorId(inicio.no)?.nome : "—"}</div>
          </div>
          <div className="rounded-xl border border-linha p-2">
            <div className="text-ink-3">{det.status === "rodando" ? "Rodando agora" : det.status === "sucesso" ? "Terminou" : "Parou"}</div>
            <div className="font-semibold text-ink">{det.status === "rodando" ? (noPorId(det.noAtual ?? "")?.nome ?? "—") : (noPorId(det.paradoEm ?? ultimo?.no ?? "")?.nome ?? "—")}</div>
            <div className="text-ink-3">{det.finalizadoEm ? hora(det.finalizadoEm) : ""}</div>
          </div>
          <div className="rounded-xl border border-linha p-2">
            <div className="text-ink-3">Duração · passos</div>
            <div className="font-semibold text-ink">{det.duracaoMs != null ? duracao(det.duracaoMs) : "—"} · {det.passos.length}</div>
            <div className="text-ink-3 line-clamp-2">{det.motivo ?? ""}</div>
          </div>
        </div>
        <Canvas className="h-[380px]" destaque={destaque} selecionado={selNo} aoSelecionar={(id) => {
          setSelNo(id);
          const i = det.passos.findLastIndex((p) => p.no === id);
          setAberto(i >= 0 ? i : null);
          if (i >= 0) document.getElementById(`passo-${det.id}-${i}`)?.scrollIntoView({ behavior: "smooth", block: "nearest" });
        }} />
        <div className="mt-2">
          <LegendaStatus />
        </div>
      </Painel>

      <Painel className="p-4">
        <TituloSecao>Passo a passo</TituloSecao>
        <ol className="flex flex-col gap-1.5">
          {det.passos.map((p, i) => {
            const no = noPorId(p.no);
            const cor = p.status === "erro" ? "#dc2626" : p.status === "parou" ? "#f59e0b" : p.tentativas?.length ? "#fb923c" : "#16a34a";
            return (
              <li key={i} id={`passo-${det.id}-${i}`} className={cn("rounded-xl border", aberto === i ? "border-linha-forte" : "border-linha")}>
                <button type="button" onClick={() => setAberto(aberto === i ? null : i)} className="flex w-full items-center gap-2 px-3 py-2 text-left text-[12.5px]">
                  <span className="num w-6 shrink-0 text-ink-3">{i + 1}</span>
                  <span className="size-2.5 shrink-0 rounded-full" style={{ background: cor }} />
                  <span className="min-w-0 flex-1">
                    <span className="font-semibold text-ink">{no?.nome ?? p.no}</span>
                    {p.ramo && p.ramo !== "ok" && <span className="ml-2 rounded-full bg-trilho px-2 py-0.5 text-[11px] text-ink-2">→ {ROTULOS_RAMO[p.ramo] ?? p.ramo}</span>}
                    {p.detalhe && <span className="block text-ink-2">{p.detalhe}</span>}
                    {!!p.tentativas?.length && (
                      <span className="block text-ink-3">
                        {p.status === "erro" ? `Falhou nas ${p.tentativas.length} tentativas` : `Deu certo na ${p.tentativas.length + 1}ª tentativa`} · {TIPOS_FALHA[classificarFalha(p.tentativas.at(-1)!.erro)].rotulo}
                      </span>
                    )}
                  </span>
                  <span className="shrink-0 text-ink-3">{duracao(p.ms)}</span>
                </button>
                {aberto === i && !!p.tentativas?.length && (
                  <div className="border-t border-linha p-3">
                    <p className="mb-1 text-[11px] uppercase tracking-wide text-ink-3">Tentativas</p>
                    <LinhaTentativas tentativas={p.tentativas} recuperou={p.status !== "erro"} />
                    <p className="mt-2 text-[12px] text-ink-2">{TIPOS_FALHA[classificarFalha(p.tentativas.at(-1)!.erro)].dica}</p>
                  </div>
                )}
                {aberto === i && (
                  <div className="grid gap-2 border-t border-linha p-3 md:grid-cols-2">
                    <BlocoJson titulo="Entrada" valor={p.entrada} />
                    <BlocoJson titulo="Saída" valor={p.saida} />
                  </div>
                )}
              </li>
            );
          })}
          {det.status === "rodando" && !interrompida(det) && (
            <li className="px-3 py-2 text-[12.5px] text-ink-3">
              rodando: {noPorId(det.noAtual ?? "")?.nome}…{det.motivo ? <span className="block text-[#fb923c]">{det.motivo}</span> : null}
            </li>
          )}
          {interrompida(det) && <li className="px-3 py-2 text-[12.5px] text-critico">A execução não terminou (o servidor pode ter reiniciado no meio). Último nó: {noPorId(det.noAtual ?? "")?.nome ?? "—"}.</li>}
        </ol>
      </Painel>

      {det.conversaId && (
        <Painel className="p-4">
          <TituloSecao
            acao={
              <Botao
                tamanho="sm"
                carregando={pendente}
                onClick={() => {
                  if (!confirm("Apagar a memória da IA para esta conversa? O histórico de mensagens continua na conversa, mas a IA passa a começar do zero.")) return;
                  iniciar(async () => {
                    const r = await acaoApagarMemoria(det.conversaId!);
                    if (!r.ok) return void toast.error(r.erro);
                    toast.success(r.mensagem);
                    aoApagarMemoria();
                  });
                }}
              >
                <Eraser className="size-4" /> Apagar memória
              </Botao>
            }
          >
            Memória da IA nesta conversa
          </TituloSecao>
          {!det.memoria || (!fatos.length && !det.memoria.resumo) ? (
            <p className="text-[13px] text-ink-3">Nada guardado ainda.</p>
          ) : (
            <div className="flex flex-col gap-2 text-[13px]">
              {det.memoria.resumo && <p className="text-ink-2">{det.memoria.resumo}</p>}
              {!!fatos.length && (
                <dl className="grid gap-x-4 gap-y-1 sm:grid-cols-2">
                  {fatos.map(([k, v]) => (
                    <div key={k} className="flex gap-2">
                      <dt className="text-ink-3">{k}:</dt>
                      <dd className="text-ink">{v}</dd>
                    </div>
                  ))}
                </dl>
              )}
            </div>
          )}
          {det.memoria?.limpaEm && <p className="mt-2 text-[12px] text-ink-3">Memória conta a partir de {hora(det.memoria.limpaEm)}.</p>}
        </Painel>
      )}
    </div>
  );
}

function BlocoJson({ titulo, valor }: { titulo: string; valor: unknown }) {
  return (
    <div className="min-w-0">
      <div className="mb-1 text-[11px] uppercase tracking-wide text-ink-3">{titulo}</div>
      <pre className="rolagem-fina max-h-[280px] overflow-auto whitespace-pre-wrap break-words rounded-lg bg-trilho p-2 text-[11.5px] leading-relaxed text-ink">{valor === undefined ? "—" : JSON.stringify(valor, null, 2)}</pre>
    </div>
  );
}
