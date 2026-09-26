import type { Metadata } from "next";
import { asc, desc, eq, inArray, sql } from "drizzle-orm";
import { PhoneCall } from "lucide-react";
import { exigirPermissao } from "@/lib/auth/dal";
import { db, schema } from "@/lib/db";
import { dataHora, formatarTelefone } from "@/lib/formato";
import {
  STATUS_LIGACAO,
  RESULTADOS_LIGACAO,
  type StatusLigacao,
  type ResultadoLigacao,
} from "@/lib/servicos/ligacoes";
import { Pagina } from "@/components/ui/pagina";
import { CabecalhoPagina, EstadoVazio, Painel } from "@/components/ui/basicos";
import { AcoesLigacao } from "./acoes-ligacao";

export const metadata: Metadata = { title: "Ligações" };

export default async function PaginaLigacoes() {
  await exigirPermissao("conversas.ver");
  const base = () =>
    db
      .select({
        id: schema.solicitacoesLigacao.id,
        conversaId: schema.solicitacoesLigacao.conversaId,
        telefone: schema.solicitacoesLigacao.telefone,
        nome: sql<
          string | null
        >`coalesce(${schema.clientes.nome}, ${schema.solicitacoesLigacao.nomeContato})`,
        motivo: schema.solicitacoesLigacao.motivo,
        preferencia: schema.solicitacoesLigacao.preferencia,
        status: schema.solicitacoesLigacao.status,
        agendadoPara: schema.solicitacoesLigacao.agendadoPara,
        foraDoHorario: schema.solicitacoesLigacao.foraDoHorario,
        criadoEm: schema.solicitacoesLigacao.criadoEm,
        responsavel: schema.usuarios.nome,
      })
      .from(schema.solicitacoesLigacao)
      .leftJoin(
        schema.clientes,
        eq(schema.clientes.id, schema.solicitacoesLigacao.clienteId),
      )
      .leftJoin(
        schema.usuarios,
        eq(schema.usuarios.id, schema.solicitacoesLigacao.responsavelId),
      );
  const [abertas, feitas] = await Promise.all([
    base()
      .where(
        inArray(schema.solicitacoesLigacao.status, [
          "pendente",
          "em_andamento",
          "reagendada",
        ]),
      )
      .orderBy(asc(schema.solicitacoesLigacao.criadoEm))
      .limit(200),
    base()
      .where(
        inArray(schema.solicitacoesLigacao.status, [
          "concluida",
          "nao_atendida",
        ]),
      )
      .orderBy(desc(schema.solicitacoesLigacao.atualizadoEm))
      .limit(30),
  ]);
  const ids = feitas.map((f) => f.id);
  const hist = ids.length
    ? await db
        .select()
        .from(schema.ligacoesHistorico)
        .where(inArray(schema.ligacoesHistorico.solicitacaoId, ids))
        .orderBy(desc(schema.ligacoesHistorico.ocorridaEm))
    : [];
  const ultimo = new Map<number, (typeof hist)[number]>();
  for (const h of hist)
    if (!ultimo.has(h.solicitacaoId)) ultimo.set(h.solicitacaoId, h);

  return (
    <Pagina>
      <CabecalhoPagina
        titulo="Ligações"
        subtitulo="Clientes que pediram para receber uma ligação. Ligue no horário de atendimento e registre o resultado."
      />
      {abertas.length === 0 ? (
        <Painel>
          <EstadoVazio
            icone={<PhoneCall />}
            titulo="Nenhum pedido de ligação pendente"
            texto="Quando um cliente pedir uma ligação no WhatsApp, ele aparece aqui."
          />
        </Painel>
      ) : (
        <Painel className="overflow-hidden">
          <ul>
            {abertas.map((s) => (
              <li
                key={s.id}
                className="flex flex-col gap-2 border-b border-linha px-4 py-3 last:border-0 lg:flex-row lg:items-center lg:gap-4"
              >
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="truncate font-semibold">
                      {s.nome ?? formatarTelefone(s.telefone)}
                    </span>
                    <span className="rounded-full bg-marca px-2 py-0.5 text-[10.5px] font-bold uppercase text-black">
                      {STATUS_LIGACAO[s.status as StatusLigacao]}
                    </span>
                    {s.foraDoHorario && (
                      <span className="rounded-full border border-linha px-2 py-0.5 text-[10.5px] text-ink-2">
                        Pedido fora do horário
                      </span>
                    )}
                  </span>
                  <span className="block truncate text-[12.5px] text-ink-2">
                    {formatarTelefone(s.telefone)} · pedido em{" "}
                    {dataHora(s.criadoEm)}
                    {s.preferencia ? ` · prefere: ${s.preferencia}` : ""}
                    {s.agendadoPara
                      ? ` · ligar em ${dataHora(s.agendadoPara)}`
                      : ""}
                    {s.responsavel ? ` · ${s.responsavel}` : ""}
                  </span>
                  {s.motivo && (
                    <span className="line-clamp-2 text-[12.5px] text-ink-3">
                      “{s.motivo}”
                    </span>
                  )}
                </span>
                <AcoesLigacao
                  id={s.id}
                  telefone={s.telefone}
                  conversaId={s.conversaId}
                />
              </li>
            ))}
          </ul>
        </Painel>
      )}
      {feitas.length > 0 && (
        <section className="mt-6">
          <h2 className="mb-2 text-[13px] font-semibold uppercase tracking-wide text-ink-3">
            Histórico recente
          </h2>
          <Painel className="overflow-hidden">
            <ul>
              {feitas.map((f) => {
                const h = ultimo.get(f.id);
                return (
                  <li
                    key={f.id}
                    className="flex flex-col gap-0.5 border-b border-linha px-4 py-2.5 text-[13px] last:border-0"
                  >
                    <span className="flex items-center justify-between gap-3">
                      <span className="truncate font-medium">
                        {f.nome ?? formatarTelefone(f.telefone)}
                      </span>
                      <span className="shrink-0 text-ink-3">
                        {h
                          ? `${RESULTADOS_LIGACAO[h.resultado as ResultadoLigacao] ?? h.resultado} · ${dataHora(h.ocorridaEm)}`
                          : STATUS_LIGACAO[f.status as StatusLigacao]}
                      </span>
                    </span>
                    {h && (h.duracaoSegundos || h.notas || h.proximaAcao) && (
                      <span className="text-[12px] text-ink-2">
                        {h.duracaoSegundos
                          ? `${Math.round(h.duracaoSegundos / 60)} min. `
                          : ""}
                        {h.notas ?? ""}{" "}
                        {h.proximaAcao ? `Próxima ação: ${h.proximaAcao}` : ""}
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          </Painel>
        </section>
      )}
    </Pagina>
  );
}
