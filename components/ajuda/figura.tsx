"use client";
import { useState } from "react";
import { X } from "lucide-react";

/* Imagem de exemplo do tutorial. Se o arquivo ainda não existir, a figura some
   (o passo por escrito continua). Toque na imagem para ver grande. */
export function FiguraTutorial({ src, legenda }: { src: string; legenda?: string }) {
  const [falhou, setFalhou] = useState(false);
  const [aberta, setAberta] = useState(false);
  if (falhou) return null;
  return (
    <figure className="mt-3">
      <button type="button" onClick={() => setAberta(true)} className="block w-full overflow-hidden rounded-2xl border border-linha bg-trilho" aria-label={`Ampliar imagem: ${legenda ?? "exemplo"}`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt={legenda ?? "Imagem de exemplo"} loading="lazy" onError={() => setFalhou(true)} className="h-auto w-full" />
      </button>
      {legenda && <figcaption className="mt-1.5 text-[13px] text-ink-3">{legenda}</figcaption>}
      {aberta && (
        <div role="dialog" aria-modal="true" aria-label={legenda ?? "Imagem ampliada"} className="fixed inset-0 z-50 grid place-items-center bg-black/85 p-3" onClick={() => setAberta(false)}>
          <button type="button" className="absolute right-3 top-3 grid size-11 place-items-center rounded-full bg-white/10 text-white" aria-label="Fechar imagem" onClick={() => setAberta(false)}>
            <X className="size-5" />
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src} alt={legenda ?? "Imagem de exemplo"} className="max-h-[90dvh] max-w-full rounded-xl object-contain" />
        </div>
      )}
    </figure>
  );
}
