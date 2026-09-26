"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { DURACAO_MAXIMA_S, DURACAO_MINIMA_S, PREFERENCIA_GRAVACAO } from "@/lib/mensageria/audio-formatos";

/* Gravação de áudio no navegador. Pede o formato que o WhatsApp aceita (AAC em mp4
   ou Opus em ogg); o tempo é medido por relógio (performance.now), não por contagem
   de segundos, e o servidor confere a duração real do arquivo depois. */
export type Gravacao = { blob: Blob; mime: string; duracao: number };
type Estado = "parado" | "pedindo" | "gravando";

export function gravacaoSuportada() {
  return typeof window !== "undefined" && !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== "undefined";
}

function escolherFormato(): string | null {
  return PREFERENCIA_GRAVACAO.find((t) => MediaRecorder.isTypeSupported(t)) ?? null;
}

function mensagemDeErro(e: unknown): string {
  const nome = (e as { name?: string })?.name;
  if (nome === "NotAllowedError" || nome === "SecurityError") return "Permissão do microfone negada. Libere o microfone no cadeado ao lado do endereço do site e tente de novo.";
  if (nome === "NotFoundError" || nome === "OverconstrainedError") return "Nenhum microfone encontrado neste aparelho.";
  if (nome === "NotReadableError") return "O microfone está em uso por outro aplicativo.";
  return "Não foi possível iniciar a gravação.";
}

export function useGravador(aoErro: (msg: string) => void, aoTerminar: (g: Gravacao) => void) {
  const [estado, setEstado] = useState<Estado>("parado");
  const [segundos, setSegundos] = useState(0);
  const rec = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const pedacos = useRef<Blob[]>([]);
  const inicio = useRef(0);
  const descartar = useRef(false);
  const callbacks = useRef({ aoErro, aoTerminar });
  useEffect(() => {
    callbacks.current = { aoErro, aoTerminar };
  });

  const soltarMicrofone = useCallback(() => {
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
  }, []);

  const iniciar = useCallback(async () => {
    if (estado !== "parado") return;
    if (!window.isSecureContext) return callbacks.current.aoErro("A gravação só funciona em conexão segura (https).");
    if (!gravacaoSuportada()) return callbacks.current.aoErro("Este navegador não suporta gravação de áudio. Use o Chrome, Edge ou Safari atualizados.");
    const mime = escolherFormato();
    if (!mime) return callbacks.current.aoErro("Este navegador não grava em um formato aceito pelo WhatsApp. Use o Chrome, Edge ou Safari atualizados.");
    setEstado("pedindo");
    try {
      stream.current = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    } catch (e) {
      setEstado("parado");
      return callbacks.current.aoErro(mensagemDeErro(e));
    }
    try {
      const r = new MediaRecorder(stream.current, { mimeType: mime, audioBitsPerSecond: 32000 });
      pedacos.current = [];
      descartar.current = false;
      r.ondataavailable = (ev) => {
        if (ev.data.size > 0) pedacos.current.push(ev.data);
      };
      r.onerror = () => {
        descartar.current = true;
        callbacks.current.aoErro("A gravação foi interrompida.");
      };
      r.onstop = () => {
        const duracao = (performance.now() - inicio.current) / 1000;
        soltarMicrofone();
        setEstado("parado");
        setSegundos(0);
        const blob = new Blob(pedacos.current, { type: mime });
        pedacos.current = [];
        if (descartar.current) return;
        if (duracao < DURACAO_MINIMA_S || blob.size < 500) return callbacks.current.aoErro("Áudio muito curto. Grave por pelo menos 1 segundo.");
        callbacks.current.aoTerminar({ blob, mime, duracao: Math.round(duracao * 10) / 10 });
      };
      rec.current = r;
      inicio.current = performance.now();
      r.start(250);
      setSegundos(0);
      setEstado("gravando");
    } catch (e) {
      soltarMicrofone();
      setEstado("parado");
      callbacks.current.aoErro(mensagemDeErro(e));
    }
  }, [estado, soltarMicrofone]);

  const parar = useCallback(() => {
    if (rec.current?.state === "recording") rec.current.stop();
  }, []);
  const cancelar = useCallback(() => {
    descartar.current = true;
    if (rec.current?.state === "recording") rec.current.stop();
    else {
      soltarMicrofone();
      setEstado("parado");
    }
  }, [soltarMicrofone]);

  useEffect(() => {
    if (estado !== "gravando") return;
    const id = setInterval(() => {
      const s = (performance.now() - inicio.current) / 1000;
      setSegundos(Math.floor(s));
      if (s >= DURACAO_MAXIMA_S) parar();
    }, 250);
    return () => clearInterval(id);
  }, [estado, parar]);

  /* sair da tela no meio da gravação: descarta e solta o microfone */
  useEffect(
    () => () => {
      descartar.current = true;
      if (rec.current?.state === "recording") rec.current.stop();
      stream.current?.getTracks().forEach((t) => t.stop());
    },
    [],
  );

  return { estado, segundos, iniciar, parar, cancelar };
}
