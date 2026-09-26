import type { Metadata } from "next";
import { exigirPermissao } from "@/lib/auth/dal";
import { pode } from "@/lib/dominio";
import { listarCoresModelos, listarModelos, listarMovimentacoes, listarVeiculos, resumoEstoque } from "@/lib/consultas/estoque";
import { listarUnidades } from "@/lib/consultas/equipe";
import { Pagina } from "@/components/ui/pagina";
import { TelaEstoque } from "./tela";

export const metadata: Metadata = { title: "Estoque" };

export default async function PaginaEstoque({ searchParams }: { searchParams: Promise<{ q?: string; status?: string; tipo?: string }> }) {
  const u = await exigirPermissao("estoque.ver");
  const b = await searchParams;
  const verCusto = pode(u.papel, "custo.ver");
  const [veiculos, resumo, modelos, unidades, movimentacoes, cores] = await Promise.all([
    listarVeiculos({ ...b, verCusto }),
    resumoEstoque(verCusto),
    listarModelos(),
    listarUnidades(),
    listarMovimentacoes(),
    listarCoresModelos(),
  ]);
  return (
    <Pagina larga>
      <TelaEstoque
        veiculos={veiculos}
        resumo={resumo}
        modelos={modelos}
        unidades={unidades}
        movimentacoes={movimentacoes}
        cores={cores}
        filtros={b}
        permissoes={{ editar: pode(u.papel, "estoque.editar"), custo: verCusto }}
      />
    </Pagina>
  );
}
