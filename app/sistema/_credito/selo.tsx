"use client";
import Link from "next/link";
import { Bot } from "lucide-react";
import { cn } from "@/lib/cn";
import type { NivelCredito } from "@/lib/ia/credito";

const ROTULO: Partial<Record<NivelCredito, string>> = { baixo: "Crédito IA baixo", acabando: "Crédito IA acabando", acabou: "Crédito IA acabou" };

/** Selo do crédito da IA no topo de TODAS as telas quando está baixo, acabando ou acabou (usuário, 12/11/2026:
 *  "quero ver isso no sistema também"; a recarga automática da OpenAI foi desligada). Toca e abre a Visão geral,
 *  onde está a barrinha completa com o campo do saldo. Selo e não faixa: a faixa empurrava a tela do chat. */
export function SeloCreditoIa({ nivel, texto }: { nivel: NivelCredito; texto: string }) {
  const rotulo = ROTULO[nivel];
  if (!rotulo) return null;
  const serio = nivel !== "baixo";
  return (
    <Link
      href="/sistema"
      title={texto}
      aria-label={texto}
      className={cn("flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-2.5 text-[12px] font-semibold", serio ? "animate-pulse border-serio/60 bg-serio/15 text-serio" : "border-atencao/60 bg-atencao/10 text-atencao")}
    >
      <Bot className="size-3.5" aria-hidden />
      <span className="hidden sm:inline">{rotulo}</span>
    </Link>
  );
}
