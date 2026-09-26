"use client";
import Link from "next/link";
import { useCallback, useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { Bot, ExternalLink, MessageSquare, Pencil, Receipt, Sparkles, Repeat } from "lucide-react";
import type { DetalheNegocio } from "@/lib/consultas/funil";
import { CANAIS_INTERACAO, ETAPAS, MOTIVOS_PERDA, ORIGENS, STATUS_VENDA, rotuloEtapa, type Etapa } from "@/lib/dominio";
import { brl, data, dataHora, formatarTelefone, km, relativo, tempoDesde } from "@/lib/formato";
import { LinhaDoTempo } from "@/components/ui/abas";
import { Avatar, EstadoVazio, ItemInfo, PontoEtapa, Selo, TituloSecao } from "@/components/ui/basicos";
import { Botao, classesBotao } from "@/components/ui/botao";
import { Dialogo } from "@/components/ui/dialogo";
import { acaoDetalheNegocio, acaoGerarDiagnostico } from "@/app/sistema/funil/acoes";
import { CartaoDiagnostico } from "./diagnostico";
import type { NegocioForm } from "./formulario-negocio";

export function DetalheNegocioGaveta({
  negocioId,
  aoMudar,
  aoPedirEtapa,
  aoEditar,
  versao,
}: {
  negocioId: number | null;
  aoMudar: (v: boolean) => void;
  aoPedirEtapa: (id: number, etapa: Etapa, d: DetalheNegocio) => void;
  aoEditar: (f: NegocioForm) => void;
  versao: number;
}) {
  const [dados, setD] = useState<{ id: number; versao: number; d: DetalheNegocio | null } | null>(null);
  const [pendenteIa, iniciarIa] = useTransition();

  const carregar = useCallback(async (id: number, v: number) => {
    const d = await acaoDetalheNegocio(id);
    setD({ id, versao: v, d });
  }, []);

  useEffect(() => {
    if (!negocioId) return;
    const t = setTimeout(() => carregar(negocioId, versao), 0);
    return () => clearTimeout(t);
  }, [negocioId, versao, carregar]);

  const d = dados && dados.id === negocioId ? dados.d : null;
  const carregando = !!negocioId && (!dados || dados.id !== negocioId || dados.versao !== versao);

  const n = d?.negocio;
  const veiculo = d?.veiculo ? [d.veiculo.marca, d.veiculo.modelo, d.veiculo.versao, d.veiculo.cor, d.veiculo.anoModelo].filter(Boolean).join(" ") : n?.veiculoInteresse;

  return (
    <Dialogo
      aberto={!!negocioId}
      aoMudar={aoMudar}
      tipo="gaveta"
      largura="lg"
      titulo={d ? d.cliente.nome : "Negócio"}
      descricao={n ? `Negócio nº ${n.id} · criado ${relativo(n.criadoEm)}` : undefined}
    >
      {!d || !n ? (
        <div className="flex flex-col gap-3">
          {carregando ? Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-16 animate-pulse rounded-2xl bg-trilho" />) : <EstadoVazio titulo="Negócio não encontrado" />}
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          {n.demo && <Selo tom="atencao">Dados simulados (WhatsApp de demonstração)</Selo>}

          {/* etapa — dá para mudar daqui, sem arrastar (celular, teclado) */}
          <section>
            <TituloSecao>Etapa</TituloSecao>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
              {ETAPAS.map((e) => (
                <button
                  key={e.id}
                  onClick={() => e.id !== n.etapa && aoPedirEtapa(n.id, e.id, d)}
                  aria-pressed={e.id === n.etapa}
                  className={`flex items-center gap-2 rounded-xl border px-2.5 py-2 text-left text-[12.5px] transition ${e.id === n.etapa ? "border-ink bg-vidro-forte font-semibold" : "border-linha text-ink-2 hover:border-linha-forte hover:text-ink"}`}
                >
                  <PontoEtapa etapa={e.id} />
                  {e.curto}
                </button>
              ))}
            </div>
            <p className="mt-2 text-[12px] text-ink-3">
              Nesta etapa há {tempoDesde(n.etapaDesde)} · última interação {n.ultimaInteracaoEm ? relativo(n.ultimaInteracaoEm) : "não registrada"}
            </p>
          </section>

          <section className="grid grid-cols-2 gap-x-6 gap-y-4">
            <ItemInfo rotulo="Veículo" className="col-span-2">
              {veiculo}
              {d.veiculo?.km != null ? ` · ${km(d.veiculo.km)}` : ""}
            </ItemInfo>
            <ItemInfo rotulo="Valor anunciado">{n.valorAnunciado != null ? brl(n.valorAnunciado) : null}</ItemInfo>
            <ItemInfo rotulo="Valor da proposta">{n.valorProposta != null ? brl(n.valorProposta) : null}</ItemInfo>
            <ItemInfo rotulo="Responsável">
              {d.responsavel && (
                <span className="flex items-center gap-1.5">
                  <Avatar nome={d.responsavel} foto={d.responsavelFoto} tamanho="xs" />
                  <span className="truncate">{d.responsavel}</span>
                </span>
              )}
            </ItemInfo>
            <ItemInfo rotulo="Origem">{n.origem ? ORIGENS[n.origem as keyof typeof ORIGENS] : null}</ItemInfo>
            <ItemInfo rotulo="Troca" className="col-span-2">
              {n.temTroca ? `${n.trocaDescricao ?? "Sim"}${n.trocaValor ? ` · avaliada em ${brl(n.trocaValor)}` : ""}` : "Não"}
            </ItemInfo>
            <ItemInfo rotulo="Contato">{formatarTelefone(d.cliente.whatsapp ?? d.cliente.telefone)}</ItemInfo>
            <ItemInfo rotulo="Entrada no funil">{data(n.criadoEm)}</ItemInfo>
            {n.observacoes && (
              <ItemInfo rotulo="Observações" className="col-span-2">
                <span className="whitespace-pre-line">{n.observacoes}</span>
              </ItemInfo>
            )}
          </section>

          <div className="flex flex-wrap gap-2">
            <Botao
              tamanho="sm"
              onClick={() =>
                aoEditar({
                  id: n.id,
                  cliente: { id: d.cliente.id, nome: d.cliente.nome },
                  veiculoId: n.veiculoId,
                  veiculoInteresse: n.veiculoInteresse,
                  responsavelId: n.responsavelId,
                  origem: n.origem,
                  valorAnunciado: n.valorAnunciado,
                  valorProposta: n.valorProposta,
                  temTroca: n.temTroca,
                  trocaDescricao: n.trocaDescricao,
                  trocaValor: n.trocaValor,
                  observacoes: n.observacoes,
                })
              }
            >
              <Pencil className="size-4" /> Editar / proposta
            </Botao>
            <Link href={`/sistema/clientes/${d.cliente.id}`} className={classesBotao("secundario", "sm")}>
              <ExternalLink className="size-4" /> Ficha do cliente
            </Link>
            {d.conversa && (
              <Link href={`/sistema/conversas?c=${d.conversa.id}`} className={classesBotao("secundario", "sm")}>
                <MessageSquare className="size-4" /> Conversa
              </Link>
            )}
            {d.venda && (
              <Link href={`/sistema/vendas/${d.venda.id}`} className={classesBotao("primario", "sm")}>
                <Receipt className="size-4" /> Venda · {STATUS_VENDA[d.venda.status as keyof typeof STATUS_VENDA]}
              </Link>
            )}
          </div>

          {(n.triagemIa || d.atendimentoHumano) && (
            <section className="rounded-2xl border border-linha p-4">
              <p className="mb-1 flex items-center gap-2 text-[13px] font-semibold">
                <Bot className="size-4" /> Atendimento
              </p>
              {n.triagemIa && <p className="text-[13px] text-ink-2">Triagem da IA: {n.triagemIa}</p>}
              {d.atendimentoHumano && <p className="mt-1 text-[13px]">Atendimento humano: {d.atendimentoHumano}</p>}
            </section>
          )}

          {n.etapa === "perdida" && (
            <section>
              <TituloSecao
                acao={
                  <Botao
                    tamanho="sm"
                    carregando={pendenteIa}
                    onClick={() =>
                      iniciarIa(async () => {
                        const r = await acaoGerarDiagnostico(n.id);
                        if (!r.ok) return void toast.error(r.erro);
                        toast.success(r.mensagem);
                        await carregar(n.id, versao);
                      })
                    }
                  >
                    <Sparkles className="size-4" /> {n.diagnosticoIa ? "Gerar de novo" : "Gerar diagnóstico"}
                  </Botao>
                }
              >
                Venda perdida
              </TituloSecao>
              <dl className="mb-3 grid grid-cols-1 gap-3 text-[13.5px] sm:grid-cols-2">
                <ItemInfo rotulo="Motivo">{n.perdaMotivo ? MOTIVOS_PERDA[n.perdaMotivo as keyof typeof MOTIVOS_PERDA] : null}</ItemInfo>
                <ItemInfo rotulo="Objeção principal">{n.perdaObjecao}</ItemInfo>
                <ItemInfo rotulo="Observações do consultor" className="sm:col-span-2">
                  <span className="whitespace-pre-line">{n.perdaObservacoes}</span>
                </ItemInfo>
              </dl>
              {n.diagnosticoIa ? (
                <CartaoDiagnostico d={n.diagnosticoIa} quando={n.diagnosticoEm ? dataHora(n.diagnosticoEm) : undefined} />
              ) : (
                <p className="rounded-2xl border border-dashed border-linha-forte p-4 text-[13px] text-ink-2">Diagnóstico ainda não gerado.</p>
              )}
            </section>
          )}

          {d.followups.length > 0 && (
            <section>
              <TituloSecao>Follow-ups pendentes</TituloSecao>
              <ul className="flex flex-col gap-1.5 text-[13px]">
                {d.followups.map((f) => (
                  <li key={f.id} className="flex items-center gap-2">
                    <Repeat className="size-4 text-ink-3" /> {dataHora(f.agendadoPara)} {f.notas ? `· ${f.notas}` : ""}
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section>
            <TituloSecao>Histórico do negócio</TituloSecao>
            <LinhaDoTempo
              itens={[
                ...d.eventos.filter((e) => e.tipo !== "interacao").map((e) => ({ id: `e${e.id}`, titulo: e.descricao, quando: dataHora(e.criadoEm), quem: e.usuario, t: +new Date(e.criadoEm) })),
                ...d.interacoes.map((i) => ({
                  id: `i${i.id}`,
                  titulo: `Interação — ${CANAIS_INTERACAO[i.canal as keyof typeof CANAIS_INTERACAO] ?? i.canal}`,
                  detalhe: i.resumo,
                  quando: dataHora(i.criadoEm),
                  quem: i.usuario,
                  t: +new Date(i.criadoEm),
                })),
              ].sort((a, b) => b.t - a.t)}
            />
          </section>
          <p className="text-[11.5px] text-ink-3">Etapa atual: {rotuloEtapa(n.etapa)}</p>
        </div>
      )}
    </Dialogo>
  );
}
