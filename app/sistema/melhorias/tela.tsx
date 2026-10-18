"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { Check, ChevronDown, FlaskConical, Lightbulb, RotateCcw, ScanSearch, X } from "lucide-react";
import type { ChamadoTela, RelatorioTela } from "@/lib/ia/chamados";
import { AREAS_SUGESTAO } from "@/lib/ia/analista-regras";
import { aplicaSozinho, STATUS_CHAMADO, TIPOS_CHAMADO, type PropostaChamado, type StatusChamado, type TipoChamado } from "@/lib/ia/chamados-regras";
import { dataHora } from "@/lib/formato";
import { Abas } from "@/components/ui/abas";
import { CabecalhoPagina, EstadoVazio, Painel, Selo, TituloSecao } from "@/components/ui/basicos";
import { Botao } from "@/components/ui/botao";
import { AreaTexto, Campo, Entrada, Selecao } from "@/components/ui/campos";
import { Dialogo, RodapeDialogo } from "@/components/ui/dialogo";
import { acaoDesbloquearConfig } from "@/app/sistema/configuracoes/desbloqueio";
import { acaoAprovarChamado, acaoConcluirPlano, acaoDesfazerChamado, acaoGerarChamados, acaoRecusarChamado, acaoTreinarChamado } from "./acoes";
import type { TreinoSonix } from "@/lib/ia/sonix-treino";

type Aba = "relatorio" | "chamados" | "plano" | "historico";
const fDia = new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC", weekday: "short", day: "2-digit", month: "2-digit" });
const nomeDia = (d: string) => fDia.format(new Date(`${d}T12:00:00Z`)).replace(".", "");
const minutos = (m: number | null) => (m == null ? "—" : m >= 60 ? `${Math.floor(m / 60)} h ${Math.round(m % 60)} min` : `${Math.round(m)} min`);

export function TelaMelhorias({
  dias,
  relatorioInicial: rel,
  chamadosIniciais: chamados,
  usuario,
  liberadaIa,
}: {
  dias: string[];
  relatorioInicial: RelatorioTela;
  chamadosIniciais: ChamadoTela[];
  usuario: string;
  liberadaIa: boolean;
}) {
  const router = useRouter();
  const novos = chamados.filter((c) => c.status === "novo");
  const plano = chamados.filter((c) => c.status === "plano");
  const historico = chamados.filter((c) => !["novo", "plano"].includes(c.status));
  const [aba, setAba] = useState<Aba>(novos.length ? "chamados" : "relatorio");
  const [gerando, iniciarGerar] = useTransition();
  /* já tem chamado do dia esperando: o botão refaz (troca os não decididos) em vez de só somar */
  const refazer = novos.length > 0;
  /* ação que pede a senha da IA: guarda para refazer depois de destrancar */
  const [senhaPara, setSenhaPara] = useState<(() => Promise<void>) | null>(null);

  const gerar = () =>
    iniciarGerar(async () => {
      const r = await acaoGerarChamados(rel.dia, refazer);
      if (!r.ok) return void toast.error(r.erro);
      toast.success(r.dados.r.novos || r.dados.r.reforcados ? `${r.dados.r.novos} chamado(s) novo(s), ${r.dados.r.reforcados} reforçado(s)` : "Nada novo para virar chamado neste dia");
      router.refresh();
      setAba("chamados");
    });

  /** Roda a ação; se a tela da IA estiver trancada, pede a senha e tenta de novo. */
  const comSenhaSePrecisar = async (fn: () => Promise<{ ok: boolean; erro?: string; mensagem?: string }>) => {
    const r = await fn();
    if (!r.ok && r.erro?.includes("trancada")) {
      setSenhaPara(() => async () => {
        const de = await fn();
        if (!de.ok) toast.error(de.erro);
        else toast.success(de.mensagem);
        router.refresh();
      });
      return false;
    }
    if (!r.ok) toast.error(r.erro);
    else toast.success(r.mensagem);
    router.refresh();
    return r.ok;
  };

  return (
    <>
      <CabecalhoPagina
        titulo="Melhorias"
        subtitulo="O que o Analista achou nas conversas, os chamados para você aprovar e o plano de ação."
        acoes={
          <Botao tamanho="sm" carregando={gerando} onClick={gerar}>
            <ScanSearch className="size-4" /> {refazer ? "Refazer chamados não decididos (7 dias)" : `Gerar chamados de ${nomeDia(rel.dia)}`}
          </Botao>
        }
      />
      <Abas<Aba>
        className="mb-5"
        atual={aba}
        aoMudar={setAba}
        abas={[
          { id: "relatorio", rotulo: "Relatório do dia" },
          { id: "chamados", rotulo: "Chamados", contador: novos.length },
          { id: "plano", rotulo: "Plano de ação", contador: plano.length },
          { id: "historico", rotulo: "Histórico" },
        ]}
      />
      {aba === "relatorio" && <Relatorio rel={rel} dias={dias} novos={novos.length} aoVerChamados={() => setAba("chamados")} />}
      {aba === "chamados" &&
        (novos.length ? (
          <div className="flex flex-col gap-4">
            {novos.map((c) => (
              <CartaoChamado key={c.id} c={c} liberadaIa={liberadaIa} comSenha={comSenhaSePrecisar} />
            ))}
          </div>
        ) : (
          <EstadoVazio icone={<Lightbulb className="size-5" />} titulo="Nenhum chamado esperando" texto="Todo dia, depois das 18:45, o Analista transforma o que achou nas conversas em chamados. Você também pode gerar agora pelo botão lá em cima." />
        ))}
      {aba === "plano" &&
        (plano.length ? (
          <div className="flex flex-col gap-3">
            {plano.map((c) => (
              <ItemPlano key={c.id} c={c} />
            ))}
          </div>
        ) : (
          <EstadoVazio icone={<Check className="size-5" />} titulo="Plano de ação vazio" texto="Chamado aprovado que a IA não resolve sozinha (estoque, preço, equipe, sistema, marketing) aparece aqui até ser feito." />
        ))}
      {aba === "historico" && <Historico itens={historico} comSenha={comSenhaSePrecisar} />}
      <SenhaIa
        usuario={usuario}
        aberto={!!senhaPara}
        aoFechar={() => setSenhaPara(null)}
        aoLiberar={async () => {
          const f = senhaPara;
          setSenhaPara(null);
          await f?.();
        }}
      />
    </>
  );
}

/* ---------------- relatório ---------------- */

function Relatorio({ rel, dias, novos, aoVerChamados }: { rel: RelatorioTela; dias: string[]; novos: number; aoVerChamados: () => void }) {
  const router = useRouter();
  const notaTom = rel.notaMedia == null ? "neutro" : rel.notaMedia >= 8 ? "bom" : rel.notaMedia >= 6 ? "atencao" : "serio";
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-3">
        <Selecao className="w-auto" value={rel.dia} onChange={(e) => router.push(`/sistema/melhorias?dia=${e.target.value}`)} aria-label="Dia do relatório">
          {dias.map((d) => (
            <option key={d} value={d}>
              {nomeDia(d)}
            </option>
          ))}
        </Selecao>
        {novos > 0 && (
          <button type="button" onClick={aoVerChamados} className="rounded-full bg-marca px-3 py-1.5 text-[13px] font-semibold text-black">
            {novos} chamado{novos > 1 ? "s" : ""} esperando sua aprovação →
          </button>
        )}
      </div>

      {rel.conversas === 0 ? (
        <EstadoVazio icone={<ScanSearch className="size-5" />} titulo="Ainda sem análise neste dia" texto="O Analista lê as conversas do dia a partir das 18:30. Para ver uma conversa agora, use Analisar agora no painel dela." />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Numero rotulo="Conversas analisadas" valor={rel.conversas} detalhe={rel.naoClientes ? `${rel.naoClientes} não eram clientes` : `${rel.deVenda} de compra`} />
            <Numero rotulo="Vendas fechadas" valor={rel.compraram} detalhe={`${rel.perderam} perdidas · ${rel.emAberto} em aberto`} />
            <Numero rotulo="Leads quentes" valor={rel.quentes} />
            <Numero
              rotulo="Nota do atendimento"
              valor={rel.notaMedia ?? "—"}
              detalhe={rel.notaSemanaAnterior != null ? `semana anterior: ${rel.notaSemanaAnterior}` : undefined}
              selo={<Selo tom={notaTom}>{rel.notaMedia == null ? "sem nota" : rel.notaMedia >= 8 ? "boa" : rel.notaMedia >= 6 ? "regular" : "baixa"}</Selo>}
            />
            <Numero rotulo="1ª resposta (média)" valor={minutos(rel.primeiraRespostaMediaMin)} />
            <Numero rotulo="Maior espera do dia" valor={minutos(rel.maiorEsperaMin)} />
            <Numero rotulo="Sem resposta no fim do dia" valor={rel.semRespostaNoFim.length} />
            <Numero rotulo="Perguntas sem resposta" valor={rel.perguntasSemResposta.length} />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Contagens titulo="Objeções dos clientes" itens={rel.objecoes} vazio="Nenhuma objeção registrada." />
            <Contagens titulo="Motos mais procuradas" itens={rel.modelos} vazio="Nenhum modelo citado." />
            <Citacoes titulo="Onde as vendas travaram" itens={rel.travas} />
            <Citacoes titulo="Perguntas que ficaram sem resposta" itens={rel.perguntasSemResposta} />
            <Citacoes titulo="Erros da IA" itens={rel.errosIa} />
            <Citacoes titulo="Erros da equipe" itens={rel.errosEquipe} />
            <Citacoes titulo="Concorrência citada" itens={rel.concorrencia} />
            <Citacoes titulo="Clientes sem resposta no fim do dia" itens={rel.semRespostaNoFim} />
            <Citacoes titulo="Atendimentos com nota baixa" itens={rel.notasBaixas} />
          </div>
          <p className="text-[12px] text-ink-3">Tudo aqui vem das fichas do Analista, que só usa o que está escrito nas conversas. Clique no nome para abrir a conversa.</p>
        </>
      )}
    </div>
  );
}

function Numero({ rotulo, valor, detalhe, selo }: { rotulo: string; valor: React.ReactNode; detalhe?: string; selo?: React.ReactNode }) {
  return (
    <Painel className="p-4">
      <p className="text-[12px] text-ink-3">{rotulo}</p>
      <div className="mt-1 flex items-center gap-2">
        <p className="num text-[24px] font-bold leading-none">{valor}</p>
        {selo}
      </div>
      {detalhe && <p className="mt-1 text-[11.5px] text-ink-3">{detalhe}</p>}
    </Painel>
  );
}

function Contagens({ titulo, itens, vazio }: { titulo: string; itens: { chave: string; rotulo: string; total: number }[]; vazio: string }) {
  const max = Math.max(1, ...itens.map((i) => i.total));
  return (
    <Painel className="p-4">
      <TituloSecao>{titulo}</TituloSecao>
      {itens.length ? (
        <ul className="flex flex-col gap-2">
          {itens.slice(0, 8).map((i) => (
            <li key={i.chave} className="grid grid-cols-[minmax(0,10rem)_1fr_auto] items-center gap-3 text-[13px]">
              <span className="truncate">{i.rotulo}</span>
              <span className="h-2 rounded-full bg-trilho">
                <span className="block h-2 rounded-full bg-marca" style={{ width: `${(i.total / max) * 100}%` }} />
              </span>
              <span className="num w-6 text-right font-semibold">{i.total}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[13px] text-ink-3">{vazio}</p>
      )}
    </Painel>
  );
}

function Citacoes({ titulo, itens }: { titulo: string; itens: { conversaId: number; contato: string | null; texto: string }[] }) {
  const [todas, setTodas] = useState(false);
  if (!itens.length) return null;
  const mostrar = todas ? itens : itens.slice(0, 5);
  return (
    <Painel className="p-4">
      <TituloSecao>
        {titulo} <span className="num ml-1 text-ink-3">{itens.length}</span>
      </TituloSecao>
      <ul className="flex flex-col gap-2 text-[13px] leading-relaxed">
        {mostrar.map((i, k) => (
          <li key={k}>
            <Link href={`/sistema/conversas?c=${i.conversaId}`} className="font-medium underline-offset-2 hover:underline">
              {i.contato?.split(" ")[0] ?? "Cliente"}
            </Link>
            <span className="text-ink-2">: {i.texto}</span>
          </li>
        ))}
      </ul>
      {itens.length > 5 && (
        <button type="button" onClick={() => setTodas(!todas)} className="mt-2 text-[12.5px] text-ink-3 hover:text-ink">
          {todas ? "Mostrar menos" : `Ver todas (${itens.length})`}
        </button>
      )}
    </Painel>
  );
}

/* ---------------- chamados ---------------- */

type Comsenha = (fn: () => Promise<{ ok: boolean; erro?: string; mensagem?: string }>) => Promise<boolean>;

function CartaoChamado({ c, liberadaIa, comSenha }: { c: ChamadoTela; liberadaIa: boolean; comSenha: Comsenha }) {
  const tipo = c.tipo as TipoChamado;
  const [p, setP] = useState<PropostaChamado>(c.proposta);
  const [obs, setObs] = useState("");
  const [pendente, iniciar] = useTransition();
  const muda = (campo: keyof PropostaChamado) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setP({ ...p, [campo]: e.target.value });

  return (
    <Painel className="p-5">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <Selo tom={aplicaSozinho(tipo) ? "marca" : "info"} ponto={false}>
          {TIPOS_CHAMADO[tipo]}
        </Selo>
        {tipo === "plano_acao" && (
          <Selo tom="neutro" ponto={false}>
            {AREAS_SUGESTAO[c.area as keyof typeof AREAS_SUGESTAO] ?? c.area}
          </Selo>
        )}
        <Selo tom={c.clientes >= 3 ? "serio" : "neutro"}>
          {c.clientes} cliente{c.clientes > 1 ? "s" : ""}
        </Selo>
        <span className="ml-auto text-[11.5px] text-ink-3">#{c.id} · {dataHora(c.criadoEm)}</span>
      </div>
      <h3 className="text-[16px] font-semibold">{c.titulo}</h3>
      <p className="mt-1 text-[13.5px] leading-relaxed text-ink-2">{c.problema}</p>
      <Provas c={c} />

      <div className="mt-4 flex flex-col gap-3 rounded-2xl border border-linha bg-trilho/40 p-4">
        <p className="text-[12px] font-medium uppercase tracking-wide text-ink-3">
          {tipo === "base_conhecimento" ? "Resposta que a IA vai passar a usar (pode editar)" : tipo === "regra_ia" ? "Regra que entra no atendimento da IA (pode editar)" : "O que fazer (pode editar)"}
        </p>
        {tipo === "base_conhecimento" && (
          <>
            <div className="grid gap-3 sm:grid-cols-[12rem_1fr]">
              <Campo rotulo="Categoria">
                <Entrada value={p.categoria ?? ""} onChange={muda("categoria")} />
              </Campo>
              <Campo rotulo="Pergunta do cliente">
                <Entrada value={p.titulo ?? ""} onChange={muda("titulo")} />
              </Campo>
            </div>
            <Campo rotulo="Resposta" dica="Onde estiver [PREENCHER…], escreva a informação certa antes de aprovar.">
              <AreaTexto rows={4} value={p.conteudo ?? ""} onChange={muda("conteudo")} />
            </Campo>
          </>
        )}
        {tipo === "regra_ia" && (
          <Campo rotulo="Regra">
            <AreaTexto rows={2} value={p.regra ?? ""} onChange={muda("regra")} />
          </Campo>
        )}
        {tipo === "plano_acao" && (
          <Campo rotulo="Ação">
            <AreaTexto rows={3} value={p.acao ?? ""} onChange={muda("acao")} />
          </Campo>
        )}
        <Campo rotulo="Observação (opcional)">
          <Entrada value={obs} onChange={(e) => setObs(e.target.value)} placeholder="Ex.: responsável, prazo, por que recusou" />
        </Campo>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Botao variante="primario" carregando={pendente} onClick={() => iniciar(async () => void (await comSenha(() => acaoAprovarChamado(c.id, p, obs))))}>
          <Check className="size-4" /> {aplicaSozinho(tipo) ? "Aprovar e aplicar na IA" : "Aprovar e pôr no plano"}
        </Botao>
        <Botao variante="fantasma" disabled={pendente} onClick={() => iniciar(async () => void (await comSenha(() => acaoRecusarChamado(c.id, obs))))}>
          <X className="size-4" /> Recusar
        </Botao>
        {aplicaSozinho(tipo) && (
          <p className="text-[12px] text-ink-3">
            {tipo === "base_conhecimento" ? "Entra na base de conhecimento e vale na hora." : "Entra como versão nova das regras da IA."} Dá para desfazer no Histórico.
            {!liberadaIa && " Vai pedir a senha da IA."}
          </p>
        )}
      </div>
    </Painel>
  );
}

function Provas({ c }: { c: ChamadoTela }) {
  const [aberto, setAberto] = useState(false);
  if (!c.evidencias.length) return null;
  return (
    <div className="mt-2">
      <button type="button" onClick={() => setAberto(!aberto)} className="flex items-center gap-1 text-[12.5px] text-ink-3 hover:text-ink">
        <ChevronDown className={`size-4 transition ${aberto ? "rotate-180" : ""}`} /> Ver as {c.evidencias.length} prova{c.evidencias.length > 1 ? "s" : ""} nas conversas
      </button>
      {aberto && (
        <ul className="mt-2 flex flex-col gap-1.5 text-[13px]">
          {c.evidencias.map((e, i) => (
            <li key={i}>
              <Link href={`/sistema/conversas?c=${e.conversaId}`} className="font-medium underline-offset-2 hover:underline">
                {e.contato ?? "Cliente"}
              </Link>
              <span className="text-ink-3"> ({nomeDia(e.dia)})</span>
              <span className="text-ink-2">: {e.trecho}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ItemPlano({ c }: { c: ChamadoTela }) {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();
  return (
    <Painel className="flex flex-wrap items-start gap-4 p-4">
      <div className="min-w-0 flex-1">
        <div className="mb-1 flex flex-wrap items-center gap-2">
          <Selo tom="info" ponto={false}>
            {AREAS_SUGESTAO[c.area as keyof typeof AREAS_SUGESTAO] ?? c.area}
          </Selo>
          <span className="text-[11.5px] text-ink-3">
            #{c.id} · aprovado {c.decididoEm ? dataHora(c.decididoEm) : ""} · {c.clientes} cliente{c.clientes > 1 ? "s" : ""}
          </span>
        </div>
        <p className="font-semibold">{c.titulo}</p>
        <p className="mt-1 text-[13.5px] leading-relaxed">{c.proposta.acao}</p>
        {c.observacao && <p className="mt-1 text-[12.5px] text-ink-3">Obs.: {c.observacao}</p>}
        <Provas c={c} />
      </div>
      <Botao
        tamanho="sm"
        carregando={pendente}
        onClick={() =>
          iniciar(async () => {
            const r = await acaoConcluirPlano(c.id);
            if (!r.ok) return void toast.error(r.erro);
            toast.success(r.mensagem);
            router.refresh();
          })
        }
      >
        <Check className="size-4" /> Marcar como feito
      </Botao>
    </Painel>
  );
}

function Historico({ itens, comSenha }: { itens: ChamadoTela[]; comSenha: Comsenha }) {
  const [pendente, iniciar] = useTransition();
  const router = useRouter();
  /* a Sonix está testando algum: a tela se atualiza sozinha até o relatório chegar */
  const testando = itens.some((c) => ((c.resultado ?? {}) as { treino?: TreinoSonix }).treino?.status === "rodando");
  useEffect(() => {
    if (!testando) return;
    const t = setInterval(() => router.refresh(), 10000);
    return () => clearInterval(t);
  }, [testando, router]);
  if (!itens.length) return <EstadoVazio titulo="Nada decidido ainda" texto="Chamados aprovados, recusados e feitos ficam registrados aqui." />;
  const tom: Record<StatusChamado, "bom" | "neutro" | "atencao" | "serio" | "info" | "marca"> = { aplicado: "bom", feito: "bom", recusado: "neutro", desfeito: "atencao", novo: "info", plano: "info" };
  return (
    <div className="flex flex-col gap-2">
      {itens.map((c) => {
        const r = (c.resultado ?? {}) as { versao?: number };
        return (
          <Painel key={c.id} className="flex flex-wrap items-center gap-3 p-4">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <Selo tom={tom[c.status as StatusChamado] ?? "neutro"}>{STATUS_CHAMADO[c.status as StatusChamado] ?? c.status}</Selo>
                <span className="text-[11.5px] text-ink-3">
                  #{c.id} · {TIPOS_CHAMADO[c.tipo as TipoChamado]} · {c.decididoEm ? dataHora(c.decididoEm) : ""}
                  {r.versao ? ` · regras da IA versão ${r.versao}` : ""}
                </span>
              </div>
              <p className="mt-1 font-medium">{c.titulo}</p>
              {c.observacao && <p className="text-[12.5px] text-ink-3">Obs.: {c.observacao}</p>}
              <RelatorioSonix id={c.id} treino={((c.resultado ?? {}) as { treino?: TreinoSonix }).treino ?? null} aplicado={c.status === "aplicado"} />
            </div>
            {c.status === "aplicado" && (
              <Botao tamanho="sm" variante="fantasma" disabled={pendente} onClick={() => iniciar(async () => void (await comSenha(() => acaoDesfazerChamado(c.id))))}>
                <RotateCcw className="size-4" /> Desfazer
              </Botao>
            )}
          </Painel>
        );
      })}
    </div>
  );
}

/* ---------------- relatório da Sonix (treino no Simulador) ---------------- */
function RelatorioSonix({ id, treino, aplicado }: { id: number; treino: TreinoSonix | null; aplicado: boolean }) {
  const [pendente, iniciar] = useTransition();
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const testar = () =>
    iniciar(async () => {
      const r = await acaoTreinarChamado(id);
      if (!r.ok) return void toast.error(r.erro);
      toast.success("A Sonix começou a testar no Simulador");
      router.refresh();
    });
  if (!treino) {
    return aplicado ? (
      <Botao tamanho="sm" variante="fantasma" className="mt-2" carregando={pendente} onClick={testar}>
        <FlaskConical className="size-4" /> Sonix: testar no Simulador
      </Botao>
    ) : null;
  }
  if (treino.status === "rodando") return <p className="mt-2 text-[12.5px] text-ink-2">⏳ A Sonix está rodando de novo, no Simulador, a conversa em que o erro aconteceu. Leva alguns minutos; esta tela se atualiza sozinha.</p>;
  if (treino.status === "erro")
    return (
      <div className="mt-2 flex flex-wrap items-center gap-2 text-[12.5px] text-critico">
        Sonix não conseguiu testar: {treino.motivo}
        <Botao tamanho="sm" variante="fantasma" carregando={pendente} onClick={testar}>
          Tentar de novo
        </Botao>
      </div>
    );
  const titulo = treino.resolvido === true ? "✅ Resolvido, conferido no Simulador" : treino.resolvido === false ? "⚠️ Ainda não resolveu no Simulador" : "Testado no Simulador: confira a resposta nova";
  return (
    <div className="mt-2 rounded-xl border border-linha bg-trilho/40 p-3 text-[12.5px]">
      <div className="flex flex-wrap items-center gap-2">
        <p className="font-semibold">Relatório da Sonix · {titulo}</p>
        <span className="text-ink-3">{dataHora(treino.em)}</span>
        <button className="ml-auto text-ink-3 underline underline-offset-2" onClick={() => setAberto((v) => !v)}>
          {aberto ? "esconder" : "ver antes e depois"}
        </button>
      </div>
      {treino.cenarios.map((x, i) => (
        <div key={i} className="mt-1.5">
          <p className="text-ink-2">{x.porque}</p>
          {aberto && (
            <div className="mt-1.5 grid gap-2 sm:grid-cols-2">
              <p className="sm:col-span-2 text-ink-3">Cliente: “{x.cliente}”</p>
              <div className="rounded-lg bg-critico/10 p-2">
                <p className="mb-1 font-semibold text-critico">Antes</p>
                <p className="whitespace-pre-wrap">{x.antes}</p>
              </div>
              <div className="rounded-lg bg-bom/10 p-2">
                <p className="mb-1 font-semibold text-bom">Depois da correção</p>
                <p className="whitespace-pre-wrap">{x.depois || "(a IA não respondeu)"}</p>
              </div>
              {x.conversaTesteId && (
                <Link href={`/sistema/conversas?c=${x.conversaTesteId}`} className="text-marca underline underline-offset-2 sm:col-span-2">
                  Abrir a conversa de teste no Atendimento
                </Link>
              )}
            </div>
          )}
        </div>
      ))}
      {treino.ajusteChamadoId && <p className="mt-1.5 font-medium">A Sonix propôs um ajuste para você aprovar: chamado #{treino.ajusteChamadoId}, na aba Chamados.</p>}
      <Botao tamanho="sm" variante="fantasma" className="mt-1.5" carregando={pendente} onClick={testar}>
        <FlaskConical className="size-4" /> Testar de novo
      </Botao>
    </div>
  );
}

/* ---------------- senha da IA ---------------- */

function SenhaIa({ usuario, aberto, aoFechar, aoLiberar }: { usuario: string; aberto: boolean; aoFechar: () => void; aoLiberar: () => Promise<void> }) {
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();
  const enviar = (e: React.FormEvent) => {
    e.preventDefault();
    iniciar(async () => {
      const r = await acaoDesbloquearConfig(senha, "ia");
      setSenha("");
      if (!r.ok) return setErro(r.erro);
      setErro(null);
      await aoLiberar();
    });
  };
  return (
    <Dialogo aberto={aberto} aoMudar={(v) => !v && aoFechar()} titulo="Senha da IA" descricao="Aprovar ou desfazer mudanças na IA pede a mesma senha da tela Inteligência artificial." largura="sm">
      <form onSubmit={enviar} className="flex flex-col gap-4 px-5 py-5 sm:px-6">
        <input type="text" name="username" autoComplete="username" value={usuario} readOnly hidden />
        <Campo rotulo="Senha" erro={erro ?? undefined}>
          <Entrada type="password" name="password" autoComplete="current-password" autoFocus value={senha} invalido={!!erro} onChange={(e) => setSenha(e.target.value)} />
        </Campo>
        <RodapeDialogo>
          <Botao type="button" variante="fantasma" onClick={aoFechar}>
            Cancelar
          </Botao>
          <Botao type="submit" variante="primario" carregando={pendente} disabled={!senha}>
            Continuar
          </Botao>
        </RodapeDialogo>
      </form>
    </Dialogo>
  );
}
