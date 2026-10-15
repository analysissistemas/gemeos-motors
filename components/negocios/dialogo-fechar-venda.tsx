"use client";
import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { CircleDollarSign, Sparkles, TriangleAlert } from "lucide-react";
import { brl } from "@/lib/formato";
import { FORMAS_PAGAMENTO } from "@/lib/dominio";
import { Botao, classesBotao } from "@/components/ui/botao";
import { Campo, CampoDinheiro, Selecao } from "@/components/ui/campos";
import { Dialogo, RodapeDialogo } from "@/components/ui/dialogo";
import { EditorPagamentos, type Pagamento } from "@/components/vendas/editor-pagamentos";
import { acaoFecharVenda, acaoSugestaoVenda, acaoVeiculosVendaveis, type SugestaoVenda } from "@/app/sistema/funil/acoes";

type Veic = { id: number; rotulo: string; valorAnunciado: number | null; status: string };
type Alvo = { id: number; cliente: string; veiculoId: number | null; valorAnunciado: number | null; valorProposta: number | null };

/* Etapa obrigatória de "Venda fechada": sem valores e pagamentos que
   batem com o valor vendido, o negócio não muda de coluna. */
export function DialogoFecharVenda({
  negocio,
  aoMudar,
  aoConcluir,
}: {
  negocio: Alvo | null;
  aoMudar: (v: boolean) => void;
  aoConcluir: (vendaId: number | null) => void;
}) {
  const venda = useRef<number | null>(null);
  const fechar = () => {
    aoMudar(false);
    if (venda.current) {
      const id = venda.current;
      venda.current = null;
      aoConcluir(id);
    }
  };
  return (
    <Dialogo aberto={!!negocio} aoMudar={(v) => (v ? aoMudar(true) : fechar())} titulo="Fechar venda" descricao={negocio ? `Negócio de ${negocio.cliente}` : undefined} largura="lg">
      {negocio && <CorpoFechar key={negocio.id} negocio={negocio} aoRegistrar={(id) => (venda.current = id)} aoFechar={fechar} aoCancelar={() => aoMudar(false)} />}
    </Dialogo>
  );
}

function CorpoFechar({ negocio, aoRegistrar, aoFechar, aoCancelar }: { negocio: Alvo; aoRegistrar: (id: number) => void; aoFechar: () => void; aoCancelar: () => void }) {
  const [veiculos, setVeiculos] = useState<Veic[] | null>(null);
  const [veiculoId, setVeiculoId] = useState(negocio.veiculoId ? String(negocio.veiculoId) : "");
  const [anunciado, setAnunciado] = useState<number | null>(negocio.valorAnunciado);
  const [vendido, setVendido] = useState<number | null>(negocio.valorProposta ?? negocio.valorAnunciado);
  const [pags, setPags] = useState<Pagamento[]>([{ forma: "pix", valor: negocio.valorProposta ?? negocio.valorAnunciado, entrada: false }]);
  const [erros, setErros] = useState<Record<string, string>>({});
  const [vendaId, setVendaId] = useState<number | null>(null);
  const [pendente, iniciar] = useTransition();
  const [sugestao, setSugestao] = useState<SugestaoVenda | null>(null);

  useEffect(() => {
    acaoVeiculosVendaveis().then(setVeiculos);
    /* o que o cliente disse no WhatsApp já entra: a moto, o preço dela e o pagamento (dono, 15/10/2026) */
    acaoSugestaoVenda(negocio.id).then((sg) => {
      if (!sg) return;
      setSugestao(sg);
      if (sg.veiculoId) setVeiculoId(String(sg.veiculoId));
      if (sg.valorAnunciado) setAnunciado(sg.valorAnunciado);
      const valor = sg.valorVendido ?? sg.valorAnunciado ?? negocio.valorProposta ?? negocio.valorAnunciado;
      if (valor) setVendido(valor);
      setPags([{ forma: sg.pagamento?.forma ?? "pix", valor, entrada: false, observacao: sg.pagamento?.observacao ?? null }]);
    });
  }, [negocio.id, negocio.valorAnunciado, negocio.valorProposta]);

  /* o preço é o da moto escolhida; o vendido e o pagamento único acompanham enquanto ninguém digitou outro */
  function escolher(id: string) {
    setVeiculoId(id);
    const v = veiculos?.find((x) => x.id === Number(id));
    if (!v?.valorAnunciado) return;
    const novo = v.valorAnunciado;
    if (!vendido || vendido === anunciado) {
      setVendido(novo);
      if (pags.length === 1 && (!pags[0].valor || pags[0].valor === vendido)) setPags([{ ...pags[0], valor: novo }]);
    }
    setAnunciado(novo);
  }

  if (vendaId)
    return (
      <>
        <div className="flex flex-col gap-2 text-[14px]">
          <p>
            Venda registrada. O negócio foi para <b>Venda fechada</b> e o veículo ficou reservado.
          </p>
          <p className="text-ink-2">
            A venda só é <b>finalizada</b> depois do documento gerado e assinado pelo cliente. Continue pela tela da venda: documentação, PDF, assinatura e finalização.
          </p>
        </div>
        <RodapeDialogo>
          <Botao variante="fantasma" onClick={aoFechar}>
            Voltar
          </Botao>
          <Link href={`/sistema/vendas/${vendaId}`} className={classesBotao("primario")}>
            Gerar documento e assinatura
          </Link>
        </RodapeDialogo>
      </>
    );

  return (
    <>
      {sugestao && (sugestao.veiculoId || sugestao.pagamento) && (
        <div className="mb-4 flex items-start gap-2 rounded-2xl border border-linha bg-trilho/50 px-4 py-3 text-[13px]">
          <Sparkles className="mt-0.5 size-4 shrink-0 text-ink-2" />
          <span>
            Preenchido com o que o cliente disse no WhatsApp. Confira antes de registrar.
            {sugestao.veiculoId && sugestao.interesse && (
              <span className="block text-ink-2">Moto: pediu “{sugestao.interesse}”.</span>
            )}
            {sugestao.pagamento && (
              <span className="block text-ink-2">
                Pagamento: {FORMAS_PAGAMENTO[sugestao.pagamento.forma]}
                {sugestao.pagamento.observacao ? ` (${sugestao.pagamento.observacao})` : ""}, ele disse “{sugestao.ditoPagamento}”.
              </span>
            )}
          </span>
        </div>
      )}
      {sugestao && sugestao.faltaCliente.length > 0 && (
        <div className="mb-4 flex items-start gap-2 rounded-2xl border border-atencao/40 bg-atencao/10 px-4 py-3 text-[13px]">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" />
          <span>
            Falta <b>{sugestao.faltaCliente.join(" e ")}</b> do cliente para o documento. Depois de registrar, você preenche na própria tela da venda.
          </span>
        </div>
      )}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Campo rotulo="Veículo vendido" obrigatorio erro={erros.veiculoId} className="sm:col-span-2">
          {veiculos === null ? (
            <div className="h-10 animate-pulse rounded-xl bg-trilho" />
          ) : veiculos.length === 0 ? (
            <p className="rounded-xl border border-linha px-3 py-2.5 text-[13px] text-ink-2">
              Nenhum veículo disponível no estoque.{" "}
              <Link href="/sistema/estoque" className="font-semibold underline">
                Dar entrada no veículo
              </Link>{" "}
              antes de fechar a venda.
            </p>
          ) : (
            <Selecao
              value={veiculoId}
              invalido={!!erros.veiculoId}
              onChange={(e) => escolher(e.target.value)}
            >
              <option value="">Escolha o veículo</option>
              {veiculos.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.rotulo}
                  {v.valorAnunciado ? ` — ${brl(v.valorAnunciado)}` : ""}
                  {v.status === "reservado" ? " (reservado)" : ""}
                </option>
              ))}
            </Selecao>
          )}
        </Campo>
        <Campo rotulo="Valor anunciado" obrigatorio erro={erros.valorAnunciado} dica="Quanto o veículo estava anunciado.">
          <CampoDinheiro valor={anunciado} aoMudar={setAnunciado} invalido={!!erros.valorAnunciado} />
        </Campo>
        <Campo
          rotulo="Valor vendido"
          obrigatorio
          erro={erros.valorVendido}
          dica={anunciado && vendido && anunciado !== vendido ? `${vendido < anunciado ? "Desconto" : "Acréscimo"} de ${brl(Math.abs(anunciado - vendido), 2)}` : "Quanto realmente foi vendido."}
        >
          <CampoDinheiro valor={vendido} aoMudar={setVendido} invalido={!!erros.valorVendido} />
        </Campo>
        <div className="sm:col-span-2">
          <p className="mb-2 text-[12px] font-medium text-ink-2">
            Forma de pagamento <span className="text-critico">*</span>
          </p>
          <EditorPagamentos valorVenda={vendido} pagamentos={pags} aoMudar={setPags} />
        </div>
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
              const r = await acaoFecharVenda({ negocioId: negocio.id, veiculoId, valorAnunciado: anunciado, valorVendido: vendido, pagamentos: pags });
              if (!r.ok) {
                setErros(r.campos ?? {});
                toast.error(r.erro);
                return;
              }
              toast.success(r.mensagem);
              aoRegistrar(r.dados.vendaId);
              setVendaId(r.dados.vendaId);
            })
          }
        >
          <CircleDollarSign className="size-4" /> Registrar venda
        </Botao>
      </RodapeDialogo>
    </>
  );
}
