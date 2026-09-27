"use client";
import { useEffect, useMemo, useState } from "react";
import { FileText, RefreshCw } from "lucide-react";
import { acaoListarModelos } from "@/app/sistema/conversas/acoes";
import { montarTexto, type ModeloMensagem } from "@/lib/mensageria/modelos";
import { Dialogo } from "@/components/ui/dialogo";
import { Botao } from "@/components/ui/botao";
import { Campo, Entrada, Selecao } from "@/components/ui/campos";
import type { EnvioChat } from "./compositor";

/* Janela "Enviar modelo aprovado": fora das 24 h a Meta só aceita modelo (template) aprovado.
   Lista os aprovados da conta, pede os campos ({{1}}, {{nome}}...), mostra a prévia e envia. */
export function DialogoModelos({
  aberto,
  aoMudar,
  nomeCliente,
  aoEnviar,
}: {
  aberto: boolean;
  aoMudar: (v: boolean) => void;
  nomeCliente: string | null;
  aoEnviar: (e: EnvioChat) => Promise<boolean>;
}) {
  const [modelos, setModelos] = useState<ModeloMensagem[] | null>(null);
  const [simulado, setSimulado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [escolhido, setEscolhido] = useState("");
  const [valores, setValores] = useState<string[]>([]);
  const [enviando, setEnviando] = useState(false);

  async function carregar() {
    setCarregando(true);
    setErro(null);
    const r = await acaoListarModelos();
    setCarregando(false);
    if (!r.ok) return setErro(r.erro);
    setModelos(r.dados.modelos);
    setSimulado(r.dados.simulado);
  }
  /* busca a lista na primeira vez que a janela abre */
  useEffect(() => {
    if (!aberto || modelos) return;
    const t = setTimeout(() => void carregar(), 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aberto]);

  const m = useMemo(() => modelos?.find((x) => `${x.nome}|${x.idioma}` === escolhido) ?? null, [modelos, escolhido]);
  const primeiroNome = (nomeCliente ?? "").trim().split(/\s+/)[0] ?? "";

  function escolher(chave: string) {
    setEscolhido(chave);
    const novo = modelos?.find((x) => `${x.nome}|${x.idioma}` === chave);
    /* o primeiro campo quase sempre é o nome do cliente: já vem preenchido (dá para trocar) */
    setValores(novo ? novo.campos.map((c, i) => (i === 0 && primeiroNome && (!c.nomeado || /nome|name/i.test(c.chave)) ? primeiroNome : "")) : []);
  }

  const faltando = m ? m.campos.some((_, i) => !(valores[i] ?? "").trim()) : true;
  const aprovados = modelos?.filter((x) => x.suportado) ?? [];
  const fora = modelos?.filter((x) => !x.suportado) ?? [];

  return (
    <Dialogo
      aberto={aberto}
      aoMudar={aoMudar}
      titulo="Enviar modelo aprovado"
      descricao="Fora da janela de 24 horas a Meta só deixa a loja escrever com um modelo aprovado. Quando o cliente responder, a conversa volta ao normal."
      rodape={
        <>
          <Botao onClick={() => aoMudar(false)}>Cancelar</Botao>
          <Botao
            variante="primario"
            carregando={enviando}
            disabled={!m || faltando}
            onClick={async () => {
              if (!m) return;
              setEnviando(true);
              const ok = await aoEnviar({ modo: "modelo", nome: m.nome, idioma: m.idioma, valores: m.campos.map((_, i) => valores[i].trim()), previa: montarTexto(m, valores) });
              setEnviando(false);
              if (ok) {
                setEscolhido("");
                setValores([]);
                aoMudar(false);
              }
            }}
          >
            Enviar modelo
          </Botao>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {erro && <p className="rounded-xl bg-critico/10 px-3 py-2 text-[13px] text-critico">{erro}</p>}
        {simulado && <p className="rounded-xl bg-trilho px-3 py-2 text-[12.5px] text-ink-2">Modo simulado: estes dois modelos são exemplos. Com a API Oficial ligada, aparecem os modelos aprovados da sua conta na Meta.</p>}
        {carregando && <p className="text-[13px] text-ink-3">Buscando os modelos na Meta…</p>}
        {modelos && !aprovados.length && (
          <p className="text-[13px] text-ink-2">
            Nenhum modelo aprovado na conta. Crie em business.facebook.com → Gerenciador do WhatsApp → Modelos de mensagem; a Meta costuma aprovar em minutos.
          </p>
        )}
        {modelos && aprovados.length > 0 && (
          <Campo rotulo="Modelo">
            <Selecao value={escolhido} onChange={(e) => escolher(e.target.value)}>
              <option value="">Escolha um modelo…</option>
              {aprovados.map((x) => (
                <option key={`${x.nome}|${x.idioma}`} value={`${x.nome}|${x.idioma}`}>
                  {x.nome.replace(/_/g, " ")} ({x.idioma})
                </option>
              ))}
            </Selecao>
          </Campo>
        )}
        {m?.campos.map((c, i) => (
          <Campo key={c.chave} rotulo={c.nomeado ? `Campo "${c.chave}"` : `Campo {{${c.chave}}}`}>
            <Entrada
              value={valores[i] ?? ""}
              maxLength={1024}
              onChange={(e) => setValores((v) => Object.assign([...v], { [i]: e.target.value.replace(/[\r\n\t]/g, " ") }))}
            />
          </Campo>
        ))}
        {m && (
          <div>
            <p className="mb-1 text-[12px] font-semibold text-ink-2">Prévia do que o cliente recebe</p>
            <div className="whitespace-pre-wrap rounded-2xl bg-bolha-saida px-3 py-2 text-[14px] leading-snug">{montarTexto(m, valores)}</div>
            {m.botoes.length > 0 && <p className="mt-1 text-[12px] text-ink-3">Botões: {m.botoes.join(" · ")}</p>}
          </div>
        )}
        {fora.length > 0 && (
          <details className="text-[12px] text-ink-3">
            <summary className="cursor-pointer">{fora.length} modelo(s) aprovado(s) que o sistema ainda não envia</summary>
            <ul className="mt-1 list-disc pl-5">
              {fora.map((x) => (
                <li key={`${x.nome}|${x.idioma}`}>
                  {x.nome}: {x.motivo}
                </li>
              ))}
            </ul>
          </details>
        )}
        {modelos && (
          <button type="button" className="flex items-center gap-1 self-start text-[12px] text-ink-3 hover:text-ink" onClick={() => void carregar()}>
            <RefreshCw className="size-3.5" /> Atualizar a lista
          </button>
        )}
      </div>
    </Dialogo>
  );
}

/** Aviso acima da caixa de texto quando a janela de 24 h está fechada. */
export function AvisoJanela({ aoAbrir }: { aoAbrir: () => void }) {
  return (
    <div className="mb-2 flex items-center gap-2 rounded-xl border border-marca/40 bg-marca/10 px-3 py-2 text-[12.5px]">
      <FileText className="size-4 shrink-0 text-marca" />
      <span className="min-w-0 flex-1">Faz mais de 24 h que o cliente não escreve (ou ele nunca escreveu). A Meta só aceita um modelo aprovado.</span>
      <Botao tamanho="sm" variante="primario" onClick={aoAbrir}>
        Enviar modelo
      </Botao>
    </div>
  );
}
