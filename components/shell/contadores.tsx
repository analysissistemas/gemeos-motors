"use client";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

export type Contadores = { conversas: number; followups: number; os: number; ligacoes: number };
const vazio: Contadores = { conversas: 0, followups: 0, os: 0, ligacoes: 0 };

const Ctx = createContext<{ valores: Contadores; atualizar: () => void }>({ valores: vazio, atualizar: () => {} });

/* Contadores do menu (não lidas, follow-ups, OS). Hoje por consulta curta a
   cada 20 s, só com a aba visível. Quando o WhatsApp real entrar, esta é a
   peça que troca por SSE/WebSocket — o resto da tela só lê o contexto. */
export function ProvedorContadores({ children, inicial }: { children: React.ReactNode; inicial?: Contadores }) {
  const [valores, setValores] = useState<Contadores>(inicial ?? vazio);
  const anterior = useRef<Contadores>(inicial ?? vazio);
  const router = useRouter();

  const atualizar = useCallback(async () => {
    try {
      const r = await fetch("/api/sistema/contadores", { cache: "no-store" });
      if (!r.ok) return;
      const novo = (await r.json()) as Contadores;
      if (novo.conversas > anterior.current.conversas && !location.pathname.startsWith("/sistema/conversas")) {
        const n = novo.conversas - anterior.current.conversas;
        toast(`${n} ${n === 1 ? "nova mensagem" : "novas mensagens"} no atendimento`, {
          action: { label: "Abrir", onClick: () => router.push("/sistema/conversas") },
        });
      }
      anterior.current = novo;
      setValores(novo);
    } catch {}
  }, [router]);

  useEffect(() => {
    const id = setInterval(() => document.visibilityState === "visible" && atualizar(), 20000);
    const aoVoltar = () => document.visibilityState === "visible" && atualizar();
    const aoPedir = () => atualizar();
    document.addEventListener("visibilitychange", aoVoltar);
    window.addEventListener("gm:contadores", aoPedir);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", aoVoltar);
      window.removeEventListener("gm:contadores", aoPedir);
    };
  }, [atualizar]);

  return <Ctx.Provider value={{ valores, atualizar }}>{children}</Ctx.Provider>;
}

export const useContadores = () => useContext(Ctx).valores;
export const pedirAtualizacaoContadores = () => window.dispatchEvent(new Event("gm:contadores"));
