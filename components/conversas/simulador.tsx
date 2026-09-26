"use client";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { FlaskConical } from "lucide-react";
import { Botao } from "@/components/ui/botao";
import { AreaTexto, Campo, Entrada } from "@/components/ui/campos";
import { Dialogo, RodapeDialogo } from "@/components/ui/dialogo";
import { acaoSimularCliente } from "@/app/sistema/conversas/acoes";

/* ============================================================
   SIMULADOR DE CLIENTE — existe só no modo de demonstração (MOCK).
   Faz o papel de quem manda mensagem pelo WhatsApp. Por baixo usa o
   mesmo caminho do webhook real (receberMensagem), então identificação
   do cliente, não lidas e triagem da IA funcionam de verdade.
   ============================================================ */
const FRASES = [
  "Oi, ainda tem a T1 branca?",
  "Quanto fica a TANK AG11 no Pix?",
  "Aceita minha moto na troca?",
  "Precisa de CNH para andar na elétrica?",
  "Vocês fazem entrega em Itambé?",
  "Quero falar com um atendente, por favor",
];

export function SimuladorCliente({
  aberto,
  aoMudar,
  conversaAtual,
  aoSimulado,
}: {
  aberto: boolean;
  aoMudar: (v: boolean) => void;
  conversaAtual: { telefone: string; nome: string } | null;
  aoSimulado: (conversaId: number | null) => void;
}) {
  return (
    <Dialogo
      aberto={aberto}
      aoMudar={aoMudar}
      largura="sm"
      titulo={
        <span className="flex items-center gap-2">
          <FlaskConical className="size-4" /> Simular mensagem de cliente
        </span>
      }
      descricao="Modo de demonstração: nada é enviado para o WhatsApp de verdade."
    >
      {aberto && (
        <CorpoSimulador
          conversaAtual={conversaAtual}
          aoConcluir={(id) => {
            aoMudar(false);
            aoSimulado(id);
          }}
        />
      )}
    </Dialogo>
  );
}

function numeroAleatorio() {
  return `5581${Math.floor(900000000 + Math.random() * 99999999)}`;
}

function CorpoSimulador({ conversaAtual, aoConcluir }: { conversaAtual: { telefone: string; nome: string } | null; aoConcluir: (id: number | null) => void }) {
  const [telefone, setTelefone] = useState(() => conversaAtual?.telefone ?? numeroAleatorio());
  const [nome, setNome] = useState(conversaAtual?.nome ?? "");
  const [texto, setTexto] = useState("");
  const [pendente, iniciar] = useTransition();

  return (
    <>
      <div className="flex flex-col gap-3">
        {conversaAtual && <p className="rounded-xl bg-trilho px-3 py-2 text-[12.5px] text-ink-2">Respondendo como o cliente da conversa aberta. Troque o número para simular outro contato.</p>}
        <Campo rotulo="WhatsApp do cliente (com DDD)">
          <Entrada inputMode="tel" value={telefone} onChange={(e) => setTelefone(e.target.value)} />
        </Campo>
        <Campo rotulo="Nome no perfil do WhatsApp (opcional)">
          <Entrada value={nome} onChange={(e) => setNome(e.target.value)} />
        </Campo>
        <Campo rotulo="Mensagem">
          <AreaTexto value={texto} onChange={(e) => setTexto(e.target.value)} className="min-h-[72px]" />
        </Campo>
        <div className="flex flex-wrap gap-1.5">
          {FRASES.map((f) => (
            <button key={f} className="rounded-full border border-linha px-2.5 py-1 text-[12px] hover:border-linha-forte" onClick={() => setTexto(f)}>
              {f}
            </button>
          ))}
        </div>
      </div>
      <RodapeDialogo>
        <Botao
          variante="primario"
          carregando={pendente}
          onClick={() =>
            iniciar(async () => {
              const r = await acaoSimularCliente({ telefone, nome, texto });
              if (!r.ok) return void toast.error(r.campos ? Object.values(r.campos)[0] : r.erro);
              toast.success(r.dados.triagem && r.dados.triagem !== "ok" ? `Mensagem recebida. ${r.dados.triagem}` : "Mensagem do cliente recebida");
              aoConcluir(r.dados.conversaId);
            })
          }
        >
          Receber mensagem
        </Botao>
      </RodapeDialogo>
    </>
  );
}
