"use client";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { ORIGENS } from "@/lib/dominio";
import { brl } from "@/lib/formato";
import { Botao } from "@/components/ui/botao";
import { Alternar, AreaTexto, Campo, CampoDinheiro, Entrada, Selecao } from "@/components/ui/campos";
import { Dialogo, RodapeDialogo } from "@/components/ui/dialogo";
import { SeletorCliente } from "@/components/clientes/seletor-cliente";
import { acaoAtualizarNegocio, acaoCriarNegocio, acaoVeiculosVendaveis } from "@/app/sistema/funil/acoes";

export type NegocioForm = {
  id?: number;
  cliente: { id: number; nome: string } | null;
  veiculoId: number | null;
  veiculoInteresse: string | null;
  responsavelId: number | null;
  origem: string | null;
  valorAnunciado: number | null;
  valorProposta: number | null;
  temTroca: boolean;
  trocaDescricao: string | null;
  trocaValor: number | null;
  observacoes: string | null;
};

export const negocioVazio = (cliente: { id: number; nome: string } | null = null): NegocioForm => ({
  cliente,
  veiculoId: null,
  veiculoInteresse: null,
  responsavelId: null,
  origem: null,
  valorAnunciado: null,
  valorProposta: null,
  temTroca: false,
  trocaDescricao: null,
  trocaValor: null,
  observacoes: null,
});

export function FormularioNegocio({
  inicial,
  aoMudar,
  equipe,
  aoSalvar,
}: {
  inicial: NegocioForm | null;
  aoMudar: (v: boolean) => void;
  equipe: { id: number; nome: string }[];
  aoSalvar: (id: number) => void;
}) {
  return (
    <Dialogo
      aberto={!!inicial}
      aoMudar={aoMudar}
      titulo={inicial?.id ? "Editar negócio" : "Novo negócio"}
      descricao={inicial?.id ? "Mudança no valor da proposta fica no histórico." : "Entra na etapa “Novo contato”."}
      largura="lg"
    >
      {inicial && (
        <CorpoNegocio
          inicial={inicial}
          equipe={equipe}
          aoCancelar={() => aoMudar(false)}
          aoSalvar={(id) => {
            aoMudar(false);
            aoSalvar(id);
          }}
        />
      )}
    </Dialogo>
  );
}

function CorpoNegocio({ inicial, equipe, aoCancelar, aoSalvar }: { inicial: NegocioForm; equipe: { id: number; nome: string }[]; aoCancelar: () => void; aoSalvar: (id: number) => void }) {
  const [f, setF] = useState<NegocioForm>(inicial);
  const [veiculos, setVeiculos] = useState<{ id: number; rotulo: string; valorAnunciado: number | null }[]>([]);
  const [erros, setErros] = useState<Record<string, string>>({});
  const [pendente, iniciar] = useTransition();

  useEffect(() => {
    acaoVeiculosVendaveis().then(setVeiculos);
  }, []);

  const set = <K extends keyof NegocioForm>(k: K, v: NegocioForm[K]) => setF((x) => ({ ...x, [k]: v }));

  return (
    <>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Campo rotulo="Cliente" obrigatorio erro={erros.clienteId} className="sm:col-span-2">
          <SeletorCliente valor={f.cliente} aoMudar={(c) => set("cliente", c)} equipe={equipe} invalido={!!erros.clienteId} desabilitado={!!inicial.id} />
        </Campo>
        <Campo rotulo="Veículo do estoque" dica="Se ainda não sabe qual unidade, descreva o interesse ao lado.">
          <Selecao
            value={f.veiculoId ?? ""}
            onChange={(e) => {
              const id = e.target.value ? Number(e.target.value) : null;
              const v = veiculos.find((x) => x.id === id);
              setF((x) => ({ ...x, veiculoId: id, valorAnunciado: v?.valorAnunciado ?? x.valorAnunciado }));
            }}
          >
            <option value="">Nenhum específico</option>
            {veiculos.map((v) => (
              <option key={v.id} value={v.id}>
                {v.rotulo}
                {v.valorAnunciado ? ` — ${brl(v.valorAnunciado)}` : ""}
              </option>
            ))}
          </Selecao>
        </Campo>
        <Campo rotulo="Veículo de interesse" erro={erros.veiculoInteresse}>
          <Entrada value={f.veiculoInteresse ?? ""} onChange={(e) => set("veiculoInteresse", e.target.value)} placeholder="Ex.: T1 branca, CG 160 até 2020" />
        </Campo>
        <Campo rotulo="Consultor responsável" dica={inicial.id ? undefined : "Em branco, fica com você."}>
          <Selecao value={f.responsavelId ?? ""} onChange={(e) => set("responsavelId", e.target.value ? Number(e.target.value) : null)}>
            <option value="">—</option>
            {equipe.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nome}
              </option>
            ))}
          </Selecao>
        </Campo>
        <Campo rotulo="Origem do lead" dica="Em branco, usa a origem do cliente.">
          <Selecao value={f.origem ?? ""} onChange={(e) => set("origem", e.target.value || null)}>
            <option value="">—</option>
            {Object.entries(ORIGENS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </Selecao>
        </Campo>
        <Campo rotulo="Valor anunciado" erro={erros.valorAnunciado}>
          <CampoDinheiro valor={f.valorAnunciado} aoMudar={(v) => set("valorAnunciado", v)} />
        </Campo>
        <Campo rotulo="Valor da proposta" erro={erros.valorProposta}>
          <CampoDinheiro valor={f.valorProposta} aoMudar={(v) => set("valorProposta", v)} />
        </Campo>
        <div className="sm:col-span-2">
          <Alternar marcado={f.temTroca} aoMudar={(v) => set("temTroca", v)} rotulo="Cliente tem veículo para a troca" />
        </div>
        {f.temTroca && (
          <>
            <Campo rotulo="Veículo da troca">
              <Entrada value={f.trocaDescricao ?? ""} onChange={(e) => set("trocaDescricao", e.target.value)} placeholder="Ex.: Onix 2022, 45 mil km" />
            </Campo>
            <Campo rotulo="Valor avaliado da troca">
              <CampoDinheiro valor={f.trocaValor} aoMudar={(v) => set("trocaValor", v)} />
            </Campo>
          </>
        )}
        <Campo rotulo="Observações" className="sm:col-span-2">
          <AreaTexto value={f.observacoes ?? ""} onChange={(e) => set("observacoes", e.target.value)} />
        </Campo>
      </div>
      <RodapeDialogo>
        <Botao variante="fantasma" onClick={aoCancelar}>
          Cancelar
        </Botao>
        <Botao
          variante="primario"
          carregando={pendente}
          onClick={() =>
            iniciar(async () => {
              const dados = { ...f, clienteId: f.cliente?.id ?? "" };
              const r = inicial.id ? await acaoAtualizarNegocio(inicial.id, dados) : await acaoCriarNegocio(dados);
              if (!r.ok) {
                setErros(r.campos ?? {});
                toast.error(r.erro);
                return;
              }
              toast.success(r.mensagem);
              aoSalvar(inicial.id ?? (r.dados as { id: number }).id);
            })
          }
        >
          {inicial.id ? "Salvar" : "Criar negócio"}
        </Botao>
      </RodapeDialogo>
    </>
  );
}
