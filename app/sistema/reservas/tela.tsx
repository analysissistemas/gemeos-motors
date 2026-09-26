"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { MessageSquare, NotebookPen } from "lucide-react";
import { STATUS_RESERVA, type StatusReserva } from "@/lib/dominio";
import { Botao } from "@/components/ui/botao";
import { AreaTexto, Selecao } from "@/components/ui/campos";
import { Dialogo, RodapeDialogo } from "@/components/ui/dialogo";
import { acaoConversaComNumero } from "@/app/sistema/conversas/acoes";
import { acaoAnotarReserva, acaoStatusReserva } from "./acoes";

/** Ações de uma reserva: mudar o status, anotar e abrir a conversa no Atendimento. */
export function AcoesReserva(p: { id: number; status: string; telefone: string; nome: string; observacoes: string | null; editar: boolean; conversar: boolean }) {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();
  const [anotando, setAnotando] = useState(false);
  const [texto, setTexto] = useState(p.observacoes ?? "");

  const rodar = (acao: () => Promise<{ ok: boolean; erro?: string; mensagem?: string }>, depois?: () => void) =>
    iniciar(async () => {
      const r = await acao();
      if (!r.ok) return void toast.error(r.erro);
      if (r.mensagem) toast.success(r.mensagem);
      depois?.();
      router.refresh();
    });

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {p.editar && (
        <Selecao
          aria-label={`Status da reserva de ${p.nome}`}
          value={p.status}
          disabled={pendente}
          className="h-11 w-40"
          onChange={(e) => rodar(() => acaoStatusReserva(p.id, e.target.value as StatusReserva))}
        >
          {(Object.keys(STATUS_RESERVA) as StatusReserva[]).map((k) => (
            <option key={k} value={k}>
              {STATUS_RESERVA[k]}
            </option>
          ))}
        </Selecao>
      )}
      {p.conversar && (
        <Botao
          tamanho="sm"
          variante="primario"
          carregando={pendente}
          onClick={() =>
            iniciar(async () => {
              const r = await acaoConversaComNumero(p.telefone, p.nome);
              if (!r.ok) return void toast.error(r.erro);
              router.push(`/sistema/conversas?c=${r.dados}`);
            })
          }
        >
          <MessageSquare className="size-4" /> Conversar
        </Botao>
      )}
      {p.editar && (
        <Botao tamanho="sm" variante="secundario" onClick={() => setAnotando(true)}>
          <NotebookPen className="size-4" /> Anotar
        </Botao>
      )}
      <Dialogo aberto={anotando} aoMudar={setAnotando} titulo={`Anotação da reserva de ${p.nome}`} largura="sm">
        <AreaTexto value={texto} onChange={(e) => setTexto(e.target.value)} rows={4} maxLength={1000} placeholder="Ex.: pediu para ligar depois das 18h" />
        <RodapeDialogo>
          <Botao variante="fantasma" onClick={() => setAnotando(false)}>
            Cancelar
          </Botao>
          <Botao variante="primario" carregando={pendente} onClick={() => rodar(() => acaoAnotarReserva(p.id, texto), () => setAnotando(false))}>
            Salvar
          </Botao>
        </RodapeDialogo>
      </Dialogo>
    </div>
  );
}
