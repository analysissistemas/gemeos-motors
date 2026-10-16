import type { Metadata } from "next";
import { exigirPermissao } from "@/lib/auth/dal";
import { configLiberada } from "@/lib/auth/desbloqueio";
import { diasComFichas, listarChamados, relatorioDoDia } from "@/lib/ia/chamados";
import { diaDaLoja } from "@/lib/ia/analista-regras";
import { Pagina } from "@/components/ui/pagina";
import { TelaMelhorias } from "./tela";

export const metadata: Metadata = { title: "Melhorias" };

/* Relatório do Analista + chamados de melhoria + plano de ação (dono, 15/10/2026). Só administrador. */
export default async function PaginaMelhorias({ searchParams }: { searchParams: Promise<{ dia?: string }> }) {
  const u = await exigirPermissao("config.gerenciar");
  const b = await searchParams;
  const [dias, chamados, liberadaIa] = await Promise.all([diasComFichas(), listarChamados(), configLiberada(u, "ia")]);
  const hoje = diaDaLoja(new Date());
  const dia = b.dia && dias.includes(b.dia) ? b.dia : (dias[0] ?? hoje);
  const relatorio = await relatorioDoDia(dia);
  return (
    <Pagina>
      <TelaMelhorias dias={dias.length ? dias : [hoje]} relatorioInicial={relatorio} chamadosIniciais={chamados} usuario={u.usuario} liberadaIa={liberadaIa} />
    </Pagina>
  );
}
