"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Bike, Pencil, Plus, Search } from "lucide-react";
import type { VeiculoLinha } from "@/lib/consultas/estoque";
import { CONDICOES, ORIGENS_ENTRADA, STATUS_VEICULO, TIPOS_VEICULO, ehEletrico } from "@/lib/dominio";
import { brl, data, formatarPlaca, km } from "@/lib/formato";
import { Abas } from "@/components/ui/abas";
import { CabecalhoPagina, EstadoVazio, Painel, Selo } from "@/components/ui/basicos";
import { Botao } from "@/components/ui/botao";
import { AreaTexto, Campo, CampoDinheiro, Entrada, Selecao } from "@/components/ui/campos";
import { Dialogo, RodapeDialogo } from "@/components/ui/dialogo";
import { mudarStatusVeiculo, salvarVeiculo } from "./acoes";

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
  filtros,
  permissoes,
}: {
  veiculos: VeiculoLinha[];
  resumo: { disponiveis: number; reservados: number; vendidos30: number; valorAnunciado: number; custoParado: number; semValor: number; paradosMais60: number };
  modelos: Modelo[];
  unidades: { id: number; nome: string }[];
  movimentacoes: Mov;
  filtros: { q?: string; status?: string; tipo?: string };
  permissoes: { editar: boolean; custo: boolean };
}) {
  const [aba, setAba] = useState<"veiculos" | "mov">("veiculos");
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
                            <p className="font-semibold">{[v.marca, v.modelo, v.versao].filter(Boolean).join(" ")}</p>
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
                        <p className="truncate font-semibold">{[v.marca, v.modelo, v.versao].filter(Boolean).join(" ")}</p>
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

      <FormularioVeiculo aberto={!!editando} aoMudar={(v) => !v && setEditando(null)} inicial={editando ?? {}} modelos={modelos} unidades={unidades} custo={permissoes.custo} />
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
  unidades,
  custo,
}: {
  aberto: boolean;
  aoMudar: (v: boolean) => void;
  inicial: Partial<VeiculoLinha>;
  modelos: Modelo[];
  unidades: { id: number; nome: string }[];
  custo: boolean;
}) {
  return (
    <Dialogo
      aberto={aberto}
      aoMudar={aoMudar}
      largura="lg"
      titulo={inicial.id ? "Editar veículo" : "Dar entrada em veículo"}
      descricao="Moto e triciclo elétricos não têm placa nem Renavam. Veículo emplacado: placa, ano e Renavam ajudam na documentação da venda."
    >
      {aberto && <CorpoVeiculo key={inicial.id ?? "novo"} inicial={inicial} modelos={modelos} unidades={unidades} custo={custo} aoFechar={() => aoMudar(false)} />}
    </Dialogo>
  );
}

function CorpoVeiculo({
  inicial,
  modelos,
  unidades,
  custo,
  aoFechar,
}: {
  inicial: Partial<VeiculoLinha>;
  modelos: Modelo[];
  unidades: { id: number; nome: string }[];
  custo: boolean;
  aoFechar: () => void;
}) {
  const [f, setF] = useState<Partial<VeiculoLinha>>(() =>
    inicial.id ? inicial : { tipo: "moto_eletrica", condicao: "zero_km", status: "disponivel", origemEntrada: "fornecedor", unidadeId: unidades[0]?.id ?? null },
  );
  const [erros, setErros] = useState<Record<string, string>>({});
  const [pendente, iniciar] = useTransition();
  const router = useRouter();

  const eletrico = ehEletrico(f.tipo ?? "moto_eletrica");
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
        <Campo rotulo="Cor" className="sm:col-span-2">
          <Entrada value={f.cor ?? ""} onChange={(e) => set("cor", e.target.value)} />
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
