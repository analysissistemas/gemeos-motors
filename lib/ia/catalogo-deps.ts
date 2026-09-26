import "server-only";
import { registrarInteresse } from "@/lib/servicos/interesses";
import { consultarCatalogo } from "./catalogo";

/* Peças de catálogo para o pipeline (Deps.consultarCatalogo / Deps.registrarInteresse) de UMA conversa.
   O pipeline continua sem tocar o banco; quem monta as Deps chama esta função. */
export function depsDeCatalogo(conversa: { id: number; telefone: string }) {
  return {
    consultarCatalogo: (termo: string) => consultarCatalogo(termo),
    registrarInteresse: async (r: { modelo: { id: number } | null }) => {
      if (r.modelo) await registrarInteresse({ conversaId: conversa.id, telefone: conversa.telefone, modeloId: r.modelo.id, origem: "ia" });
    },
  };
}
