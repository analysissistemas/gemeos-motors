"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Painel, TituloSecao } from "@/components/ui/basicos";
import { Botao } from "@/components/ui/botao";
import { Entrada } from "@/components/ui/campos";
import { DIAS, textoHorario, type HorarioLoja } from "@/lib/ia/horario";
import { acaoSalvarHorario } from "./acoes";

/* Horário de funcionamento: a IA só afirma o horário que estiver aqui, e sabe se a loja está aberta agora. */
export function EditorHorario({ horario }: { horario: HorarioLoja }) {
  const router = useRouter();
  const [h, setH] = useState(horario);
  const [pendente, iniciar] = useTransition();
  const mudou = JSON.stringify(h) !== JSON.stringify(horario);
  const mudarDia = (id: (typeof DIAS)[number]["id"], v: Partial<HorarioLoja["dias"]["seg"]>) => setH({ ...h, dias: { ...h.dias, [id]: { ...h.dias[id], ...v } } });

  return (
    <Painel className="p-5">
      <TituloSecao
        acao={
          <Botao
            variante="primario"
            tamanho="sm"
            disabled={!mudou}
            carregando={pendente}
            onClick={() =>
              iniciar(async () => {
                const r = await acaoSalvarHorario(h);
                if (!r.ok) return void toast.error(r.erro);
                toast.success(r.mensagem);
                router.refresh();
              })
            }
          >
            Salvar horário
          </Botao>
        }
      >
        Horário de funcionamento
      </TituloSecao>
      <p className="mb-3 text-[13px] text-ink-2">A IA usa este horário para responder e para saber se a loja está aberta agora (horário de Recife).</p>
      <div className="grid gap-2 md:grid-cols-2">
        {DIAS.map(({ id, nome }) => {
          const d = h.dias[id];
          return (
            <div key={id} className="flex items-center gap-2 rounded-xl border border-linha px-3 py-2 text-[13px]">
              <label className="flex w-24 shrink-0 items-center gap-2">
                <input type="checkbox" className="size-4 accent-[var(--ink)]" checked={d.aberto} onChange={(e) => mudarDia(id, { aberto: e.target.checked })} />
                {nome}
              </label>
              {d.aberto ? (
                <div className="flex items-center gap-1">
                  <Entrada type="time" className="h-8 w-[92px] px-2" value={d.abre} onChange={(e) => mudarDia(id, { abre: e.target.value })} aria-label={`${nome}: abre`} />
                  <span className="text-ink-3">às</span>
                  <Entrada type="time" className="h-8 w-[92px] px-2" value={d.fecha} onChange={(e) => mudarDia(id, { fecha: e.target.value })} aria-label={`${nome}: fecha`} />
                </div>
              ) : (
                <span className="text-ink-3">fechado</span>
              )}
            </div>
          );
        })}
      </div>
      <div className="mt-3">
        <Entrada value={h.observacao} maxLength={300} onChange={(e) => setH({ ...h, observacao: e.target.value })} placeholder="Observação (opcional). Ex.: feriados, fechado para almoço das 12h às 13h" />
      </div>
      <p className="mt-3 whitespace-pre-line rounded-xl bg-trilho p-3 text-[12.5px] text-ink-2">
        <b className="text-ink">Como a IA vai ler: </b>
        {"\n"}
        {textoHorario(h)}
      </p>
    </Painel>
  );
}
