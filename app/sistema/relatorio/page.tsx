import type { Metadata } from "next";
import Link from "next/link";
import { Bot, CalendarClock, ChevronRight, ClipboardList, MessageSquare, Package, TrendingUp } from "lucide-react";
import { exigirPermissao } from "@/lib/auth/dal";
import { relatorioDaManha, planoDeAcao } from "@/lib/consultas/relatorio-manha";
import { AREAS_SUGESTAO } from "@/lib/ia/analista-regras";
import { rotuloEtapa } from "@/lib/dominio";
import { brl, hora, relativo } from "@/lib/formato";
import { Pagina } from "@/components/ui/pagina";
import { CabecalhoPagina, Painel } from "@/components/ui/basicos";

export const metadata: Metadata = { title: "Relatório da manhã" };

/* Relatório da manhã (dono, 15/10/2026): o aviso das 8h no celular abre aqui. Separado por área: plano de ação,
   atendimento, vendas, estoque e o que a IA sugere. */

const dataBr = (dia: string) => `${dia.slice(8, 10)}/${dia.slice(5, 7)}`;
const ORDEM_FUNIL = ["whatsapp", "interessado", "visita", "equipe", "proposta", "negociando"];

function Area({ icone, titulo, children, href, link }: { icone: React.ReactNode; titulo: string; children: React.ReactNode; href?: string; link?: string }) {
  return (
    <Painel className="mb-4 p-5">
      <div className="mb-3 flex items-center gap-2">
        {icone}
        <h2 className="flex-1 text-[16px] font-semibold">{titulo}</h2>
        {href && (
          <Link href={href} className="flex items-center text-[12.5px] text-ink-2 hover:text-ink">
            {link ?? "Abrir"} <ChevronRight className="size-4" />
          </Link>
        )}
      </div>
      {children}
    </Painel>
  );
}

function Numero({ valor, rotulo }: { valor: React.ReactNode; rotulo: string }) {
  return (
    <div className="rounded-xl border border-linha px-3 py-2.5">
      <p className="num text-[20px] font-bold leading-tight">{valor}</p>
      <p className="text-[12px] text-ink-2">{rotulo}</p>
    </div>
  );
}

const Vazio = ({ children }: { children: React.ReactNode }) => <p className="text-[13px] text-ink-3">{children}</p>;

export default async function PaginaRelatorio() {
  await exigirPermissao("conversas.ver");
  const r = await relatorioDaManha();
  const plano = planoDeAcao(r);
  const a = r.atendimento;
  const q = a.qualidade;
  const funil = [...r.vendas.funil].sort((x, y) => ORDEM_FUNIL.indexOf(x.etapa) - ORDEM_FUNIL.indexOf(y.etapa));
  const disponiveis = r.estoque.modelos.reduce((s, m) => s + m.disponiveis, 0);
  const reservados = r.estoque.modelos.reduce((s, m) => s + m.reservados, 0);

  return (
    <Pagina estreita>
      <CabecalhoPagina titulo="Relatório da manhã" subtitulo={`Hoje, ${dataBr(r.hoje)}. Números de ontem (${dataBr(r.ontem)}) e do mês. Chega no celular às 8h.`} />

      {/* 1. plano de ação */}
      <Area icone={<ClipboardList className="size-4.5" />} titulo="Plano de ação de hoje">
        {plano.length ? (
          <ol className="flex flex-col gap-1.5">
            {plano.map((p, i) => (
              <li key={i}>
                <Link href={p.href} className="flex items-start gap-2 rounded-xl px-2 py-1.5 text-[14px] hover:bg-trilho">
                  <span className="num mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-ink text-[11px] font-bold text-contra-ink">{i + 1}</span>
                  <span>{p.texto}</span>
                </Link>
              </li>
            ))}
          </ol>
        ) : (
          <Vazio>Nada pendente registrado para hoje.</Vazio>
        )}
      </Area>

      {/* 2. atendimento */}
      <Area icone={<MessageSquare className="size-4.5" />} titulo="Atendimento" href="/sistema/conversas" link="Atendimento">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Numero valor={a.conversas} rotulo="conversas ontem" />
          <Numero valor={a.novas} rotulo="contatos novos" />
          <Numero valor={a.daIa} rotulo="mensagens da IA" />
          <Numero valor={a.daEquipe} rotulo="mensagens da equipe" />
        </div>
        {q && (
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Numero valor={q.notaMedia ?? "—"} rotulo={`nota do atendimento${q.notaSemanaAnterior != null ? ` (semana: ${q.notaSemanaAnterior})` : ""}`} />
            <Numero valor={q.primeiraRespostaMediaMin != null ? `${q.primeiraRespostaMediaMin} min` : "—"} rotulo="1ª resposta (média)" />
            <Numero valor={q.maiorEsperaMin != null ? `${q.maiorEsperaMin} min` : "—"} rotulo="maior espera" />
            <Numero valor={q.semRespostaNoFim.length} rotulo="ficaram sem resposta" />
          </div>
        )}
        {q && q.objecoes.length > 0 && (
          <p className="mt-3 text-[13px] text-ink-2">
            <b className="text-ink">Objeções de ontem:</b> {q.objecoes.slice(0, 4).map((o) => `${o.rotulo} (${o.total})`).join(", ")}
          </p>
        )}
        {a.esperando.length > 0 ? (
          <div className="mt-3">
            <p className="mb-1 text-[13px] font-semibold text-critico">Esperando a loja agora ({a.esperando.length})</p>
            <ul className="flex flex-col gap-0.5 text-[13.5px]">
              {a.esperando.map((e) => (
                <li key={e.id}>
                  <Link href={`/sistema/conversas?c=${e.id}`} className="hover:underline">
                    {e.nome}
                  </Link>{" "}
                  <span className="text-ink-3">desde {relativo(e.desde)}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="mt-3 text-[13px] text-bom">Nenhum cliente esperando resposta em Humano.</p>
        )}
        {!q && <p className="mt-2 text-[12px] text-ink-3">A nota e as esperas aparecem quando o Analista fecha as fichas do dia.</p>}
      </Area>

      {/* 3. vendas */}
      <Area icone={<TrendingUp className="size-4.5" />} titulo="Vendas" href="/sistema/funil" link="Funil">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Numero valor={r.vendas.ontem.n} rotulo={`vendas ontem${r.vendas.ontem.valor ? ` · ${brl(r.vendas.ontem.valor)}` : ""}`} />
          <Numero valor={r.vendas.mes.n} rotulo={`vendas no mês${r.vendas.mes.valor ? ` · ${brl(r.vendas.mes.valor)}` : ""}`} />
          <Numero valor={r.vendas.prontos.length} rotulo="prontos para fechar" />
          <Numero valor={r.vendas.perdidasOntem} rotulo="perdidas ontem" />
        </div>
        {funil.length > 0 && (
          <p className="mt-3 text-[13px] text-ink-2">
            <b className="text-ink">No funil agora:</b> {funil.map((f) => `${rotuloEtapa(f.etapa)} ${f.n}`).join(" · ")}
          </p>
        )}
        {r.vendas.prontos.length > 0 && (
          <ul className="mt-2 flex flex-col gap-0.5 text-[13.5px]">
            {r.vendas.prontos.slice(0, 6).map((p) => (
              <li key={p.conversaId}>
                🔥{" "}
                <Link href={`/sistema/conversas?c=${p.conversaId}`} className="font-medium hover:underline">
                  {p.cliente ?? "Cliente"}
                </Link>
                {p.interesse ? ` · ${p.interesse}` : ""} <span className="text-ink-3">· {p.porque}</span>
              </li>
            ))}
          </ul>
        )}
      </Area>

      {/* 4. estoque */}
      <Area icone={<Package className="size-4.5" />} titulo="Estoque" href="/sistema/estoque" link="Estoque">
        <div className="mb-3 grid grid-cols-2 gap-2">
          <Numero valor={disponiveis} rotulo="disponíveis" />
          <Numero valor={reservados} rotulo="reservadas (venda em andamento)" />
        </div>
        {r.estoque.modelos.length ? (
          <ul className="flex flex-col gap-0.5 text-[13.5px]">
            {r.estoque.modelos.map((m) => (
              <li key={m.modelo} className="flex gap-2">
                <span className="w-40 shrink-0 font-medium">{m.modelo}</span>
                <span className={m.disponiveis ? "" : "text-critico"}>
                  {m.disponiveis ? `${m.disponiveis} ${m.disponiveis === 1 ? "disponível" : "disponíveis"}` : "sem unidade disponível"}
                  {m.cores ? <span className="text-ink-3"> · {m.cores}</span> : null}
                  {m.reservados ? <span className="text-ink-3"> · {m.reservados} reservada{m.reservados === 1 ? "" : "s"}</span> : null}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <Vazio>Nenhum veículo disponível ou reservado.</Vazio>
        )}
        {r.estoque.procuradosSemEstoque.length > 0 && (
          <p className="mt-3 text-[13px] text-atencao">
            <b>Procurados sem unidade:</b> {r.estoque.procuradosSemEstoque.map((p) => `${p.modelo} (${p.n} cliente${p.n === 1 ? "" : "s"})`).join(", ")}
          </p>
        )}
        {q && q.modelos.length > 0 && (
          <p className="mt-1 text-[13px] text-ink-2">
            <b className="text-ink">Mais procurados ontem:</b> {q.modelos.slice(0, 5).map((m) => `${m.rotulo} (${m.total})`).join(", ")}
          </p>
        )}
      </Area>

      {/* 5. hoje na loja */}
      <Area icone={<CalendarClock className="size-4.5" />} titulo="Hoje na loja" href="/sistema/test-drives" link="Visitas e negociação">
        {r.hojeNaLoja.retiradas.length + r.hojeNaLoja.testDrives.length === 0 ? (
          <Vazio>Nenhuma retirada nem test drive marcado para hoje.</Vazio>
        ) : (
          <ul className="flex flex-col gap-0.5 text-[13.5px]">
            {r.hojeNaLoja.retiradas.map((t, i) => (
              <li key={`r${i}`}>🛵 {t.quando ? `${hora(t.quando)} · ` : ""}{(t.notas ?? "Retirada").split(".")[0]}</li>
            ))}
            {r.hojeNaLoja.testDrives.map((t, i) => (
              <li key={`t${i}`}>
                📅 {hora(t.quando)} · {t.nome ?? "Cliente"} · {t.descricao ?? "visita"}
              </li>
            ))}
          </ul>
        )}
      </Area>

      {/* 6. o que a IA sugere */}
      <Area icone={<Bot className="size-4.5" />} titulo="O que a IA sugere" href="/sistema/melhorias" link="Melhorias">
        {r.ia.sugestoes.length ? (
          <ul className="flex flex-col gap-2">
            {r.ia.sugestoes.slice(0, 6).map((c) => (
              <li key={c.id} className="text-[13.5px]">
                <span className="font-medium">{c.titulo}</span>{" "}
                <span className="text-ink-3">
                  · {AREAS_SUGESTAO[c.area as keyof typeof AREAS_SUGESTAO] ?? c.area}
                  {c.clientes ? ` · ${c.clientes} cliente${c.clientes === 1 ? "" : "s"}` : ""}
                </span>
                <span className="block text-[12.5px] text-ink-2">{c.problema}</span>
              </li>
            ))}
          </ul>
        ) : (
          <Vazio>Nenhuma sugestão nova. O Analista gera as sugestões no fim do dia.</Vazio>
        )}
      </Area>
    </Pagina>
  );
}
