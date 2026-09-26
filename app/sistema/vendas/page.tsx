import type { Metadata } from "next";
import Link from "next/link";
import { Receipt } from "lucide-react";
import { exigirPermissao } from "@/lib/auth/dal";
import { listarVendas } from "@/lib/consultas/vendas";
import { listarEquipe } from "@/lib/consultas/equipe";
import { FORMAS_PAGAMENTO, STATUS_VENDA } from "@/lib/dominio";
import { brl, data, numeroDoc } from "@/lib/formato";
import { Pagina } from "@/components/ui/pagina";
import { pode } from "@/lib/dominio";
import { Filtros } from "@/components/ui/filtros";
import { CabecalhoPagina, EstadoVazio, Painel, Selo } from "@/components/ui/basicos";
import { NovaVenda } from "./nova-venda";

export const metadata: Metadata = { title: "Vendas" };

const tom = (s: string) => (s === "finalizada" ? "bom" : s === "cancelada" ? "critico" : s === "assinada" ? "info" : "atencao") as "bom" | "critico" | "info" | "atencao";

export default async function PaginaVendas({ searchParams }: { searchParams: Promise<{ status?: string; dias?: string }> }) {
  const u = await exigirPermissao("vendas.ver");
  const podeEditar = pode(u.papel, "vendas.editar");
  const b = await searchParams;
  const dias = [30, 90, 365].includes(Number(b.dias)) ? Number(b.dias) : 90;
  const [vendas, equipe] = await Promise.all([listarVendas({ status: b.status, dias }), listarEquipe()]);
  const finalizadas = vendas.filter((v) => v.status === "finalizada");
  const emAndamento = vendas.filter((v) => ["rascunho", "aguardando_assinatura", "assinada"].includes(v.status));
  const faturamento = finalizadas.reduce((s, v) => s + (v.valorVendido ?? 0), 0);
  const link = (st?: string) => `/sistema/vendas?${new URLSearchParams({ ...(st && { status: st }), dias: String(dias) })}`;

  return (
    <Pagina>
      <CabecalhoPagina titulo="Vendas" subtitulo={`Últimos ${dias} dias`} acoes={podeEditar && <NovaVenda equipe={equipe} />} />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Painel className="p-4">
          <p className="text-[12px] text-ink-3">Vendas finalizadas</p>
          <p className="num mt-1 text-[24px] font-bold">{finalizadas.length}</p>
        </Painel>
        <Painel className="p-4">
          <p className="text-[12px] text-ink-3">Faturamento</p>
          <p className="num mt-1 text-[24px] font-bold">{brl(faturamento)}</p>
        </Painel>
        <Painel className="p-4">
          <p className="text-[12px] text-ink-3">Ticket médio</p>
          <p className="num mt-1 text-[24px] font-bold">{finalizadas.length ? brl(faturamento / finalizadas.length) : "—"}</p>
        </Painel>
        <Painel className="p-4">
          <p className="text-[12px] text-ink-3">Em andamento</p>
          <p className="num mt-1 text-[24px] font-bold">{emAndamento.length}</p>
          <p className="text-[12px] text-ink-2">{vendas.filter((v) => v.status === "aguardando_assinatura").length} aguardando assinatura</p>
        </Painel>
      </div>

      <Filtros className="mb-4">
      <div className="rolagem-fina flex gap-1.5 overflow-x-auto">
        {[["", "Todas"], ...Object.entries(STATUS_VENDA)].map(([k, r]) => (
          <Link key={k} href={link(k)} className={`flex min-h-10 shrink-0 items-center rounded-full border px-4 text-[13px] md:min-h-0 md:px-3 md:py-1.5 md:text-[12.5px] ${(b.status ?? "") === k ? "border-ink bg-ink text-contra-ink" : "border-linha text-ink-2 hover:border-linha-forte"}`}>
            {r}
          </Link>
        ))}
        {[30, 90, 365].map((d) => (
          <Link key={d} href={`/sistema/vendas?${new URLSearchParams({ ...(b.status && { status: b.status }), dias: String(d) })}`} className={`flex min-h-10 shrink-0 items-center rounded-full border px-4 text-[13px] md:min-h-0 md:px-3 md:py-1.5 md:text-[12.5px] ${dias === d ? "border-ink-2 text-ink" : "border-linha text-ink-3"}`}>
            {d === 365 ? "12 meses" : `${d} dias`}
          </Link>
        ))}
      </div>
      </Filtros>

      <Painel className="overflow-hidden">
        {vendas.length === 0 ? (
          <EstadoVazio icone={<Receipt />} titulo="Nenhuma venda neste período" texto="Vendas nascem do funil (arrastando para Venda fechada) ou do botão Nova venda." acao={podeEditar && <NovaVenda equipe={equipe} />} />
        ) : (
          <ul>
            {vendas.map((v) => (
              <li key={v.id} className="border-b border-linha last:border-0">
                <Link href={`/sistema/vendas/${v.id}`} className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 px-4 py-3 hover:bg-trilho sm:grid-cols-[110px_1.4fr_1fr_140px_130px] sm:items-center sm:px-5">
                  <span className="num text-[12.5px] text-ink-3">{numeroDoc("V", v.id)}</span>
                  <span className="order-first min-w-0 sm:order-none">
                    <span className="block truncate font-semibold">{v.cliente}</span>
                    <span className="block truncate text-[12.5px] text-ink-2">{v.veiculo ?? "Veículo não escolhido"}</span>
                  </span>
                  <span className="text-[12.5px] text-ink-2">
                    {v.vendedor ?? "—"} · {data(v.finalizadaEm ?? v.criadoEm)}
                    {v.formas && (
                      <span className="block truncate text-ink-3">
                        {v.formas
                          .split(",")
                          .map((f) => FORMAS_PAGAMENTO[f as keyof typeof FORMAS_PAGAMENTO] ?? f)
                          .join(" + ")}
                      </span>
                    )}
                  </span>
                  <span className="num font-semibold sm:text-right">{brl(v.valorVendido)}</span>
                  <span className="sm:text-right">
                    <Selo tom={tom(v.status)}>{STATUS_VENDA[v.status as keyof typeof STATUS_VENDA]}</Selo>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Painel>
    </Pagina>
  );
}
