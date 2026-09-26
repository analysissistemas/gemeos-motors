"use client";
import { useState } from "react";
import { cn } from "@/lib/cn";
import { iniciais } from "@/lib/formato";

const TAMANHOS = {
  xs: "size-5 text-[9.5px]",
  sm: "size-7 text-[11px]",
  md: "size-10 text-[13px]",
  lg: "size-14 text-[18px]",
  xl: "size-12 text-[15px]",
} as const;

/** Foto da pessoa (equipe ou cliente) ou, sem foto, as iniciais. Se a foto não
 *  abrir (arquivo apagado, sessão caída), volta para as iniciais. */
export function Avatar({
  nome,
  foto,
  className,
  tamanho = "md",
}: {
  nome?: string | null;
  foto?: string | null;
  className?: string;
  tamanho?: keyof typeof TAMANHOS;
}) {
  const [falhou, setFalhou] = useState<string | null>(null);
  const comFoto = !!foto && falhou !== foto;
  return (
    <span
      className={cn("grid shrink-0 place-items-center overflow-hidden rounded-full bg-vidro-forte font-semibold text-ink ring-1 ring-linha", TAMANHOS[tamanho], className)}
      aria-hidden={comFoto ? undefined : true}
    >
      {comFoto ? (
        // eslint-disable-next-line @next/next/no-img-element -- a foto vem de rota com sessão (/api/fotos); o otimizador do Next não levaria o cookie
        <img src={foto} alt={nome ?? "Foto"} className="size-full object-cover" loading="lazy" decoding="async" onError={() => setFalhou(foto)} />
      ) : (
        iniciais(nome)
      )}
    </span>
  );
}
