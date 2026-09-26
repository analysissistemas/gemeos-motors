import type { Metadata } from "next";
import Link from "next/link";
import { BookmarkCheck } from "lucide-react";
import { exigirPermissao } from "@/lib/auth/dal";
import { STATUS_RESERVA, pode, type StatusReserva } from "@/lib/dominio";
import { dataHora, formatarTelefone } from "@/lib/formato";
import { cn } from "@/lib/cn";
import { listarReservas } from "@/lib/servicos/reservas";
import { Pagina } from "@/components/ui/pagina";
import { CabecalhoPagina, EstadoVazio, Painel, Selo } from "@/components/ui/basicos";
import { Filtros } from "@/components/ui/filtros";
import { AcoesReserva } from "./tela";

export const metadata: Metadata = { title: "Reservas" };

const FILTROS = { abertas: "Em aberto", nova: "Novas", confirmada: "Confirmadas", todas: "Todas" } as const;
type Filtro = keyof typeof FILTROS;
const tom = (s: string) => (s === "nova" ? "atencao" : s === "confirmada" ? "bom" : s === "contatada" ? "info" : "neutro") as "atencao" | "bom" | "info" | "neutro";

export default async function PaginaReservas({ searchParams }: { searchParams: Promise<{ f?: string }> }) {
  const u = await exigirPermissao("reservas.ver");
  const { f: bruto } = await searchParams;
  const f: Filtro = bruto && bruto in FILTROS ? (bruto as Filtro) : "abertas";
  const status: StatusReserva[] | undefined = f === "todas" ? undefined : f === "abertas" ? ["nova", "contatada", "confirmada"] : [f];
  const reservas = await listarReservas({ status });
  const editar = pode(u.papel, "reservas.editar");
  const conversar = pode(u.papel, "conversas.ver");

  return (
    <Pagina>
      <CabecalhoPagina titulo="Reservas" subtitulo="Quem reservou pelo site um modelo em lançamento. Cada reserva já abriu um negócio no funil." />
      <Filtros className="mb-5 flex flex-wrap gap-1.5">
        {(Object.keys(FILTROS) as Filtro[]).map((k) => (
          <Link key={k} href={k === "abertas" ? "/sistema/reservas" : `/sistema/reservas?f=${k}`} className={cn("rounded-full border px-3 py-1.5 text-[12.5px]", f === k ? "border-ink bg-ink text-contra-ink" : "border-linha text-ink-2")}>
            {FILTROS[k]}
          </Link>
        ))}
      </Filtros>

      {reservas.length === 0 ? (
        <Painel>
          <EstadoVazio icone={<BookmarkCheck />} titulo="Nenhuma reserva aqui" texto="Marque um modelo como lançamento em Estoque → Catálogo para o site abrir o formulário de reserva." />
        </Painel>
      ) : (
        <Painel className="overflow-hidden">
          <ul>
            {reservas.map((x) => (
              <li key={x.id} className="flex flex-col gap-2 border-b border-linha px-4 py-3 last:border-0 lg:flex-row lg:items-center lg:gap-4" data-reserva={x.id}>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    {x.clienteId ? (
                      <Link href={`/sistema/clientes/${x.clienteId}`} className="truncate font-semibold hover:underline">
                        {x.nome}
                      </Link>
                    ) : (
                      <span className="truncate font-semibold">{x.nome}</span>
                    )}
                    <Selo tom={tom(x.status)}>{STATUS_RESERVA[x.status as StatusReserva] ?? x.status}</Selo>
                  </span>
                  <span className="block truncate text-[12.5px] text-ink-2">
                    {x.modelo ?? "Modelo removido"}
                    {x.cor ? ` · ${x.cor}` : ""} · {formatarTelefone(x.telefone)} · {dataHora(x.criadoEm)}
                  </span>
                  {x.observacoes && <span className="line-clamp-2 text-[12.5px] text-ink-3">{x.observacoes}</span>}
                </span>
                <AcoesReserva id={x.id} status={x.status} telefone={x.telefone} nome={x.nome} observacoes={x.observacoes} editar={editar} conversar={conversar} />
              </li>
            ))}
          </ul>
        </Painel>
      )}
    </Pagina>
  );
}
