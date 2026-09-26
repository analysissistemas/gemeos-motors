"use client";
import Link from "next/link";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Bot, CalendarClock, CalendarPlus, ExternalLink, Link2, Pencil, Receipt, Repeat, Sparkles, UserPlus } from "lucide-react";
import type { ContextoConversa } from "@/lib/consultas/conversas";
import { ETAPAS, ORIGENS, STATUS_CONVERSA, STATUS_VENDA, type Etapa } from "@/lib/dominio";
import { brl, data, dataHora, formatarCpf, formatarTelefone, relativo } from "@/lib/formato";
import { cn } from "@/lib/cn";
import { Avatar, ItemInfo, Selo } from "@/components/ui/basicos";
import { Botao, classesBotao } from "@/components/ui/botao";
import { Campo, CampoDinheiro, Entrada, Selecao } from "@/components/ui/campos";
import { FormularioCliente } from "@/components/clientes/formulario-cliente";
import { SeletorCliente } from "@/components/clientes/seletor-cliente";
import {
  acaoAgendarFollowUp,
  acaoEncerrarFollowUp,
  acaoNegocioDaConversa,
  acaoTriagem,
  acaoVincularCliente,
} from "@/app/sistema/conversas/acoes";

export type AlvoEtapa = { id: number; cliente: string; responsavelId: number | null; veiculoId: number | null; valorAnunciado: number | null; valorProposta: number | null };

export function ContextoCliente({
  ctx,
  equipe,
  usuarioId,
  permissoes,
  aoAtualizar,
  aoPedirEtapa,
  aoEditarNegocio,
  aoAtribuir,
  aoStatus,
}: {
  ctx: ContextoConversa;
  equipe: { id: number; nome: string }[];
  usuarioId: number;
  permissoes: { clientes: boolean; funil: boolean; vendas: boolean };
  aoAtualizar: () => void;
  aoPedirEtapa: (alvo: AlvoEtapa, atual: string, destino: Etapa) => void;
  aoEditarNegocio: () => void;
  aoAtribuir: (id: number | null) => void;
  aoStatus: (s: string) => void;
}) {
  const c = ctx.conversa;
  const [cadastrando, setCadastrando] = useState(false);
  const [ligando, setLigando] = useState<{ id: number; nome: string } | null>(null);
  const [pendente, iniciar] = useTransition();
  const t = c.triagemIa;
  const proximo = ctx.followups.filter((f) => f.status === "pendente").sort((a, b) => +new Date(a.agendadoPara) - +new Date(b.agendadoPara))[0];

  return (
    <div className="flex flex-col gap-5 pb-6">
      {/* atendimento (no celular os seletores do cabeçalho ficam aqui) */}
      <Bloco titulo="Atendimento">
        <div className="grid grid-cols-2 gap-2">
          <Campo rotulo="Status">
            <Selecao value={c.status} onChange={(e) => aoStatus(e.target.value)}>
              {Object.entries(STATUS_CONVERSA).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </Selecao>
          </Campo>
          <Campo rotulo="Responsável">
            <Selecao value={c.responsavelId ?? ""} onChange={(e) => aoAtribuir(e.target.value ? Number(e.target.value) : null)}>
              <option value="">Ninguém</option>
              {equipe.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.id === usuarioId ? `${p.nome} (você)` : p.nome}
                </option>
              ))}
            </Selecao>
          </Campo>
        </div>
        <p className="mt-2 text-[12px] text-ink-3">
          {c.modo === "ia" ? "Em triagem pela IA." : ctx.atendimentoHumano ? `Atendimento humano iniciado por ${ctx.atendimentoHumano}${c.atendimentoHumanoEm ? ` · ${dataHora(c.atendimentoHumanoEm)}` : ""}.` : "Atendimento humano."}
          {c.demo ? " Conversa de demonstração." : ""}
        </p>
      </Bloco>

      {/* cliente */}
      <Bloco titulo="Cliente">
        {ctx.cliente ? (
          <>
            <div className="mb-3 flex items-center gap-3">
              <Avatar nome={ctx.cliente.nome} foto={ctx.cliente.fotoUrl} />
              <div className="min-w-0 flex-1">
                <p className="text-[11.5px] text-ink-3">Nome</p>
                <p className="mt-0.5 truncate text-[13.5px]">
                  <Link href={`/sistema/clientes/${ctx.cliente.id}`} className="font-semibold hover:underline">
                    {ctx.cliente.nome}
                  </Link>
                  {ctx.cliente.demo && <Selo tom="atencao" className="ml-2">Simulado</Selo>}
                </p>
              </div>
            </div>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
              <ItemInfo rotulo="Telefone">{formatarTelefone(ctx.cliente.whatsapp ?? ctx.cliente.telefone)}</ItemInfo>
              <ItemInfo rotulo="CPF">{ctx.cliente.cpf ? formatarCpf(ctx.cliente.cpf) : null}</ItemInfo>
              <ItemInfo rotulo="Aniversário">{ctx.cliente.nascimento ? data(ctx.cliente.nascimento) : null}</ItemInfo>
              <ItemInfo rotulo="E-mail">{ctx.cliente.email}</ItemInfo>
            </dl>
          </>
        ) : (
          <div className="rounded-2xl border border-dashed border-linha-forte p-3">
            <p className="text-[13.5px] font-semibold">Contato sem cadastro</p>
            <p className="mt-0.5 text-[12.5px] text-ink-2">
              {c.contatoNome ? `${c.contatoNome} · ` : ""}
              {formatarTelefone(c.contatoTelefone)}
            </p>
            {permissoes.clientes && (
              <div className="mt-3 flex flex-col gap-2">
                <Botao tamanho="sm" variante="primario" onClick={() => setCadastrando(true)}>
                  <UserPlus className="size-4" /> Cadastrar cliente
                </Botao>
                <p className="text-[11.5px] text-ink-3">Ou ligue a um cliente que já existe:</p>
                <SeletorCliente valor={ligando} aoMudar={setLigando} equipe={equipe} />
                {ligando && (
                  <Botao
                    tamanho="sm"
                    carregando={pendente}
                    onClick={() =>
                      iniciar(async () => {
                        const r = await acaoVincularCliente(c.id, ligando.id);
                        if (!r.ok) return void toast.error(r.erro);
                        toast.success(r.mensagem);
                        setLigando(null);
                        aoAtualizar();
                      })
                    }
                  >
                    <Link2 className="size-4" /> Ligar a {ligando.nome}
                  </Botao>
                )}
              </div>
            )}
          </div>
        )}
      </Bloco>

      {t && (
        <Bloco
          titulo="Triagem da IA"
          acao={
            c.modo === "ia" && (
              <Botao
                tamanho="sm"
                variante="fantasma"
                carregando={pendente}
                onClick={() =>
                  iniciar(async () => {
                    const r = await acaoTriagem(c.id);
                    if (!r.ok) return void toast.error(r.erro);
                    toast.success(r.mensagem);
                    aoAtualizar();
                  })
                }
              >
                <Sparkles className="size-4" /> Refazer
              </Botao>
            )
          }
        >
          <p className="text-[13.5px] leading-relaxed">{t.resumo}</p>
          <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3">
            <ItemInfo rotulo="Interesse">{t.veiculo ?? t.interesse}</ItemInfo>
            <ItemInfo rotulo="Intenção de compra">{t.intencaoCompra === "indefinida" ? "Indefinida" : t.intencaoCompra === "media" ? "Média" : t.intencaoCompra === "alta" ? "Alta" : "Baixa"}</ItemInfo>
            <ItemInfo rotulo="Troca" className="col-span-2">
              {t.temTroca == null ? "Não informado" : t.temTroca ? (t.trocaDescricao ?? "Sim") : "Não"}
            </ItemInfo>
            {t.faltaPerguntar.length > 0 && (
              <ItemInfo rotulo="Falta perguntar" className="col-span-2">
                <span className="whitespace-normal">{t.faltaPerguntar.join(" · ")}</span>
              </ItemInfo>
            )}
          </dl>
          <p className="mt-2 flex items-center gap-1 text-[11.5px] text-ink-3">
            <Bot className="size-3" /> {c.triagemEm ? `Atualizada ${relativo(c.triagemEm)}` : ""}
          </p>
        </Bloco>
      )}

      {/* negócio */}
      <Bloco
        titulo="Negócio"
        acao={
          ctx.negocio &&
          permissoes.funil && (
            <Link href={`/sistema/funil?negocio=${ctx.negocio.id}`} className={classesBotao("fantasma", "sm")}>
              <ExternalLink className="size-4" /> Funil
            </Link>
          )
        }
      >
        {ctx.negocio ? (
          <>
            <div className="grid grid-cols-5 gap-1" role="group" aria-label="Etapa do negócio">
              {ETAPAS.map((e) => {
                const on = e.id === ctx.negocio!.etapa;
                return (
                  <button
                    key={e.id}
                    disabled={!permissoes.funil}
                    onClick={() =>
                      !on &&
                      aoPedirEtapa(
                        { id: ctx.negocio!.id, cliente: ctx.cliente?.nome ?? "", responsavelId: ctx.negocio!.responsavelId, veiculoId: ctx.negocio!.veiculoId, valorAnunciado: ctx.negocio!.valorAnunciado, valorProposta: ctx.negocio!.valorProposta },
                        ctx.negocio!.etapa,
                        e.id,
                      )
                    }
                    title={e.rotulo}
                    aria-pressed={on}
                    className={cn("flex flex-col items-center gap-1 rounded-xl border px-1 py-2 text-[10.5px] leading-tight transition", on ? "border-ink bg-vidro-forte font-semibold" : "border-linha text-ink-2 hover:border-linha-forte")}
                  >
                    <span className="size-2.5 rounded-full" style={{ background: `var(--etapa-${e.id})` }} aria-hidden />
                    {e.curto}
                  </button>
                );
              })}
            </div>
            <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3">
              <ItemInfo rotulo="Veículo" className="col-span-2">
                {ctx.negocio.veiculo ?? ctx.negocio.veiculoInteresse}
              </ItemInfo>
              <ItemInfo rotulo="Valor anunciado">{ctx.negocio.valorAnunciado != null ? brl(ctx.negocio.valorAnunciado) : null}</ItemInfo>
              <ItemInfo rotulo="Proposta">{ctx.negocio.valorProposta != null ? brl(ctx.negocio.valorProposta) : null}</ItemInfo>
              <ItemInfo rotulo="Troca" className="col-span-2">
                {ctx.negocio.temTroca ? `${ctx.negocio.trocaDescricao ?? "Sim"}${ctx.negocio.trocaValor ? ` · ${brl(ctx.negocio.trocaValor)}` : ""}` : "Não"}
              </ItemInfo>
              <ItemInfo rotulo="Responsável">
                {ctx.negocio.responsavel && (
                  <span className="flex items-center gap-1.5">
                    <Avatar nome={ctx.negocio.responsavel} foto={ctx.negocio.responsavelFoto} tamanho="xs" />
                    <span className="truncate">{ctx.negocio.responsavel}</span>
                  </span>
                )}
              </ItemInfo>
              <ItemInfo rotulo="Entrada">{data(ctx.negocio.criadoEm)}</ItemInfo>
              <ItemInfo rotulo="Origem">{ctx.negocio.origem ? ORIGENS[ctx.negocio.origem as keyof typeof ORIGENS] : null}</ItemInfo>
            </dl>
            <div className="mt-3 flex flex-wrap gap-2">
              {permissoes.funil && (
                <Botao tamanho="sm" onClick={aoEditarNegocio}>
                  <Pencil className="size-4" /> Editar / proposta
                </Botao>
              )}
              {ctx.negocio.vendaId && permissoes.vendas && (
                <Link href={`/sistema/vendas/${ctx.negocio.vendaId}`} className={classesBotao("primario", "sm")}>
                  <Receipt className="size-4" /> Venda · {STATUS_VENDA[ctx.negocio.vendaStatus as keyof typeof STATUS_VENDA]}
                </Link>
              )}
            </div>
          </>
        ) : ctx.cliente && permissoes.funil ? (
          <NovoNegocio conversaId={c.id} triagem={t} aoCriar={aoAtualizar} />
        ) : (
          <p className="text-[13px] text-ink-3">{ctx.cliente ? "Sem negócio no funil." : "Cadastre o cliente para criar o negócio."}</p>
        )}
      </Bloco>

      {/* follow-up */}
      <Bloco titulo="Próximo follow-up">
        {proximo ? (
          <div className="rounded-2xl border border-linha p-3">
            <p className="flex items-center gap-2 text-[15px] font-semibold">
              <CalendarClock className="size-4" /> {dataHora(proximo.agendadoPara)}
            </p>
            {proximo.notas && <p className="mt-1 text-[13px] text-ink-2">{proximo.notas}</p>}
            <p className="mt-1 text-[11.5px] text-ink-3">{proximo.usuario ? `Com ${proximo.usuario}` : ""}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Botao
                tamanho="sm"
                variante="primario"
                carregando={pendente}
                onClick={() =>
                  iniciar(async () => {
                    const r = await acaoEncerrarFollowUp(proximo.id, "concluido");
                    if (!r.ok) return void toast.error(r.erro);
                    toast.success(r.mensagem);
                    aoAtualizar();
                  })
                }
              >
                Concluir follow-up
              </Botao>
              <AgendarFollowUp conversaId={c.id} rotulo="Reagendar" aoAgendar={aoAtualizar} />
              <Botao
                tamanho="sm"
                variante="fantasma"
                carregando={pendente}
                onClick={() =>
                  iniciar(async () => {
                    const r = await acaoEncerrarFollowUp(proximo.id, "cancelado");
                    if (!r.ok) return void toast.error(r.erro);
                    toast.success(r.mensagem);
                    aoAtualizar();
                  })
                }
              >
                Cancelar
              </Botao>
            </div>
          </div>
        ) : (
          <AgendarFollowUp conversaId={c.id} rotulo="Agendar follow-up" aoAgendar={aoAtualizar} aberto />
        )}
      </Bloco>

      {/* histórico */}
      {ctx.cliente && ctx.historico && (
        <Bloco
          titulo="Histórico do cliente"
          acao={
            <Link href={`/sistema/clientes/${ctx.cliente.id}`} className={classesBotao("fantasma", "sm")}>
              Ficha completa
            </Link>
          }
        >
          <dl className="grid grid-cols-3 gap-2 text-center">
            {[
              ["Conversas", ctx.historico.conversas],
              ["Negócios", ctx.historico.negocios],
              ["Propostas", ctx.historico.propostas],
              ["Vendas", ctx.historico.vendas],
              ["OS", ctx.historico.os],
              ["Follow-ups", ctx.historico.followups],
            ].map(([r, v]) => (
              <div key={r} className="rounded-xl bg-trilho px-2 py-2">
                <dd className="num text-[17px] font-bold">{v}</dd>
                <dt className="text-[11px] text-ink-3">{r}</dt>
              </div>
            ))}
          </dl>
        </Bloco>
      )}

      <FormularioCliente
        aberto={cadastrando}
        aoMudar={setCadastrando}
        equipe={equipe}
        inicial={{ nome: c.contatoNome, whatsapp: c.contatoTelefone.startsWith("55") ? c.contatoTelefone.slice(2) : c.contatoTelefone, origem: "whatsapp" }}
        aoSalvar={async (id) => {
          const r = await acaoVincularCliente(c.id, id);
          if (!r.ok) toast.error(r.erro);
          aoAtualizar();
        }}
      />
    </div>
  );
}

function Bloco({ titulo, acao, children }: { titulo: string; acao?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section>
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-3">{titulo}</h3>
        {acao}
      </div>
      {children}
    </section>
  );
}

function NovoNegocio({ conversaId, triagem, aoCriar }: { conversaId: number; triagem: ContextoConversa["conversa"]["triagemIa"]; aoCriar: () => void }) {
  const [veiculo, setVeiculo] = useState(triagem?.veiculo ?? triagem?.interesse ?? "");
  const [valor, setValor] = useState<number | null>(null);
  const [troca, setTroca] = useState(triagem?.trocaDescricao ?? "");
  const [pendente, iniciar] = useTransition();
  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-dashed border-linha-forte p-3">
      <p className="text-[13px] text-ink-2">Sem negócio no funil. Crie para acompanhar esta venda.</p>
      <Campo rotulo="Veículo de interesse">
        <Entrada value={veiculo} onChange={(e) => setVeiculo(e.target.value)} />
      </Campo>
      <Campo rotulo="Valor anunciado">
        <CampoDinheiro valor={valor} aoMudar={setValor} />
      </Campo>
      <Campo rotulo="Veículo na troca (se houver)">
        <Entrada value={troca} onChange={(e) => setTroca(e.target.value)} />
      </Campo>
      <Botao
        variante="primario"
        tamanho="sm"
        carregando={pendente}
        onClick={() =>
          iniciar(async () => {
            const r = await acaoNegocioDaConversa(conversaId, { veiculoInteresse: veiculo, valorAnunciado: valor, temTroca: !!troca.trim(), trocaDescricao: troca });
            if (!r.ok) return void toast.error(r.erro);
            toast.success(r.mensagem);
            aoCriar();
          })
        }
      >
        Criar negócio
      </Botao>
    </div>
  );
}

function AgendarFollowUp({ conversaId, rotulo, aoAgendar, aberto: inicial }: { conversaId: number; rotulo: string; aoAgendar: () => void; aberto?: boolean }) {
  const [aberto, setAberto] = useState(!!inicial);
  const [quando, setQuando] = useState("");
  const [notas, setNotas] = useState("");
  const [pendente, iniciar] = useTransition();
  const atalho = (dias: number, h = 10) => {
    const d = new Date();
    d.setDate(d.getDate() + dias);
    d.setHours(h, 0, 0, 0);
    const pad = (n: number) => String(n).padStart(2, "0");
    setQuando(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`);
  };
  if (!aberto)
    return (
      <Botao tamanho="sm" onClick={() => setAberto(true)}>
        <Repeat className="size-4" /> {rotulo}
      </Botao>
    );
  return (
    <div className="flex w-full flex-col gap-2 rounded-2xl border border-linha p-3">
      <div className="flex flex-wrap gap-1.5">
        {[
          ["Amanhã 10h", 1],
          ["Em 2 dias", 2],
          ["Em 1 semana", 7],
        ].map(([r, d]) => (
          <button key={r} className="rounded-full border border-linha px-2.5 py-1 text-[12px] hover:border-linha-forte" onClick={() => atalho(Number(d))}>
            {r}
          </button>
        ))}
      </div>
      <Entrada type="datetime-local" value={quando} onChange={(e) => setQuando(e.target.value)} aria-label="Data e hora do follow-up" />
      <Entrada value={notas} onChange={(e) => setNotas(e.target.value)} placeholder="O que retomar com o cliente" aria-label="Notas do follow-up" />
      <Botao
        tamanho="sm"
        variante="primario"
        disabled={!quando}
        carregando={pendente}
        onClick={() =>
          iniciar(async () => {
            const r = await acaoAgendarFollowUp(conversaId, new Date(quando).toISOString(), notas);
            if (!r.ok) return void toast.error(r.erro);
            toast.success(r.mensagem);
            setQuando("");
            setNotas("");
            if (!inicial) setAberto(false);
            aoAgendar();
          })
        }
      >
        <CalendarPlus className="size-4" /> Agendar
      </Botao>
    </div>
  );
}
