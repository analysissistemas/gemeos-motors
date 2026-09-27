import "server-only";
import { registrarInteresse } from "@/lib/servicos/interesses";
import { consultarCatalogo } from "./catalogo";

/* Peças de catálogo para o pipeline (Deps.consultarCatalogo / Deps.registrarInteresse) de UMA conversa.
   O pipeline continua sem tocar o banco; quem monta as Deps chama esta função. */
export function depsDeCatalogo(conversa: { id: number; telefone: string; demo?: boolean }) {
  return {
    /* conversa simulada enxerga os veículos de teste; cliente de verdade, nunca */
    consultarCatalogo: (termo: string) => consultarCatalogo(termo, { incluirTeste: !!conversa.demo }),
    registrarInteresse: async (r: { modelo: { id: number } | null }) => {
      if (r.modelo) await registrarInteresse({ conversaId: conversa.id, telefone: conversa.telefone, modeloId: r.modelo.id, origem: "ia" });
    },
  };
}
