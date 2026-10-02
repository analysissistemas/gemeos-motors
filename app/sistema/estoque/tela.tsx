"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Bike, Pencil, Plus, Search } from "lucide-react";
import type { CorModelo, ItemCatalogo, VeiculoLinha } from "@/lib/consultas/estoque";
import { CONDICOES, ORIGENS_ENTRADA, STATUS_VEICULO, TIPOS_VEICULO, ehEletrico } from "@/lib/dominio";
import { brl, data, formatarPlaca, km } from "@/lib/formato";
import { Abas } from "@/components/ui/abas";
import { CabecalhoPagina, EstadoVazio, Painel, Selo } from "@/components/ui/basicos";
import { Botao } from "@/components/ui/botao";
import { Alternar, AreaTexto, Campo, CampoDinheiro, Entrada, Selecao } from "@/components/ui/campos";
import { Dialogo, RodapeDialogo } from "@/components/ui/dialogo";
import { darEntradaEmLote, mudarStatusVeiculo, salvarVeiculo } from "./acoes";
import { BolinhaCor } from "./cores";
import { Catalogo } from "./catalogo";

type Modelo = { id: number; nome: string; tipo: string; marca: string | null; precoTabela: number | null; ficha: Record<string, string> | null };
type Mov = {
  entradas: { id: number; quando: Date; entradaEm: string; descricao: string; origem: string | null; quem: string | null; placa: string | null }[];
  saidas: { id: number; quando: Date | null; veiculoId: number; descricao: string; cliente: string | null; valor: number | null; quem: string | null; placa: string | null }[];
};

const tomStatus = (s: string) => (s === "disponivel" ? "bom" : s === "reservado" ? "atencao" : s === "vendido" ? "info" : "neutro") as "bom" | "atencao" | "info" | "neutro";

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
                    {veiculos.map((v) => {
                      const margem = v.custo && v.valorAnunciado ? Math.round(((v.valorAnunciado - v.custo) / v.valorAnunciado) * 100) : null;
                      return (
                        <tr key={v.id} className="border-b border-linha last:border-0 hover:bg-trilho">
                          <td className="px-4 py-3">
                            <p className="font-semibold">
                              {[v.marca, v.modelo, v.versao].filter(Boolean).join(" ")} {v.teste && <Selo tom="atencao">Teste · IA</Selo>}
                            </p>
                            <p className="text-[12px] text-ink-3">
                              {TIPOS_VEICULO[v.tipo as keyof typeof TIPOS_VEICULO]}
                              {v.cor ? ` · ${v.cor}` : ""}
                              {v.anoModelo ? ` · ${v.anoFabricacao ?? v.anoModelo}/${v.anoModelo}` : ""}
                              {v.unidade ? ` · ${v.unidade}` : ""}
                            </p>
                          </td>
                          <td className="px-4 py-3 text-ink-2">{CONDICOES[v.condicao as keyof typeof CONDICOES]}</td>
                          <td className="num px-4 py-3 text-ink-2">
                            {v.placa ? formatarPlaca(v.placa) : ehEletrico(v.tipo) ? "Sem placa" : "—"}
                            {v.chassi && <span className="block text-[11.5px] text-ink-3">{v.chassi}</span>}
                          </td>
                          <td className="num px-4 py-3 text-right text-ink-2">{km(v.km)}</td>
                          <td className="num px-4 py-3 text-right font-semibold">{v.valorAnunciado ? brl(v.valorAnunciado) : <Selo tom="atencao">Sem preço</Selo>}</td>
                          {permissoes.custo && (
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
                            {permissoes.editar && v.status !== "vendido" && (
                              <Botao tamanho="sm" variante="fantasma" onClick={() => setEditando(v)} aria-label={`Editar ${v.modelo}`}>
                                <Pencil className="size-4" />
                              </Botao>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <ul className="md:hidden">
                {veiculos.map((v) => {
                  const margem = v.custo && v.valorAnunciado ? Math.round(((v.valorAnunciado - v.custo) / v.valorAnunciado) * 100) : null;
                  return (
                    <li key={v.id} className="flex items-start gap-2 border-b border-linha px-4 py-3 last:border-0">
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-semibold">
                          {[v.marca, v.modelo, v.versao].filter(Boolean).join(" ")} {v.teste && <Selo tom="atencao">Teste · IA</Selo>}
                        </p>
                        <p className="truncate text-[12.5px] text-ink-2">
                          {[CONDICOES[v.condicao as keyof typeof CONDICOES], v.cor, v.anoModelo ? `${v.anoFabricacao ?? v.anoModelo}/${v.anoModelo}` : null, v.km ? km(v.km) : null].filter(Boolean).join(" · ")}
                        </p>
                        <p className="num truncate text-[12px] text-ink-3">
                          {v.placa ? formatarPlaca(v.placa) : "Sem placa"}
                          {v.unidade ? ` · ${v.unidade}` : ""}
                        </p>
                        <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
                          <Selo tom={tomStatus(v.status)}>{STATUS_VEICULO[v.status as keyof typeof STATUS_VEICULO]}</Selo>
                          <span className="num font-semibold">{v.valorAnunciado ? brl(v.valorAnunciado) : <Selo tom="atencao">Sem preço</Selo>}</span>
                          {permissoes.custo && v.custo ? (
                            <span className="num text-[12px] text-ink-3">
                              custo {brl(v.custo)}
                              {margem != null ? ` · ${margem}%` : ""}
                            </span>
                          ) : null}
                        </div>
                      </div>
                      {permissoes.editar && v.status !== "vendido" && (
                        <button type="button" onClick={() => setEditando(v)} aria-label={`Editar ${v.modelo}`} className="grid size-11 shrink-0 place-items-center rounded-full text-ink-2 hover:bg-trilho active:bg-trilho">
                          <Pencil className="size-4" />
                        </button>
                      )}
                    </li>
                  );
                })}
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
