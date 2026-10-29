"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Bot } from "lucide-react";
import { cn } from "@/lib/cn";
import { Botao } from "@/components/ui/botao";
import type { NivelCredito } from "@/lib/ia/credito";
import { acaoSalvarSaldoIa } from "./acoes";

const ESTILO: Record<NivelCredito, string> = {
  acabou: "border-serio/60 bg-serio/15 font-semibold",
  acabando: "border-serio/60 bg-serio/10 font-semibold",
  baixo: "border-atencao/60 bg-atencao/10",
  sem_saldo: "border-linha",
  ok: "border-linha",
};

/** Barrinha do crédito da IA na Visão geral. Quem não é admin só vê o aviso; o admin também informa o saldo. */
export function BarraCreditoIa({ nivel, texto, podeAtualizar }: { nivel: NivelCredito; texto: string; podeAtualizar: boolean }) {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();
  const [aberto, setAberto] = useState(nivel === "sem_saldo");
  const [valor, setValor] = useState("");
  const salvar = () =>
    iniciar(async () => {
      const r = await acaoSalvarSaldoIa(valor);
      if (!r.ok) return void toast.error(r.erro);
      toast.success(r.mensagem);
      setValor("");
      setAberto(false);
      router.refresh();
    });

  return (
    <div role={nivel === "acabou" || nivel === "acabando" ? "alert" : "status"} className={cn("mb-4 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl border px-4 py-2.5 text-[13px]", ESTILO[nivel])}>
      <Bot className={cn("size-4 shrink-0", nivel === "baixo" ? "text-atencao" : nivel === "acabou" || nivel === "acabando" ? "text-serio" : "text-ink-3")} aria-hidden />
      <p className="min-w-0 flex-1">{texto}</p>
      {podeAtualizar &&
        (aberto ? (
          <form
            className="flex items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              salvar();
            }}
          >
            <label className="flex h-9 items-center gap-1 rounded-full border border-linha bg-plano/60 px-3">
              <span className="text-ink-3">US$</span>
              <input inputMode="decimal" autoComplete="off" value={valor} onChange={(e) => setValor(e.target.value)} placeholder="saldo na OpenAI" aria-label="Saldo da OpenAI em dólar" className="w-28 bg-transparent outline-none" />
            </label>
            <Botao variante="primario" tamanho="sm" carregando={pendente} disabled={!valor.trim()}>
              Salvar
            </Botao>
          </form>
        ) : (
          <button type="button" onClick={() => setAberto(true)} className="text-[12.5px] text-ink-2 underline underline-offset-2 hover:text-ink">
            Atualizar saldo
          </button>
        ))}
    </div>
  );
}
