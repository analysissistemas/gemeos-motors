"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Plus, UserPlus } from "lucide-react";
import { Botao } from "@/components/ui/botao";
import { Campo } from "@/components/ui/campos";
import { Dialogo } from "@/components/ui/dialogo";
import { SeletorCliente } from "@/components/clientes/seletor-cliente";
import { FormularioCliente } from "@/components/clientes/formulario-cliente";
import { acaoNovaVenda } from "./acoes";

export function NovaVenda({ equipe }: { equipe: { id: number; nome: string }[] }) {
  const [aberto, setAberto] = useState(false);
  const [cliente, setCliente] = useState<{ id: number; nome: string } | null>(null);
  const [cadastrando, setCadastrando] = useState(false);
  const [pendente, iniciar] = useTransition();
  const router = useRouter();
  return (
    <>
      <Botao variante="primario" onClick={() => setAberto(true)}>
        <Plus className="size-4" /> Nova venda
      </Botao>
      <Dialogo
        aberto={aberto}
        aoMudar={setAberto}
        titulo="Nova venda"
        descricao="Para venda que não passou pelo funil (cliente de balcão). Vendas do funil nascem ao arrastar para Venda fechada."
        largura="sm"
        rodape={
          <Botao
            variante="primario"
            disabled={!cliente}
            carregando={pendente}
            onClick={() =>
              iniciar(async () => {
                if (!cliente) return;
                const r = await acaoNovaVenda(cliente.id);
                if (!r.ok) return void toast.error(r.erro);
                router.push(`/sistema/vendas/${r.dados.id}`);
              })
            }
          >
            Começar venda
          </Botao>
        }
      >
        <Campo rotulo="Cliente" obrigatorio>
          <SeletorCliente valor={cliente} aoMudar={setCliente} equipe={equipe} />
        </Campo>
        {/* cliente de balcão que ainda não existe: cadastra aqui com CPF e endereço, sem ir à aba Clientes (dono, 15/10/2026) */}
        <Botao className="mt-3" tamanho="sm" variante="fantasma" onClick={() => setCadastrando(true)}>
          <UserPlus className="size-4" /> Cliente novo? Cadastrar aqui (nome, CPF e endereço)
        </Botao>
        <FormularioCliente aberto={cadastrando} aoMudar={setCadastrando} equipe={equipe} aoSalvar={(id, nome) => setCliente({ id, nome })} />
      </Dialogo>
    </>
  );
}
