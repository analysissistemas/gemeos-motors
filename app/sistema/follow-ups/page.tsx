import type { Metadata } from "next";
import Link from "next/link";
import { and, asc, desc, eq, isNull, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { CalendarClock } from "lucide-react";
import { exigirPermissao } from "@/lib/auth/dal";
import { db, schema } from "@/lib/db";
import { chaveDia, chaveHoje, dataHora, formatarTelefone, hora, jaPassou } from "@/lib/formato";
import { cn } from "@/lib/cn";
import { Pagina } from "@/components/ui/pagina";
import { CabecalhoPagina, EstadoVazio, Painel } from "@/components/ui/basicos";
import { AcoesFollowUp } from "./acoes-follow";

export const metadata: Metadata = { title: "Follow-ups" };

export default async function PaginaFollowUps({ searchParams }: { searchParams: Promise<{ todos?: string }> }) {
  const u = await exigirPermissao("conversas.ver");
  const { todos } = await searchParams;
  const verTodos = todos === "1";
  const resp = alias(schema.usuarios, "resp_f");
  /* função: o construtor do Drizzle é mutável; reutilizá-lo faria as duas consultas virarem a última */
  const base = () =>
    db
    .select({
      id: schema.followUps.id,
      agendadoPara: schema.followUps.agendadoPara,
      status: schema.followUps.status,
      notas: schema.followUps.notas,
      tipo: schema.followUps.tipo,
      origem: schema.followUps.origem,
      exigeAprovacao: schema.followUps.exigeAprovacao,
      concluidoEm: schema.followUps.concluidoEm,
      conversaId: schema.followUps.conversaId,
      negocioId: schema.followUps.negocioId,
      clienteId: schema.followUps.clienteId,
      cliente: sql<string | null>`coalesce(${schema.clientes.nome}, ${schema.conversas.contatoNome})`,
      telefone: schema.conversas.contatoTelefone,
      responsavel: resp.nome,
    })
    .from(schema.followUps)
    .leftJoin(schema.clientes, eq(schema.clientes.id, schema.followUps.clienteId))
    .leftJoin(schema.conversas, eq(schema.conversas.id, schema.followUps.conversaId))
    .leftJoin(resp, eq(resp.id, schema.followUps.usuarioId));
  const meus = verTodos ? undefined : or(eq(schema.followUps.usuarioId, u.id), isNull(schema.followUps.usuarioId));
  const [pendentes, encerrados] = await Promise.all([
    base().where(and(eq(schema.followUps.status, "pendente"), meus)).orderBy(asc(schema.followUps.agendadoPara)).limit(300),
    base().where(and(sql`${schema.followUps.status} <> 'pendente'`, meus)).orderBy(desc(schema.followUps.concluidoEm)).limit(20),
  ]);
  const hoje = chaveHoje();
  const grupos = [
    { titulo: "Atrasados", itens: pendentes.filter((f) => jaPassou(f.agendadoPara)), alerta: true },
    { titulo: "Hoje", itens: pendentes.filter((f) => !jaPassou(f.agendadoPara) && chaveDia(f.agendadoPara) === hoje) },
    { titulo: "Próximos dias", itens: pendentes.filter((f) => !jaPassou(f.agendadoPara) && chaveDia(f.agendadoPara) !== hoje) },
  ];

  return (
    <Pagina>
      <CabecalhoPagina
        titulo="Follow-ups"
        subtitulo="Retornos combinados com os clientes. Conclua quando falar com a pessoa."
        acoes={
          <div className="flex gap-1.5">
            <Link href="/sistema/follow-ups" className={cn("rounded-full border px-3 py-1.5 text-[12.5px]", !verTodos ? "border-ink bg-ink text-contra-ink" : "border-linha text-ink-2")}>
              Meus
            </Link>
            <Link href="/sistema/follow-ups?todos=1" className={cn("rounded-full border px-3 py-1.5 text-[12.5px]", verTodos ? "border-ink bg-ink text-contra-ink" : "border-linha text-ink-2")}>
              Toda a equipe
            </Link>
          </div>
        }
      />
      {pendentes.length === 0 ? (
        <Painel>
          <EstadoVazio icone={<CalendarClock />} titulo="Nenhum follow-up pendente" texto="Agende retornos direto na conversa com o cliente." />
        </Painel>
      ) : (
        <div className="flex flex-col gap-5">
          {grupos
            .filter((g) => g.itens.length)
            .map((g) => (
              <section key={g.titulo}>
                <h2 className={cn("mb-2 text-[13px] font-semibold uppercase tracking-wide", g.alerta ? "text-serio" : "text-ink-3")}>
                  {g.titulo} · {g.itens.length}
                </h2>
                <Painel className="overflow-hidden">
                  <ul>
                    {g.itens.map((f) => (
                      <li key={f.id} className="flex flex-col gap-2 border-b border-linha px-4 py-3 last:border-0 sm:flex-row sm:items-center sm:gap-4">
                        <span className={cn("num w-28 shrink-0 text-[14px] font-semibold", g.alerta && "text-serio")}>{g.titulo === "Hoje" ? hora(f.agendadoPara) : dataHora(f.agendadoPara)}</span>
                        <span className="min-w-0 flex-1">
                          <span className="flex flex-wrap items-center gap-2">
                            <span className="truncate font-semibold">{f.cliente ?? formatarTelefone(f.telefone)}</span>
                            <span className="rounded-full bg-marca px-2 py-0.5 text-[10.5px] font-bold uppercase text-black">Follow-up pendente</span>
                            {f.tipo === "estoque" && <span className="rounded-full border border-linha px-2 py-0.5 text-[10.5px] text-ink-2">Voltou ao estoque</span>}
                            {f.exigeAprovacao && <span className="rounded-full border border-linha px-2 py-0.5 text-[10.5px] text-ink-2">Precisa de aprovação</span>}
                          </span>
                          <span className="block truncate text-[12.5px] text-ink-2">
                            {f.notas ?? "Sem anotação"}
                            {verTodos && f.responsavel ? ` · ${f.responsavel}` : ""}
                          </span>
                        </span>
                        <AcoesFollowUp id={f.id} conversaId={f.conversaId} />
                      </li>
                    ))}
                  </ul>
                </Painel>
              </section>
            ))}
        </div>
      )}
      {encerrados.length > 0 && (
        <section className="mt-6">
          <h2 className="mb-2 text-[13px] font-semibold uppercase tracking-wide text-ink-3">Encerrados recentemente</h2>
          <Painel className="overflow-hidden">
            <ul>
              {encerrados.map((f) => (
                <li key={f.id} className="flex items-center justify-between gap-3 border-b border-linha px-4 py-2.5 text-[13px] last:border-0">
                  <span className="truncate">{f.cliente ?? formatarTelefone(f.telefone)}</span>
                  <span className="shrink-0 text-ink-3">
                    {f.status === "concluido" ? "Concluído" : "Cancelado"} · {dataHora(f.concluidoEm)}
                  </span>
                </li>
              ))}
            </ul>
          </Painel>
        </section>
      )}
    </Pagina>
  );
}
