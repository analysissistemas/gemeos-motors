"use client";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { Bot, RefreshCw, Send } from "lucide-react";
import { Painel } from "@/components/ui/basicos";
import { Botao } from "@/components/ui/botao";
import { dataHora, formatarTelefone } from "@/lib/formato";
import { acaoAvisoCredito, acaoCriarModeloCredito, acaoSalvarAvisoCredito, acaoTesteAvisoCredito } from "./avisos-acoes";

/* Aviso do crédito da IA no WhatsApp dos programadores e do dono (usuário, 12/11/2026). Só administrador. */

type Dados = Extract<Awaited<ReturnType<typeof acaoAvisoCredito>>, { ok: true }>["dados"];

const SITUACAO: Record<string, string> = { APPROVED: "Aprovado pela Meta ✅", PENDING: "Em análise na Meta (costuma levar minutos)", REJECTED: "Recusado pela Meta", PAUSED: "Pausado pela Meta", DISABLED: "Desativado pela Meta" };

export function CreditoNoWhatsapp() {
  const [d, setD] = useState<Dados | null>(null);
  const [lista, setLista] = useState("");
  const [pendente, iniciar] = useTransition();

  const carregar = () =>
    iniciar(async () => {
      const r = await acaoAvisoCredito();
      if (!r.ok) return void toast.error(r.erro);
      setD(r.dados);
      setLista(r.dados.telefones.map(formatarTelefone).join("\n"));
    });
  useEffect(() => {
    const t = setTimeout(carregar, 0);
    return () => clearTimeout(t);
  }, []);
  const recarregar = async () => {
    const n = await acaoAvisoCredito();
    if (n.ok) setD(n.dados);
  };

  return (
    <Painel id="credito-whatsapp" className="mb-4 p-5">
      <h2 className="flex items-center gap-2 text-[16px] font-semibold">
        <Bot className="size-4.5" /> Aviso do crédito da IA no WhatsApp
      </h2>
      <p className="mt-1 text-[13px] text-ink-2">
        Quando o crédito da OpenAI estiver baixo, acabando ou acabar, estes números recebem um aviso pelo WhatsApp da loja (das 8h às 21h; se acabar de madrugada, avisa na hora). Para a conta funcionar, informe o saldo na Visão geral sempre que colocar crédito.
      </p>
      <label className="mt-4 block text-[12.5px] font-medium text-ink-2" htmlFor="credito-tels">
        WhatsApp com DDD, um por linha
      </label>
      <textarea
        id="credito-tels"
        value={lista}
        onChange={(e) => setLista(e.target.value)}
        rows={3}
        placeholder={"(81) 99999-9999\n(81) 98888-8888"}
        className="mt-1 w-full rounded-2xl border border-linha bg-plano/60 px-3 py-2 text-[13.5px] outline-none focus:border-linha-forte"
      />
      <div className="mt-2 flex flex-wrap gap-2">
        <Botao
          carregando={pendente}
          onClick={() =>
            iniciar(async () => {
              const r = await acaoSalvarAvisoCredito(lista);
              if (!r.ok) return void toast.error(r.erro);
              toast.success(r.mensagem);
              await recarregar();
            })
          }
        >
          Salvar
        </Botao>
        <Botao
          variante="secundario"
          carregando={pendente}
          disabled={!d?.telefones.length}
          onClick={() =>
            iniciar(async () => {
              const r = await acaoTesteAvisoCredito();
              if (!r.ok) return void toast.error(r.erro);
              toast.success(`Mensagem enviada (${r.dados})`);
              await recarregar();
            })
          }
        >
          <Send className="size-4" /> Avisar todos que estão cadastrados
        </Botao>
      </div>

      <div className="mt-4 rounded-2xl border border-linha p-3 text-[13px]">
        <p>
          <b>Modelo de mensagem na Meta</b> (obrigatório para chegar a quem não escreveu para a loja nas últimas 24 h):{" "}
          {d?.erroModelo ? <span className="text-critico">{d.erroModelo}</span> : d?.modelo ? SITUACAO[d.modelo.status] ?? d.modelo.status : d ? "ainda não criado" : "…"}
          {d?.modelo?.motivo ? <span className="text-critico"> ({d.modelo.motivo})</span> : null}
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          {!d?.modelo && (
            <Botao
              tamanho="sm"
              carregando={pendente}
              onClick={() =>
                iniciar(async () => {
                  const r = await acaoCriarModeloCredito();
                  if (!r.ok) return void toast.error(r.erro);
                  toast.success(`Modelo enviado para a Meta: ${SITUACAO[r.dados.status] ?? r.dados.status}`);
                  await recarregar();
                })
              }
            >
              Criar modelo na Meta
            </Botao>
          )}
          <Botao tamanho="sm" variante="fantasma" carregando={pendente} onClick={carregar}>
            <RefreshCw className="size-4" /> Atualizar
          </Botao>
        </div>
        {d?.ultimo && (
          <div className="mt-2 text-ink-2">
            <p>
              Último aviso: {dataHora(d.ultimo.em)} · &quot;{d.ultimo.frase}&quot;
            </p>
            <ul className="mt-1">
              {d.ultimo.envios.map((e) => (
                <li key={e.telefone} className={e.ok ? "" : "text-critico"}>
                  {formatarTelefone(e.telefone)}: {e.ok ? `a Meta aceitou (${e.como})` : `não saiu (${e.erro})`}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Painel>
  );
}
