"use client";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { ScanSearch } from "lucide-react";
import { AREAS_SUGESTAO, ASSUNTOS, RESULTADOS, TEMPERATURAS, TIPOS_OBJECAO, type FichaConversa, type MetricasConversa } from "@/lib/ia/analista-regras";
import { relativo } from "@/lib/formato";
import { Selo } from "@/components/ui/basicos";
import { Botao } from "@/components/ui/botao";
import { acaoAnalisarAgora, acaoFichasAnalista } from "@/app/sistema/conversas/acoes-analista";

type Ficha = { dia: string; ficha: FichaConversa; metricas: MetricasConversa; descartados: number; atualizadoEm: Date };

const diaCurto = (d: string) => d.split("-").reverse().slice(0, 2).join("/");
const tomNota = (n: number) => (n >= 8 ? "bom" : n >= 5 ? "atencao" : "serio");

/* Ficha do Analista (só administrador): o que a IA interna achou do atendimento de cada dia. */
export function FichaAnalista({ conversaId }: { conversaId: number }) {
  const [fichas, setFichas] = useState<Ficha[] | null>(null);
  const [indice, setIndice] = useState(0);
  const [pendente, iniciar] = useTransition();

  useEffect(() => {
    let vivo = true;
    acaoFichasAnalista(conversaId).then((r) => {
      if (vivo) setFichas(r.ok ? (r.dados as Ficha[]) : []);
    });
    return () => {
      vivo = false;
    };
  }, [conversaId]);

  const analisar = () =>
    iniciar(async () => {
      const r = await acaoAnalisarAgora(conversaId);
      if (!r.ok) return void toast.error(r.erro);
      toast.success(r.mensagem);
      setFichas(r.dados as Ficha[]);
      setIndice(0);
    });

  const atual = fichas?.[indice];
  return (
    <section>
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-3">Analista</h3>
        <Botao tamanho="sm" variante="fantasma" carregando={pendente} onClick={analisar}>
          <ScanSearch className="size-4" /> {atual ? "Analisar de novo" : "Analisar agora"}
        </Botao>
      </div>
      {fichas === null ? (
        <p className="text-[13px] text-ink-3">Carregando…</p>
      ) : !atual ? (
        <p className="text-[13px] leading-relaxed text-ink-3">Ainda sem análise. O Analista lê as conversas do dia a partir das 18:30.</p>
      ) : (
        <CorpoFicha f={atual} dias={fichas.map((x) => x.dia)} indice={indice} aoTrocar={setIndice} />
      )}
    </section>
  );
}

function CorpoFicha({ f, dias, indice, aoTrocar }: { f: Ficha; dias: string[]; indice: number; aoTrocar: (i: number) => void }) {
  const x = f.ficha;
  const m = f.metricas;
  return (
    <div className="flex flex-col gap-3 text-[13.5px]">
      {dias.length > 1 && (
        <div className="flex flex-wrap gap-1">
          {dias.map((d, i) => (
            <button
              key={d}
              type="button"
              onClick={() => aoTrocar(i)}
              className={`rounded-full px-2 py-0.5 text-[11.5px] ${i === indice ? "bg-marca text-black" : "bg-trilho text-ink-2"}`}
            >
              {diaCurto(d)}
            </button>
          ))}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-1.5">
        {x.nota != null && <Selo tom={tomNota(x.nota)}>Nota {x.nota}</Selo>}
        <Selo tom="info" ponto={false}>
          {ASSUNTOS[x.assunto]}
        </Selo>
        <Selo tom="neutro" ponto={false}>
          {RESULTADOS[x.resultado]}
        </Selo>
        {x.temperatura !== "indefinida" && (
          <Selo tom="neutro" ponto={false}>
            {TEMPERATURAS[x.temperatura]}
          </Selo>
        )}
      </div>
      <p className="leading-relaxed">{x.resumo}</p>
      {x.nota != null && <p className="text-[12.5px] text-ink-2">{x.notaMotivo}</p>}

      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-[12.5px]">
        {x.modeloInteresse && <Par r="Quer">{x.modeloInteresse}</Par>}
        {x.formaPagamento && <Par r="Pagamento">{x.formaPagamento}</Par>}
        {x.usoDeclarado && <Par r="Uso">{x.usoDeclarado}</Par>}
        {x.cidade && <Par r="Cidade">{x.cidade}</Par>}
        <Par r="1ª resposta">{m.primeiraRespostaMin != null ? `${m.primeiraRespostaMin} min` : "—"}</Par>
        <Par r="Maior espera">{m.maiorEsperaMin != null ? `${m.maiorEsperaMin} min` : "—"}</Par>
      </dl>

      {x.ondeTravou && <Lista titulo="Onde travou" itens={[x.ondeTravou]} />}
      <Lista titulo="Objeções" itens={x.objecoes.map((o) => `${TIPOS_OBJECAO[o.tipo]}: ${o.descricao}`)} />
      <Lista titulo="Concorrência" itens={x.concorrentes.map((c) => `${c.quem}: ${c.oQueDisse}`)} />
      <Lista titulo="Perguntas sem resposta" itens={x.perguntasSemResposta.map((p) => p.pergunta)} />
      <Lista titulo="Erros da IA" itens={x.errosIa.map((e) => e.descricao)} />
      <Lista titulo="Erros da equipe" itens={x.errosEquipe.map((e) => e.descricao)} />
      <Lista titulo="O que funcionou" itens={x.acertos.map((a) => a.descricao)} />
      <Lista titulo="Sugestões" itens={x.sugestoes.map((s) => `${AREAS_SUGESTAO[s.area]}: ${s.sugestao}`)} />
      {x.lacunas.length > 0 && <Lista titulo="Faltou informação" itens={x.lacunas} />}

      <p className="text-[11.5px] text-ink-3">
        Analisado {relativo(f.atualizadoEm)}. Cada item cita uma mensagem da conversa
        {f.descartados > 0 ? `; ${f.descartados} sem prova foram descartados` : ""}. É apoio à gestão, não conclusão.
      </p>
    </div>
  );
}

function Par({ r, children }: { r: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-[11px] uppercase tracking-wide text-ink-3">{r}</dt>
      <dd>{children}</dd>
    </div>
  );
}

function Lista({ titulo, itens }: { titulo: string; itens: string[] }) {
  if (!itens.length) return null;
  return (
    <div>
      <p className="text-[11px] font-medium uppercase tracking-wide text-ink-3">{titulo}</p>
      <ul className="mt-0.5 list-disc pl-5 leading-relaxed">
        {itens.map((t, i) => (
          <li key={i}>{t}</li>
        ))}
      </ul>
    </div>
  );
}
