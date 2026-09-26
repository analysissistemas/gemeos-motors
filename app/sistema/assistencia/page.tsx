import type { Metadata } from "next";
import Link from "next/link";
import { Plus, Search, Wrench } from "lucide-react";
import { exigirPermissao } from "@/lib/auth/dal";
import { listarOs } from "@/lib/consultas/os";
import { listarEquipe } from "@/lib/consultas/equipe";
import { CANAIS_RECEBIMENTO, pode, STATUS_OS, TIPOS_OS } from "@/lib/dominio";
import { data, numeroDoc, relativo } from "@/lib/formato";
import { cn } from "@/lib/cn";
import { Pagina } from "@/components/ui/pagina";
import { CabecalhoPagina, EstadoVazio, Painel, Selo } from "@/components/ui/basicos";
import { classesBotao } from "@/components/ui/botao";
import { Filtros } from "@/components/ui/filtros";

export const metadata: Metadata = { title: "Assistência técnica" };

type Busca = { tipo?: string; tec?: string; q?: string };

export default async function PaginaAssistencia({ searchParams }: { searchParams: Promise<Busca> }) {
  const u = await exigirPermissao("os.ver");
  const b = await searchParams;
  const [ordens, equipe] = await Promise.all([listarOs({ tipo: b.tipo, tecnicoId: b.tec ? Number(b.tec) : undefined, q: b.q }), listarEquipe()]);
  const por = (s: string) => ordens.filter((o) => o.status === s);
  const hoje = new Date().toISOString().slice(0, 10);
  const atrasadas = ordens.filter((o) => o.previsaoEntrega && o.previsaoEntrega < hoje && !["finalizada", "entregue", "cancelada"].includes(o.status));
  const link = (p: Partial<Busca>) => `/sistema/assistencia?${new URLSearchParams(Object.entries({ ...b, ...p }).filter(([, v]) => v) as [string, string][])}`;

  return (
    <Pagina larga>
      <CabecalhoPagina
        titulo="Assistência técnica e garantia"
        subtitulo="Da abertura à entrega, com quem recebeu, quem atendeu e quem finalizou."
        acoes={
          pode(u.papel, "os.editar") && (
            <Link href="/sistema/assistencia/nova" className={classesBotao("primario")}>
              <Plus className="size-4" /> Abrir OS
            </Link>
          )
        }
      />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Indicador rotulo="Aguardando atendimento" valor={por("aberta").length + por("aguardando").length} />
        <Indicador rotulo="Em análise ou execução" valor={por("analise").length + por("execucao").length} />
        <Indicador rotulo="Aguardando peça" valor={por("aguardando_peca").length} />
        <Indicador rotulo="Previsão vencida" valor={atrasadas.length} alerta={atrasadas.length > 0} />
      </div>

      <Filtros className="mb-4">
      <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
        <form className="relative flex-1" action="/sistema/assistencia">
          {b.tipo && <input type="hidden" name="tipo" value={b.tipo} />}
          {b.tec && <input type="hidden" name="tec" value={b.tec} />}
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-3" />
          <input name="q" type="search" enterKeyHint="search" defaultValue={b.q} placeholder="Cliente, veículo, placa ou nº da OS" className="h-10 w-full rounded-full border border-linha bg-plano/60 pl-9 pr-4 text-[14px] outline-none placeholder:text-ink-3 focus:border-ink-2" />
        </form>
        <div className="rolagem-fina flex gap-1.5 overflow-x-auto">
          {[["", "Todas"], ...Object.entries(TIPOS_OS)].map(([k, r]) => (
            <Link key={k} href={link({ tipo: k || undefined })} className={cn("flex min-h-10 shrink-0 items-center rounded-full border px-4 text-[13px] md:min-h-0 md:px-3 md:py-1.5 md:text-[12.5px]", (b.tipo ?? "") === k ? "border-ink bg-ink text-contra-ink" : "border-linha text-ink-2 hover:border-linha-forte")}>
              {r}
            </Link>
          ))}
          <Link href={link({ tec: b.tec === String(u.id) ? undefined : String(u.id) })} className={cn("flex min-h-10 shrink-0 items-center rounded-full border px-4 text-[13px] md:min-h-0 md:px-3 md:py-1.5 md:text-[12.5px]", b.tec === String(u.id) ? "border-ink bg-ink text-contra-ink" : "border-linha text-ink-2 hover:border-linha-forte")}>
            Minhas OS
          </Link>
          {equipe
            .filter((p) => p.id !== u.id && p.papel !== "vendedor")
            .map((p) => (
              <Link key={p.id} href={link({ tec: b.tec === String(p.id) ? undefined : String(p.id) })} className={cn("flex min-h-10 shrink-0 items-center rounded-full border px-4 text-[13px] md:min-h-0 md:px-3 md:py-1.5 md:text-[12.5px]", b.tec === String(p.id) ? "border-ink bg-ink text-contra-ink" : "border-linha text-ink-2 hover:border-linha-forte")}>
                {p.nome}
              </Link>
            ))}
        </div>
      </div>
      </Filtros>

      {ordens.length === 0 ? (
        <Painel>
          <EstadoVazio icone={<Wrench />} titulo={b.q || b.tipo || b.tec ? "Nenhuma OS com este filtro" : "Nenhuma ordem de serviço em andamento"} texto="Abra uma OS quando o cliente trouxer o veículo ou pedir atendimento." acao={pode(u.papel, "os.editar") && <Link href="/sistema/assistencia/nova" className={classesBotao("primario")}><Plus className="size-4" /> Abrir OS</Link>} />
        </Painel>
      ) : (
        <div className="rolagem-fina -mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-4 sm:-mx-6 sm:px-6">
          {STATUS_OS.map((s) => {
            const lista = por(s.id);
            return (
              <section key={s.id} className="painel flex w-[84vw] max-w-[300px] shrink-0 snap-start flex-col sm:w-[270px]" aria-label={s.rotulo}>
                <header className="flex items-center gap-2 px-4 pb-2 pt-4">
                  <h2 className="flex-1 text-[13.5px] font-semibold">{s.rotulo}</h2>
                  <span className="num rounded-full bg-trilho px-2 text-[12px] leading-5 text-ink-2">{lista.length}</span>
                </header>
                <div className="flex flex-col gap-2 px-2.5 pb-3">
                  {lista.length === 0 ? (
                    <p className="rounded-2xl border border-dashed border-linha px-3 py-5 text-center text-[12.5px] text-ink-3">Nenhuma</p>
                  ) : (
                    lista.map((o) => {
                      const vencida = o.previsaoEntrega && o.previsaoEntrega < hoje && !["finalizada", "entregue"].includes(o.status);
                      return (
                        <Link key={o.id} href={`/sistema/assistencia/${o.id}`} className="block rounded-2xl border border-linha bg-elevado p-3 hover:border-linha-forte">
                          <div className="flex items-center justify-between gap-2">
                            <span className="num text-[11.5px] text-ink-3">{numeroDoc("OS", o.id)}</span>
                            <Selo tom={o.tipo === "garantia" ? "marca" : "neutro"} ponto={o.tipo === "garantia"}>
                              {TIPOS_OS[o.tipo as keyof typeof TIPOS_OS]}
                            </Selo>
                          </div>
                          <p className="mt-1 truncate text-[14px] font-semibold">{o.cliente}</p>
                          <p className="truncate text-[12.5px] text-ink-2">{o.veiculoDescricao}</p>
                          <p className="mt-1 line-clamp-2 text-[12.5px] text-ink-3">{o.problemaRelatado}</p>
                          <div className="mt-2 flex items-center justify-between gap-2 border-t border-linha pt-2 text-[11.5px] text-ink-3">
                            <span className="truncate">{o.tecnico ?? "Sem técnico"}</span>
                            <span className={cn(vencida && "font-semibold text-serio")}>{vencida ? `Previsto ${data(o.previsaoEntrega)}` : relativo(o.abertaEm)}</span>
                          </div>
                          <p className="mt-1 truncate text-[11px] text-ink-3">
                            {CANAIS_RECEBIMENTO[o.canalRecebimento as keyof typeof CANAIS_RECEBIMENTO]}
                            {o.unidade ? ` · ${o.unidade}` : ""}
                          </p>
                        </Link>
                      );
                    })
                  )}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </Pagina>
  );
}

function Indicador({ rotulo, valor, alerta }: { rotulo: string; valor: number; alerta?: boolean }) {
  return (
    <Painel className="p-4">
      <p className="text-[12px] text-ink-3">{rotulo}</p>
      <p className={cn("num mt-1 text-[24px] font-bold", alerta && "text-serio")}>{valor}</p>
    </Painel>
  );
}
