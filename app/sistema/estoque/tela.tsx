"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Bike, ChevronRight, Pencil, Plus, Search } from "lucide-react";
import type { CorModelo, ItemCatalogo, VeiculoLinha } from "@/lib/consultas/estoque";
import { CONDICOES, ORIGENS_ENTRADA, STATUS_VEICULO, TIPOS_VEICULO, ehEletrico } from "@/lib/dominio";
import { brl, data, formatarPlaca, km } from "@/lib/formato";
import { Abas } from "@/components/ui/abas";
import { CabecalhoPagina, EstadoVazio, Painel, Selo } from "@/components/ui/basicos";
import { Botao } from "@/components/ui/botao";
import { Alternar, AreaTexto, Campo, CampoDinheiro, Entrada, Selecao } from "@/components/ui/campos";
import { Dialogo, RodapeDialogo } from "@/components/ui/dialogo";
import { ajustarGrupoVeiculos, darEntradaEmLote, mudarStatusVeiculo, salvarVeiculo } from "./acoes";
import { BolinhaCor } from "./cores";
import { Catalogo } from "./catalogo";

type Modelo = { id: number; nome: string; tipo: string; marca: string | null; precoTabela: number | null; ficha: Record<string, string> | null };
type Mov = {
  entradas: { id: number; quando: Date; entradaEm: string; descricao: string; origem: string | null; quem: string | null; placa: string | null }[];
  saidas: { id: number; quando: Date | null; veiculoId: number; descricao: string; cliente: string | null; valor: number | null; quem: string | null; placa: string | null }[];
};

const tomStatus = (s: string) => (s === "disponivel" ? "bom" : s === "reservado" ? "atencao" : s === "vendido" ? "info" : "neutro") as "bom" | "atencao" | "info" | "neutro";
/* "R$ 8.999,90"; preço redondo sem centavos ("R$ 7.190") */
const preco = (x: number) => brl(x, Number.isInteger(x) ? 0 : 2);
const nomeVeiculo = (v: VeiculoLinha) => [v.marca, v.modelo, v.versao].filter(Boolean).join(" ");

/* Unidades iguais (moto zero km do mesmo modelo, cor, preço e situação, sem placa nem km) viram uma
   linha só com a quantidade, pedido do dono (02/10/2026). Por dentro cada uma continua sendo um veículo.
   A mesma chave (menos preço e situação, que o ajuste muda) é conferida de novo no servidor. */
function agrupar(veiculos: VeiculoLinha[]): VeiculoLinha[][] {
  const grupos = new Map<string, VeiculoLinha[]>();
  const saida: VeiculoLinha[][] = [];
  for (const v of veiculos) {
    const agrupavel = v.status !== "vendido" && v.status !== "inativo" && !v.placa && !v.km && v.condicao === "zero_km";
    if (!agrupavel) {
      saida.push([v]);
      continue;
    }
    const chave = [v.modeloId, v.tipo, v.marca, v.modelo, v.versao, v.cor, v.condicao, v.teste, v.unidadeId, v.status, v.valorAnunciado].join("|");
    const g = grupos.get(chave);
    if (g) g.push(v);
    else {
      const novo = [v];
      grupos.set(chave, novo);
      saida.push(novo);
    }
  }
  return saida;
}

function resumoChassis(g: VeiculoLinha[]) {
  const com = g.filter((v) => v.chassi).length;
  return `Sem placa · ${com === 0 ? "sem chassi" : com === g.length ? "todas com chassi" : `${com} com chassi, ${g.length - com} sem`}`;
}

type PropsLinha = { v: VeiculoLinha; custo: boolean; editar: boolean; aoEditar: (v: VeiculoLinha) => void };

function LinhaVeiculo({ v, custo, editar, aoEditar, rotulo, recuo }: PropsLinha & { rotulo?: string; recuo?: boolean }) {
  const margem = v.custo && v.valorAnunciado ? Math.round(((v.valorAnunciado - v.custo) / v.valorAnunciado) * 100) : null;
  return (
    <tr className={`border-b border-linha last:border-0 hover:bg-trilho ${recuo ? "bg-trilho/40" : ""}`}>
      <td className={`py-3 pr-4 ${recuo ? "pl-10" : "pl-4"}`}>
        <p className="font-semibold">
          {rotulo ?? nomeVeiculo(v)} {v.teste && <Selo tom="atencao">Teste · IA</Selo>}
        </p>
        {!recuo && (
          <p className="text-[12px] text-ink-3">
            {TIPOS_VEICULO[v.tipo as keyof typeof TIPOS_VEICULO]}
            {v.cor ? ` · ${v.cor}` : ""}
            {v.anoModelo ? ` · ${v.anoFabricacao ?? v.anoModelo}/${v.anoModelo}` : ""}
            {v.unidade ? ` · ${v.unidade}` : ""}
          </p>
        )}
      </td>
      <td className="px-4 py-3 text-ink-2">{CONDICOES[v.condicao as keyof typeof CONDICOES]}</td>
      <td className="num px-4 py-3 text-ink-2">
        {v.placa ? formatarPlaca(v.placa) : ehEletrico(v.tipo) ? "Sem placa" : "—"}
        {v.chassi ? <span className="block text-[11.5px] text-ink-3">{v.chassi}</span> : recuo ? <span className="block text-[11.5px] text-ink-3">sem chassi</span> : null}
      </td>
      <td className="num px-4 py-3 text-right text-ink-2">{km(v.km)}</td>
      <td className="num px-4 py-3 text-right font-semibold">{v.valorAnunciado ? preco(v.valorAnunciado) : <Selo tom="atencao">Sem preço</Selo>}</td>
      {custo && (
        <td className="num px-4 py-3 text-right text-ink-2">
          {v.custo ? brl(v.custo) : "—"}
          {margem != null && <span className="block text-[11.5px] text-ink-3">{margem}%</span>}
        </td>
      )}
      <td className="px-4 py-3">
        <Selo tom={tomStatus(v.status)}>{STATUS_VEICULO[v.status as keyof typeof STATUS_VEICULO]}</Selo>
        {v.negociosAbertos > 0 && <span className="mt-1 block text-[11.5px] text-ink-3">{v.negociosAbertos} negociação(ões)</span>}
      </td>
      <td className="px-4 py-3 text-right">
        {editar && v.status !== "vendido" && (
          <Botao tamanho="sm" variante="fantasma" onClick={() => aoEditar(v)} aria-label={`Editar ${rotulo ? `${rotulo} de ` : ""}${v.modelo}`}>
            <Pencil className="size-4" />
          </Botao>
        )}
      </td>
    </tr>
  );
}

function GrupoLinhas({ g, custo, editar, aberto, aoAbrir, aoEditar, aoAjustar }: { g: VeiculoLinha[]; custo: boolean; editar: boolean; aberto: boolean; aoAbrir: () => void; aoEditar: (v: VeiculoLinha) => void; aoAjustar: () => void }) {
  const v = g[0];
  const negocios = g.reduce((s, x) => s + x.negociosAbertos, 0);
  return (
    <>
      <tr className="border-b border-linha last:border-0 hover:bg-trilho">
        <td className="px-4 py-3">
          <button type="button" onClick={aoAbrir} aria-expanded={aberto} className="flex items-start gap-1.5 text-left">
            <ChevronRight className={`mt-0.5 size-4 shrink-0 text-ink-3 transition ${aberto ? "rotate-90" : ""}`} aria-hidden />
            <span>
              <span className="flex flex-wrap items-center gap-1.5 font-semibold">
                {nomeVeiculo(v)} <Selo tom="info">{g.length} unidades</Selo> {v.teste && <Selo tom="atencao">Teste · IA</Selo>}
              </span>
              <span className="block text-[12px] text-ink-3">
                {TIPOS_VEICULO[v.tipo as keyof typeof TIPOS_VEICULO]}
                {v.cor ? ` · ${v.cor}` : ""}
                {v.unidade ? ` · ${v.unidade}` : ""}
              </span>
            </span>
          </button>
        </td>
        <td className="px-4 py-3 text-ink-2">{CONDICOES[v.condicao as keyof typeof CONDICOES]}</td>
        <td className="num px-4 py-3 text-ink-2">{resumoChassis(g)}</td>
        <td className="num px-4 py-3 text-right text-ink-2">{km(null)}</td>
        <td className="num px-4 py-3 text-right font-semibold">
          {v.valorAnunciado ? preco(v.valorAnunciado) : <Selo tom="atencao">Sem preço</Selo>}
          <span className="block text-[11.5px] font-normal text-ink-3">cada</span>
        </td>
        {custo && <td className="num px-4 py-3 text-right text-ink-2">{v.custo ? brl(v.custo) : "—"}</td>}
        <td className="px-4 py-3">
          <Selo tom={tomStatus(v.status)}>{STATUS_VEICULO[v.status as keyof typeof STATUS_VEICULO]}</Selo>
          {negocios > 0 && <span className="mt-1 block text-[11.5px] text-ink-3">{negocios} negociação(ões)</span>}
        </td>
        <td className="px-4 py-3 text-right">
          {editar && (
            <Botao tamanho="sm" variante="secundario" onClick={aoAjustar} aria-label={`Ajustar quantidade de ${nomeVeiculo(v)} ${v.cor ?? ""}`}>
              Quantidade
            </Botao>
          )}
        </td>
      </tr>
      {aberto && g.map((x, i) => <LinhaVeiculo key={x.id} v={x} custo={custo} editar={editar} aoEditar={aoEditar} rotulo={`Unidade ${i + 1}`} recuo />)}
    </>
  );
}

function ItemVeiculo({ v, custo, editar, aoEditar, rotulo }: PropsLinha & { rotulo?: string }) {
  const margem = v.custo && v.valorAnunciado ? Math.round(((v.valorAnunciado - v.custo) / v.valorAnunciado) * 100) : null;
  return (
    <li className={`flex items-start gap-2 border-b border-linha py-3 pr-4 last:border-0 ${rotulo ? "pl-8" : "pl-4"}`}>
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold">
          {rotulo ?? nomeVeiculo(v)} {v.teste && <Selo tom="atencao">Teste · IA</Selo>}
        </p>
        {!rotulo && (
          <p className="truncate text-[12.5px] text-ink-2">
            {[CONDICOES[v.condicao as keyof typeof CONDICOES], v.cor, v.anoModelo ? `${v.anoFabricacao ?? v.anoModelo}/${v.anoModelo}` : null, v.km ? km(v.km) : null].filter(Boolean).join(" · ")}
          </p>
        )}
        <p className="num truncate text-[12px] text-ink-3">
          {v.placa ? formatarPlaca(v.placa) : "Sem placa"}
          {rotulo ? ` · ${v.chassi ?? "sem chassi"}` : v.unidade ? ` · ${v.unidade}` : ""}
        </p>
        {!rotulo && (
          <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
            <Selo tom={tomStatus(v.status)}>{STATUS_VEICULO[v.status as keyof typeof STATUS_VEICULO]}</Selo>
            <span className="num font-semibold">{v.valorAnunciado ? preco(v.valorAnunciado) : <Selo tom="atencao">Sem preço</Selo>}</span>
            {custo && v.custo ? (
              <span className="num text-[12px] text-ink-3">
                custo {brl(v.custo)}
                {margem != null ? ` · ${margem}%` : ""}
              </span>
            ) : null}
          </div>
        )}
      </div>
      {editar && v.status !== "vendido" && (
        <button type="button" onClick={() => aoEditar(v)} aria-label={`Editar ${rotulo ? `${rotulo} de ` : ""}${v.modelo}`} className="grid size-11 shrink-0 place-items-center rounded-full text-ink-2 hover:bg-trilho active:bg-trilho">
          <Pencil className="size-4" />
        </button>
      )}
    </li>
  );
}

/* Quantidade, preço e situação de uma linha agrupada, de uma vez. */
function DialogoQuantidade({ grupo, aoFechar }: { grupo: VeiculoLinha[]; aoFechar: () => void }) {
  const v = grupo[0];
  const [quantidade, setQuantidade] = useState(grupo.length);
  const [valor, setValor] = useState<number | null>(v.valorAnunciado);
  const [status, setStatus] = useState<"disponivel" | "reservado">(v.status === "reservado" ? "reservado" : "disponivel");
  const [erros, setErros] = useState<Record<string, string>>({});
  const [pendente, iniciar] = useTransition();
  const router = useRouter();
  const nome = `${nomeVeiculo(v)}${v.cor ? ` ${v.cor}` : ""}`;
  const diferenca = quantidade - grupo.length;

  function salvar() {
    iniciar(async () => {
      const r = await ajustarGrupoVeiculos({ ids: grupo.map((x) => x.id), quantidade, valorAnunciado: valor, status });
      if (!r.ok) {
        setErros(r.campos ?? {});
        toast.error(r.erro);
        return;
      }
      toast.success(r.mensagem);
      aoFechar();
      router.refresh();
    });
  }

  return (
    <Dialogo aberto aoMudar={(x) => !x && aoFechar()} titulo={nome} descricao="Quantas tem, o preço e se já estão na loja. Vale para todas as unidades desta linha.">
      <div className="flex flex-col gap-4">
        <Campo rotulo="Quantidade em estoque" erro={erros.quantidade} htmlFor="grupo-quantidade">
          <div className="flex items-center gap-2">
            <Botao variante="secundario" aria-label="Uma a menos" onClick={() => setQuantidade((q) => Math.max(0, q - 1))} disabled={quantidade <= 0}>
              −
            </Botao>
            <Entrada
              id="grupo-quantidade"
              inputMode="numeric"
              className="num w-16 text-center"
              value={quantidade}
              onChange={(e) => setQuantidade(Math.min(50, Math.max(0, Number(e.target.value.replace(/\D/g, "")) || 0)))}
            />
            <Botao variante="secundario" aria-label="Uma a mais" onClick={() => setQuantidade((q) => Math.min(50, q + 1))} disabled={quantidade >= 50}>
              +
            </Botao>
          </div>
        </Campo>
        <Campo rotulo="Valor anunciado (cada)" erro={erros.valorAnunciado}>
          <CampoDinheiro valor={valor} aoMudar={setValor} />
        </Campo>
        <fieldset>
          <legend className="mb-2 text-[12px] font-medium text-ink-2">Onde estão</legend>
          <div className="grid grid-cols-2 gap-2" role="group" aria-label="Onde estão">
            {(
              [
                ["disponivel", "Na loja", "Disponível"],
                ["reservado", "Vão chegar", "Reservado"],
              ] as const
            ).map(([k, titulo, detalhe]) => (
              <button
                key={k}
                type="button"
                onClick={() => setStatus(k)}
                aria-pressed={status === k}
                className={`rounded-xl border px-3 py-2 text-left ${status === k ? "border-ink bg-trilho" : "border-linha hover:border-linha-forte"}`}
              >
                <span className="block text-[14px] font-semibold">{titulo}</span>
                <span className="block text-[12px] text-ink-3">{detalhe}</span>
              </button>
            ))}
          </div>
        </fieldset>
        <p className="rounded-xl bg-trilho px-3 py-2.5 text-[13px]" aria-live="polite">
          {diferenca > 0
            ? `Entram mais ${diferenca} unidade(s) iguais, sem chassi (dá para completar depois).`
            : diferenca < 0
              ? `${-diferenca} unidade(s) vão para "Fora de venda" (nada é apagado). Moto vendida baixa sozinha pela venda; use isto só para corrigir a contagem.`
              : "A quantidade continua a mesma."}
          <span className="block text-[12px] text-ink-3">
            {quantidade === 0 ? "A IA deixa de oferecer esta moto." : status === "disponivel" ? `A IA oferece ${quantidade} unidade(s) a pronta entrega.` : "A IA só oferece quando mudar para Na loja."}
          </span>
        </p>
      </div>
      <RodapeDialogo>
        <Botao variante="fantasma" onClick={aoFechar}>
          Cancelar
        </Botao>
        <Botao variante="primario" carregando={pendente} onClick={salvar}>
          Salvar
        </Botao>
      </RodapeDialogo>
    </Dialogo>
  );
}

export function TelaEstoque({
  veiculos,
  resumo,
  modelos,
  unidades,
  movimentacoes,
  cores,
  catalogo,
  filtros,
  permissoes,
}: {
  veiculos: VeiculoLinha[];
  resumo: { disponiveis: number; reservados: number; vendidos30: number; valorAnunciado: number; custoParado: number; semValor: number; paradosMais60: number };
  modelos: Modelo[];
  unidades: { id: number; nome: string }[];
  movimentacoes: Mov;
  cores: CorModelo[];
  catalogo: ItemCatalogo[];
  filtros: { q?: string; status?: string; tipo?: string };
  permissoes: { editar: boolean; custo: boolean; admin: boolean };
}) {
  const [aba, setAba] = useState<"veiculos" | "catalogo" | "mov">("veiculos");
  const [editando, setEditando] = useState<Partial<VeiculoLinha> | null>(null);
  const [ajustando, setAjustando] = useState<VeiculoLinha[] | null>(null);
  const [abertos, setAbertos] = useState<Set<number>>(() => new Set());
  const grupos = agrupar(veiculos);
  const alternarGrupo = (id: number) =>
    setAbertos((x) => {
      const n = new Set(x);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const router = useRouter();
  const params = useSearchParams();
  const [busca, setBusca] = useState(filtros.q ?? "");
  const [filtrando, iniciarFiltro] = useTransition();

  const filtrar = (k: string, v?: string) => {
    const p = new URLSearchParams(params.toString());
    if (v) p.set(k, v);
    else p.delete(k);
    iniciarFiltro(() => router.push(`/sistema/estoque?${p}`));
  };

  return (
    <>
      <CabecalhoPagina
        titulo="Estoque"
        subtitulo="Cada veículo é uma peça única: chassi, quilometragem e condição próprios."
        acoes={
          permissoes.editar && (
            <Botao variante="primario" onClick={() => setEditando({})}>
              <Plus className="size-4" /> Dar entrada em veículo
            </Botao>
          )
        }
      />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Indicador rotulo="Disponíveis" valor={resumo.disponiveis} detalhe={resumo.reservados ? `${resumo.reservados} reservado(s)` : undefined} />
        <Indicador rotulo="Vendidos nos últimos 30 dias" valor={resumo.vendidos30} />
        <Indicador rotulo="Valor anunciado em estoque" valor={brl(resumo.valorAnunciado)} detalhe={permissoes.custo ? `Custo parado ${brl(resumo.custoParado)}` : undefined} />
        <Indicador
          rotulo="Pede atenção"
          valor={resumo.semValor + resumo.paradosMais60}
          detalhe={[resumo.semValor && `${resumo.semValor} sem preço`, resumo.paradosMais60 && `${resumo.paradosMais60} parado(s) há +60 dias`].filter(Boolean).join(" · ") || "Nada pendente"}
        />
      </div>

      <Abas
        className="mb-4"
        atual={aba}
        aoMudar={setAba}
        abas={[
          { id: "veiculos", rotulo: "Veículos", contador: veiculos.length },
          { id: "catalogo", rotulo: "Catálogo e cores", contador: modelos.length },
          { id: "mov", rotulo: "Entradas e saídas" },
        ]}
      />

      {aba === "veiculos" && (
        <>
          <div className={`mb-4 flex flex-col gap-2 transition-opacity lg:flex-row lg:items-center ${filtrando ? "opacity-60" : ""}`} aria-busy={filtrando}>
            <form
              className="relative flex-1"
              onSubmit={(e) => {
                e.preventDefault();
                filtrar("q", busca);
              }}
            >
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-3" />
              <input
                type="search"
                enterKeyHint="search"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Modelo, cor, placa ou chassi"
                className="h-10 w-full rounded-full border border-linha bg-plano/60 pl-9 pr-4 text-[14px] outline-none placeholder:text-ink-3 focus:border-ink-2"
              />
            </form>
            <div className="rolagem-fina flex gap-1.5 overflow-x-auto">
              {[["", "Em estoque"], ["disponivel", "Disponíveis"], ["reservado", "Reservados"], ["vendido", "Vendidos"], ["inativo", "Fora de venda"]].map(([k, r]) => (
                <button key={k} onClick={() => filtrar("status", k)} className={`min-h-10 shrink-0 rounded-full border px-4 text-[13px] md:min-h-0 md:px-3 md:py-1.5 md:text-[12.5px] ${(filtros.status ?? "") === k ? "border-ink bg-ink text-contra-ink" : "border-linha text-ink-2 hover:border-linha-forte"}`}>
                  {r}
                </button>
              ))}
              <select value={filtros.tipo ?? ""} onChange={(e) => filtrar("tipo", e.target.value)} className="h-10 shrink-0 rounded-full md:h-8 border border-linha bg-plano/60 px-3 text-[12.5px]">
                <option value="">Todo tipo</option>
                {Object.entries(TIPOS_VEICULO).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <Painel className="overflow-hidden">
            {veiculos.length === 0 ? (
              <EstadoVazio
                icone={<Bike />}
                titulo={filtros.q || filtros.status || filtros.tipo ? "Nenhum veículo com este filtro" : "Nenhum veículo no estoque"}
                texto={filtros.q || filtros.status || filtros.tipo ? "Tire os filtros para ver todos." : "Dê entrada no primeiro veículo. Ele passa a aparecer no funil e na venda."}
                acao={permissoes.editar && !filtros.q && <Botao onClick={() => setEditando({})}>Dar entrada em veículo</Botao>}
              />
            ) : (
              <>
              <div className="hidden overflow-x-auto md:block">
                <table className="w-full min-w-[760px] text-left text-[13.5px]">
                  <thead className="border-b border-linha text-[11.5px] uppercase tracking-wide text-ink-3">
                    <tr>
                      <th className="px-4 py-3 font-medium">Veículo</th>
                      <th className="px-4 py-3 font-medium">Condição</th>
                      <th className="px-4 py-3 font-medium">Placa / chassi</th>
                      <th className="px-4 py-3 text-right font-medium">Km</th>
                      <th className="px-4 py-3 text-right font-medium">Anunciado</th>
                      {permissoes.custo && <th className="px-4 py-3 text-right font-medium">Custo · margem</th>}
                      <th className="px-4 py-3 font-medium">Situação</th>
                      <th className="px-4 py-3" />
                    </tr>
                  </thead>
                  <tbody>
                    {grupos.map((g) =>
                      g.length === 1 ? (
                        <LinhaVeiculo key={g[0].id} v={g[0]} custo={permissoes.custo} editar={permissoes.editar} aoEditar={setEditando} />
                      ) : (
                        <GrupoLinhas key={g[0].id} g={g} custo={permissoes.custo} editar={permissoes.editar} aberto={abertos.has(g[0].id)} aoAbrir={() => alternarGrupo(g[0].id)} aoEditar={setEditando} aoAjustar={() => setAjustando(g)} />
                      ),
                    )}
                  </tbody>
                </table>
              </div>
              <ul className="md:hidden">
                {grupos.map((g) =>
                  g.length === 1 ? (
                    <ItemVeiculo key={g[0].id} v={g[0]} custo={permissoes.custo} editar={permissoes.editar} aoEditar={setEditando} />
                  ) : (
                    <li key={g[0].id} className="border-b border-linha last:border-0">
                      <div className="flex items-start gap-2 px-4 py-3">
                        <button type="button" onClick={() => alternarGrupo(g[0].id)} aria-expanded={abertos.has(g[0].id)} className="min-w-0 flex-1 text-left">
                          <p className="flex items-center gap-1.5 truncate font-semibold">
                            {nomeVeiculo(g[0])} <Selo tom="info">{g.length} unidades</Selo> {g[0].teste && <Selo tom="atencao">Teste · IA</Selo>}
                          </p>
                          <p className="truncate text-[12.5px] text-ink-2">{[CONDICOES[g[0].condicao as keyof typeof CONDICOES], g[0].cor].filter(Boolean).join(" · ")}</p>
                          <p className="num truncate text-[12px] text-ink-3">{resumoChassis(g)}</p>
                          <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
                            <Selo tom={tomStatus(g[0].status)}>{STATUS_VEICULO[g[0].status as keyof typeof STATUS_VEICULO]}</Selo>
                            <span className="num font-semibold">{g[0].valorAnunciado ? preco(g[0].valorAnunciado) : <Selo tom="atencao">Sem preço</Selo>}</span>
                            <span className="text-[12px] text-ink-3">{abertos.has(g[0].id) ? "toque para fechar" : "toque para ver cada uma"}</span>
                          </div>
                        </button>
                        {permissoes.editar && (
                          <Botao tamanho="sm" variante="secundario" onClick={() => setAjustando(g)} aria-label={`Ajustar quantidade de ${nomeVeiculo(g[0])} ${g[0].cor ?? ""}`}>
                            Quantidade
                          </Botao>
                        )}
                      </div>
                      {abertos.has(g[0].id) && (
                        <ul className="border-t border-linha bg-trilho/40">
                          {g.map((v, i) => (
                            <ItemVeiculo key={v.id} v={v} custo={permissoes.custo} editar={permissoes.editar} aoEditar={setEditando} rotulo={`Unidade ${i + 1}`} />
                          ))}
                        </ul>
                      )}
                    </li>
                  ),
                )}
              </ul>
              </>
            )}
          </Painel>
        </>
      )}

      {aba === "catalogo" && <Catalogo itens={catalogo} cores={cores} editar={permissoes.editar} />}

      {aba === "mov" && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Painel className="overflow-hidden">
            <p className="border-b border-linha px-5 py-3 text-[14px] font-semibold">Entradas</p>
            {movimentacoes.entradas.length === 0 ? (
              <EstadoVazio compacto titulo="Nenhuma entrada registrada" />
            ) : (
              <ul>
                {movimentacoes.entradas.map((m) => (
                  <li key={m.id} className="flex items-center justify-between gap-3 border-b border-linha px-5 py-3 last:border-0">
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{m.descricao}</span>
                      <span className="block text-[12px] text-ink-3">
                        {m.origem ? ORIGENS_ENTRADA[m.origem as keyof typeof ORIGENS_ENTRADA] : "Origem não informada"}
                        {m.quem ? ` · ${m.quem}` : ""}
                      </span>
                    </span>
                    <span className="shrink-0 text-[12.5px] text-ink-2">{data(m.entradaEm)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Painel>
          <Painel className="overflow-hidden">
            <p className="border-b border-linha px-5 py-3 text-[14px] font-semibold">Saídas (vendas finalizadas)</p>
            {movimentacoes.saidas.length === 0 ? (
              <EstadoVazio compacto titulo="Nenhuma venda finalizada ainda" />
            ) : (
              <ul>
                {movimentacoes.saidas.map((m) => (
                  <li key={m.id} className="flex items-center justify-between gap-3 border-b border-linha px-5 py-3 last:border-0">
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{m.descricao}</span>
                      <span className="block text-[12px] text-ink-3">
                        {m.cliente ?? "—"}
                        {m.quem ? ` · ${m.quem}` : ""}
                      </span>
                    </span>
                    <span className="shrink-0 text-right">
                      <span className="num block font-semibold">{brl(m.valor)}</span>
                      <span className="block text-[12px] text-ink-3">{data(m.quando)}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Painel>
        </div>
      )}

      {ajustando && <DialogoQuantidade grupo={ajustando} aoFechar={() => setAjustando(null)} />}
      <FormularioVeiculo aberto={!!editando} aoMudar={(v) => !v && setEditando(null)} inicial={editando ?? {}} modelos={modelos} cores={cores} unidades={unidades} custo={permissoes.custo} admin={permissoes.admin} />
    </>
  );
}

function Indicador({ rotulo, valor, detalhe }: { rotulo: string; valor: string | number; detalhe?: string }) {
  return (
    <Painel className="p-4">
      <p className="text-[12px] text-ink-3">{rotulo}</p>
      <p className="num mt-1 text-[22px] font-bold tracking-tight">{valor}</p>
      {detalhe && <p className="text-[12px] text-ink-2">{detalhe}</p>}
    </Painel>
  );
}

function FormularioVeiculo({
  aberto,
  aoMudar,
  inicial,
  modelos,
  cores,
  unidades,
  custo,
  admin,
}: {
  aberto: boolean;
  aoMudar: (v: boolean) => void;
  inicial: Partial<VeiculoLinha>;
  modelos: Modelo[];
  cores: CorModelo[];
  unidades: { id: number; nome: string }[];
  custo: boolean;
  admin: boolean;
}) {
  /* entrada nova abre na rápida (moto elétrica do catálogo); editar e "outro veículo" usam o formulário completo */
  const [modo, setModo] = useState<"rapida" | "completa">("rapida");
  const temEletrica = modelos.some((m) => m.tipo === "moto_eletrica");
  const rapida = !inicial.id && temEletrica && modo === "rapida";
  return (
    <Dialogo
      aberto={aberto}
      aoMudar={(v) => {
        aoMudar(v);
        if (!v) setModo("rapida");
      }}
      largura="lg"
      titulo={inicial.id ? "Editar veículo" : "Dar entrada em veículo"}
      descricao={
        rapida
          ? "Escolha o modelo, a cor e quantas chegaram. O resto vem do catálogo."
          : "Moto elétrica não tem placa nem Renavam. Veículo emplacado: placa, ano e Renavam ajudam na documentação da venda."
      }
    >
      {aberto && !inicial.id && temEletrica && (
        <Abas
          className="mb-4"
          abas={[
            { id: "rapida", rotulo: "Moto elétrica nova" },
            { id: "completa", rotulo: "Outro veículo (usado, a combustão, carro)" },
          ]}
          atual={modo}
          aoMudar={setModo}
        />
      )}
      {aberto &&
        (rapida ? (
          <EntradaRapida modelos={modelos.filter((m) => m.tipo === "moto_eletrica")} cores={cores} unidades={unidades} custo={custo} admin={admin} aoFechar={() => aoMudar(false)} />
        ) : (
          <CorpoVeiculo key={inicial.id ?? "novo"} inicial={inicial} modelos={modelos} cores={cores} unidades={unidades} custo={custo} admin={admin} aoFechar={() => aoMudar(false)} />
        ))}
    </Dialogo>
  );
}

/* Entrada rápida: moto elétrica nova do catálogo, várias de uma vez. Só o que muda de uma moto
   para outra é perguntado (modelo, cor, quantas); tipo, nome, condição e preço vêm do catálogo,
   então a unidade fica sempre ligada ao modelo e a IA enxerga certinho o que tem. */
function EntradaRapida({
  modelos,
  cores,
  unidades,
  custo,
  admin,
  aoFechar,
}: {
  modelos: Modelo[];
  cores: CorModelo[];
  unidades: { id: number; nome: string }[];
  custo: boolean;
  admin: boolean;
  aoFechar: () => void;
}) {
  const [modeloId, setModeloId] = useState<number | null>(null);
  const [cor, setCor] = useState("");
  const [outraCor, setOutraCor] = useState(false);
  const [quantidade, setQuantidade] = useState(1);
  const [valor, setValor] = useState<number | null>(null);
  const [status, setStatus] = useState<"disponivel" | "reservado">("disponivel");
  const [chassis, setChassis] = useState("");
  const [mais, setMais] = useState({ custo: null as number | null, origemEntrada: "fornecedor", entradaEm: "", observacoes: "", unidadeId: (unidades[0]?.id ?? null) as number | null, teste: false });
  const [erros, setErros] = useState<Record<string, string>>({});
  const [pendente, iniciar] = useTransition();
  const router = useRouter();

  const modelo = modelos.find((m) => m.id === modeloId) ?? null;
  /* as cores que aparecem no site primeiro; as escondidas continuam escolhíveis */
  const coresDoModelo = modelo ? cores.filter((c) => c.modeloId === modelo.id).sort((a, b) => Number(b.ativo) - Number(a.ativo)) : [];
  const listaChassis = chassis.split(/[\s,;]+/).map((c) => c.trim().toUpperCase()).filter(Boolean);
  const nomeMoto = modelo ? `${modelo.nome}${cor.trim() ? ` ${cor.trim()}` : ""}` : "";

  function escolherModelo(m: Modelo) {
    setModeloId(m.id);
    setValor(m.precoTabela);
    const doModelo = cores.filter((c) => c.modeloId === m.id);
    /* cor única: já vem marcada */
    setCor(doModelo.length === 1 ? doModelo[0].nome : "");
    setOutraCor(doModelo.length === 0);
    setErros({});
  }

  function salvar() {
    iniciar(async () => {
      if (!modelo) return void setErros({ modeloId: "Escolha o modelo" });
      if (!cor.trim()) return void setErros({ cor: "Escolha a cor" });
      const r = await darEntradaEmLote({
        modeloId: modelo.id,
        cor: cor.trim(),
        quantidade,
        chassis: listaChassis,
        valorAnunciado: valor,
        custo: mais.custo,
        status,
        unidadeId: mais.unidadeId,
        origemEntrada: mais.origemEntrada,
        entradaEm: mais.entradaEm || null,
        observacoes: mais.observacoes || null,
        teste: mais.teste,
      });
      if (!r.ok) {
        setErros(r.campos ?? {});
        toast.error(r.erro);
        return;
      }
      toast.success(r.mensagem);
      aoFechar();
      router.refresh();
    });
  }

  return (
    <>
      <div className="flex flex-col gap-5">
        <fieldset>
          <legend className="mb-2 text-[12px] font-medium text-ink-2">
            Modelo <span className="text-critico">*</span>
          </legend>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" role="group" aria-label="Modelo">
            {modelos.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => escolherModelo(m)}
                aria-pressed={m.id === modeloId}
                className={`flex min-h-14 flex-col items-start justify-center rounded-xl border px-3 py-2 text-left transition ${m.id === modeloId ? "border-ink bg-trilho" : "border-linha hover:border-linha-forte"}`}
              >
                <span className="text-[14px] font-semibold leading-tight">{m.nome}</span>
                <span className="num text-[12px] text-ink-3">{m.precoTabela ? brl(m.precoTabela) : "sem preço"}</span>
              </button>
            ))}
          </div>
          {erros.modeloId && (
            <p className="mt-1.5 text-[12px] text-critico" role="alert">
              {erros.modeloId}
            </p>
          )}
        </fieldset>

        {modelo && (
          <>
            <fieldset>
              <legend className="mb-2 text-[12px] font-medium text-ink-2">
                Cor <span className="text-critico">*</span>
              </legend>
              <div className="flex flex-wrap gap-1.5" role="group" aria-label="Cor">
                {coresDoModelo.map((c) => {
                  const marcada = !outraCor && cor.toLowerCase() === c.nome.toLowerCase();
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => {
                        setOutraCor(false);
                        setCor(c.nome);
                      }}
                      aria-pressed={marcada}
                      className={`flex items-center gap-1.5 rounded-full border py-1.5 pl-1.5 pr-3 text-[13px] ${marcada ? "border-ink bg-trilho font-semibold" : "border-linha hover:border-linha-forte"}`}
                    >
                      <BolinhaCor hex={c.hex} tamanho="sm" />
                      {c.nome}
                    </button>
                  );
                })}
                <button
                  type="button"
                  onClick={() => {
                    setOutraCor(true);
                    setCor("");
                  }}
                  aria-pressed={outraCor}
                  className={`rounded-full border px-3 py-1.5 text-[13px] ${outraCor ? "border-ink bg-trilho font-semibold" : "border-dashed border-linha hover:border-linha-forte"}`}
                >
                  Outra cor
                </button>
              </div>
              {outraCor && (
                <Entrada className="mt-2" aria-label="Nome da cor" value={cor} onChange={(e) => setCor(e.target.value)} placeholder="Ex.: Cinza com laranja" autoFocus invalido={!!erros.cor} />
              )}
              <p className={`mt-1.5 text-[12px] ${erros.cor ? "text-critico" : "text-ink-3"}`} role={erros.cor ? "alert" : undefined}>
                {erros.cor ?? "A IA oferece a moto exatamente com esta cor."}
              </p>
            </fieldset>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Campo rotulo="Quantas chegaram" erro={erros.quantidade} htmlFor="entrada-quantidade">
                <div className="flex items-center gap-2">
                  <Botao variante="secundario" aria-label="Uma a menos" onClick={() => setQuantidade((q) => Math.max(1, q - 1))} disabled={quantidade <= 1}>
                    −
                  </Botao>
                  <Entrada
                    id="entrada-quantidade"
                    inputMode="numeric"
                    className="num w-16 text-center"
                    value={quantidade}
                    onChange={(e) => setQuantidade(Math.min(30, Math.max(1, Number(e.target.value.replace(/\D/g, "")) || 1)))}
                  />
                  <Botao variante="secundario" aria-label="Uma a mais" onClick={() => setQuantidade((q) => Math.min(30, q + 1))} disabled={quantidade >= 30}>
                    +
                  </Botao>
                </div>
              </Campo>
              <Campo rotulo="Valor anunciado (cada)" erro={erros.valorAnunciado} dica={modelo.precoTabela && valor === modelo.precoTabela ? "Preço de tabela do catálogo." : undefined}>
                <CampoDinheiro valor={valor} aoMudar={setValor} />
              </Campo>
            </div>

            <fieldset>
              <legend className="mb-2 text-[12px] font-medium text-ink-2">Onde está</legend>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2" role="group" aria-label="Onde está">
                {(
                  [
                    ["disponivel", "Já está na loja", "Fica Disponível: a IA já pode oferecer."],
                    ["reservado", "Ainda vai chegar", "Fica Reservado: a IA só oferece quando você mudar para Disponível."],
                  ] as const
                ).map(([k, titulo, detalhe]) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setStatus(k)}
                    aria-pressed={status === k}
                    className={`rounded-xl border px-3 py-2 text-left ${status === k ? "border-ink bg-trilho" : "border-linha hover:border-linha-forte"}`}
                  >
                    <span className="block text-[14px] font-semibold">{titulo}</span>
                    <span className="block text-[12px] text-ink-3">{detalhe}</span>
                  </button>
                ))}
              </div>
            </fieldset>

            <Campo
              rotulo="Chassi (opcional)"
              erro={erros.chassis}
              dica={`Um por linha, ou cole a lista. ${listaChassis.length ? `${listaChassis.length} de ${quantidade} preenchido(s); o resto você completa depois.` : "Pode deixar para depois."}`}
            >
              <AreaTexto value={chassis} onChange={(e) => setChassis(e.target.value.toUpperCase())} className="num min-h-[72px]" invalido={!!erros.chassis} />
            </Campo>

            <details className="rounded-xl border border-linha px-3 py-2">
              <summary className="cursor-pointer text-[13px] font-medium text-ink-2">Mais detalhes (custo, origem, data, observações)</summary>
              <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
                {custo && (
                  <Campo rotulo="Custo de cada (só administrador vê)">
                    <CampoDinheiro valor={mais.custo} aoMudar={(v) => setMais((x) => ({ ...x, custo: v }))} />
                  </Campo>
                )}
                <Campo rotulo="Origem">
                  <Selecao value={mais.origemEntrada} onChange={(e) => setMais((x) => ({ ...x, origemEntrada: e.target.value }))}>
                    {Object.entries(ORIGENS_ENTRADA).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </Selecao>
                </Campo>
                <Campo rotulo="Data de entrada" dica="Vazio = hoje.">
                  <Entrada type="date" value={mais.entradaEm} onChange={(e) => setMais((x) => ({ ...x, entradaEm: e.target.value }))} />
                </Campo>
                {unidades.length > 1 && (
                  <Campo rotulo="Loja">
                    <Selecao value={mais.unidadeId ?? ""} onChange={(e) => setMais((x) => ({ ...x, unidadeId: e.target.value ? Number(e.target.value) : null }))}>
                      {unidades.map((un) => (
                        <option key={un.id} value={un.id}>
                          {un.nome}
                        </option>
                      ))}
                    </Selecao>
                  </Campo>
                )}
                <Campo rotulo="Observações" className="sm:col-span-2">
                  <AreaTexto value={mais.observacoes} onChange={(e) => setMais((x) => ({ ...x, observacoes: e.target.value }))} placeholder="Vale para todas as unidades desta entrada." />
                </Campo>
                {admin && (
                  <div className="sm:col-span-2">
                    <Alternar
                      marcado={mais.teste}
                      aoMudar={(v) => setMais((x) => ({ ...x, teste: v }))}
                      rotulo="Veículo de teste (só para testar a IA)"
                      descricao="Não entra no estoque real, nas vendas, no painel nem nos avisos aos clientes."
                    />
                  </div>
                )}
              </div>
            </details>

            <div className="rounded-xl bg-trilho px-3 py-2.5 text-[13px]" aria-live="polite">
              <p>
                Vai entrar: <strong className="num">{quantidade}</strong> × <strong>{nomeMoto}</strong>
                {valor ? <span className="num"> · {brl(valor)} cada</span> : null} · {status === "disponivel" ? "Disponível" : "Reservado (chegando)"}
              </p>
              <p className="text-[12px] text-ink-3">
                {mais.teste
                  ? "Veículo de teste: a IA só enxerga em conversa simulada."
                  : status === "disponivel"
                    ? `A IA passa a oferecer a ${nomeMoto || "moto"} a pronta entrega.`
                    : "A IA não oferece enquanto estiver Reservado."}
              </p>
            </div>
          </>
        )}
      </div>
      <RodapeDialogo>
        <Botao variante="fantasma" onClick={aoFechar}>
          Cancelar
        </Botao>
        <Botao variante="primario" carregando={pendente} onClick={salvar} disabled={!modelo}>
          {quantidade > 1 ? `Cadastrar ${quantidade} motos` : "Cadastrar moto"}
        </Botao>
      </RodapeDialogo>
    </>
  );
}

function CorpoVeiculo({
  inicial,
  modelos,
  cores,
  unidades,
  custo,
  admin,
  aoFechar,
}: {
  inicial: Partial<VeiculoLinha>;
  modelos: Modelo[];
  cores: CorModelo[];
  unidades: { id: number; nome: string }[];
  custo: boolean;
  admin: boolean;
  aoFechar: () => void;
}) {
  const [f, setF] = useState<Partial<VeiculoLinha>>(() =>
    inicial.id ? inicial : { tipo: "moto_eletrica", condicao: "zero_km", status: "disponivel", origemEntrada: "fornecedor", unidadeId: unidades[0]?.id ?? null },
  );
  const [erros, setErros] = useState<Record<string, string>>({});
  const [pendente, iniciar] = useTransition();
  const router = useRouter();

  const eletrico = ehEletrico(f.tipo ?? "moto_eletrica");
  /* cores cadastradas no modelo escolhido: viram atalho, mas o campo continua livre */
  const coresDoModelo = f.modeloId ? cores.filter((c) => c.modeloId === f.modeloId) : [];
  const set = <K extends keyof VeiculoLinha>(k: K, v: VeiculoLinha[K] | null | undefined) => setF((x) => ({ ...x, [k]: v }));

  function escolherModelo(id: string) {
    const m = modelos.find((x) => x.id === Number(id));
    if (!m) return set("modeloId", null);
    setF((x) => ({
      ...x,
      modeloId: m.id,
      modelo: m.nome,
      marca: m.marca ?? x.marca,
      tipo: m.tipo,
      valorAnunciado: x.valorAnunciado ?? (x.condicao === "zero_km" || !x.condicao ? m.precoTabela : null),
    }));
  }

  return (
    <>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-6">
        <Campo rotulo="Modelo do catálogo" dica="Preenche tipo, nome e preço de tabela." className="sm:col-span-3">
          <Selecao value={f.modeloId ?? ""} onChange={(e) => escolherModelo(e.target.value)}>
            <option value="">Outro (preencher à mão)</option>
            {modelos.map((m) => (
              <option key={m.id} value={m.id}>
                {m.nome}
                {m.precoTabela ? ` — ${brl(m.precoTabela)}` : ""}
              </option>
            ))}
          </Selecao>
        </Campo>
        <Campo rotulo="Tipo" obrigatorio erro={erros.tipo} className="sm:col-span-3">
          <Selecao value={f.tipo ?? ""} onChange={(e) => set("tipo", e.target.value)}>
            {Object.entries(TIPOS_VEICULO).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </Selecao>
        </Campo>
        <Campo rotulo="Marca" className="sm:col-span-2">
          <Entrada value={f.marca ?? ""} onChange={(e) => set("marca", e.target.value)} placeholder={eletrico ? "Opcional" : "Honda, Fiat…"} />
        </Campo>
        <Campo rotulo="Modelo" obrigatorio erro={erros.modelo} className="sm:col-span-2">
          <Entrada value={f.modelo ?? ""} onChange={(e) => set("modelo", e.target.value)} invalido={!!erros.modelo} />
        </Campo>
        <Campo rotulo="Versão" className="sm:col-span-2">
          <Entrada value={f.versao ?? ""} onChange={(e) => set("versao", e.target.value)} />
        </Campo>
        <Campo rotulo="Cor" htmlFor="veiculo-cor" className="sm:col-span-2" dica={coresDoModelo.length ? "Toque numa cor do modelo ou digite outra." : undefined}>
          <Entrada id="veiculo-cor" value={f.cor ?? ""} onChange={(e) => set("cor", e.target.value)} />
          {coresDoModelo.length > 0 && (
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Cores do modelo">
            {coresDoModelo.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => set("cor", c.nome)}
                aria-pressed={(f.cor ?? "").toLowerCase() === c.nome.toLowerCase()}
                className={`flex items-center gap-1.5 rounded-full border py-1 pl-1 pr-2.5 text-[12.5px] ${(f.cor ?? "").toLowerCase() === c.nome.toLowerCase() ? "border-ink bg-trilho" : "border-linha hover:border-linha-forte"}`}
              >
                <BolinhaCor hex={c.hex} tamanho="sm" />
                {c.nome}
              </button>
            ))}
          </div>
          )}
        </Campo>
        <Campo rotulo="Condição" obrigatorio className="sm:col-span-2">
          <Selecao value={f.condicao ?? ""} onChange={(e) => set("condicao", e.target.value)}>
            {Object.entries(CONDICOES)
              .filter(([k]) => eletrico || k === "seminovo" || k === "usado")
              .map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
          </Selecao>
        </Campo>
        <Campo rotulo="Quilometragem" erro={erros.km} className="sm:col-span-2">
          <Entrada inputMode="numeric" value={f.km ?? ""} onChange={(e) => set("km", e.target.value ? Number(e.target.value.replace(/\D/g, "")) : null)} />
        </Campo>
        {!eletrico && (
          <>
            <Campo rotulo="Ano fabricação" erro={erros.anoFabricacao} className="sm:col-span-2">
              <Entrada inputMode="numeric" maxLength={4} value={f.anoFabricacao ?? ""} onChange={(e) => set("anoFabricacao", e.target.value ? Number(e.target.value.replace(/\D/g, "")) : null)} />
            </Campo>
            <Campo rotulo="Ano modelo" erro={erros.anoModelo} className="sm:col-span-2">
              <Entrada inputMode="numeric" maxLength={4} value={f.anoModelo ?? ""} onChange={(e) => set("anoModelo", e.target.value ? Number(e.target.value.replace(/\D/g, "")) : null)} />
            </Campo>
            <Campo rotulo="Placa" erro={erros.placa} className="sm:col-span-2">
              <Entrada value={f.placa ?? ""} onChange={(e) => set("placa", e.target.value.toUpperCase())} placeholder="ABC1D23" invalido={!!erros.placa} />
            </Campo>
            <Campo rotulo="Renavam" erro={erros.renavam} className="sm:col-span-3">
              <Entrada inputMode="numeric" value={f.renavam ?? ""} onChange={(e) => set("renavam", e.target.value)} invalido={!!erros.renavam} />
            </Campo>
          </>
        )}
        <Campo rotulo="Chassi" erro={erros.chassi} className={eletrico ? "sm:col-span-4" : "sm:col-span-3"}>
          <Entrada value={f.chassi ?? ""} onChange={(e) => set("chassi", e.target.value.toUpperCase())} invalido={!!erros.chassi} />
        </Campo>
        <Campo rotulo="Valor anunciado" erro={erros.valorAnunciado} className="sm:col-span-2">
          <CampoDinheiro valor={f.valorAnunciado} aoMudar={(v) => set("valorAnunciado", v)} />
        </Campo>
        {custo && (
          <Campo rotulo="Custo (só administrador vê)" erro={erros.custo} className="sm:col-span-2">
            <CampoDinheiro valor={f.custo} aoMudar={(v) => set("custo", v)} />
          </Campo>
        )}
        <Campo rotulo="Loja" className="sm:col-span-2">
          <Selecao value={f.unidadeId ?? ""} onChange={(e) => set("unidadeId", e.target.value ? Number(e.target.value) : null)}>
            <option value="">—</option>
            {unidades.map((un) => (
              <option key={un.id} value={un.id}>
                {un.nome}
              </option>
            ))}
          </Selecao>
        </Campo>
        <Campo rotulo="Origem" className="sm:col-span-2">
          <Selecao value={f.origemEntrada ?? ""} onChange={(e) => set("origemEntrada", e.target.value || null)}>
            <option value="">—</option>
            {Object.entries(ORIGENS_ENTRADA).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </Selecao>
        </Campo>
        <Campo rotulo="Data de entrada" className="sm:col-span-2">
          <Entrada type="date" value={f.entradaEm ?? ""} onChange={(e) => set("entradaEm", e.target.value)} />
        </Campo>
        <Campo rotulo="Situação" className="sm:col-span-2">
          <Selecao value={f.status ?? "disponivel"} onChange={(e) => set("status", e.target.value)} disabled={f.status === "vendido"}>
            <option value="disponivel">Disponível</option>
            <option value="reservado">Reservado</option>
            <option value="inativo">Fora de venda</option>
          </Selecao>
        </Campo>
        {admin && (
          <div className="sm:col-span-6">
            <Alternar
              marcado={!!f.teste}
              aoMudar={(v) => set("teste", v)}
              rotulo="Veículo de teste (só para testar a IA)"
              descricao="Não entra no estoque real, nas vendas, no painel nem nos avisos aos clientes. Só administradores veem. A IA só enxerga ele em conversa simulada."
            />
          </div>
        )}
        <Campo rotulo="Observações (avarias, detalhes)" className="sm:col-span-6">
          <AreaTexto value={f.observacoes ?? ""} onChange={(e) => set("observacoes", e.target.value)} placeholder="Risco na carenagem, pneu novo, revisão feita…" />
        </Campo>
      </div>
      <RodapeDialogo>
        {inicial.id && inicial.status !== "vendido" && (
          <Botao
            variante="fantasma"
            className="mr-auto"
            onClick={() =>
              iniciar(async () => {
                const r = await mudarStatusVeiculo(inicial.id!, inicial.status === "inativo" ? "disponivel" : "inativo");
                if (!r.ok) return void toast.error(r.erro);
                toast.success(r.mensagem);
                aoFechar();
                router.refresh();
              })
            }
          >
            {inicial.status === "inativo" ? "Voltar para venda" : "Tirar de venda"}
          </Botao>
        )}
        <Botao variante="fantasma" onClick={aoFechar}>
          Cancelar
        </Botao>
        <Botao
          variante="primario"
          carregando={pendente}
          onClick={() =>
            iniciar(async () => {
              const r = await salvarVeiculo({ ...f, id: inicial.id });
              if (!r.ok) {
                setErros(r.campos ?? {});
                toast.error(r.erro);
                return;
              }
              toast.success(r.mensagem);
              aoFechar();
              router.refresh();
            })
          }
        >
          Salvar
        </Botao>
      </RodapeDialogo>
    </>
  );
}
