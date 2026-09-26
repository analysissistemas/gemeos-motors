import type { Metadata } from "next";
import Link from "next/link";
import { KeyRound } from "lucide-react";
import { exigirPermissao } from "@/lib/auth/dal";
import { listarEquipe } from "@/lib/consultas/equipe";
import { chaveDia, chaveHoje, dataHora, diaPorExtenso, formatarTelefone, hora } from "@/lib/formato";
import { cn } from "@/lib/cn";
import { listarTestDrives, type ItemTestDrive } from "@/lib/servicos/test-drive";
import { ENDERECO_LOJA, STATUS_ABERTOS, STATUS_TEST_DRIVE, type StatusTestDrive } from "@/lib/test-drive";
import { Pagina } from "@/components/ui/pagina";
import { CabecalhoPagina, EstadoVazio, Painel, Selo } from "@/components/ui/basicos";
import { Filtros } from "@/components/ui/filtros";
import { AcoesItem, NovoTestDrive } from "./tela";

export const metadata: Metadata = { title: "Test drives" };

const PERIODOS = { hoje: "Hoje", "7dias": "Próximos 7 dias", todos: "Todos" } as const;
type Periodo = keyof typeof PERIODOS;

/** Dia de hoje + n, no fuso da loja ("2026-09-27"). */
const chaveDaqui = (n: number) => chaveDia(new Date(Date.now() + n * 86_400_000));
/** Meia-noite (hora de Recife) de hoje + n dias. */
const inicioDoDia = (n: number) => new Date(`${chaveDaqui(n)}T00:00:00-03:00`);

export default async function PaginaTestDrives({ searchParams }: { searchParams: Promise<{ periodo?: string }> }) {
  await exigirPermissao("testdrives.ver");
  const { periodo: p } = await searchParams;
  const periodo: Periodo = p && p in PERIODOS ? (p as Periodo) : "7dias";
  const agora = new Date();
  const ate = periodo === "hoje" ? inicioDoDia(1) : periodo === "7dias" ? inicioDoDia(8) : null;
  const [atrasados, proximos, encerrados, equipe] = await Promise.all([
    listarTestDrives({ ate: agora, status: STATUS_ABERTOS }),
    listarTestDrives({ de: agora, ate, status: STATUS_ABERTOS }),
    listarTestDrives({ status: ["realizado", "nao_compareceu", "cancelado"], ordem: "desc", limite: 20 }),
    listarEquipe(),
  ]);

  /* agenda por dia, no fuso da loja */
  const hoje = chaveHoje();
  const amanha = chaveDaqui(1);
  const dias = new Map<string, ItemTestDrive[]>();
  for (const t of proximos) {
    const k = chaveDia(t.agendadoPara);
    dias.set(k, [...(dias.get(k) ?? []), t]);
  }
  const tituloDia = (k: string, d: Date) => (k === hoje ? "Hoje" : k === amanha ? "Amanhã" : diaPorExtenso(d));

  return (
    <Pagina>
      <CabecalhoPagina titulo="Test drives" subtitulo={`Agenda de test drives na loja de Goiana (${ENDERECO_LOJA}).`} acoes={<NovoTestDrive equipe={equipe} />} />
      <Filtros className="mb-5 flex flex-wrap gap-1.5">
        {(Object.keys(PERIODOS) as Periodo[]).map((k) => (
          <Link key={k} href={k === "7dias" ? "/sistema/test-drives" : `/sistema/test-drives?periodo=${k}`} className={cn("rounded-full border px-3 py-1.5 text-[12.5px]", periodo === k ? "border-ink bg-ink text-contra-ink" : "border-linha text-ink-2")}>
            {PERIODOS[k]}
          </Link>
        ))}
      </Filtros>

      {atrasados.length > 0 && (
        <section className="mb-5">
          <h2 className="mb-2 text-[13px] font-semibold uppercase tracking-wide text-serio">Aguardando resultado · {atrasados.length}</h2>
          <Painel className="overflow-hidden">
            <ul>
              {atrasados.map((t) => (
                <Linha key={t.id} t={t} quando={dataHora(t.agendadoPara)} alerta />
              ))}
            </ul>
          </Painel>
        </section>
      )}

      {proximos.length === 0 ? (
        <Painel>
          <EstadoVazio
            icone={<KeyRound />}
            titulo={periodo === "hoje" ? "Nenhum test drive hoje" : periodo === "7dias" ? "Nenhum test drive nos próximos 7 dias" : "Nenhum test drive marcado"}
            texto="Agende pela conversa com o cliente (painel da direita) ou pelo botão Novo test drive."
          />
        </Painel>
      ) : (
        <div className="flex flex-col gap-5">
          {[...dias.entries()].map(([k, itens]) => (
            <section key={k}>
              <h2 className="mb-2 text-[13px] font-semibold uppercase tracking-wide text-ink-3">
                {tituloDia(k, itens[0].agendadoPara)} · {itens.length}
              </h2>
              <Painel className="overflow-hidden">
                <ul>
                  {itens.map((t) => (
                    <Linha key={t.id} t={t} quando={hora(t.agendadoPara)} />
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
              {encerrados.map((t) => (
                <li key={t.id} className="flex flex-col gap-0.5 border-b border-linha px-4 py-2.5 text-[13px] last:border-0">
                  <span className="flex items-center justify-between gap-3">
                    <span className="truncate font-medium">
                      {t.cliente ?? formatarTelefone(t.telefone)} · <span className="font-normal text-ink-2">{t.veiculo ?? "—"}</span>
                    </span>
                    <span className="shrink-0 text-ink-3">
                      {STATUS_TEST_DRIVE[t.status as StatusTestDrive] ?? t.status} · {dataHora(t.agendadoPara)}
                    </span>
                  </span>
                  {t.resultado && <span className="text-[12px] text-ink-2">{t.resultado}</span>}
                </li>
              ))}
            </ul>
          </Painel>
        </section>
      )}
    </Pagina>
  );
}

function Linha({ t, quando, alerta }: { t: ItemTestDrive; quando: string; alerta?: boolean }) {
  return (
    <li className="flex flex-col gap-2 border-b border-linha px-4 py-3 last:border-0 lg:flex-row lg:items-center lg:gap-4">
      <span className={cn("num w-32 shrink-0 text-[14px] font-semibold", alerta && "text-serio")}>{quando}</span>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-2">
          {t.clienteId ? (
            <Link href={`/sistema/clientes/${t.clienteId}`} className="truncate font-semibold hover:underline">
              {t.cliente ?? formatarTelefone(t.telefone)}
            </Link>
          ) : (
            <span className="truncate font-semibold">{t.cliente ?? formatarTelefone(t.telefone)}</span>
          )}
          <Selo tom={t.status === "confirmado" ? "bom" : "neutro"}>{STATUS_TEST_DRIVE[t.status as StatusTestDrive] ?? t.status}</Selo>
        </span>
        <span className="block truncate text-[12.5px] text-ink-2">
          {t.veiculo ?? "—"} · {formatarTelefone(t.telefone)}
          {t.responsavel ? ` · ${t.responsavel}` : ""}
        </span>
        {t.observacoes && <span className="line-clamp-2 text-[12.5px] text-ink-3">{t.observacoes}</span>}
      </span>
      <AcoesItem id={t.id} status={t.status} agendadoPara={t.agendadoPara} conversaId={t.conversaId} />
    </li>
  );
}
