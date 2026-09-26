import { provedorNaoConectado } from "./nao-conectado";
import type { ProvedorCamera } from "./tipos";

export * from "./tipos";

/** Porta única para câmeras. Hoje só existe o provedor "nao_conectado". */
export function provedorCamera(): ProvedorCamera {
  return provedorNaoConectado;
}
