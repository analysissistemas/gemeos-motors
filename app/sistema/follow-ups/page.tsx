import type { Metadata } from "next";
import Link from "next/link";
import { and, asc, desc, eq, isNull, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { Bot, CalendarClock, ChevronDown } from "lucide-react";
import { exigirPermissao } from "@/lib/auth/dal";
import { db, schema } from "@/lib/db";
import { chaveDia, chaveHoje, dataCurta, dataHora, diaPorExtenso, formatarTelefone, hora, jaPassou, tempoDesde } from "@/lib/formato";
import { cn } from "@/lib/cn";
import { Pagina } from "@/components/ui/pagina";
import { CabecalhoPagina, EstadoVazio, Painel } from "@/components/ui/basicos";
import { AcoesAquecimento, AcoesFollowUp } from "./acoes-follow";

export const metadata: Metadata = { title: "Follow-ups" };

/* Página organizada a pedido do dono (15/10/2026: "o follow-up está funcionando, mas desorganizado"):
   1. resumo no topo; 2. o que a EQUIPE tem de fazer (atrasados, hoje, próximos), cada linha com o tipo, o que fazer,
   de quem é e há quanto tempo atrasou; 3. o que a IA vai mandar sozinha, UMA linha por cliente com as 3 tentativas;
   4. encerrados recolhidos. Conversas do Simulador ficam de fora (aba Testes do Atendimento). */

const TIPOS: Record<string, { rotulo: string; tom?: "serio" | "marca" }> = {
  retorno_cliente: { rotulo: "Responder cliente", tom: "marca" },
  simulacao: { rotulo: "Simulação", tom: "marca" },
  entrega: { rotulo: "Entrega" },
  revisar_ia: { rotulo: "Revisar IA", tom: "serio" },
  estoque: { rotulo: "Voltou ao estoque" },
  pagamento: { rotulo: "Pagamento" },
  consulta_terceiro: { rotulo: "Consulta" },
  manual: { rotulo: "Retorno" },
};
const rotuloTipo = (t: string | null) => TIPOS[t ?? ""] ?? { rotulo: "Retorno" };
/* nome de perfil sem letra (".", emoji): mostra o telefone */
const nomeDe = (nome: string | null, tel: string | null) => (nome && /\p{L}{2}/u.test(nome) ? nome : formatarTelefone(tel));

export default async function PaginaFollowUps({ searchParams }: { searchParams: Promise<{ todos?: string }> }) {
  const u = await exigirPermissao("conversas.ver");
  const { todos } = await searchParams;
  const verTodos = todos === "1";
  const resp = alias(schema.usuarios, "resp_f");
  const quemFechou = alias(schema.usuarios, "fechou_f");
  const F = schema.followUps;
  /* função: o construtor do Drizzle é mutável; reutilizá-lo faria as duas consultas virarem a última */
  const base = () =>
    db
      .select({
        id: F.id,
        agendadoPara: F.agendadoPara,
        status: F.status,
        notas: F.notas,
        motivo: F.motivo,
        tipo: F.tipo,
        origem: F.origem,
        exigeAprovacao: F.exigeAprovacao,
        concluidoEm: F.concluidoEm,
        conversaId: F.conversaId,
        contexto: F.contexto,
        cliente: sql<string | null>`coalesce(${schema.clientes.nome}, ${schema.conversas.contatoNome})`,
        telefone: schema.conversas.contatoTelefone,
        responsavel: resp.nome,
        fechadoPor: quemFechou.nome,
      })
      .from(F)
      .leftJoin(schema.clientes, eq(schema.clientes.id, F.clienteId))
      .leftJoin(schema.conversas, eq(schema.conversas.id, F.conversaId))
      .leftJoin(resp, eq(resp.id, F.usuarioId))
      .leftJoin(quemFechou, eq(quemFechou.id, F.concluidoPor));
  const meus = verTodos ? undefined : or(eq(F.usuarioId, u.id), isNull(F.usuarioId));
  const real = sql`coalesce(${schema.conversas.demo}, ${schema.clientes.demo}, false) = false`;
  const [pendentes, encerrados] = await Promise.all([
    base().where(and(eq(F.status, "pendente"), meus, real)).orderBy(asc(F.agendadoPara)).limit(300),
    /* aquecimento cancelado porque o cliente respondeu é rotina da IA: não entra no histórico da equipe */
    base().where(and(sql`${F.status} <> 'pendente'`, sql`coalesce(${F.tipo}, '') <> 'aquecimento'`, meus, real)).orderBy(desc(F.concluidoEm)).limit(20),
  ]);
  const hoje = chaveHoje();
  const daEquipe = pendentes.filter((f) => f.tipo !== "aquecimento");
  const atrasados = daEquipe.filter((f) => jaPassou(f.agendadoPara));
  const deHoje = daEquipe.filter((f) => !jaPassou(f.agendadoPara) && chaveDia(f.agendadoPara) === hoje);
  const proximos = daEquipe.filter((f) => !jaPassou(f.agendadoPara) && chaveDia(f.agendadoPara) !== hoje);
  /* aquecimento: uma linha por conversa, com as tentativas em ordem */
  const porConversa = new Map<number, typeof pendentes>();
  for (const f of pendentes.filter((x) => x.tipo === "aquecimento")) {
    const k = f.conversaId ?? -f.id;
    porConversa.set(k, [...(porConversa.get(k) ?? []), f]);
  }
  const daIa = Array.from(porConversa.values());

  return (
    <Pagina>
      <CabecalhoPagina
        titulo="Follow-ups"
        subtitulo="O que a equipe precisa retornar e o que a IA vai mandar sozinha."
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

      <div className="mb-6 grid grid-cols-3 gap-2 sm:gap-3">
        <Resumo numero={atrasados.length} rotulo="Atrasados" tom={atrasados.length ? "serio" : undefined} />
        <Resumo numero={deHoje.length} rotulo="Para hoje" />
        <Resumo numero={daIa.length} rotulo={daIa.length === 1 ? "Cliente com a IA" : "Clientes com a IA"} icone />
      </div>

      <h2 className="mb-3 text-[16px] font-bold">Para a equipe</h2>
      {daEquipe.length === 0 ? (
        <Painel className="mb-8">
          <EstadoVazio icone={<CalendarClock />} titulo="Nada pendente para a equipe" texto="Agende retornos direto na conversa com o cliente." />
        </Painel>
      ) : (
        <div className="mb-8 flex flex-col gap-5">
          <Grupo titulo="Atrasados" alerta itens={atrasados} verTodos={verTodos} />
          <Grupo titulo="Hoje" itens={deHoje} verTodos={verTodos} soHora />
          <Grupo titulo="Próximos dias" itens={proximos} verTodos={verTodos} />
        </div>
      )}

      <h2 className="mb-1 flex items-center gap-2 text-[16px] font-bold">
        <Bot className="size-4.5" /> A IA vai chamar sozinha
      </h2>
      <p className="mb-3 text-[12.5px] text-ink-2">Cliente que parou de responder. Se ele responder ou um vendedor assumir a conversa, as tentativas são canceladas sozinhas.</p>
      {daIa.length === 0 ? (
        <Painel className="mb-8">
          <EstadoVazio icone={<Bot />} titulo="Nenhum cliente na fila da IA" texto="Quando um cliente parar de responder, as tentativas aparecem aqui." />
        </Painel>
      ) : (
        <Painel className="mb-8 overflow-hidden">
          <ul>
            {daIa.map((fs) => {
              const f = fs[0];
              const modelo = typeof f.contexto?.modelo === "string" ? f.contexto.modelo : null;
              return (
                <li key={f.id} className="flex flex-col gap-2 border-b border-linha px-4 py-3 last:border-0 sm:flex-row sm:items-center sm:gap-4">
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-baseline gap-x-2">
                      <span className="truncate font-semibold">{nomeDe(f.cliente, f.telefone)}</span>
                      {modelo && <span className="text-[12.5px] text-ink-2">interessado na {modelo}</span>}
                    </span>
                    <span className="mt-1.5 flex flex-wrap gap-1.5">
                      {fs.map((x, i) => {
                        const etapa = typeof x.contexto?.etapa === "number" ? x.contexto.etapa : i + 1;
                        return (
                          <span key={x.id} className={cn("num rounded-full border px-2 py-0.5 text-[11.5px]", i === 0 ? "border-ink-2 text-ink" : "border-linha text-ink-3")} title={x.notas ?? undefined}>
                            {etapa}ª · {chaveDia(x.agendadoPara) === hoje ? "hoje" : diaPorExtenso(x.agendadoPara).split(",")[0]} {hora(x.agendadoPara)}
                          </span>
                        );
                      })}
                    </span>
                  </span>
                  <AcoesAquecimento ids={fs.map((x) => x.id)} conversaId={f.conversaId} />
                </li>
              );
            })}
          </ul>
        </Painel>
      )}

      {encerrados.length > 0 && (
        <details className="group">
          <summary className="mb-2 flex cursor-pointer list-none items-center gap-1.5 text-[13px] font-semibold uppercase tracking-wide text-ink-3">
            <ChevronDown className="size-4 transition group-open:rotate-180" /> Encerrados recentemente · {encerrados.length}
          </summary>
          <Painel className="overflow-hidden">
            <ul>
              {encerrados.map((f) => (
                <li key={f.id} className="flex items-center justify-between gap-3 border-b border-linha px-4 py-2.5 text-[13px] last:border-0">
                  <span className="min-w-0 truncate">
                    <span className="font-medium">{nomeDe(f.cliente, f.telefone)}</span>
                    <span className="text-ink-3"> · {rotuloTipo(f.tipo).rotulo}</span>
                  </span>
                  <span className="shrink-0 text-ink-3">
                    {f.status === "concluido" ? `Concluído${f.fechadoPor ? ` por ${f.fechadoPor}` : ""}` : "Cancelado"} · {dataHora(f.concluidoEm)}
                  </span>
                </li>
              ))}
            </ul>
          </Painel>
        </details>
      )}
    </Pagina>
  );
}

function Resumo({ numero, rotulo, tom, icone }: { numero: number; rotulo: string; tom?: "serio"; icone?: boolean }) {
  return (
    <Painel className={cn("px-4 py-3", tom === "serio" && "border-serio/50")}>
      <span className={cn("num block text-[24px] font-bold leading-none", tom === "serio" && "text-serio")}>{numero}</span>
      <span className="mt-1 flex items-center gap-1 text-[12.5px] text-ink-2">
        {icone && <Bot className="size-3.5" />}
        {rotulo}
      </span>
    </Painel>
  );
}

type Item = {
  id: number;
  agendadoPara: Date;
  notas: string | null;
  motivo: string | null;
  tipo: string | null;
  origem: string | null;
  exigeAprovacao: boolean;
  conversaId: number | null;
  cliente: string | null;
  telefone: string | null;
  responsavel: string | null;
};

function Grupo({ titulo, itens, alerta, soHora, verTodos }: { titulo: string; itens: Item[]; alerta?: boolean; soHora?: boolean; verTodos: boolean }) {
  if (!itens.length) return null;
  return (
    <section>
      <h3 className={cn("mb-2 text-[12.5px] font-semibold uppercase tracking-wide", alerta ? "text-serio" : "text-ink-3")}>
        {titulo} · {itens.length}
      </h3>
      <Painel className="overflow-hidden">
        <ul>
          {itens.map((f) => {
            const t = rotuloTipo(f.tipo);
            const oQue = f.notas ?? f.motivo ?? "Retornar o contato combinado com o cliente.";
            return (
              <li key={f.id} className="flex flex-col gap-2 border-b border-linha px-4 py-3 last:border-0 sm:flex-row sm:items-center sm:gap-4">
                <span className="w-32 shrink-0">
                  <span className={cn("num block text-[14px] font-semibold", alerta && "text-serio")}>{soHora ? hora(f.agendadoPara) : `${dataCurta(f.agendadoPara)} · ${hora(f.agendadoPara)}`}</span>
                  {alerta && <span className="block text-[11.5px] text-serio">atrasado há {tempoDesde(f.agendadoPara)}</span>}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="truncate font-semibold">{nomeDe(f.cliente, f.telefone)}</span>
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-[10.5px] font-semibold",
                        t.tom === "serio" ? "border border-serio text-serio" : t.tom === "marca" ? "bg-marca text-black" : "border border-linha text-ink-2",
                      )}
                    >
                      {t.rotulo}
                    </span>
                    {f.exigeAprovacao && <span className="rounded-full border border-linha px-2 py-0.5 text-[10.5px] text-ink-2">Precisa de aprovação</span>}
                  </span>
                  <span className="mt-0.5 block line-clamp-2 text-[12.5px] text-ink-2">{oQue}</span>
                  <span className="mt-0.5 block text-[11.5px] text-ink-3">
                    {f.origem === "ia" ? "Pedido pela IA" : "Agendado pela equipe"}
                    {verTodos || !f.responsavel ? ` · ${f.responsavel ?? "Sem responsável"}` : ""}
                  </span>
                </span>
                <AcoesFollowUp id={f.id} conversaId={f.conversaId} />
              </li>
            );
          })}
        </ul>
      </Painel>
    </section>
  );
}
