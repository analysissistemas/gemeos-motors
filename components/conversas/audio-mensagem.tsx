"use client";
import { useRef, useState } from "react";
import { Download, Pause, Play } from "lucide-react";
import { cn } from "@/lib/cn";

/* Player de áudio de verdade (elemento <audio>). A duração mostrada é a do arquivo;
   se o navegador não a informar (WebM), usa a que o servidor mediu e guardou. */
const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
const VELOCIDADES = [1, 1.5, 2];

export function AudioMensagem({ url, duracaoGuardada }: { url: string | null; duracaoGuardada?: number | null }) {
  const el = useRef<HTMLAudioElement>(null);
  const [tocando, setTocando] = useState(false);
  const [pos, setPos] = useState(0);
  const [medida, setMedida] = useState<number | null>(null);
  const [falhou, setFalhou] = useState(false);
  const [vel, setVel] = useState(1);

  if (!url) return <p className="py-1 text-[12.5px] text-ink-3">Áudio sem arquivo (registro de demonstração).</p>;

  const dur = medida ?? duracaoGuardada ?? null;
  const total = dur && Number.isFinite(dur) ? dur : 0;

  function aoCarregar() {
    const a = el.current;
    if (!a) return;
    if (Number.isFinite(a.duration) && a.duration > 0) setMedida(a.duration);
  }
  async function alternar() {
    const a = el.current;
    if (!a) return;
    if (a.paused) {
      try {
        await a.play();
      } catch {
        setFalhou(true);
      }
    } else a.pause();
  }
  function buscar(v: number) {
    const a = el.current;
    if (!a) return;
    a.currentTime = v;
    setPos(v);
  }
  function mudarVelocidade() {
    const prox = VELOCIDADES[(VELOCIDADES.indexOf(vel) + 1) % VELOCIDADES.length];
    setVel(prox);
    if (el.current) el.current.playbackRate = prox;
  }

  return (
    <div className="flex w-60 max-w-full items-center gap-2 py-1">
      <audio
        ref={el}
        src={url}
        preload="metadata"
        onLoadedMetadata={aoCarregar}
        onDurationChange={aoCarregar}
        onTimeUpdate={(e) => setPos(e.currentTarget.currentTime)}
        onPlay={() => setTocando(true)}
        onPause={() => setTocando(false)}
        onEnded={() => {
          setTocando(false);
          setPos(0);
        }}
        onError={() => setFalhou(true)}
      />
      {falhou ? (
        <a href={url} download className="flex items-center gap-2 text-[12.5px] underline">
          <Download className="size-4" /> Não foi possível tocar aqui. Baixar áudio
        </a>
      ) : (
        <>
          <button className="grid size-9 shrink-0 place-items-center rounded-full bg-ink text-contra-ink" onClick={alternar} aria-label={tocando ? "Pausar áudio" : "Tocar áudio"}>
            {tocando ? <Pause className="size-4" /> : <Play className="size-4" />}
          </button>
          <input
            type="range"
            min={0}
            max={total || 1}
            step={0.1}
            value={Math.min(pos, total || 1)}
            disabled={!total}
            onChange={(e) => buscar(Number(e.target.value))}
            aria-label="Posição do áudio"
            className={cn("h-1 min-w-0 flex-1 accent-current", !total && "opacity-40")}
          />
          <span className="num w-[34px] shrink-0 text-right text-[11px] text-ink-3" data-testid="audio-tempo">
            {total ? fmt(tocando || pos > 0 ? pos : total) : "--:--"}
          </span>
          <button className="num shrink-0 rounded-full bg-trilho px-1.5 py-0.5 text-[10.5px] text-ink-2" onClick={mudarVelocidade} aria-label={`Velocidade ${vel}x`}>
            {vel}x
          </button>
        </>
      )}
    </div>
  );
}
