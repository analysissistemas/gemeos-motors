"use client";
import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { CalendarPlus, Check, MessageSquare } from "lucide-react";
import { Botao, classesBotao } from "@/components/ui/botao";
import { Dialogo, RodapeDialogo } from "@/components/ui/dialogo";
import { Alternar, AreaTexto, Campo, Entrada, Selecao } from "@/components/ui/campos";
import { SeletorCliente } from "@/components/clientes/seletor-cliente";
import { chaveDia, formatarPlaca, jaPassou } from "@/lib/formato";
import { DURACAO_TEST_DRIVE_MIN, ENDERECO_LOJA, LOJA_TEST_DRIVE, doCampoLocal, paraCampoLocal, textoConfirmacao, type StatusTestDrive } from "@/lib/test-drive";
import type { OpcoesTestDrive } from "@/lib/servicos/test-drive";
import { acaoAgendarTestDrive, acaoOpcoesTestDrive, acaoReagendarTestDrive, acaoStatusTestDrive } from "@/app/sistema/test-drives/acoes";

/* ============================================================
   Janelas do test drive: agendar, remarcar e mudar status.
   Usadas na agenda (/sistema/test-drives) e no painel da conversa.
   ============================================================ */

const semAcento = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

/* Veículo sugerido: o do negócio, senão o modelo do catálogo citado no texto de interesse. */
function sugestao(op: OpcoesTestDrive, inicial: { veiculoId?: number | null; veiculoTexto?: string | null }) {
  if (inicial.veiculoId && op.veiculos.some((v) => v.id === inicial.veiculoId)) return `v:${inicial.veiculoId}`;
  const texto = semAcento(inicial.veiculoTexto ?? "");
  if (!texto) return "";
  const achado = op.modelos
    .filter((m) => texto.includes(semAcento(m.nome)))
    .sort((a, b) => b.nome.length - a.nome.length)[0];
  return achado ? `m:${achado.id}` : "outro";
}

/** Dia (hoje + n) às h, no fuso da loja, no formato do campo datetime-local. */
function atalho(dias: number, h: number) {
  return `${chaveDia(new Date(Date.now() + dias * 86_400_000))}T${String(h).padStart(2, "0")}:00`;
}
function diasAteSabado() {
  const hoje = new Date(`${chaveDia(new Date())}T12:00:00-03:00`).getUTCDay();
  return ((6 - hoje + 7) % 7) || 7;
}

export function AgendarTestDrive({
  aberto,
  aoMudar,
  conversaId,
  clienteId,
  negocioId,
  inicial = {},
  equipe,
  aoAgendar,
}: {
  aberto: boolean;
  aoMudar: (v: boolean) => void;
  conversaId?: number | null;
  clienteId?: number | null;
  negocioId?: number | null;
  /** veículo do negócio (id do estoque e/ou texto de interesse) */
  inicial?: { veiculoId?: number | null; veiculoTexto?: string | null };
  /** para o cadastro rápido de cliente, quando o agendamento não vem de uma conversa */
  equipe?: { id: number; nome: string }[];
  aoAgendar: () => void;
}) {
  return (
    <Dialogo aberto={aberto} aoMudar={aoMudar} titulo="Agendar test drive" descricao={`Na loja de ${LOJA_TEST_DRIVE}: ${ENDERECO_LOJA}. Cada horário ocupa o veículo por ${DURACAO_TEST_DRIVE_MIN} minutos.`}>
      <FormAgendar
        conversaId={conversaId ?? null}
        clienteId={clienteId ?? null}
        negocioId={negocioId ?? null}
        inicial={inicial}
        equipe={equipe}
        aoFim={() => {
          aoMudar(false);
          aoAgendar();
        }}
      />
    </Dialogo>
  );
}

function FormAgendar({
  conversaId,
  clienteId,
  negocioId,
  inicial,
  equipe,
  aoFim,
}: {
  conversaId: number | null;
  clienteId: number | null;
  negocioId: number | null;
  inicial: { veiculoId?: number | null; veiculoTexto?: string | null };
  equipe?: { id: number; nome: string }[];
  aoFim: () => void;
}) {
  const [opcoes, setOpcoes] = useState<OpcoesTestDrive | null>(null);
  const [erroOpcoes, setErroOpcoes] = useState<string | null>(null);
  const [escolha, setEscolha] = useState<string | null>(null); // null = ainda a sugestão
  const [outro, setOutro] = useState(inicial.veiculoTexto ?? "");
  const [quando, setQuando] = useState("");
  const [obs, setObs] = useState("");
  const [cliente, setCliente] = useState<{ id: number; nome: string } | null>(null);
  const [nome, setNome] = useState("");
  const [telefone, setTelefone] = useState("");
  const [confirmar, setConfirmar] = useState(!!conversaId);
  const [erros, setErros] = useState<Record<string, string>>({});
  const [carregando, iniciar] = useTransition();
  const precisaCliente = !conversaId && !clienteId;

  useEffect(() => {
    let vivo = true;
    acaoOpcoesTestDrive().then((r) => {
      if (!vivo) return;
      if (r.ok) setOpcoes(r.dados);
      else setErroOpcoes(r.erro);
    });
    return () => {
      vivo = false;
    };
  }, []);

  const veiculo = escolha ?? (opcoes ? sugestao(opcoes, inicial) : "");
  const quandoData = quando ? doCampoLocal(quando) : null;

  const salvar = () =>
    iniciar(async () => {
      const e: Record<string, string> = {};
      if (!quando) e.quando = "Escolha a data e a hora";
      if (!veiculo) e.veiculo = "Escolha o veículo";
      if (veiculo === "outro" && !outro.trim()) e.veiculo = "Escreva qual é o veículo";
      if (precisaCliente && !cliente && (!nome.trim() || telefone.replace(/\D/g, "").length < 10)) e.cliente = "Escolha o cliente ou informe nome e telefone com DDD";
      setErros(e);
      if (Object.keys(e).length) return;
      const [tipo, id] = veiculo.split(":");
      const r = await acaoAgendarTestDrive(
        {
          conversaId,
          clienteId: clienteId ?? cliente?.id ?? null,
          negocioId,
          nomeContato: precisaCliente && !cliente ? nome : null,
          telefone: precisaCliente && !cliente ? telefone : null,
          modeloId: tipo === "m" ? Number(id) : null,
          veiculoId: tipo === "v" ? Number(id) : null,
          veiculoDescricao: veiculo === "outro" ? outro : null,
          agendadoPara: doCampoLocal(quando).toISOString(),
          observacoes: obs || null,
        },
        !!conversaId && confirmar,
      );
      if (!r.ok) {
        if (r.campos) setErros(r.campos);
        return void toast.error(r.erro);
      }
      toast.success(r.mensagem);
      if (r.dados.aviso) toast.warning(r.dados.aviso);
      aoFim();
    });

  return (
    <div className="flex flex-col gap-4">
      {precisaCliente && (
        <Campo rotulo="Cliente" erro={erros.cliente} obrigatorio>
          <div className="flex flex-col gap-2">
            <SeletorCliente valor={cliente} aoMudar={setCliente} equipe={equipe ?? []} invalido={!!erros.cliente} />
            {!cliente && (
              <div className="grid gap-2 sm:grid-cols-2">
                <Entrada value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ou só o nome" aria-label="Nome de quem vai fazer o test drive" />
                <Entrada value={telefone} onChange={(e) => setTelefone(e.target.value)} inputMode="tel" placeholder="Telefone com DDD" aria-label="Telefone de quem vai fazer o test drive" />
              </div>
            )}
          </div>
        </Campo>
      )}
      <Campo rotulo="Data e hora" erro={erros.quando ?? erros.agendadoPara} obrigatorio>
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap gap-1.5">
            {(
              [
                ["Amanhã 9h", atalho(1, 9)],
                ["Amanhã 14h", atalho(1, 14)],
                ["Sábado 9h", atalho(diasAteSabado(), 9)],
              ] as const
            ).map(([r, v]) => (
              <button key={r} type="button" className="rounded-full border border-linha px-2.5 py-1 text-[12px] hover:border-linha-forte" onClick={() => setQuando(v)}>
                {r}
              </button>
            ))}
          </div>
          <Entrada type="datetime-local" value={quando} min={paraCampoLocal(new Date())} onChange={(e) => setQuando(e.target.value)} invalido={!!erros.quando} aria-label="Data e hora do test drive" />
        </div>
      </Campo>
      <Campo rotulo="Veículo" erro={erros.veiculo ?? erroOpcoes ?? undefined} obrigatorio>
        <div className="flex flex-col gap-2">
          <Selecao value={veiculo} onChange={(e) => setEscolha(e.target.value)} disabled={!opcoes} invalido={!!erros.veiculo} aria-label="Veículo do test drive">
            <option value="">{opcoes ? "Escolha o veículo" : "Carregando…"}</option>
            {opcoes && opcoes.modelos.length > 0 && (
              <optgroup label="Catálogo (moto de demonstração da loja)">
                {opcoes.modelos.map((m) => (
                  <option key={`m${m.id}`} value={`m:${m.id}`}>
                    {[m.marca, m.nome].filter(Boolean).join(" ")}
                  </option>
                ))}
              </optgroup>
            )}
            {opcoes && opcoes.veiculos.length > 0 && (
              <optgroup label="Veículos no estoque">
                {opcoes.veiculos.map((v) => (
                  <option key={`v${v.id}`} value={`v:${v.id}`}>
                    {v.descricao}
                    {v.placa ? ` · ${formatarPlaca(v.placa)}` : ""}
                  </option>
                ))}
              </optgroup>
            )}
            <option value="outro">Outro (escrever)</option>
          </Selecao>
          {veiculo === "outro" && <Entrada value={outro} onChange={(e) => setOutro(e.target.value)} placeholder="Qual veículo" aria-label="Qual veículo" />}
        </div>
      </Campo>
      <Campo rotulo="Observações">
        <AreaTexto value={obs} onChange={(e) => setObs(e.target.value)} rows={2} placeholder="Ex.: vem com a esposa, quer ver a garupa" />
      </Campo>
      {conversaId && (
        <div className="flex flex-col gap-1.5">
          <Alternar marcado={confirmar} aoMudar={setConfirmar} rotulo="Enviar confirmação no WhatsApp" descricao="Manda esta mensagem na conversa assim que agendar." />
          {confirmar && quandoData && !Number.isNaN(quandoData.getTime()) && <p className="rounded-xl bg-trilho px-3 py-2 text-[12.5px] text-ink-2">{textoConfirmacao({ quando: quandoData })}</p>}
        </div>
      )}
      <RodapeDialogo>
        <Botao variante="primario" carregando={carregando} onClick={salvar}>
          <CalendarPlus className="size-4" /> Agendar
        </Botao>
      </RodapeDialogo>
    </div>
  );
}

/* ---------------- ações sobre um test drive já marcado ---------------- */
type Destino = Exclude<StatusTestDrive, "agendado">;
const TITULOS: Record<Exclude<Destino, "confirmado">, { titulo: string; rotulo: string; placeholder: string; obrigatoria: boolean; botao: string }> = {
  realizado: { titulo: "Test drive realizado", rotulo: "Como foi?", placeholder: "O que o cliente achou, se quer proposta, próximo passo", obrigatoria: true, botao: "Marcar como realizado" },
  nao_compareceu: { titulo: "Cliente não compareceu", rotulo: "O que aconteceu?", placeholder: "Ex.: não atendeu a ligação, pediu para remarcar", obrigatoria: true, botao: "Registrar ausência" },
  cancelado: { titulo: "Cancelar test drive", rotulo: "Motivo (opcional)", placeholder: "Ex.: cliente desistiu, chuva", obrigatoria: false, botao: "Cancelar test drive" },
};

export function AcoesTestDrive({
  id,
  status,
  agendadoPara,
  conversaId,
  compacto,
  aoMudar,
}: {
  id: number;
  status: string;
  agendadoPara: Date | string;
  conversaId: number | null;
  /** no painel da conversa: sem o link para a conversa */
  compacto?: boolean;
  aoMudar: () => void;
}) {
  const [pendente, iniciar] = useTransition();
  const [dialogo, setDialogo] = useState<Exclude<Destino, "confirmado"> | "remarcar" | null>(null);
  const jaChegou = jaPassou(agendadoPara);
  const fim = () => {
    setDialogo(null);
    aoMudar();
  };
  const confirmarPresenca = () =>
    iniciar(async () => {
      const r = await acaoStatusTestDrive(id, { status: "confirmado" });
      if (!r.ok) return void toast.error(r.erro);
      toast.success("Test drive confirmado");
      aoMudar();
    });
  const tam = "sm" as const;
  return (
    <span className="flex shrink-0 flex-wrap gap-2">
      {!compacto && conversaId && (
        <Link href={`/sistema/conversas?c=${conversaId}`} className={classesBotao("secundario", tam)}>
          <MessageSquare className="size-4" /> Conversa
        </Link>
      )}
      {status === "agendado" && !jaChegou && (
        <Botao tamanho={tam} variante="secundario" carregando={pendente} onClick={confirmarPresenca}>
          <Check className="size-4" /> Confirmar
        </Botao>
      )}
      <Botao tamanho={tam} variante="primario" disabled={pendente} onClick={() => setDialogo("realizado")}>
        Realizado
      </Botao>
      {jaChegou && (
        <Botao tamanho={tam} variante="secundario" disabled={pendente} onClick={() => setDialogo("nao_compareceu")}>
          Não compareceu
        </Botao>
      )}
      <Botao tamanho={tam} variante="fantasma" disabled={pendente} onClick={() => setDialogo("remarcar")}>
        Remarcar
      </Botao>
      <Botao tamanho={tam} variante="fantasma" disabled={pendente} onClick={() => setDialogo("cancelado")}>
        Cancelar
      </Botao>
      <Dialogo aberto={dialogo === "remarcar"} aoMudar={(v) => !v && setDialogo(null)} titulo="Remarcar test drive" descricao="O horário novo volta para Agendado e precisa ser confirmado de novo.">
        <FormRemarcar id={id} atual={agendadoPara} conversaId={conversaId} aoFim={fim} />
      </Dialogo>
      {(["realizado", "nao_compareceu", "cancelado"] as const).map((s) => (
        <Dialogo key={s} aberto={dialogo === s} aoMudar={(v) => !v && setDialogo(null)} titulo={TITULOS[s].titulo}>
          <FormStatus id={id} status={s} aoFim={fim} />
        </Dialogo>
      ))}
    </span>
  );
}

function FormStatus({ id, status, aoFim }: { id: number; status: Exclude<Destino, "confirmado">; aoFim: () => void }) {
  const t = TITULOS[status];
  const [nota, setNota] = useState("");
  const [erro, setErro] = useState<string | undefined>();
  const [carregando, iniciar] = useTransition();
  return (
    <div className="flex flex-col gap-4">
      <Campo rotulo={t.rotulo} obrigatorio={t.obrigatoria} erro={erro}>
        <AreaTexto value={nota} onChange={(e) => setNota(e.target.value)} rows={3} placeholder={t.placeholder} invalido={!!erro} />
      </Campo>
      <RodapeDialogo>
        <Botao
          variante={status === "cancelado" ? "perigo" : "primario"}
          carregando={carregando}
          onClick={() =>
            iniciar(async () => {
              if (t.obrigatoria && nota.trim().length < 3) return void setErro("Escreva uma anotação curta");
              const r = await acaoStatusTestDrive(id, { status, nota: nota || null });
              if (!r.ok) return void toast.error(r.erro);
              toast.success(r.mensagem);
              aoFim();
            })
          }
        >
          {t.botao}
        </Botao>
      </RodapeDialogo>
    </div>
  );
}

function FormRemarcar({ id, atual, conversaId, aoFim }: { id: number; atual: Date | string; conversaId: number | null; aoFim: () => void }) {
  const [quando, setQuando] = useState(() => paraCampoLocal(new Date(atual)));
  const [confirmar, setConfirmar] = useState(!!conversaId);
  const [carregando, iniciar] = useTransition();
  const quandoData = quando ? doCampoLocal(quando) : null;
  return (
    <div className="flex flex-col gap-4">
      <Campo rotulo="Nova data e hora" obrigatorio>
        <Entrada type="datetime-local" value={quando} min={paraCampoLocal(new Date())} onChange={(e) => setQuando(e.target.value)} />
      </Campo>
      {conversaId && (
        <div className="flex flex-col gap-1.5">
          <Alternar marcado={confirmar} aoMudar={setConfirmar} rotulo="Avisar o cliente no WhatsApp" />
          {confirmar && quandoData && !Number.isNaN(quandoData.getTime()) && <p className="rounded-xl bg-trilho px-3 py-2 text-[12.5px] text-ink-2">{textoConfirmacao({ quando: quandoData, remarcado: true })}</p>}
        </div>
      )}
      <RodapeDialogo>
        <Botao
          variante="primario"
          carregando={carregando}
          disabled={!quando}
          onClick={() =>
            iniciar(async () => {
              const r = await acaoReagendarTestDrive(id, doCampoLocal(quando).toISOString(), !!conversaId && confirmar);
              if (!r.ok) return void toast.error(r.erro);
              toast.success(r.mensagem);
              if (r.dados.aviso) toast.warning(r.dados.aviso);
              aoFim();
            })
          }
        >
          Remarcar
        </Botao>
      </RodapeDialogo>
    </div>
  );
}
