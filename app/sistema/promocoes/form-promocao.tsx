"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Botao } from "@/components/ui/botao";
import { Campo, Entrada, Selecao } from "@/components/ui/campos";
import { acaoCriarPromocao, acaoEncerrarPromocao } from "./acoes";

export function FormPromocao({ modelos }: { modelos: { id: number; nome: string; precoTabela: number }[] }) {
  const [modeloId, setModeloId] = useState(modelos[0]?.id ?? 0);
  const [preco, setPreco] = useState("");
  const [inicio, setInicio] = useState("");
  const [fim, setFim] = useState("");
  const [carregando, iniciar] = useTransition();
  const router = useRouter();
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
      <Campo rotulo="Modelo">
        <Selecao value={modeloId} onChange={(e) => setModeloId(Number(e.target.value))}>
          {modelos.map((m) => (
            <option key={m.id} value={m.id}>
              {m.nome}
            </option>
          ))}
        </Selecao>
      </Campo>
      <Campo rotulo="Preço promocional (R$)">
        <Entrada inputMode="decimal" value={preco} onChange={(e) => setPreco(e.target.value.replace(/[^\d,.]/g, ""))} placeholder="Ex.: 8990" />
      </Campo>
      <Campo rotulo="Começa em">
        <Entrada type="datetime-local" value={inicio} onChange={(e) => setInicio(e.target.value)} />
      </Campo>
      <Campo rotulo="Termina em">
        <Entrada type="datetime-local" value={fim} onChange={(e) => setFim(e.target.value)} />
      </Campo>
      <div className="flex items-end">
        <Botao
          variante="primario"
          carregando={carregando}
          disabled={!modeloId || !preco || !inicio || !fim}
          onClick={() =>
            iniciar(async () => {
              const r = await acaoCriarPromocao({ modeloId, precoPromocional: Number(preco.replace(/\./g, "").replace(",", ".")), inicioEm: inicio, fimEm: fim });
              if (!r.ok) return void toast.error(r.erro);
              toast.success(r.mensagem);
              setPreco("");
              router.refresh();
            })
          }
        >
          Criar promoção
        </Botao>
      </div>
    </div>
  );
}

export function EncerrarPromocao({ id }: { id: number }) {
  const [carregando, iniciar] = useTransition();
  const router = useRouter();
  return (
    <Botao
      tamanho="sm"
      variante="fantasma"
      carregando={carregando}
      onClick={() =>
        iniciar(async () => {
          const r = await acaoEncerrarPromocao(id);
          if (!r.ok) return void toast.error(r.erro);
          toast.success(r.mensagem);
          router.refresh();
        })
      }
    >
      Encerrar agora
    </Botao>
  );
}
