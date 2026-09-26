"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { MessageSquare, Phone } from "lucide-react";
import { Botao, classesBotao } from "@/components/ui/botao";
import { Dialogo, RodapeDialogo } from "@/components/ui/dialogo";
import { AreaTexto, Campo, Entrada, Selecao } from "@/components/ui/campos";
import { pedirAtualizacaoContadores } from "@/components/shell/contadores";
import { acaoConcluirLigacao, acaoIniciarLigacao, acaoReagendarLigacao } from "./acoes";

const RESULTADOS = [
  ["atendida", "Atendida"],
  ["nao_atendida", "Não atendida"],
  ["ocupado", "Ocupado"],
  ["numero_errado", "Número errado"],
] as const;

export function AcoesLigacao({ id, telefone, conversaId }: { id: number; telefone: string; conversaId: number | null }) {
  const [pendente, iniciar] = useTransition();
  const [concluir, setConcluir] = useState(false);
  const [reagendar, setReagendar] = useState(false);
  const router = useRouter();
  const depois = () => {
    pedirAtualizacaoContadores();
    router.refresh();
  };
  return (
    <span className="flex shrink-0 flex-wrap gap-2">
      {conversaId && (
        <Link href={`/sistema/conversas?c=${conversaId}`} className={classesBotao("secundario", "sm")}>
          <MessageSquare className="size-4" /> Conversa
        </Link>
      )}
      <a
        href={`tel:+${telefone}`}
        className={classesBotao("primario", "sm")}
        onClick={() =>
          iniciar(async () => {
            const r = await acaoIniciarLigacao(id);
            if (!r.ok) toast.error(r.erro);
            else depois();
          })
        }
      >
        <Phone className="size-4" /> Ligar
      </a>
      <Botao tamanho="sm" variante="secundario" onClick={() => setConcluir(true)} disabled={pendente}>
        Concluir
      </Botao>
      <Botao tamanho="sm" variante="fantasma" onClick={() => setReagendar(true)} disabled={pendente}>
        Reagendar
      </Botao>
      <Dialogo aberto={concluir} aoMudar={setConcluir} titulo="Registrar ligação" descricao="Fica salvo no histórico do cliente.">
        <FormConclusao
          id={id}
          aoFim={() => {
            setConcluir(false);
            depois();
          }}
        />
      </Dialogo>
      <Dialogo aberto={reagendar} aoMudar={setReagendar} titulo="Reagendar ligação">
        <FormReagendar
          id={id}
          aoFim={() => {
            setReagendar(false);
            depois();
          }}
        />
      </Dialogo>
    </span>
  );
}

function FormConclusao({ id, aoFim }: { id: number; aoFim: () => void }) {
  const [resultado, setResultado] = useState<string>("atendida");
  const [min, setMin] = useState("");
  const [notas, setNotas] = useState("");
  const [prox, setProx] = useState("");
  const [carregando, iniciar] = useTransition();
  return (
    <div className="flex flex-col gap-4">
      <Campo rotulo="Resultado">
        <Selecao value={resultado} onChange={(e) => setResultado(e.target.value)}>
          {RESULTADOS.map(([v, r]) => (
            <option key={v} value={v}>
              {r}
            </option>
          ))}
        </Selecao>
      </Campo>
      <Campo rotulo="Duração (minutos)">
        <Entrada inputMode="numeric" value={min} onChange={(e) => setMin(e.target.value.replace(/\D/g, ""))} placeholder="Opcional" />
      </Campo>
      <Campo rotulo="Anotações">
        <AreaTexto value={notas} onChange={(e) => setNotas(e.target.value)} rows={3} />
      </Campo>
      <Campo rotulo="Próxima ação">
        <Entrada value={prox} onChange={(e) => setProx(e.target.value)} placeholder="Ex.: enviar proposta" />
      </Campo>
      <RodapeDialogo>
        <Botao
          variante="primario"
          carregando={carregando}
          onClick={() =>
            iniciar(async () => {
              const r = await acaoConcluirLigacao(id, { resultado, duracaoSegundos: min ? Number(min) * 60 : null, notas: notas || null, proximaAcao: prox || null });
              if (!r.ok) return void toast.error(r.erro);
              toast.success(r.mensagem);
              aoFim();
            })
          }
        >
          Salvar
        </Botao>
      </RodapeDialogo>
    </div>
  );
}

function FormReagendar({ id, aoFim }: { id: number; aoFim: () => void }) {
  const [quando, setQuando] = useState("");
  const [carregando, iniciar] = useTransition();
  return (
    <div className="flex flex-col gap-4">
      <Campo rotulo="Nova data e hora">
        <Entrada type="datetime-local" value={quando} onChange={(e) => setQuando(e.target.value)} />
      </Campo>
      <RodapeDialogo>
        <Botao
          variante="primario"
          carregando={carregando}
          disabled={!quando}
          onClick={() =>
            iniciar(async () => {
              /* o campo é hora de Recife (UTC-3, sem horário de verão) */
              const r = await acaoReagendarLigacao(id, new Date(`${quando}:00-03:00`).toISOString());
              if (!r.ok) return void toast.error(r.erro);
              toast.success(r.mensagem);
              aoFim();
            })
          }
        >
          Reagendar
        </Botao>
      </RodapeDialogo>
    </div>
  );
}
