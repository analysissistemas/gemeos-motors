"use client";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { CalendarClock, RefreshCw } from "lucide-react";
import { Painel } from "@/components/ui/basicos";
import { Botao } from "@/components/ui/botao";
import { acaoCriarModelosCliente, acaoModelosCliente } from "./avisos-acoes";

/* Modelos da Meta para a IA chamar o cliente no dia combinado depois das 24 h do WhatsApp (dono, 20/10/2026). Só administrador. */

type Dados = Extract<Awaited<ReturnType<typeof acaoModelosCliente>>, { ok: true }>["dados"];

const SITUACAO: Record<string, string> = { APPROVED: "Aprovado pela Meta ✅", PENDING: "Em análise na Meta (costuma levar minutos)", REJECTED: "Recusado pela Meta", PAUSED: "Pausado pela Meta", DISABLED: "Desativado pela Meta" };
const PARA_QUE: Record<string, string> = {
  confirmar_visita: "chama quem disse “talvez sábado” ou “sexta vou aí” sem horário",
  lembrete_visita: "lembra a visita ou o test drive marcado com horário",
};

export function ModelosDoCliente() {
  const [d, setD] = useState<Dados | null>(null);
  const [pendente, iniciar] = useTransition();
  const carregar = () =>
    iniciar(async () => {
      const r = await acaoModelosCliente();
      if (!r.ok) return void toast.error(r.erro);
      setD(r.dados);
    });
  useEffect(() => {
    const t = setTimeout(carregar, 0);
    return () => clearTimeout(t);
  }, []);
  const faltaCriar = !!d && !d.erro && d.modelos.some((m) => !m.status);

  return (
    <Painel id="modelos-cliente" className="mb-4 p-5">
      <h2 className="flex items-center gap-2 text-[16px] font-semibold">
        <CalendarClock className="size-4.5" /> Mensagens do dia combinado
      </h2>
      <p className="mt-1 text-[13px] text-ink-2">
        No dia que o cliente combinou, a IA chama ele sozinha. Se já passaram 24 h desde a última mensagem dele, o WhatsApp só aceita estes modelos aprovados pela Meta. Sem eles, a mensagem vira tarefa para a equipe em Follow-ups.
      </p>
      <div className="mt-4 rounded-2xl border border-linha p-3 text-[13px]">
        {d?.erro ? (
          <p className="text-critico">{d.erro}</p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {(d?.modelos ?? []).map((m) => (
              <li key={m.nome}>
                <b>{m.nome}</b> ({PARA_QUE[m.nome]}): {m.status ? SITUACAO[m.status] ?? m.status : "ainda não criado"}
                {m.motivo ? <span className="text-critico"> ({m.motivo})</span> : null}
              </li>
            ))}
            {!d && <li>…</li>}
          </ul>
        )}
        <div className="mt-3 flex flex-wrap gap-2">
          {faltaCriar && (
            <Botao
              tamanho="sm"
              carregando={pendente}
              onClick={() =>
                iniciar(async () => {
                  const r = await acaoCriarModelosCliente();
                  if (!r.ok) return void toast.error(r.erro);
                  toast.success("Modelos enviados para a Meta");
                  setD({ modelos: r.dados, erro: null });
                })
              }
            >
              Criar modelos na Meta
            </Botao>
          )}
          <Botao tamanho="sm" variante="fantasma" carregando={pendente} onClick={carregar}>
            <RefreshCw className="size-4" /> Atualizar
          </Botao>
        </div>
      </div>
    </Painel>
  );
}
