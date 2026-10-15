"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore, useTransition } from "react";
import { toast } from "sonner";
import { ArrowLeft, BadgeCheck, Copy, Download, ExternalLink, FileText, MessageSquare, PenLine, Printer, ShieldCheck, TriangleAlert } from "lucide-react";
import type { DetalheVenda } from "@/lib/consultas/vendas";
import { CHECKLIST_DOCUMENTACAO, CONDICOES, FORMAS_PAGAMENTO, PASSOS_VENDA, STATUS_VENDA, TIPOS_VEICULO, type FormaPagamento } from "@/lib/dominio";
import { brl, data, dataHora, formatarCpf, formatarPlaca, formatarTelefone, km, numeroDoc, soDigitos, telefoneWhatsapp } from "@/lib/formato";
import { cn } from "@/lib/cn";
import { LinhaDoTempo } from "@/components/ui/abas";
import { ItemInfo, Painel, Selo, TituloSecao } from "@/components/ui/basicos";
import { Botao, classesBotao } from "@/components/ui/botao";
import { AreaTexto, Campo, CampoDinheiro, Entrada, Selecao } from "@/components/ui/campos";
import { Dialogo } from "@/components/ui/dialogo";
import { Passos } from "@/components/ui/passos";
import { EditorPagamentos, type Pagamento } from "@/components/vendas/editor-pagamentos";
import { ClienteNaTela } from "@/components/clientes/formulario-cliente";
import { SeletorCliente } from "@/components/clientes/seletor-cliente";
import {
  acaoAssinaturaPresencial,
  acaoCancelarVenda,
  acaoFinalizarVenda,
  acaoGerarDocumento,
  acaoLinkAssinatura,
  acaoSalvarVenda,
  acaoStatusAssinatura,
} from "../acoes";

type Veic = { id: number; rotulo: string; valorAnunciado: number | null; status: string; condicao: string };

export function FluxoVenda({
  venda: d,
  veiculos,
  equipe,
  condicoesPadrao,
  permissoes,
}: {
  venda: DetalheVenda;
  veiculos: Veic[];
  equipe: { id: number; nome: string }[];
  condicoesPadrao: string | null;
  permissoes: { editar: boolean; cancelar: boolean; custo: boolean };
}) {
  const router = useRouter();
  const v = d.venda;
  const encerrada = v.status === "finalizada" || v.status === "cancelada";
  const somenteLeitura = encerrada || !permissoes.editar;
  const [f, setF] = useState(() => ({
    cliente: { id: d.cliente.id, nome: d.cliente.nome },
    veiculoId: v.veiculoId,
    valorAnunciado: v.valorAnunciado,
    valorVendido: v.valorVendido,
    condicoes: v.condicoes ?? "",
    observacoes: v.observacoes ?? "",
    documentacao: (v.documentacao ?? {}) as Record<string, boolean>,
    pagamentos: d.pagamentos.length
      ? d.pagamentos.map((p) => ({ forma: p.forma as FormaPagamento, valor: p.valor, entrada: p.entrada, instituicao: p.instituicao, observacao: p.observacao }))
      : ([{ forma: "pix", valor: v.valorVendido, entrada: false }] as Pagamento[]),
  }));
  const [pendente, iniciar] = useTransition();
  const [editandoCliente, setEditandoCliente] = useState(false);
  const [cancelando, setCancelando] = useState(false);

  /* o que o documento da venda precisa do cliente e ainda não tem */
  const faltaNoCliente = [!soDigitos(d.cliente.cpf) && "CPF", !(d.cliente.endereco && d.cliente.cidade) && "endereço"].filter((x): x is string => !!x);
  const somaPag = Math.round(f.pagamentos.reduce((s, p) => s + (p.valor ?? 0), 0) * 100);
  const pagamentosOk = !!f.valorVendido && somaPag === Math.round(f.valorVendido * 100);
  const completos = [
    !!d.cliente.nome,
    !!f.veiculoId,
    !!f.valorAnunciado && !!f.valorVendido,
    true,
    pagamentosOk,
    true,
    !!soDigitos(d.cliente.cpf) && !!f.veiculoId && pagamentosOk,
    !!v.documentoHash,
    v.status === "assinada" || v.status === "finalizada",
    v.status === "finalizada",
  ];
  const passoInicial = useMemo(() => {
    if (v.status === "finalizada" || v.status === "assinada" || v.status === "cancelada") return 9;
    if (v.status === "aguardando_assinatura") return 8;
    const falta = completos.findIndex((ok, i) => i < 7 && !ok);
    return falta === -1 ? 6 : falta;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [passo, setPasso] = useState(passoInicial);

  const pendencias = [
    !soDigitos(d.cliente.cpf) && "CPF do cliente",
    !f.veiculoId && "Veículo",
    !f.valorAnunciado && "Valor anunciado",
    !f.valorVendido && "Valor vendido",
    !pagamentosOk && "Pagamentos somando o valor vendido",
  ].filter(Boolean) as string[];

  function salvar(proximo?: number) {
    if (somenteLeitura) return setPasso(proximo ?? passo);
    iniciar(async () => {
      const r = await acaoSalvarVenda(v.id, {
        clienteId: f.cliente.id,
        veiculoId: f.veiculoId,
        valorAnunciado: f.valorAnunciado,
        valorVendido: f.valorVendido,
        condicoes: f.condicoes,
        observacoes: f.observacoes,
        documentacao: f.documentacao,
        pagamentos: f.pagamentos.filter((p) => (p.valor ?? 0) > 0),
      });
      if (!r.ok) return void toast.error(r.erro);
      if (r.dados.documentoInvalidado) toast.warning("Os dados mudaram: o documento anterior deixou de valer. Gere de novo.");
      else toast.success("Salvo");
      router.refresh();
      if (proximo != null) setPasso(proximo);
    });
  }

  const avancar = () => salvar(Math.min(passo + 1, 9));
  const aoAssinado = useCallback(() => router.refresh(), [router]);
  const veiculo = d.veiculo;
  const veicEscolhido = veiculos.find((x) => x.id === f.veiculoId);
  const assinaturaValida = d.assinaturas.find((a) => a.status === "assinado" && a.documentoHash === v.documentoHash);

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Link href="/sistema/vendas" className={classesBotao("fantasma", "icone")} aria-label="Voltar para vendas">
          <ArrowLeft className="size-5" />
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="text-[22px] font-bold tracking-tight sm:text-[26px]">
            Venda {numeroDoc("V", v.id)} · {d.cliente.nome}
          </h1>
          <p className="text-[13px] text-ink-2">
            {d.vendedor ?? "Sem consultor"} · iniciada em {data(v.criadoEm)}
            {v.negocioId && (
              <>
                {" · "}
                <Link href={`/sistema/funil?negocio=${v.negocioId}`} className="underline">
                  ver negócio
                </Link>
              </>
            )}
          </p>
        </div>
        <Selo tom={v.status === "finalizada" ? "bom" : v.status === "cancelada" ? "critico" : "atencao"}>{STATUS_VENDA[v.status as keyof typeof STATUS_VENDA]}</Selo>
        {permissoes.cancelar && v.status !== "cancelada" && (
          <Botao tamanho="sm" variante="fantasma" onClick={() => setCancelando(true)}>
            Cancelar venda
          </Botao>
        )}
      </div>

      {v.status === "cancelada" && (
        <div className="mb-4 rounded-2xl border border-critico/40 bg-critico/10 px-4 py-3 text-[13.5px]">
          Venda cancelada em {dataHora(v.canceladaEm)}: {v.cancelamentoMotivo}
        </div>
      )}
      {(v.status === "aguardando_assinatura" || v.status === "assinada") && passo < 7 && !somenteLeitura && (
        <div className="mb-4 flex items-start gap-2 rounded-2xl border border-atencao/40 bg-atencao/10 px-4 py-3 text-[13px]">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" />O documento já foi gerado. Salvar mudança em cliente, veículo, valores, condições ou pagamento anula o documento e a assinatura, e é preciso gerar e assinar de novo.
        </div>
      )}

      <Passos className="mb-5" passos={PASSOS_VENDA} atual={passo} concluidos={(i) => completos[i]} aoClicar={setPasso} />

      <Painel className="p-5 sm:p-6">
        {passo === 0 && (
          <Etapa titulo="1. Cliente" texto="Confira os dados. O CPF é obrigatório para o documento de venda.">
            {!v.negocioId && v.status === "rascunho" && !somenteLeitura && (
              <Campo rotulo="Cliente da venda" className="mb-4 max-w-md">
                <SeletorCliente valor={f.cliente} aoMudar={(c) => c && setF((x) => ({ ...x, cliente: c }))} equipe={equipe} />
              </Campo>
            )}
            {!somenteLeitura && (editandoCliente || faltaNoCliente.length > 0) ? (
              <>
                {faltaNoCliente.length > 0 && (
                  <div className="mb-4 flex items-start gap-2 rounded-2xl border border-atencao/40 bg-atencao/10 px-4 py-3 text-[13px]">
                    <TriangleAlert className="mt-0.5 size-4 shrink-0" />
                    <span>
                      Falta <b>{faltaNoCliente.join(" e ")}</b> para o documento da venda. Preencha aqui mesmo e clique em Salvar dados do cliente.
                    </span>
                  </div>
                )}
                <ClienteNaTela
                  key={[d.cliente.id, d.cliente.cpf, d.cliente.endereco, d.cliente.atualizadoEm?.toString()].join("|")}
                  inicial={d.cliente}
                  equipe={equipe}
                  aoSalvar={() => {
                    setEditandoCliente(false);
                    router.refresh();
                  }}
                  aoCancelar={faltaNoCliente.length ? undefined : () => setEditandoCliente(false)}
                />
              </>
            ) : (
            <>
            <dl className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-3">
              <ItemInfo rotulo="Nome">{d.cliente.nome}</ItemInfo>
              <ItemInfo rotulo="CPF">{d.cliente.cpf ? formatarCpf(d.cliente.cpf) : <span className="text-critico">Não informado</span>}</ItemInfo>
              <ItemInfo rotulo="WhatsApp">{formatarTelefone(d.cliente.whatsapp ?? d.cliente.telefone)}</ItemInfo>
              <ItemInfo rotulo="E-mail">{d.cliente.email}</ItemInfo>
              <ItemInfo rotulo="Endereço" className="sm:col-span-2">
                {[d.cliente.endereco, d.cliente.numero, d.cliente.bairro, d.cliente.cidade, d.cliente.estado].filter(Boolean).join(", ")}
              </ItemInfo>
            </dl>
            {!somenteLeitura && (
              <Botao className="mt-4" tamanho="sm" onClick={() => setEditandoCliente(true)}>
                <PenLine className="size-4" /> Editar dados do cliente
              </Botao>
            )}
            </>
            )}
          </Etapa>
        )}

        {passo === 1 && (
          <Etapa titulo="2. Veículo" texto="O veículo fica reservado enquanto a venda está em andamento.">
            <Campo rotulo="Veículo vendido" obrigatorio className="max-w-xl">
              <Selecao
                value={f.veiculoId ?? ""}
                disabled={somenteLeitura}
                onChange={(e) => {
                  const id = e.target.value ? Number(e.target.value) : null;
                  const x = veiculos.find((y) => y.id === id);
                  /* o anunciado é o preço da moto escolhida (dono, 15/10/2026: ficava travado em R$ 8.999,90, o valor do negócio,
                     com a N2 de R$ 5.890); o vendido acompanha enquanto ninguém digitou outro */
                  setF((s) => {
                    const novo = x?.valorAnunciado ?? s.valorAnunciado;
                    const vendidoAcompanha = !s.valorVendido || s.valorVendido === s.valorAnunciado;
                    const valorVendido = vendidoAcompanha ? novo : s.valorVendido;
                    const pagamentos = s.pagamentos.length === 1 && (!s.pagamentos[0].valor || s.pagamentos[0].valor === s.valorVendido) ? [{ ...s.pagamentos[0], valor: valorVendido }] : s.pagamentos;
                    return { ...s, veiculoId: id, valorAnunciado: novo, valorVendido, pagamentos };
                  });
                }}
              >
                <option value="">Escolha o veículo</option>
                {veiculos.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.rotulo}
                    {x.valorAnunciado ? ` — ${brl(x.valorAnunciado)}` : ""}
                  </option>
                ))}
              </Selecao>
            </Campo>
            {veiculos.length === 0 && (
              <p className="mt-2 text-[13px] text-ink-2">
                Nenhum veículo disponível.{" "}
                <Link href="/sistema/estoque" className="underline">
                  Dar entrada no estoque
                </Link>
                .
              </p>
            )}
            {veiculo && veiculo.id === f.veiculoId && (
              <dl className="mt-5 grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
                <ItemInfo rotulo="Tipo">{TIPOS_VEICULO[veiculo.tipo as keyof typeof TIPOS_VEICULO]}</ItemInfo>
                <ItemInfo rotulo="Condição">{CONDICOES[veiculo.condicao as keyof typeof CONDICOES]}</ItemInfo>
                <ItemInfo rotulo="Ano">{veiculo.anoModelo ? `${veiculo.anoFabricacao ?? veiculo.anoModelo}/${veiculo.anoModelo}` : null}</ItemInfo>
                <ItemInfo rotulo="Quilometragem">{km(veiculo.km)}</ItemInfo>
                <ItemInfo rotulo="Placa">{veiculo.placa ? formatarPlaca(veiculo.placa) : null}</ItemInfo>
                <ItemInfo rotulo="Chassi">{veiculo.chassi}</ItemInfo>
                <ItemInfo rotulo="Cor">{veiculo.cor}</ItemInfo>
                {permissoes.custo && <ItemInfo rotulo="Custo (só admin)">{veiculo.custo != null ? brl(veiculo.custo) : null}</ItemInfo>}
              </dl>
            )}
            {veicEscolhido && veiculo?.id !== f.veiculoId && <p className="mt-3 text-[13px] text-ink-2">Salve para ver os detalhes do veículo escolhido.</p>}
          </Etapa>
        )}

        {passo === 2 && (
          <Etapa titulo="3. Valores">
            <div className="grid max-w-xl grid-cols-1 gap-4 sm:grid-cols-2">
              <Campo rotulo="Valor anunciado" obrigatorio>
                <CampoDinheiro valor={f.valorAnunciado} disabled={somenteLeitura} aoMudar={(x) => setF((s) => ({ ...s, valorAnunciado: x }))} />
              </Campo>
              <Campo rotulo="Valor vendido" obrigatorio>
                <CampoDinheiro valor={f.valorVendido} disabled={somenteLeitura} aoMudar={(x) => setF((s) => ({ ...s, valorVendido: x }))} />
              </Campo>
            </div>
            {!somenteLeitura && veicEscolhido?.valorAnunciado && f.valorAnunciado !== veicEscolhido.valorAnunciado && (
              <div className="mt-4 flex flex-wrap items-center gap-3 rounded-2xl border border-atencao/40 bg-atencao/10 px-4 py-3 text-[13px]">
                <TriangleAlert className="size-4 shrink-0" />
                <span className="flex-1">
                  O preço da {veicEscolhido.rotulo} no estoque é <b>{brl(veicEscolhido.valorAnunciado)}</b>, diferente do valor anunciado.
                </span>
                <Botao
                  tamanho="sm"
                  onClick={() =>
                    setF((s) => ({
                      ...s,
                      valorAnunciado: veicEscolhido.valorAnunciado,
                      valorVendido: !s.valorVendido || s.valorVendido === s.valorAnunciado ? veicEscolhido.valorAnunciado : s.valorVendido,
                    }))
                  }
                >
                  Usar {brl(veicEscolhido.valorAnunciado)}
                </Botao>
              </div>
            )}
            {f.valorAnunciado && f.valorVendido ? (
              <p className="num mt-4 text-[14px]">
                {f.valorVendido < f.valorAnunciado ? (
                  <>
                    Desconto de <b>{brl(f.valorAnunciado - f.valorVendido, 2)}</b> ({Math.round(((f.valorAnunciado - f.valorVendido) / f.valorAnunciado) * 1000) / 10}%)
                  </>
                ) : f.valorVendido > f.valorAnunciado ? (
                  <>Vendido acima do anunciado em {brl(f.valorVendido - f.valorAnunciado, 2)}</>
                ) : (
                  "Vendido pelo valor anunciado"
                )}
                {permissoes.custo && veiculo?.custo ? <span className="block text-ink-2">Lucro bruto sobre o custo: {brl(f.valorVendido - veiculo.custo, 2)}</span> : null}
              </p>
            ) : null}
          </Etapa>
        )}

        {passo === 3 && (
          <Etapa titulo="4. Condições" texto="As condições padrão da loja entram no documento. Acrescente o que for específico desta venda.">
            {condicoesPadrao && <p className="mb-4 rounded-2xl bg-trilho p-4 text-[13px] leading-relaxed text-ink-2">{condicoesPadrao}</p>}
            <div className="grid gap-4">
              <Campo rotulo="Condições específicas desta venda">
                <AreaTexto value={f.condicoes} disabled={somenteLeitura} onChange={(e) => setF((s) => ({ ...s, condicoes: e.target.value }))} placeholder="Ex.: garantia da loja de 90 dias; entrega com revisão feita." />
              </Campo>
              <Campo rotulo="Observações">
                <AreaTexto value={f.observacoes} disabled={somenteLeitura} onChange={(e) => setF((s) => ({ ...s, observacoes: e.target.value }))} />
              </Campo>
            </div>
          </Etapa>
        )}

        {passo === 4 && (
          <Etapa titulo="5. Forma de pagamento" texto="Pode dividir entre várias formas. O total precisa bater com o valor vendido.">
            <EditorPagamentos valorVenda={f.valorVendido} pagamentos={f.pagamentos} aoMudar={(p) => setF((s) => ({ ...s, pagamentos: p }))} desabilitado={somenteLeitura} />
          </Etapa>
        )}

        {passo === 5 && (
          <Etapa titulo="6. Documentação" texto="Marque o que foi conferido. O que estiver marcado aparece no documento.">
            <div className="grid gap-2 sm:grid-cols-2">
              {Object.entries(CHECKLIST_DOCUMENTACAO).map(([k, r]) => (
                <label key={k} className="flex cursor-pointer items-center gap-3 rounded-xl border border-linha px-3 py-2.5 hover:border-linha-forte">
                  <input
                    type="checkbox"
                    className="size-4 accent-[var(--ink)]"
                    disabled={somenteLeitura}
                    checked={!!f.documentacao[k]}
                    onChange={(e) => setF((s) => ({ ...s, documentacao: { ...s.documentacao, [k]: e.target.checked } }))}
                  />
                  <span className="text-[13.5px]">{r}</span>
                </label>
              ))}
            </div>
          </Etapa>
        )}

        {passo === 6 && (
          <Etapa titulo="7. Revisão da venda">
            <div className="grid gap-5 lg:grid-cols-2">
              <dl className="grid grid-cols-2 gap-x-6 gap-y-4">
                <ItemInfo rotulo="Cliente">{d.cliente.nome}</ItemInfo>
                <ItemInfo rotulo="CPF">{d.cliente.cpf ? formatarCpf(d.cliente.cpf) : "—"}</ItemInfo>
                <ItemInfo rotulo="Veículo" className="col-span-2">
                  {veicEscolhido?.rotulo}
                </ItemInfo>
                <ItemInfo rotulo="Anunciado">{brl(f.valorAnunciado)}</ItemInfo>
                <ItemInfo rotulo="Vendido">{brl(f.valorVendido)}</ItemInfo>
              </dl>
              <div>
                <p className="mb-2 text-[12px] text-ink-3">Pagamentos</p>
                <ul className="flex flex-col gap-1 text-[13.5px]">
                  {f.pagamentos
                    .filter((p) => (p.valor ?? 0) > 0)
                    .map((p, i) => (
                      <li key={i} className="num flex justify-between gap-3">
                        <span>
                          {FORMAS_PAGAMENTO[p.forma]}
                          {p.entrada ? " · entrada" : ""}
                        </span>
                        <span>{brl(p.valor, 2)}</span>
                      </li>
                    ))}
                </ul>
              </div>
            </div>
            <div className={cn("mt-5 rounded-2xl border px-4 py-3 text-[13.5px]", pendencias.length ? "border-atencao/40 bg-atencao/10" : "border-bom/40 bg-bom/10")}>
              {pendencias.length ? (
                <>
                  <p className="font-semibold">Falta para gerar o documento:</p>
                  <p className="text-ink-2">{pendencias.join(", ")}.</p>
                </>
              ) : (
                <p className="font-semibold">Tudo certo para gerar o documento.</p>
              )}
            </div>
          </Etapa>
        )}

        {passo === 7 && (
          <Etapa titulo="8. Documento de venda" texto="Gerar o documento grava uma fotografia dos dados com um código único. É esse documento que o cliente vai assinar.">
            {v.documentoHash ? (
              <div className="flex flex-col gap-3">
                <p className="flex items-center gap-2 text-[14px]">
                  <FileText className="size-4" /> Documento gerado em {dataHora(v.documentoGeradoEm)} · código <span className="num font-semibold">{v.documentoHash.slice(0, 16).toUpperCase()}</span>
                </p>
                <div className="flex flex-wrap gap-2">
                  <a href={`/api/documentos/venda/${v.id}`} target="_blank" rel="noreferrer" className={classesBotao("primario")}>
                    <ExternalLink className="size-4" /> Visualizar PDF
                  </a>
                  <a href={`/api/documentos/venda/${v.id}?baixar=1`} className={classesBotao("secundario")}>
                    <Download className="size-4" /> Baixar
                  </a>
                  {!encerrada && v.status !== "assinada" && permissoes.editar && (
                    <Botao
                      carregando={pendente}
                      onClick={() =>
                        iniciar(async () => {
                          const r = await acaoGerarDocumento(v.id);
                          if (!r.ok) return void toast.error(r.erro);
                          toast.success("Documento gerado de novo");
                          router.refresh();
                        })
                      }
                    >
                      Gerar de novo
                    </Botao>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {pendencias.length > 0 && <p className="text-[13.5px] text-ink-2">Antes, complete: {pendencias.join(", ")}.</p>}
                <div>
                  <Botao
                    variante="primario"
                    disabled={pendencias.length > 0 || !permissoes.editar}
                    carregando={pendente}
                    onClick={() =>
                      iniciar(async () => {
                        const s = await acaoSalvarVenda(v.id, {
                          clienteId: f.cliente.id,
                          veiculoId: f.veiculoId,
                          valorAnunciado: f.valorAnunciado,
                          valorVendido: f.valorVendido,
                          condicoes: f.condicoes,
                          observacoes: f.observacoes,
                          documentacao: f.documentacao,
                          pagamentos: f.pagamentos.filter((p) => (p.valor ?? 0) > 0),
                        });
                        if (!s.ok) return void toast.error(s.erro);
                        const r = await acaoGerarDocumento(v.id);
                        if (!r.ok) return void toast.error(r.erro);
                        toast.success(r.mensagem);
                        router.refresh();
                        setPasso(8);
                      })
                    }
                  >
                    <FileText className="size-4" /> Gerar documento
                  </Botao>
                </div>
              </div>
            )}
          </Etapa>
        )}

        {passo === 8 && <PassoAssinatura d={d} permitido={permissoes.editar} aoAssinado={aoAssinado} />}

        {passo === 9 && (
          <Etapa titulo="10. Finalização">
            {v.status === "finalizada" ? (
              <div className="flex flex-col items-start gap-3">
                <p className="flex items-center gap-2 text-[16px] font-semibold">
                  <BadgeCheck className="size-5 text-bom" /> Venda finalizada em {dataHora(v.finalizadaEm)}
                </p>
                <p className="text-[13.5px] text-ink-2">O veículo saiu do estoque e o negócio está em Venda fechada.</p>
                <a href={`/api/documentos/venda/${v.id}`} target="_blank" rel="noreferrer" className={classesBotao("secundario")}>
                  <FileText className="size-4" /> Documento assinado (PDF)
                </a>
              </div>
            ) : (
              <>
                <ul className="mb-5 flex flex-col gap-2 text-[14px]">
                  <Checagem ok={pagamentosOk}>Pagamentos somam o valor vendido</Checagem>
                  <Checagem ok={!!v.documentoHash}>Documento gerado</Checagem>
                  <Checagem ok={!!assinaturaValida}>Documento assinado{assinaturaValida ? ` (${assinaturaValida.modo === "presencial" ? "no papel" : "pelo link"}, ${dataHora(assinaturaValida.assinadoEm)})` : ""}</Checagem>
                </ul>
                <Botao
                  variante="primario"
                  tamanho="lg"
                  disabled={v.status !== "assinada" || !permissoes.editar}
                  carregando={pendente}
                  onClick={() =>
                    iniciar(async () => {
                      const r = await acaoFinalizarVenda(v.id);
                      if (!r.ok) return void toast.error(r.erro);
                      toast.success(r.mensagem);
                      router.refresh();
                    })
                  }
                >
                  <ShieldCheck className="size-5" /> Finalizar venda
                </Botao>
              </>
            )}
          </Etapa>
        )}

        {passo <= 6 && (
          <div className="mt-6 flex flex-wrap justify-between gap-2 border-t border-linha pt-4">
            <Botao variante="fantasma" disabled={passo === 0} onClick={() => setPasso(passo - 1)}>
              Voltar
            </Botao>
            <div className="flex gap-2">
              {!somenteLeitura && passo < 6 && (
                <Botao carregando={pendente} onClick={() => salvar()}>
                  Salvar
                </Botao>
              )}
              <Botao variante="primario" carregando={pendente} onClick={avancar}>
                {passo === 6 ? "Ir para o documento" : somenteLeitura ? "Próximo" : "Salvar e continuar"}
              </Botao>
            </div>
          </div>
        )}
      </Painel>

      <Painel className="mt-4 p-5">
        <TituloSecao>Histórico da venda</TituloSecao>
        <LinhaDoTempo itens={d.historico.map((h) => ({ id: h.id, titulo: h.descricao, quando: dataHora(h.criadoEm), quem: h.usuarioNome }))} />
      </Painel>

      <DialogoCancelar aberto={cancelando} aoMudar={setCancelando} vendaId={v.id} />
    </>
  );
}

function Etapa({ titulo, texto, children }: { titulo: string; texto?: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-[17px] font-semibold tracking-tight">{titulo}</h2>
      {texto && <p className="mb-4 mt-1 text-[13px] text-ink-2">{texto}</p>}
      {!texto && <div className="mb-4" />}
      {children}
    </section>
  );
}

function Checagem({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return (
    <li className="flex items-center gap-2">
      <span className={cn("grid size-5 place-items-center rounded-full text-[11px] font-bold", ok ? "bg-bom text-white" : "bg-trilho text-ink-3")}>{ok ? "✓" : "·"}</span>
      <span className={ok ? "" : "text-ink-2"}>{children}</span>
    </li>
  );
}

const semAssinatura = () => () => {};

function PassoAssinatura({ d, permitido, aoAssinado }: { d: DetalheVenda; permitido: boolean; aoAssinado: () => void }) {
  const v = d.venda;
  const pendenteAtual = d.assinaturas.find((a) => a.status === "pendente" && a.modo === "eletronica" && a.documentoHash === v.documentoHash);
  const assinada = d.assinaturas.find((a) => a.status === "assinado" && a.documentoHash === v.documentoHash);
  const [token, setToken] = useState<string | null>(pendenteAtual?.token ?? null);
  const [nomePapel, setNomePapel] = useState(d.cliente.nome);
  const [pendente, iniciar] = useTransition();
  /* o endereço do site só existe no navegador: no servidor fica null e a tela
     hidrata igual, sem aviso de conteúdo diferente */
  const origem = useSyncExternalStore(semAssinatura, () => window.location.origin, () => null);
  const url = token && origem ? `${origem}/assinar/${token}` : null;

  /* acompanha a assinatura pelo link sem precisar recarregar a tela */
  useEffect(() => {
    if (!token || v.status !== "aguardando_assinatura") return;
    const id = setInterval(async () => {
      const s = await acaoStatusAssinatura(v.id);
      if (s.venda === "assinada") {
        clearInterval(id);
        toast.success("O cliente assinou o documento");
        aoAssinado();
      }
    }, 5000);
    return () => clearInterval(id);
  }, [token, v.id, v.status, aoAssinado]);

  if (!v.documentoHash)
    return (
      <Etapa titulo="9. Assinatura">
        <p className="text-[14px] text-ink-2">Gere o documento no passo anterior para pedir a assinatura.</p>
      </Etapa>
    );

  if (assinada || v.status === "assinada" || v.status === "finalizada")
    return (
      <Etapa titulo="9. Assinatura">
        <p className="flex items-center gap-2 text-[15px] font-semibold">
          <BadgeCheck className="size-5 text-bom" /> Assinado {assinada?.modo === "presencial" ? "no papel" : "pelo link"} por {assinada?.assinanteNome} em {dataHora(assinada?.assinadoEm)}
        </p>
        <p className="mt-1 text-[13px] text-ink-2">O PDF já traz a assinatura e o registro de aceite.</p>
      </Etapa>
    );

  const mensagem = url ? `Olá, ${d.cliente.nome.split(" ")[0]}! Segue o documento da sua compra na Gêmeos Motors para você conferir e assinar: ${url}` : "";
  return (
    <Etapa titulo="9. Assinatura" texto="Escolha como o cliente vai assinar. A venda só pode ser finalizada depois disso.">
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-linha p-4">
          <p className="font-semibold">Pelo link (celular ou tablet)</p>
          <p className="mb-3 mt-1 text-[13px] text-ink-2">O cliente vê o documento, confirma nome e CPF e assina com o dedo. Fica registrado data, hora e IP. Não é certificado digital ICP-Brasil.</p>
          {url ? (
            <div className="flex flex-col gap-2">
              <Entrada readOnly value={url} onFocus={(e) => e.target.select()} aria-label="Link de assinatura" />
              <div className="flex flex-wrap gap-2">
                <Botao
                  tamanho="sm"
                  onClick={async () => {
                    await navigator.clipboard.writeText(url);
                    toast.success("Link copiado");
                  }}
                >
                  <Copy className="size-4" /> Copiar
                </Botao>
                {(d.cliente.whatsapp || d.cliente.telefone) && (
                  <a className={classesBotao("secundario", "sm")} href={`https://wa.me/${telefoneWhatsapp(d.cliente.whatsapp ?? d.cliente.telefone)}?text=${encodeURIComponent(mensagem)}`} target="_blank" rel="noreferrer">
                    <MessageSquare className="size-4" /> Enviar no WhatsApp
                  </a>
                )}
                <a className={classesBotao("secundario", "sm")} href={url} target="_blank" rel="noreferrer">
                  <ExternalLink className="size-4" /> Abrir neste aparelho
                </a>
              </div>
              <p className="text-[12px] text-ink-3">Aguardando a assinatura… esta tela atualiza sozinha.</p>
            </div>
          ) : (
            <Botao
              variante="primario"
              disabled={!permitido}
              carregando={pendente}
              onClick={() =>
                iniciar(async () => {
                  const r = await acaoLinkAssinatura(v.id);
                  if (!r.ok) return void toast.error(r.erro);
                  setToken(r.dados.token);
                })
              }
            >
              Gerar link de assinatura
            </Botao>
          )}
        </div>
        <div className="rounded-2xl border border-linha p-4">
          <p className="font-semibold">No papel (presencial)</p>
          <p className="mb-3 mt-1 text-[13px] text-ink-2">Imprima o documento, o cliente assina na loja e você confirma aqui. Guarde a via assinada.</p>
          <a href={`/api/documentos/venda/${v.id}`} target="_blank" rel="noreferrer" className={classesBotao("secundario", "sm", "mb-3")}>
            <Printer className="size-4" /> Abrir para imprimir
          </a>
          <Campo rotulo="Nome de quem assinou">
            <Entrada value={nomePapel} onChange={(e) => setNomePapel(e.target.value)} />
          </Campo>
          <Botao
            className="mt-3"
            disabled={!permitido}
            carregando={pendente}
            onClick={() =>
              iniciar(async () => {
                const r = await acaoAssinaturaPresencial(v.id, nomePapel);
                if (!r.ok) return void toast.error(r.erro);
                toast.success(r.mensagem);
                aoAssinado();
              })
            }
          >
            Confirmar assinatura no papel
          </Botao>
        </div>
      </div>
    </Etapa>
  );
}

function DialogoCancelar({ aberto, aoMudar, vendaId }: { aberto: boolean; aoMudar: (v: boolean) => void; vendaId: number }) {
  const [motivo, setMotivo] = useState("");
  const [pendente, iniciar] = useTransition();
  const router = useRouter();
  return (
    <Dialogo
      aberto={aberto}
      aoMudar={aoMudar}
      titulo="Cancelar venda"
      descricao="O veículo volta para o estoque e o negócio volta para Negociando. Fica registrado no histórico."
      largura="sm"
      rodape={
        <Botao
          variante="perigo"
          carregando={pendente}
          onClick={() =>
            iniciar(async () => {
              const r = await acaoCancelarVenda(vendaId, motivo);
              if (!r.ok) return void toast.error(r.erro);
              toast.success(r.mensagem);
              aoMudar(false);
              router.refresh();
            })
          }
        >
          Cancelar venda
        </Botao>
      }
    >
      <Campo rotulo="Motivo" obrigatorio>
        <AreaTexto value={motivo} onChange={(e) => setMotivo(e.target.value)} />
      </Campo>
    </Dialogo>
  );
}
