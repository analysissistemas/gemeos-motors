"use client";
import { useEffect } from "react";
import { unstable_isUnrecognizedActionError } from "next/navigation";

/* Depois de um "Implantar", a aba que ficou aberta continua com a tela antiga, e as
   ações dela não existem mais no servidor ("Failed to find Server Action"): abrir
   conversa dava "Não foi possível abrir a conversa" e enviar falhava calado.
   Recarregar a página resolve. A trava de 30 s evita recarregar em ciclo se o erro
   tiver outra causa. */
const CHAVE = "gm_recarga_versao";

export function recarregarSeVersaoNova(erro: unknown) {
  if (!unstable_isUnrecognizedActionError(erro)) return false;
  try {
    if (Date.now() - Number(sessionStorage.getItem(CHAVE) ?? 0) < 30_000) return false;
    sessionStorage.setItem(CHAVE, String(Date.now()));
  } catch {}
  location.reload();
  return true;
}

/** Pega a falha que nenhuma tela tratou (ex.: envio sem try/catch). */
export function VigiaVersao() {
  useEffect(() => {
    const aoFalhar = (e: PromiseRejectionEvent) => {
      if (recarregarSeVersaoNova(e.reason)) e.preventDefault();
    };
    window.addEventListener("unhandledrejection", aoFalhar);
    return () => window.removeEventListener("unhandledrejection", aoFalhar);
  }, []);
  return null;
}
