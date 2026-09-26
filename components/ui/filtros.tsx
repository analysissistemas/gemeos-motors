"use client";

import { useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/cn";

/**
 * Envolve filtros que são links ou formulários GET: a navegação roda dentro de
 * useTransition e o conteúdo fica com opacidade reduzida enquanto carrega.
 * Sem JavaScript, links e formulários continuam funcionando normalmente.
 */
export function Filtros({ children, className }: { children: ReactNode; className?: string }) {
  const router = useRouter();
  const [carregando, iniciar] = useTransition();

  return (
    <div
      className={cn("transition-opacity", carregando && "opacity-60", className)}
      aria-busy={carregando}
      onClickCapture={(e) => {
        if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        const a = (e.target as HTMLElement).closest("a");
        if (!a || a.target || !a.href.startsWith(location.origin)) return;
        e.preventDefault();
        iniciar(() => router.push(a.pathname + a.search));
      }}
      onSubmitCapture={(e) => {
        const f = e.target as HTMLFormElement;
        if (f.method.toLowerCase() !== "get") return;
        e.preventDefault();
        const qs = new URLSearchParams(new FormData(f) as unknown as Record<string, string>).toString();
        iniciar(() => router.push(`${new URL(f.action).pathname}${qs ? `?${qs}` : ""}`));
      }}
    >
      {children}
    </div>
  );
}
