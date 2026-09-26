"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Lock } from "lucide-react";
import { Painel } from "@/components/ui/basicos";
import { Botao } from "@/components/ui/botao";
import { Campo, Entrada } from "@/components/ui/campos";
import { acaoDesbloquearConfig, acaoTrancarConfig } from "./desbloqueio";

/** Tela de senha na frente das configurações. */
export function TelaBloqueio({ titulo, usuario, minutos }: { titulo: string; usuario: string; minutos: number }) {
  const router = useRouter();
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();

  const enviar = (e: React.FormEvent) => {
    e.preventDefault();
    iniciar(async () => {
      const r = await acaoDesbloquearConfig(senha);
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
        <p className="text-[12px] text-ink-3">Fica liberado por {minutos} minutos e depois tranca sozinho.</p>
      </form>
    </Painel>
  );
}

/** Botão para trancar antes do tempo. */
export function BotaoTrancar() {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();
  return (
    <div className="mb-3 flex justify-end">
      <Botao
        carregando={pendente}
        onClick={() =>
          iniciar(async () => {
            const r = await acaoTrancarConfig();
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
