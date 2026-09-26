import type { Metadata } from "next";
import Link from "next/link";
import { CalendarClock, MessageSquare, SquareKanban, TriangleAlert, UserRound, Wrench, FileText } from "lucide-react";
import { redirect } from "next/navigation";
import { exigirUsuario } from "@/lib/auth/dal";
import { carregarPainel, intervalo, type Periodo } from "@/lib/consultas/painel";
import { ETAPAS, MOTIVOS_PERDA, ORIGENS, pode } from "@/lib/dominio";
import { brl, data, numeroCompacto } from "@/lib/formato";
import { cn } from "@/lib/cn";
import { Pagina } from "@/components/ui/pagina";
import { EstadoVazio, Painel, TituloSecao } from "@/components/ui/basicos";
import { classesBotao } from "@/components/ui/botao";
import { Filtros } from "@/components/ui/filtros";
import { BarrasHorizontais } from "@/components/graficos/barras";
import { ColunasTempo } from "@/components/graficos/colunas";

export const metadata: Metadata = { title: "Visão geral" };

const PERIODOS: [Periodo, string][] = [
  ["hoje", "Hoje"],
  ["7d", "7 dias"],
  ["30d", "30 dias"],
  ["mes", "Este mês"],
];

export default async function Painel_({ searchParams }: { searchParams: Promise<{ periodo?: string; de?: string; ate?: string }> }) {
  const u = await exigirUsuario();
  /* técnico não tem painel comercial: cai direto na assistência */
  if (!pode(u.papel, "painel.ver")) redirect(pode(u.papel, "os.ver") ? "/sistema/assistencia" : "/sistema/clientes");
  const b = await searchParams;
  const periodo = (["hoje", "7d", "30d", "mes", "custom"].includes(b.periodo ?? "") ? b.periodo : "30d") as Periodo;
  const { inicio, fim, rotulo } = intervalo(periodo, b.de, b.ate);
  const verLucro = pode(u.papel, "custo.ver");
  const d = await carregarPainel(inicio, fim, verLucro);
  const k = d.kpi;
  const pct = (v: number | null) => (v == null ? "—" : `${Math.round(v * 100)}%`);
  const at = d.atencao;
  const alertas = [
    at.followAtrasados && { href: "/sistema/follow-ups", icone: CalendarClock, texto: `${at.followAtrasados} follow-up${at.followAtrasados > 1 ? "s" : ""} atrasado${at.followAtrasados > 1 ? "s" : ""}`, forte: true },
    at.followHoje && { href: "/sistema/follow-ups", icone: CalendarClock, texto: `${at.followHoje} follow-up${at.followHoje > 1 ? "s" : ""} para hoje` },
    at.naoLidas && { href: "/sistema/conversas", icone: MessageSquare, texto: `${at.naoLidas} mensage${at.naoLidas > 1 ? "ns" : "m"} não lida${at.naoLidas > 1 ? "s" : ""}`, forte: true },
    at.semResponsavel && { href: "/sistema/conversas", icone: UserRound, texto: `${at.semResponsavel} conversa${at.semResponsavel > 1 ? "s" : ""} sem responsável` },
    at.parados && { href: "/sistema/funil", icone: SquareKanban, texto: `${at.parados} negócio${at.parados > 1 ? "s" : ""} parado${at.parados > 1 ? "s" : ""} na etapa` },
    k.aguardandoAssinatura && { href: "/sistema/vendas?status=aguardando_assinatura", icone: FileText, texto: `${k.aguardandoAssinatura} venda${k.aguardandoAssinatura > 1 ? "s" : ""} esperando assinatura ou finalização` },
    at.osVencidas && { href: "/sistema/assistencia", icone: Wrench, texto: `${at.osVencidas} OS com previsão vencida`, forte: true },
  ].filter(Boolean) as { href: string; icone: typeof CalendarClock; texto: string; forte?: boolean }[];
  const totalFunil = d.funil.reduce((s, x) => s + x.qtd, 0);

  return (
    <Pagina larga>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[24px] font-bold tracking-tight sm:text-[28px]">Visão geral</h1>
          <p className="mt-1 text-[13.5px] text-ink-2">
            {rotulo} · {data(inicio)} a {data(new Date(fim.getTime() - 1))}
          </p>
        </div>
        <Filtros className="w-full sm:w-auto">
          <form className="flex flex-col gap-2 sm:items-end" action="/sistema">
            <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 sm:mx-0 sm:px-0">
              {PERIODOS.map(([id, r]) => (
                <Link key={id} href={`/sistema?periodo=${id}`} className={cn("flex min-h-10 shrink-0 items-center rounded-full border px-4 text-[13px] md:min-h-8 md:px-3 md:text-[12.5px]", periodo === id ? "border-ink bg-ink font-semibold text-contra-ink" : "border-linha text-ink-2 hover:border-linha-forte")}>
                  {r}
                </Link>
              ))}
            </div>
            <details open={periodo === "custom"}>
              <summary className="flex min-h-10 cursor-pointer list-none items-center text-[12.5px] text-ink-2 underline-offset-2 hover:underline sm:justify-end">Datas personalizadas</summary>
              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                <input type="hidden" name="periodo" value="custom" />
                <input type="date" name="de" defaultValue={b.de} aria-label="De" className="h-10 rounded-full border border-linha bg-plano/60 px-3 text-[13px] md:h-8" />
                <input type="date" name="ate" defaultValue={b.ate} aria-label="Até" className="h-10 rounded-full border border-linha bg-plano/60 px-3 text-[13px] md:h-8" />
                <button className={cn(classesBotao(periodo === "custom" ? "primario" : "secundario", "sm"))}>Aplicar</button>
              </div>
            </details>
          </form>
        </Filtros>
      </div>

      {/* o que pede ação agora */}
      <Painel className="mb-4 p-4">
        <p className="mb-2 flex items-center gap-2 text-[13px] font-semibold">
          <TriangleAlert className="size-4 text-atencao" /> Precisa de atenção
        </p>
        {alertas.length === 0 ? (
          <p className="text-[13px] text-ink-2">Nada pendente agora: follow-ups em dia, mensagens lidas e negócios andando.</p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {alertas.map((a) => (
              <li key={a.texto}>
                <Link href={a.href} className={cn("flex items-center gap-2 rounded-full border px-3 py-1.5 text-[13px] hover:border-linha-forte", a.forte ? "border-serio/50 bg-serio/10" : "border-linha")}>
                  <a.icone className="size-4" /> {a.texto}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Painel>

      {/* números principais */}
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Numero rotulo="Faturamento" valor={brl(k.faturamento)} detalhe={`${k.vendas} ${k.vendas === 1 ? "venda finalizada" : "vendas finalizadas"}`} destaque />
        <Numero rotulo="Ticket médio" valor={k.ticketMedio != null ? brl(k.ticketMedio) : "—"} detalhe={`${k.vendas} veículo${k.vendas === 1 ? "" : "s"} vendido${k.vendas === 1 ? "" : "s"}`} />
        {verLucro ? (
          <Numero rotulo="Lucro bruto" valor={k.lucro != null ? brl(k.lucro) : "—"} detalhe={k.margem != null ? `Margem de ${pct(k.margem)}` : "Cadastre o custo dos veículos"} />
        ) : (
          <Numero rotulo="Veículos disponíveis" valor={String(k.disponiveis)} detalhe="No estoque agora" />
        )}
        <Numero rotulo="Em negociação" valor={String(k.emNegociacao)} detalhe={k.valorEmNegociacao ? `${brl(k.valorEmNegociacao)} em aberto` : "Negócios abertos agora"} />
        <div className="hidden md:contents">
        <Numero rotulo="Leads recebidos" valor={String(k.leads)} detalhe="Negócios criados no período" />
        <Numero rotulo="Propostas enviadas" valor={String(k.propostas)} detalhe="Negócios com proposta no período" />
        <Numero rotulo="Vendas perdidas" valor={String(k.perdidas)} detalhe={k.conversao != null ? `Conversão de ${pct(k.conversao)}` : "Sem encerramentos no período"} />
        {verLucro ? <Numero rotulo="Veículos disponíveis" valor={String(k.disponiveis)} detalhe="No estoque agora" /> : <Numero rotulo="Conversão" valor={pct(k.conversao)} detalhe="Vendas ÷ (vendas + perdidas)" />}
        </div>
        <details className="col-span-2 md:hidden">
          <summary className="flex min-h-10 cursor-pointer list-none items-center justify-center rounded-full border border-linha text-[13px] text-ink-2">Ver mais números</summary>
          <div className="mt-3 grid grid-cols-2 gap-3">
        <Numero rotulo="Leads recebidos" valor={String(k.leads)} detalhe="Negócios criados no período" />
        <Numero rotulo="Propostas enviadas" valor={String(k.propostas)} detalhe="Negócios com proposta no período" />
        <Numero rotulo="Vendas perdidas" valor={String(k.perdidas)} detalhe={k.conversao != null ? `Conversão de ${pct(k.conversao)}` : "Sem encerramentos no período"} />
        {verLucro ? <Numero rotulo="Veículos disponíveis" valor={String(k.disponiveis)} detalhe="No estoque agora" /> : <Numero rotulo="Conversão" valor={pct(k.conversao)} detalhe="Vendas ÷ (vendas + perdidas)" />}
          </div>
        </details>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Painel className="p-5 xl:col-span-2">
          <TituloSecao>Faturamento por {d.agrupamento === "week" ? "semana" : "dia"}</TituloSecao>
          <ColunasTempo pontos={d.serie} semana={d.agrupamento === "week"} />
        </Painel>
        <Painel className="p-5">
          <TituloSecao>Funil de vendas</TituloSecao>
          {totalFunil === 0 ? (
            <EstadoVazio compacto titulo="Nenhum negócio" texto="Os negócios abertos e os encerrados no período aparecem aqui." />
          ) : (
            <BarrasHorizontais
              itens={ETAPAS.map((e) => ({
                rotulo: e.rotulo,
                valor: d.funil.find((f) => f.etapa === e.id)?.qtd ?? 0,
                detalhe: e.id === "fechada" || e.id === "perdida" ? "no período" : "agora",
                cor: `var(--etapa-${e.id})`,
              }))}
            />
          )}
        </Painel>

        <Painel className="p-5">
          <TituloSecao>Vendas por consultor</TituloSecao>
          <BarrasHorizontais
            itens={d.porConsultor.filter((c) => c.faturamento > 0).map((c) => ({ rotulo: c.nome, valor: c.faturamento, detalhe: `${c.vendas} venda${c.vendas === 1 ? "" : "s"}` }))}
            formatar={(v) => brl(v)}
            cor="var(--marca)"
            vazio="Nenhuma venda finalizada no período."
          />
        </Painel>
        <Painel className="p-5">
          <TituloSecao>Origem dos leads</TituloSecao>
          <BarrasHorizontais itens={d.origens.map((o) => ({ rotulo: o.origem ? ORIGENS[o.origem as keyof typeof ORIGENS] ?? o.origem : "Não informada", valor: o.qtd }))} vazio="Nenhum lead no período." />
        </Painel>
        <Painel className="p-5">
          <TituloSecao>Motivos de perda</TituloSecao>
          <BarrasHorizontais itens={d.motivos.map((m) => ({ rotulo: MOTIVOS_PERDA[m.motivo as keyof typeof MOTIVOS_PERDA] ?? m.motivo ?? "Sem motivo", valor: m.qtd }))} cor="var(--etapa-perdida)" vazio="Nenhuma venda perdida no período." />
        </Painel>

        <Painel className="overflow-hidden xl:col-span-2">
          <p className="border-b border-linha px-5 py-3 text-[15px] font-semibold">Desempenho dos consultores</p>
          {d.porConsultor.length === 0 ? (
            <EstadoVazio compacto titulo="Sem movimento no período" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-[13.5px]">
                <thead className="text-left text-[11.5px] uppercase tracking-wide text-ink-3">
                  <tr className="border-b border-linha">
                    <th className="px-5 py-2.5 font-medium">Consultor</th>
                    <th className="px-3 py-2.5 text-right font-medium">Leads</th>
                    <th className="px-3 py-2.5 text-right font-medium">Propostas</th>
                    <th className="px-3 py-2.5 text-right font-medium">Vendas</th>
                    <th className="px-3 py-2.5 text-right font-medium">Perdidas</th>
                    <th className="px-3 py-2.5 text-right font-medium">Conversão</th>
                    <th className="px-5 py-2.5 text-right font-medium">Faturamento</th>
                  </tr>
                </thead>
                <tbody>
                  {d.porConsultor.map((c) => (
                    <tr key={c.id} className="border-b border-linha last:border-0">
                      <td className="px-5 py-2.5 font-medium">{c.nome}</td>
                      <td className="num px-3 py-2.5 text-right">{c.leads}</td>
                      <td className="num px-3 py-2.5 text-right">{c.propostas}</td>
                      <td className="num px-3 py-2.5 text-right">{c.vendas}</td>
                      <td className="num px-3 py-2.5 text-right">{c.perdidas}</td>
                      <td className="num px-3 py-2.5 text-right">{c.vendas + c.perdidas ? pct(c.vendas / (c.vendas + c.perdidas)) : "—"}</td>
                      <td className="num px-5 py-2.5 text-right font-semibold">{brl(c.faturamento)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Painel>
        <Painel className="p-5">
          <TituloSecao>Veículos mais vendidos</TituloSecao>
          <BarrasHorizontais itens={d.maisVendidos.map((m) => ({ rotulo: m.modelo || "Sem modelo", valor: m.qtd, detalhe: brl(m.faturamento) }))} formatar={(v) => `${numeroCompacto(v)}`} vazio="Nenhuma venda finalizada no período." />
        </Painel>
      </div>
    </Pagina>
  );
}

function Numero({ rotulo, valor, detalhe, destaque }: { rotulo: string; valor: string; detalhe?: string; destaque?: boolean }) {
  return (
    <Painel className={cn("p-4", destaque && "ring-1 ring-marca/40")}>
      <p className="text-[12px] text-ink-3">{rotulo}</p>
      <p className="num mt-1 truncate text-[22px] font-bold tracking-tight sm:text-[26px]">{valor}</p>
      {detalhe && <p className="mt-0.5 truncate text-[12px] text-ink-2">{detalhe}</p>}
    </Painel>
  );
}
