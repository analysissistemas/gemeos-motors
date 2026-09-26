"use client";
import { useEffect } from "react";
import { TriangleAlert } from "lucide-react";
import { Botao, BotaoLink } from "@/components/ui/botao";

export default function ErroSistema({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => console.error(error), [error]);
  return (
    <div className="grid min-h-[60dvh] place-items-center px-4">
      <div className="painel flex max-w-md flex-col items-center gap-2 p-8 text-center">
        <span className="mb-1 grid size-12 place-items-center rounded-2xl bg-trilho text-serio">
          <TriangleAlert className="size-5" />
        </span>
        <h1 className="text-[18px] font-semibold">Não consegui abrir esta tela</h1>
        <p className="text-[13.5px] text-ink-2">Seus dados estão salvos.</p>
        <div className="mt-3 flex flex-wrap justify-center gap-2">
          <Botao variante="primario" onClick={reset}>
            Tentar de novo
          </Botao>
          <BotaoLink href="/sistema" variante="secundario">
            Voltar ao início
          </BotaoLink>
        </div>
      </div>
    </div>
  );
}
