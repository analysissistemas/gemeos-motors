"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { Lock } from "lucide-react";
import { Painel } from "@/components/ui/basicos";
import { Botao } from "@/components/ui/botao";
import { Campo, Entrada } from "@/components/ui/campos";
import type { AreaConfig } from "@/lib/auth/desbloqueio";
import { acaoConfigLiberada, acaoDesbloquearConfig, acaoTrancarConfig } from "./desbloqueio";

/** Tela de senha na frente das configurações. */
export function TelaBloqueio({ titulo, usuario, area }: { titulo: string; usuario: string; area: AreaConfig }) {
  const router = useRouter();
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();

  const enviar = (e: React.FormEvent) => {
    e.preventDefault();
    iniciar(async () => {
      const r = await acaoDesbloquearConfig(senha, area);
      if (!r.ok) {
        setErro(r.erro);
        setSenha("");
        return;
      }
      router.refresh();
    });
  };

  return (
    <Painel className="mx-auto mt-10 max-w-md p-6">
      <form onSubmit={enviar} className="flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <span className="grid size-10 place-items-center rounded-full bg-trilho text-ink-2">
            <Lock className="size-5" />
          </span>
          <div>
            <h1 className="text-[17px] font-semibold">{titulo} protegidas</h1>
            <p className="text-[13px] text-ink-3">Digite a senha de administrador para continuar.</p>
          </div>
        </div>
        {/* o nome de usuário escondido ajuda o gerenciador de senhas a oferecer a senha certa */}
        <input type="text" name="username" autoComplete="username" value={usuario} readOnly hidden />
        <Campo rotulo="Senha" erro={erro ?? undefined}>
          <Entrada type="password" name="password" autoComplete="current-password" autoFocus value={senha} invalido={!!erro} onChange={(e) => { setSenha(e.target.value); setErro(null); }} />
        </Campo>
        <Botao type="submit" variante="primario" carregando={pendente} disabled={!senha}>
          Desbloquear
        </Botao>
        <p className="text-[12px] text-ink-3">Por segurança, a senha vale só enquanto você estiver nesta tela: saiu, tranca de novo.</p>
      </form>
    </Painel>
  );
}

/* quantas telas liberadas de cada área estão montadas: o React (modo dev) desmonta e monta
   de novo na hora; só tranca se, depois disso, a tela não voltou */
const montadas: Partial<Record<AreaConfig, number>> = {};

/** Botão para trancar na hora. Ele só existe com a tela liberada, então também é ele que
    tranca ao sair: navegar para outra tela, recarregar ou fechar a aba pede a senha de novo. */
export function BotaoTrancar({ area }: { area: AreaConfig }) {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();
  useEffect(() => {
    let vivo = true;
    montadas[area] = (montadas[area] ?? 0) + 1;
    /* voltou pelo "Voltar" do navegador: o roteador pode mostrar a tela guardada sem perguntar ao servidor */
    void acaoConfigLiberada(area).then((r) => {
      if (vivo && r.ok && !r.dados) router.refresh();
    });
    /* sair da tela (menu, recarregar, fechar a aba): um beacon direto para a rota que apaga o
       cookie. Ação de servidor aqui não serve: disparada no meio da troca de tela, o Next
       responde sem o Set-Cookie e a tela continuava liberada. */
    const trancar = () => navigator.sendBeacon(`/api/config/trancar?area=${area}`);
    window.addEventListener("pagehide", trancar);
    return () => {
      vivo = false;
      window.removeEventListener("pagehide", trancar);
      montadas[area] = (montadas[area] ?? 1) - 1;
      setTimeout(() => {
        if (!montadas[area]) trancar();
      }, 0);
    };
  }, [area, router]);
  return (
    <div className="mb-3 flex justify-end">
      <Botao
        carregando={pendente}
        onClick={() =>
          iniciar(async () => {
            const r = await acaoTrancarConfig(area);
            if (!r.ok) return void toast.error(r.erro);
            router.refresh();
          })
        }
      >
        <Lock className="size-4" />
        Trancar agora
      </Botao>
    </div>
  );
}
