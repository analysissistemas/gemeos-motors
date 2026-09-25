import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { exigirPermissao } from "@/lib/auth/dal";
import { db, schema } from "@/lib/db";
import { pode } from "@/lib/dominio";
import { listarConversas } from "@/lib/consultas/conversas";
import { listarEquipe } from "@/lib/consultas/equipe";
import { abrirConversaDoCliente } from "@/lib/mensageria/servico";
import { obterProvedor } from "@/lib/mensageria/provedores";
import { CentralConversas } from "@/components/conversas/central";

export const metadata: Metadata = { title: "Atendimento" };

export default async function PaginaConversas({ searchParams }: { searchParams: Promise<{ c?: string; cliente?: string }> }) {
  const u = await exigirPermissao("conversas.ver");
  const b = await searchParams;
  if (b.cliente && Number(b.cliente) > 0) {
    let destino: string | null = null;
    try {
      destino = `/sistema/conversas?c=${await abrirConversaDoCliente(u, Number(b.cliente))}`;
    } catch {
      destino = `/sistema/clientes/${Number(b.cliente)}`;
    }
    redirect(destino);
  }
  const [inicial, equipe, respostas] = await Promise.all([
    listarConversas({ filtro: "todas", usuarioId: u.id }),
    listarEquipe(),
    db
      .select({ id: schema.respostasRapidas.id, atalho: schema.respostasRapidas.atalho, titulo: schema.respostasRapidas.titulo, conteudo: schema.respostasRapidas.conteudo })
      .from(schema.respostasRapidas)
      .where(eq(schema.respostasRapidas.ativo, true))
      .orderBy(asc(schema.respostasRapidas.atalho)),
  ]);
  return (
    <CentralConversas
      inicial={inicial}
      conversaInicial={b.c && Number(b.c) > 0 ? Number(b.c) : null}
      equipe={equipe.filter((p) => p.papel !== "tecnico")}
      respostas={respostas}
      usuario={{ id: u.id, nome: u.nome }}
      simulado={(await obterProvedor()).simulado}
      permissoes={{ clientes: pode(u.papel, "clientes.editar"), funil: pode(u.papel, "funil.editar"), vendas: pode(u.papel, "vendas.ver") }}
    />
  );
}
