"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { MessageSquare } from "lucide-react";
import { Botao, classesBotao } from "@/components/ui/botao";
import { pedirAtualizacaoContadores } from "@/components/shell/contadores";
import { acaoEncerrarFollowUp } from "@/app/sistema/conversas/acoes";

export function AcoesFollowUp({ id, conversaId }: { id: number; conversaId: number | null }) {
  const [pendente, iniciar] = useTransition();
  const router = useRouter();
  const encerrar = (como: "concluido" | "cancelado") =>
    iniciar(async () => {
      const r = await acaoEncerrarFollowUp(id, como);
      if (!r.ok) return void toast.error(r.erro);
      toast.success(r.mensagem);
      pedirAtualizacaoContadores();
      router.refresh();
    });
  return (
    <span className="flex shrink-0 flex-wrap gap-2">
      {conversaId && (
        <Link href={`/sistema/conversas?c=${conversaId}`} className={classesBotao("secundario", "sm")}>
          <MessageSquare className="size-4" /> Conversa
        </Link>
      )}
      <Botao tamanho="sm" variante="primario" carregando={pendente} onClick={() => encerrar("concluido")}>
        Concluir
      </Botao>
      <Botao tamanho="sm" variante="fantasma" disabled={pendente} onClick={() => encerrar("cancelado")}>
        Cancelar
      </Botao>
    </span>
  );
}

/** As tentativas da IA de um cliente, juntas: "Não enviar" cancela todas as que faltam. */
export function AcoesAquecimento({ ids, conversaId }: { ids: number[]; conversaId: number | null }) {
  const [pendente, iniciar] = useTransition();
  const router = useRouter();
  const cancelar = () =>
    iniciar(async () => {
      for (const id of ids) {
        const r = await acaoEncerrarFollowUp(id, "cancelado");
        if (!r.ok) return void toast.error(r.erro);
      }
      toast.success(ids.length > 1 ? "As tentativas da IA foram canceladas" : "A tentativa da IA foi cancelada");
      pedirAtualizacaoContadores();
      router.refresh();
    });
  return (
    <span className="flex shrink-0 flex-wrap gap-2">
      {conversaId && (
        <Link href={`/sistema/conversas?c=${conversaId}`} className={classesBotao("secundario", "sm")}>
          <MessageSquare className="size-4" /> Conversa
        </Link>
      )}
      <Botao tamanho="sm" variante="fantasma" carregando={pendente} onClick={cancelar}>
        Não enviar
      </Botao>
    </span>
  );
}
