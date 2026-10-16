import type { Metadata } from "next";
import Link from "next/link";
import { and, desc, eq, isNull, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { AlertTriangle, Bot, CalendarClock, ChevronDown, Clock, Flame, MessageSquare, Users } from "lucide-react";
import { exigirPermissao } from "@/lib/auth/dal";
import { db, schema } from "@/lib/db";
import { chaveDia, chaveHoje, dataCurta, dataHora, diaPorExtenso, formatarTelefone, hora, jaPassou, relativo, tempoDesde } from "@/lib/formato";
import { rotuloEtapa } from "@/lib/dominio";
import { cn } from "@/lib/cn";
import { horasDesde, prioridadeDoFollowUp, TENTATIVAS_IA, type Motivo, type NivelPrioridade } from "@/lib/followup-prioridade";
import { naoClientes, pendentesFollowUp, placarVendedores, prontosParaVendedor, quentesSemRetorno, resultadoFollowUps, type PendenteFollowUp, type Resultado } from "@/lib/consultas/followups";
import { Pagina } from "@/components/ui/pagina";
import { CabecalhoPagina, EstadoVazio, Painel } from "@/components/ui/basicos";
import { classesBotao } from "@/components/ui/botao";
import { AcoesAquecimento, AcoesFollowUp } from "./acoes-follow";

export const metadata: Metadata = { title: "Follow-ups" };

/* Painel de follow-ups para bater o olho e decidir (dono, 15/10/2026):
   1. 🔥 quem respondeu a um follow-up e está pronto para o vendedor; 2. ⚠️ quentes que ninguém marcou retorno;
   3. a fila da equipe EM ORDEM DE PRIORIDADE, com o porquê, o que o cliente quer, a última frase dele, o melhor
   horário e o próximo passo; 4. a fila da IA explicada (1 h, 3 h, 23 h); 5. o resultado (chamou → respondeu →
   avançou → comprou); 6. para o gestor, o placar por vendedor. Conversa do Simulador fica de fora. */

const TIPOS: Record<string, string> = {
  retorno_cliente: "Responder cliente",
  retirada: "Retirada na loja",
  simulacao: "Simulação",
  entrega: "Entrega",
  revisar_ia: "Revisar IA",
  estoque: "Voltou ao estoque",
  pagamento: "Pagamento",
  consulta_terceiro: "Consulta",
};
const nomeDe = (nome: string | null, tel: string | null) => (nome && /\p{L}{2}/u.test(nome) ? nome : formatarTelefone(tel));
const faixaHorario = (h: number) => (h < 12 ? "de manhã" : h < 18 ? "à tarde" : "à noite");

/** O que fazer agora, em uma frase (o vendedor não precisa pensar). */
function proximoPasso(f: PendenteFollowUp): string {
  if (f.tipo === "simulacao") return "Mandar a simulação na conversa";
  if (f.tipo === "entrega") return "Confirmar a entrega e a taxa e avisar o cliente";
  if (f.tipo === "revisar_ia") return "Assumir a conversa e corrigir o que a IA respondeu";
  if (f.tipo === "retorno_cliente") return "Responder a pergunta que ficou sem resposta";
  if (f.tipo === "estoque") return "Avisar que a moto chegou";
  if (f.clienteEsperando) return "Responder o cliente: ele falou por último";
  if (f.etapa === "visita") return "Ligar e confirmar a visita";
  if (f.etapa === "proposta" || f.etapa === "negociando") return "Ligar e fechar a negociação";
  if (f.intencao === "alta") return "Ligar: lead quente";
  return f.interesse ? `Retomar: “O que está faltando para concluirmos a sua compra?”` : "Retomar e perguntar o que ele procura";
}

export default async function PaginaFollowUps({ searchParams }: { searchParams: Promise<{ todos?: string }> }) {
  const u = await exigirPermissao("conversas.ver");
  const { todos } = await searchParams;
  const verTodos = todos === "1";
  const quem = verTodos ? null : u.id;
  const fechou = alias(schema.usuarios, "fechou_f");
  const F = schema.followUps;
  const [pendentesTodos, prontosTodos, quentesTodos, resultado, placar, encerrados] = await Promise.all([
    pendentesFollowUp(quem),
    prontosParaVendedor(quem),
    quentesSemRetorno(quem),
    resultadoFollowUps(quem),
    verTodos ? placarVendedores() : Promise.resolve([]),
    db
      .select({ id: F.id, status: F.status, tipo: F.tipo, concluidoEm: F.concluidoEm, cliente: sql<string | null>`coalesce(${schema.clientes.nome}, ${schema.conversas.contatoNome})`, telefone: schema.conversas.contatoTelefone, fechadoPor: fechou.nome })
      .from(F)
      .leftJoin(schema.clientes, eq(schema.clientes.id, F.clienteId))
      .leftJoin(schema.conversas, eq(schema.conversas.id, F.conversaId))
      .leftJoin(fechou, eq(fechou.id, F.concluidoPor))
      .where(and(sql`${F.status} <> 'pendente'`, sql`coalesce(${F.tipo}, '') not in ('aquecimento', 'lembrete_retirada', 'lembrete_visita')`, sql`coalesce(${schema.conversas.demo}, false) = false`, verTodos ? undefined : or(eq(F.usuarioId, u.id), isNull(F.usuarioId))))
      .orderBy(desc(F.concluidoEm))
      .limit(20),
  ]);
  /* operadora oferecendo serviço e robô não são cliente: fora do painel (dono, 15/10/2026: "é só perda de tempo") */
  const fora = await naoClientes([...pendentesTodos, ...prontosTodos, ...quentesTodos].map((x) => x.conversaId).filter((id): id is number => id !== null));
  const pendentes = pendentesTodos.filter((x) => !x.conversaId || !fora.has(x.conversaId));
  const prontos = prontosTodos.filter((x) => !fora.has(x.conversaId));
  const quentes = quentesTodos.filter((x) => !fora.has(x.conversaId));
  const hoje = chaveHoje();
  /* quem já está em "Prontos" não se repete em "Quentes sem retorno" */
  const esquecidos = quentes.filter((e) => !prontos.some((p) => p.conversaId === e.conversaId));
  const ordemNivel: Record<NivelPrioridade, number> = { alta: 0, media: 1, baixa: 2 };
  const daEquipe = pendentes
    /* o lembrete da retirada a IA manda sozinha: aparece dentro da tarefa "Retirada na loja" */
    .filter((f) => !["aquecimento", "lembrete_retirada", "lembrete_visita"].includes(f.tipo ?? ""))
    .map((f) => ({
      ...f,
      prio: prioridadeDoFollowUp({
        etapa: f.etapa,
        intencao: f.intencao,
        tipo: f.tipo,
        clienteEsperando: f.clienteEsperando,
        horasDesdeCliente: horasDesde(f.ultimaDoClienteEm),
      }),
    }))
    /* primeiro o que importa (prioridade), depois o que venceu antes */
    .sort((a, b) => ordemNivel[a.prio.nivel] - ordemNivel[b.prio.nivel] || b.prio.pontos - a.prio.pontos || new Date(a.agendadoPara).getTime() - new Date(b.agendadoPara).getTime());
  const atrasados = daEquipe.filter((f) => jaPassou(f.agendadoPara)).length;
  const paraHoje = daEquipe.filter((f) => !jaPassou(f.agendadoPara) && chaveDia(new Date(f.agendadoPara)) === hoje).length;
  const porConversa = new Map<number, PendenteFollowUp[]>();
  for (const f of pendentes.filter((x) => x.tipo === "aquecimento")) {
    const k = f.conversaId ?? -f.id;
    porConversa.set(k, [...(porConversa.get(k) ?? []), f]);
  }
  const daIa = Array.from(porConversa.values());
  /* quantos clientes estão em cada tentativa (a próxima que vai sair de cada um) */
  const naTentativa = (n: number) => daIa.filter((fs) => Number(fs[0].contexto?.etapa ?? 0) === n).length;

  return (
    <Pagina>
      <CabecalhoPagina
        titulo="Follow-ups"
        subtitulo={verTodos ? "Visão do gestor: a equipe toda, a IA e o resultado." : "Seus retornos em ordem de prioridade: comece de cima."}
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

      {/* 1. bater o olho */}
      <div className="mb-6 grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
        <Numero numero={prontos.length} rotulo="Prontos para o vendedor" icone={<Flame className="size-3.5" />} tom={prontos.length ? "quente" : undefined} href="#prontos" />
        <Numero numero={esquecidos.length} rotulo="Quentes sem retorno" icone={<AlertTriangle className="size-3.5" />} tom={esquecidos.length ? "serio" : undefined} href="#esquecidos" />
        <Numero numero={atrasados} rotulo={`Atrasados · ${paraHoje} para hoje`} icone={<CalendarClock className="size-3.5" />} tom={atrasados ? "serio" : undefined} href="#equipe" />
        <Numero numero={daIa.length} rotulo="Na fila da IA" icone={<Bot className="size-3.5" />} href="#ia" />
      </div>

      {/* 2. prontos */}
      {prontos.length > 0 && (
        <Secao id="prontos" icone={<Flame className="size-4.5 text-critico" />} titulo="Prontos para o vendedor" ajuda="Responderam a um follow-up com sinal de compra (pagamento, preço, “quero”, vir à loja, entrega, pergunta sobre a moto) ou estão em visita, proposta ou negociação. Figurinha, “ok” e recusa não entram. Pegue agora.">
          <Painel className="overflow-hidden border-critico/40">
            <ul>
              {prontos.map((p) => (
                <li key={p.conversaId} className="flex flex-col gap-2 border-b border-linha px-4 py-3 last:border-0 sm:flex-row sm:items-center sm:gap-4">
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-1.5">
                      <span className="font-semibold">{nomeDe(p.cliente, p.telefone)}</span>
                      <Chip tom="quente">{p.porque}</Chip>
                      {p.esperandoLoja && <Chip tom="quente">Esperando a loja</Chip>}
                      {p.etapa && <Chip tom="bom">{rotuloEtapa(p.etapa)}</Chip>}
                      {p.interesse && <Chip>{p.interesse}</Chip>}
                    </span>
                    <span className="mt-1 block text-[12.5px] text-ink-2">
                      Respondeu {relativo(p.respondeuEm)} ao follow-up {p.deQuem === "ia" ? `da IA${p.tentativa ? ` (${p.tentativa}ª tentativa)` : ""}` : "da equipe"}
                      {p.resposta ? <>: <span className="text-ink">“{p.resposta.slice(0, 120)}”</span></> : null}
                    </span>
                  </span>
                  <Link href={`/sistema/conversas?c=${p.conversaId}`} className={classesBotao("primario", "sm")}>
                    <MessageSquare className="size-4" /> Atender agora
                  </Link>
                </li>
              ))}
            </ul>
          </Painel>
        </Secao>
      )}

      {/* 3. quentes esquecidos */}
      {esquecidos.length > 0 && (
        <Secao id="esquecidos" icone={<AlertTriangle className="size-4.5 text-serio" />} titulo="Quentes sem retorno marcado" ajuda="Lead quente ou em negociação, sem conversa há mais de 24 h e sem follow-up agendado. Ninguém vai lembrar dele se você não marcar.">
          <Painel className="overflow-hidden">
            <ul>
              {esquecidos.map((e) => (
                <li key={e.conversaId} className="flex flex-col gap-2 border-b border-linha px-4 py-3 last:border-0 sm:flex-row sm:items-center sm:gap-4">
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-1.5">
                      <span className="font-semibold">{nomeDe(e.cliente, e.telefone)}</span>
                      {e.intencao === "alta" && <Chip tom="quente">Lead quente</Chip>}
                      {e.etapa && <Chip tom="bom">{rotuloEtapa(e.etapa)}</Chip>}
                      {e.interesse && <Chip>{e.interesse}</Chip>}
                    </span>
                    <span className="mt-1 block text-[12.5px] text-ink-2">
                      Última conversa {relativo(e.ultimaEm)} · {e.responsavel ?? "sem responsável"}
                    </span>
                  </span>
                  <Link href={`/sistema/conversas?c=${e.conversaId}`} className={classesBotao("secundario", "sm")}>
                    <MessageSquare className="size-4" /> Abrir e marcar retorno
                  </Link>
                </li>
              ))}
            </ul>
          </Painel>
        </Secao>
      )}

      {/* 4. fila da equipe por prioridade */}
      <Secao id="equipe" icone={<CalendarClock className="size-4.5" />} titulo="Fila da equipe · em ordem de prioridade" ajuda="De cima para baixo. A prioridade soma o que o cliente mostrou: lead quente, etapa do funil, se está esperando a loja e há quanto tempo não fala.">
        {daEquipe.length === 0 ? (
          <Painel>
            <EstadoVazio icone={<CalendarClock />} titulo="Nada pendente para a equipe" texto="Agende retornos direto na conversa com o cliente." />
          </Painel>
        ) : (
          <Painel className="overflow-hidden">
            <ul>
              {daEquipe.map((f, i) => {
                const atrasado = jaPassou(f.agendadoPara);
                return (
                  <li key={f.id} className="flex flex-col gap-3 border-b border-linha px-4 py-3.5 last:border-0 sm:flex-row sm:gap-4">
                    <span className="flex w-full shrink-0 items-start gap-3 sm:w-36 sm:flex-col sm:gap-1">
                      <span className="num text-[11px] text-ink-3">#{i + 1}</span>
                      <SeloPrioridade nivel={f.prio.nivel} />
                      <span className={cn("num text-[12.5px]", atrasado ? "text-serio" : "text-ink-2")}>
                        {atrasado ? `atrasado há ${tempoDesde(f.agendadoPara)}` : chaveDia(new Date(f.agendadoPara)) === hoje ? `hoje às ${hora(f.agendadoPara)}` : `${dataCurta(f.agendadoPara)} às ${hora(f.agendadoPara)}`}
                      </span>
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-1.5">
                        <span className="font-semibold">{nomeDe(f.cliente, f.telefone)}</span>
                        {f.tipo && TIPOS[f.tipo] && <Chip tom={f.tipo === "revisar_ia" ? "serio" : "marca"}>{TIPOS[f.tipo]}</Chip>}
                        {f.exigeAprovacao && <Chip>Precisa de aprovação</Chip>}
                      </span>
                      <span className="mt-1 flex flex-wrap gap-1">
                        {f.prio.motivos.map((m) => (
                          <MotivoChip key={m.texto} m={m} />
                        ))}
                      </span>
                      <span className="mt-1.5 grid gap-0.5 text-[12.5px]">
                        {f.interesse && (
                          <span className="text-ink-2">
                            <b className="font-medium text-ink">Quer:</b> {f.interesse}
                          </span>
                        )}
                        {f.ultimaDoCliente && !/^Mensagem de um tipo/u.test(f.ultimaDoCliente) && (
                          <span className="truncate text-ink-2">
                            <b className="font-medium text-ink">Disse por último</b> ({relativo(f.ultimaDoClienteEm)}): “{f.ultimaDoCliente.slice(0, 140)}”
                          </span>
                        )}
                        {f.notas && <span className="line-clamp-2 text-ink-2">{f.notas}</span>}
                        <span className="font-medium text-ink">→ {proximoPasso(f)}</span>
                      </span>
                      <span className="mt-1 flex flex-wrap items-center gap-x-3 text-[11.5px] text-ink-3">
                        {f.horaPreferida !== null && (
                          <span className="inline-flex items-center gap-1">
                            <Clock className="size-3" /> costuma escrever {faixaHorario(f.horaPreferida)} (~{f.horaPreferida}h)
                          </span>
                        )}
                        <span>{f.origem === "ia" ? "Pedido pela IA" : "Agendado pela equipe"}</span>
                        <span>{f.responsavel ?? "Sem responsável"}</span>
                      </span>
                    </span>
                    <span className="sm:self-center">
                      <AcoesFollowUp id={f.id} conversaId={f.conversaId} />
                    </span>
                  </li>
                );
              })}
            </ul>
          </Painel>
        )}
      </Secao>

      {/* 5. fila da IA explicada */}
      <Secao id="ia" icone={<Bot className="size-4.5" />} titulo="Fila da IA · ela chama sozinha" ajuda="Cliente que parou de responder recebe até 3 mensagens, só com a loja aberta. Se ele responder ou um vendedor assumir a conversa, as que faltam são canceladas.">
        <div className="mb-3 grid gap-2 sm:grid-cols-3">
          {TENTATIVAS_IA.map((t) => (
            <Painel key={t.etapa} className="px-4 py-3">
              <span className="flex items-baseline justify-between gap-2">
                <span className="text-[13px] font-semibold">
                  {t.etapa}ª · {t.nome}
                </span>
                <span className="num text-[20px] font-bold leading-none">{naTentativa(t.etapa)}</span>
              </span>
              <span className="mt-0.5 block text-[11.5px] uppercase tracking-wide text-ink-3">{t.quando}</span>
              <span className="mt-1 block text-[12.5px] text-ink-2">{t.diz}</span>
            </Painel>
          ))}
        </div>
        {daIa.length > 0 && (
          <Painel className="overflow-hidden">
            <ul>
              {daIa.map((fs) => {
                const f = fs[0];
                const modelo = typeof f.contexto?.modelo === "string" ? f.contexto.modelo : null;
                const proxima = Number(f.contexto?.etapa ?? 1);
                return (
                  <li key={f.id} className="flex flex-col gap-2 border-b border-linha px-4 py-3 last:border-0 sm:flex-row sm:items-center sm:gap-4">
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-1.5">
                        <span className="font-semibold">{nomeDe(f.cliente, f.telefone)}</span>
                        {modelo && <Chip>{modelo}</Chip>}
                      </span>
                      <span className="mt-1.5 flex items-center gap-1.5">
                        {[1, 2, 3].map((n) => {
                          const x = fs.find((y) => Number(y.contexto?.etapa) === n);
                          return (
                            <span key={n} className={cn("num rounded-full border px-2 py-0.5 text-[11.5px]", n < proxima ? "border-bom/50 text-bom" : n === proxima ? "border-ink bg-ink font-semibold text-contra-ink" : x ? "border-linha text-ink-2" : "border-linha text-ink-3 line-through")}>
                              {n}ª {n < proxima ? "enviada" : x ? `${chaveDia(new Date(x.agendadoPara)) === hoje ? "hoje" : diaPorExtenso(x.agendadoPara).split(",")[0]} ${hora(x.agendadoPara)}` : "não sai"}
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
      </Secao>

      {/* 6. resultado */}
      <Secao id="resultado" icone={<Flame className="size-4.5" />} titulo="Resultado · últimos 30 dias" ajuda="Cada cliente conta uma vez. Respondeu = escreveu em até 48 h; avançou = foi para visita, proposta, negociação ou venda em até 7 dias; comprou = venda fechada em até 30 dias.">
        <div className="grid gap-3 sm:grid-cols-2">
          <Funil titulo="Follow-ups da IA" r={resultado.ia} />
          <Funil titulo="Follow-ups da equipe" r={resultado.equipe} />
        </div>
        {resultado.porTentativa.length > 0 && (
          <Painel className="mt-3 px-4 py-3">
            <span className="mb-2 block text-[13px] font-semibold">Qual tentativa da IA faz o cliente responder</span>
            <span className="grid gap-1.5">
              {resultado.porTentativa.map((t) => {
                const pct = t.enviados ? Math.round((t.responderam / t.enviados) * 100) : 0;
                const nome = TENTATIVAS_IA.find((x) => x.etapa === t.tentativa);
                return (
                  <span key={t.tentativa} className="grid grid-cols-[9rem_1fr_5.5rem] items-center gap-2 text-[12.5px]">
                    <span className="truncate">
                      {t.tentativa}ª · {nome?.quando.replace(" sem resposta", "")}
                    </span>
                    <span className="h-2 overflow-hidden rounded-full bg-plano">
                      <span className="block h-full rounded-full bg-marca" style={{ width: `${pct}%` }} />
                    </span>
                    <span className="num text-right text-ink-2">
                      {pct}% · {t.responderam}/{t.enviados}
                    </span>
                  </span>
                );
              })}
            </span>
          </Painel>
        )}
      </Secao>

      {/* 7. gestor */}
      {verTodos && placar.length > 0 && (
        <Secao id="vendedores" icone={<Users className="size-4.5" />} titulo="Por vendedor" ajuda="Follow-ups da equipe (os da IA ficam de fora). Respondeu = o cliente escreveu em até 48 h depois do retorno.">
          <Painel className="overflow-x-auto">
            <table className="w-full min-w-[30rem] text-[13px]">
              <thead className="text-left text-[11.5px] uppercase tracking-wide text-ink-3">
                <tr className="border-b border-linha">
                  <th className="px-4 py-2 font-medium">Vendedor</th>
                  <th className="px-2 py-2 text-right font-medium">Pendentes</th>
                  <th className="px-2 py-2 text-right font-medium">Atrasados</th>
                  <th className="px-2 py-2 text-right font-medium">Feitos (7 dias)</th>
                  <th className="px-4 py-2 text-right font-medium">Responderam</th>
                </tr>
              </thead>
              <tbody>
                {placar.map((v) => (
                  <tr key={v.id} className="border-b border-linha last:border-0">
                    <td className="px-4 py-2.5 font-medium">{v.nome}</td>
                    <td className="num px-2 py-2.5 text-right">{v.pendentes}</td>
                    <td className={cn("num px-2 py-2.5 text-right", v.atrasados > 0 && "font-semibold text-serio")}>{v.atrasados}</td>
                    <td className="num px-2 py-2.5 text-right">{v.feitos7d}</td>
                    <td className="num px-4 py-2.5 text-right">{v.feitos7d ? `${Math.round((v.responderam7d / v.feitos7d) * 100)}% · ${v.responderam7d}` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Painel>
        </Secao>
      )}

      {encerrados.length > 0 && (
        <details className="group mt-2">
          <summary className="mb-2 flex cursor-pointer list-none items-center gap-1.5 text-[13px] font-semibold uppercase tracking-wide text-ink-3">
            <ChevronDown className="size-4 transition group-open:rotate-180" /> Encerrados recentemente · {encerrados.length}
          </summary>
          <Painel className="overflow-hidden">
            <ul>
              {encerrados.map((f) => (
                <li key={f.id} className="flex items-center justify-between gap-3 border-b border-linha px-4 py-2.5 text-[13px] last:border-0">
                  <span className="min-w-0 truncate">
                    <span className="font-medium">{nomeDe(f.cliente, f.telefone)}</span>
                    <span className="text-ink-3"> · {TIPOS[f.tipo ?? ""] ?? "Retorno"}</span>
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

function Secao({ id, icone, titulo, ajuda, children }: { id: string; icone: React.ReactNode; titulo: string; ajuda: string; children: React.ReactNode }) {
  return (
    <section id={id} className="mb-8 scroll-mt-20">
      <h2 className="flex items-center gap-2 text-[16px] font-bold">
        {icone}
        {titulo}
      </h2>
      <p className="mb-3 mt-0.5 text-[12.5px] text-ink-2">{ajuda}</p>
      {children}
    </section>
  );
}

function Numero({ numero, rotulo, icone, tom, href }: { numero: number; rotulo: string; icone: React.ReactNode; tom?: "serio" | "quente"; href: string }) {
  return (
    <a href={href} className={cn("block rounded-2xl border bg-superficie px-4 py-3 transition hover:border-linha-forte", tom === "serio" ? "border-serio/50" : tom === "quente" ? "border-critico/50" : "border-linha")}>
      <span className={cn("num block text-[26px] font-bold leading-none", tom === "serio" && "text-serio", tom === "quente" && "text-critico")}>{numero}</span>
      <span className="mt-1.5 flex items-center gap-1 text-[12.5px] text-ink-2">
        {icone}
        {rotulo}
      </span>
    </a>
  );
}

function SeloPrioridade({ nivel }: { nivel: NivelPrioridade }) {
  const s = { alta: "bg-critico text-white", media: "bg-marca text-black", baixa: "border border-linha text-ink-2" }[nivel];
  return <span className={cn("inline-block rounded-full px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-wide", s)}>{{ alta: "Alta", media: "Média", baixa: "Baixa" }[nivel]}</span>;
}

function Chip({ children, tom }: { children: React.ReactNode; tom?: "quente" | "bom" | "serio" | "marca" }) {
  const s = tom === "quente" ? "bg-critico/15 text-critico" : tom === "bom" ? "bg-bom/15 text-bom" : tom === "serio" ? "border border-serio text-serio" : tom === "marca" ? "bg-marca text-black" : "border border-linha text-ink-2";
  return <span className={cn("rounded-full px-2 py-0.5 text-[10.5px] font-semibold", s)}>{children}</span>;
}

function MotivoChip({ m }: { m: Motivo }) {
  const s = { quente: "text-critico", bom: "text-bom", neutro: "text-ink-2", frio: "text-ink-3" }[m.tom];
  return <span className={cn("rounded-full bg-plano px-2 py-0.5 text-[11px]", s)}>{m.texto}</span>;
}

function Funil({ titulo, r }: { titulo: string; r: Resultado }) {
  const etapas = [
    { rotulo: "Chamados", n: r.chamados },
    { rotulo: "Responderam", n: r.responderam },
    { rotulo: "Avançaram no funil", n: r.avancaram },
    { rotulo: "Compraram", n: r.compraram },
  ];
  return (
    <Painel className="px-4 py-3">
      <span className="mb-2 block text-[13px] font-semibold">{titulo}</span>
      {r.chamados === 0 ? (
        <span className="block text-[12.5px] text-ink-3">Nenhum cliente chamado nos últimos 30 dias.</span>
      ) : (
        <span className="grid gap-1.5">
          {etapas.map((e, i) => {
            const pct = Math.round((e.n / r.chamados) * 100);
            return (
              <span key={e.rotulo} className="grid grid-cols-[8.5rem_1fr_4.5rem] items-center gap-2 text-[12.5px]">
                <span className="truncate">{e.rotulo}</span>
                <span className="h-2 overflow-hidden rounded-full bg-plano">
                  <span className={cn("block h-full rounded-full", i === 3 ? "bg-bom" : "bg-marca")} style={{ width: `${Math.max(pct, e.n ? 3 : 0)}%` }} />
                </span>
                <span className="num text-right text-ink-2">
                  {e.n}
                  {i > 0 ? ` · ${pct}%` : ""}
                </span>
              </span>
            );
          })}
        </span>
      )}
    </Painel>
  );
}
