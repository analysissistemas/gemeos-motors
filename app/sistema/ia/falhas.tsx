"use client";
import { useCallback, useEffect, useState } from "react";
import { EstadoVazio, Painel, Selo, TituloSecao } from "@/components/ui/basicos";
import { Botao } from "@/components/ui/botao";
import { cn } from "@/lib/cn";
import { noPorId } from "@/lib/ia/workflow/grafo";
import { TIPOS_FALHA, type ResumoFalha, type Tentativa } from "@/lib/ia/workflow/falhas";
import { acaoListarFalhas } from "./acoes";

const hora = (d: Date | string) => new Date(d).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" });
const segundos = (ms: number) => (ms >= 60_000 ? `${Math.round(ms / 60_000)} min` : `${Math.round(ms / 1000)} s`);

type Linha = { id: number; status: string; gatilho: string; contato: string | null; telefone: string | null; iniciadoEm: Date; falhas: ResumoFalha[] };

/* ============================================================
   ABA FALHAS — cada vez que a IA (ou o envio) falhou: onde no fluxo,
   o motivo em linguagem simples, o que fazer, as tentativas e o desfecho.
   ============================================================ */
export function AbaFalhas({ abrirExecucao }: { abrirExecucao: (id: number) => void }) {
  const [linhas, setLinhas] = useState<Linha[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    const r = await acaoListarFalhas();
    if (!r.ok) return setErro(r.erro);
    setLinhas(r.dados as Linha[]);
  }, []);
  useEffect(() => {
    const primeira = setTimeout(() => void carregar(), 0);
    const t = setInterval(() => void carregar(), 5000);
    return () => {
      clearTimeout(primeira);
      clearInterval(t);
    };
  }, [carregar]);

  if (erro) return <EstadoVazio titulo="Não foi possível carregar" texto={erro} />;
  if (!linhas) return <p className="text-[13px] text-ink-3">Carregando falhas…</p>;

  const todas = linhas.flatMap((l) => l.falhas.map((f) => ({ ...f, execucao: l })));
  const recuperadas = todas.filter((f) => f.recuperou).length;
  const porTipo = Object.entries(todas.reduce<Record<string, number>>((a, f) => ((a[f.tipo] = (a[f.tipo] ?? 0) + 1), a), {})).sort((a, b) => b[1] - a[1]);

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Cartao rotulo="Falhas (últimos 30 dias)" valor={todas.length} />
        <Cartao rotulo="Resolvidas tentando de novo" valor={recuperadas} tom="bom" />
        <Cartao rotulo="Não resolvidas" valor={todas.length - recuperadas} tom={todas.length - recuperadas ? "critico" : undefined} />
        <Cartao rotulo="Motivo mais comum" valor={porTipo[0] ? TIPOS_FALHA[porTipo[0][0] as keyof typeof TIPOS_FALHA].rotulo : "—"} pequeno />
      </div>

      <Painel className="p-4">
        <TituloSecao>Como funciona</TituloSecao>
        <p className="text-[13px] text-ink-2">
          Quando a IA ou o envio pelo WhatsApp falha, o workflow tenta de novo <b>3 vezes</b>, esperando cada vez mais (IA e envio: 5 s, 20 s e 1 min; análise de mídia: 3 s, 10 s e 30 s). Se as 4 tentativas falharem, a IA passa a conversa para um vendedor e a mídia segue sem análise. Tudo fica registrado aqui, com o ponto exato do fluxo.
        </p>
      </Painel>

      {todas.length === 0 ? (
        <Painel>
          <EstadoVazio titulo="Nenhuma falha registrada" texto="Quando a IA falhar, aparece aqui onde foi, por quê e o que o sistema fez." />
        </Painel>
      ) : (
        <ul className="flex flex-col gap-3">
          {todas.map((f, i) => {
            const tipo = TIPOS_FALHA[f.tipo] ?? TIPOS_FALHA.outro;
            return (
              <li key={`${f.execucao.id}-${f.no}-${i}`}>
                <Painel className="p-4">
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    {f.recuperou ? <Selo tom="bom">Resolvida</Selo> : <Selo tom="critico">Não resolvida</Selo>}
                    <span className="text-[14px] font-semibold text-ink">{tipo.rotulo}</span>
                    <span className="text-[12.5px] text-ink-3">
                      · execução #{f.execucao.id} · {f.execucao.contato ?? f.execucao.telefone ?? "conversa apagada"} · {hora(f.execucao.iniciadoEm)}
                    </span>
                  </div>
                  <div className="grid gap-3 text-[13px] md:grid-cols-[1fr_1fr]">
                    <div className="flex flex-col gap-1.5">
                      <p>
                        <span className="text-ink-3">Onde no fluxo: </span>
                        <b className="text-ink">{noPorId(f.no)?.nome ?? f.no}</b>
                      </p>
                      <p>
                        <span className="text-ink-3">Desfecho: </span>
                        <span className="text-ink">{f.desfecho}</span>
                      </p>
                      <p>
                        <span className="text-ink-3">O que fazer: </span>
                        <span className="text-ink-2">{tipo.dica}</span>
                      </p>
                      <p className="rounded-lg bg-trilho px-2 py-1 font-mono text-[11.5px] text-ink-2">{f.motivo}</p>
                    </div>
                    <LinhaTentativas tentativas={f.tentativas} recuperou={f.recuperou} />
                  </div>
                  <div className="mt-3 flex justify-end">
                    <Botao tamanho="sm" onClick={() => abrirExecucao(f.execucao.id)}>
                      Ver no fluxo
                    </Botao>
                  </div>
                </Painel>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export function LinhaTentativas({ tentativas, recuperou }: { tentativas: Tentativa[]; recuperou: boolean }) {
  return (
    <ol className="flex flex-col gap-1 text-[12.5px]">
      {tentativas.map((t) => (
        <li key={t.n} className="flex gap-2">
          <span className="mt-1 size-2 shrink-0 rounded-full bg-critico" />
          <span className="min-w-0">
            <b className="text-ink">{t.n}ª tentativa</b> <span className="text-ink-3">{hora(t.em)}</span> falhou
            {t.esperaMs != null && <span className="text-ink-3"> · esperou {segundos(t.esperaMs)} e tentou de novo</span>}
          </span>
        </li>
      ))}
      {recuperou && (
        <li className="flex gap-2">
          <span className="mt-1 size-2 shrink-0 rounded-full bg-bom" />
          <b className="text-ink">{tentativas.length + 1}ª tentativa deu certo</b>
        </li>
      )}
    </ol>
  );
}

function Cartao({ rotulo, valor, tom, pequeno }: { rotulo: string; valor: number | string; tom?: "bom" | "critico"; pequeno?: boolean }) {
  return (
    <Painel className="p-4">
      <p className="text-[12px] text-ink-3">{rotulo}</p>
      <p className={cn("num mt-1 font-semibold", pequeno ? "text-[14px]" : "text-[24px]", tom === "bom" && "text-bom", tom === "critico" && "text-critico")}>{valor}</p>
    </Painel>
  );
}
