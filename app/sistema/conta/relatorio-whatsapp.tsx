"use client";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { MessageCircle, RefreshCw, Send } from "lucide-react";
import { Painel } from "@/components/ui/basicos";
import { Botao } from "@/components/ui/botao";
import { Campo, Entrada } from "@/components/ui/campos";
import { dataHora, formatarTelefone } from "@/lib/formato";
import { acaoCriarModeloRelatorio, acaoEnviarRelatorioAgora, acaoSalvarWhatsappRelatorio, acaoWhatsappRelatorio } from "./avisos-acoes";

/* Relatório das 8h no WhatsApp pessoal do Milton (dono, 16/10/2026). Só administrador. */

type Dados = Extract<Awaited<ReturnType<typeof acaoWhatsappRelatorio>>, { ok: true }>["dados"];

const SITUACAO: Record<string, string> = { APPROVED: "Aprovado pela Meta ✅", PENDING: "Em análise na Meta (costuma levar minutos)", REJECTED: "Recusado pela Meta", PAUSED: "Pausado pela Meta", DISABLED: "Desativado pela Meta" };

export function RelatorioNoWhatsapp() {
  const [d, setD] = useState<Dados | null>(null);
  const [tel, setTel] = useState("");
  const [nome, setNome] = useState("Milton");
  const [pendente, iniciar] = useTransition();

  const carregar = () =>
    iniciar(async () => {
      const r = await acaoWhatsappRelatorio();
      if (!r.ok) return void toast.error(r.erro);
      setD(r.dados);
      setTel(r.dados.telefone ? formatarTelefone(r.dados.telefone) : "");
      setNome(r.dados.nome);
    });
  useEffect(() => {
    const t = setTimeout(carregar, 0);
    return () => clearTimeout(t);
  }, []);

  return (
    <Painel id="relatorio-whatsapp" className="mb-4 p-5">
      <h2 className="flex items-center gap-2 text-[16px] font-semibold">
        <MessageCircle className="size-4.5" /> Relatório das 8h no WhatsApp
      </h2>
      <p className="mt-1 text-[13px] text-ink-2">
        Todo dia às 8h o relatório da manhã vai para este WhatsApp, pelo número da loja. A conversa com este número fica sempre em <b>Humano</b>: a IA não responde a ele.
      </p>
      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <Campo rotulo="WhatsApp (com DDD)">
          <Entrada value={tel} onChange={(e) => setTel(e.target.value)} placeholder="(81) 99386-9767" inputMode="tel" />
        </Campo>
        <Campo rotulo="Nome no bom-dia">
          <Entrada value={nome} onChange={(e) => setNome(e.target.value)} />
        </Campo>
        <Botao
          carregando={pendente}
          onClick={() =>
            iniciar(async () => {
              const r = await acaoSalvarWhatsappRelatorio(tel, nome);
              if (!r.ok) return void toast.error(r.erro);
              toast.success(r.mensagem);
              const n = await acaoWhatsappRelatorio();
              if (n.ok) setD(n.dados);
            })
          }
        >
          Salvar
        </Botao>
      </div>

      <div className="mt-4 rounded-2xl border border-linha p-3 text-[13px]">
        <p>
          <b>Modelo de mensagem na Meta</b> (obrigatório para escrever fora das 24 h):{" "}
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
                  const r = await acaoCriarModeloRelatorio();
                  if (!r.ok) return void toast.error(r.erro);
                  toast.success(`Modelo enviado para a Meta: ${SITUACAO[r.dados.status] ?? r.dados.status}`);
                  const n = await acaoWhatsappRelatorio();
                  if (n.ok) setD(n.dados);
                })
              }
            >
              Criar modelo na Meta
            </Botao>
          )}
          <Botao tamanho="sm" variante="fantasma" carregando={pendente} onClick={carregar}>
            <RefreshCw className="size-4" /> Atualizar
          </Botao>
          <Botao
            tamanho="sm"
            carregando={pendente}
            disabled={!d?.telefone}
            onClick={() =>
              iniciar(async () => {
                const r = await acaoEnviarRelatorioAgora();
                if (!r.ok) return void toast.error(r.erro);
                toast.success(`Relatório enviado (${r.dados})`);
                const n = await acaoWhatsappRelatorio();
                if (n.ok) setD(n.dados);
              })
            }
          >
            <Send className="size-4" /> Enviar agora (teste)
          </Botao>
        </div>
        {d?.ultimoEnvio && (
          <p className={d.ultimoEnvio.ok ? "mt-2 text-ink-2" : "mt-2 text-critico"}>
            Último envio: {dataHora(d.ultimoEnvio.em)} · {d.ultimoEnvio.como} · {d.ultimoEnvio.ok ? "saiu" : `não saiu (${d.ultimoEnvio.erro})`}
          </p>
        )}
        {d?.ultimaMsgEm && <p className="mt-1 text-ink-3">O Milton escreveu para a loja em {dataHora(d.ultimaMsgEm)} (dentro de 24 h vai o relatório inteiro em texto).</p>}
      </div>
    </Painel>
  );
}
