"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Painel, Selo, TituloSecao } from "@/components/ui/basicos";
import { Botao } from "@/components/ui/botao";
import { Alternar, AreaTexto, Campo, Entrada } from "@/components/ui/campos";
import { Dialogo } from "@/components/ui/dialogo";
import { OctagonAlert, Power } from "lucide-react";
import { MOTIVOS_BLOQUEIO, PERMISSOES_IA, type ControleIa } from "@/lib/ia/permissoes";
import type { Violacao } from "@/lib/ia/validador";
import { acaoSalvarControle, acaoValidarTexto } from "./acoes";

export type Execucao = { id: number; criadoEm: Date; origem: string; texto: string; enviada: boolean; motivo: string | null; violacoes: Violacao[] | null; contato: string | null };

const quando = (d: Date) => new Date(d).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

export function AbaControle({ controle, execucoes }: { controle: ControleIa; execucoes: Execucao[] }) {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();
  const [c, setC] = useState<ControleIa>(controle);
  const mudou = JSON.stringify(c) !== JSON.stringify(controle);

  const [teste, setTeste] = useState("");
  /* confirmação para desligar: só aparece o botão com DESLIGAR digitado em maiúsculas */
  const [desligando, setDesligando] = useState(false);
  const [palavra, setPalavra] = useState("");
  const desligar = () =>
    iniciar(async () => {
      const r = await acaoSalvarControle({ ...c, ligada: false }, palavra);
      if (!r.ok) return void toast.error(r.erro);
      toast.success("IA desligada em todos os atendimentos.");
      setDesligando(false);
      setPalavra("");
      setC({ ...c, ligada: false });
      router.refresh();
    });
  const [resultado, setResultado] = useState<{ aprovada: boolean; violacoes: Violacao[] } | null>(null);

  return (
    <div className="flex flex-col gap-4">
      <Painel className="p-5">
        <TituloSecao acao={c.ligada ? <Selo tom="bom">IA ligada</Selo> : <Selo tom="neutro">IA desligada</Selo>}>Chave geral e permissões</TituloSecao>
        {controle.ligada && (
          <Botao variante="perigo" className="mb-4" onClick={() => setDesligando(true)}>
            <Power className="size-4" /> Desligar IA
          </Botao>
        )}
        <p className="mb-4 text-[13px] text-ink-2">
          Com a chave geral desligada a IA não faz nada: nenhuma análise, nenhuma resposta, nenhuma chamada ao modelo. O sistema continua funcionando normalmente. Toda resposta da IA passa pelo validador antes de poder chegar ao cliente.
        </p>
        <Alternar marcado={c.ligada} aoMudar={(v) => setC({ ...c, ligada: v })} rotulo="IA ligada (chave geral)" descricao="Desligue a qualquer momento para parar tudo imediatamente." />
        <div className="mt-3 flex flex-col gap-2">
          {PERMISSOES_IA.map((p) => (
            <div key={p.chave} className={c.ligada ? "" : "opacity-60"}>
              <Alternar
                marcado={c.permissoes[p.chave]}
                aoMudar={(v) => setC({ ...c, permissoes: { ...c.permissoes, [p.chave]: v } })}
                rotulo={p.efeito ? p.rotulo : `${p.rotulo} (ainda sem efeito)`}
                descricao={p.descricao}
              />
            </div>
          ))}
        </div>
        <div className="mt-4 flex justify-end">
          <Botao
            variante="primario"
            carregando={pendente}
            disabled={!mudou}
            onClick={() => {
              /* desmarcar a chave geral também passa pela confirmação com DESLIGAR */
              if (!c.ligada && controle.ligada) return setDesligando(true);
              if (c.ligada && !controle.ligada && !confirm("Ligar a IA? Ela só envia mensagens se a permissão de envio estiver marcada, e sempre depois do validador.")) return;
              iniciar(async () => {
                const r = await acaoSalvarControle(c);
                if (!r.ok) return void toast.error(r.erro);
                toast.success(r.mensagem);
                router.refresh();
              });
            }}
          >
            Salvar controle
          </Botao>
        </div>
      </Painel>

      <Dialogo
        aberto={desligando}
        aoMudar={(v) => {
          setDesligando(v);
          if (!v) setPalavra("");
        }}
        titulo="Desligar a IA?"
        rodape={
          <>
            <Botao onClick={() => setDesligando(false)}>Cancelar</Botao>
            {palavra === "DESLIGAR" && (
              <Botao variante="perigo" carregando={pendente} onClick={desligar}>
                Confirmar e desligar
              </Botao>
            )}
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <div role="alert" className="flex gap-3 rounded-2xl border border-critico/40 bg-critico/10 p-3 text-[13.5px]">
            <OctagonAlert className="mt-0.5 size-5 shrink-0 text-critico" />
            <div>
              <p className="font-semibold text-critico">Atenção: isto para a IA em TODOS os atendimentos.</p>
              <p className="mt-1 text-ink-2">
                Nenhuma conversa recebe mais resposta, triagem ou análise da IA até alguém ligar de novo. As conversas em andamento
                passam a depender só da equipe.
              </p>
            </div>
          </div>
          <Campo rotulo="Para confirmar, digite DESLIGAR (em letras maiúsculas)">
            <Entrada value={palavra} onChange={(e) => setPalavra(e.target.value)} autoComplete="off" autoCapitalize="characters" spellCheck={false} placeholder="DESLIGAR" />
          </Campo>
        </div>
      </Dialogo>

      <Painel className="p-5">
        <TituloSecao>Testar o validador</TituloSecao>
        <p className="mb-3 text-[13px] text-ink-2">Cole uma resposta e veja se ela seria aprovada. Nada é enviado a ninguém.</p>
        <AreaTexto value={teste} onChange={(e) => { setTeste(e.target.value); setResultado(null); }} className="min-h-[100px]" placeholder="Ex.: A moto custa R$ 12.990 em 12x, veja em www.site.com.br" />
        <div className="mt-3 flex justify-end">
          <Botao
            carregando={pendente}
            disabled={!teste.trim()}
            onClick={() =>
              iniciar(async () => {
                const r = await acaoValidarTexto(teste);
                if (!r.ok) return void toast.error(r.erro);
                setResultado(r.dados);
              })
            }
          >
            Validar
          </Botao>
        </div>
        {resultado && (
          <div className="mt-3 rounded-xl border border-linha p-3 text-[13px]">
            {resultado.aprovada ? (
              <Selo tom="bom">Aprovada</Selo>
            ) : (
              <>
                <Selo tom="atencao">Reprovada</Selo>
                <ul className="mt-2 list-disc space-y-1 pl-5">
                  {resultado.violacoes.map((v, i) => (
                    <li key={i}>
                      <b>{v.rotulo}.</b> <span className="text-ink-3">{v.detalhe}</span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        )}
      </Painel>

      <Painel className="p-5">
        <TituloSecao>Últimas respostas da IA</TituloSecao>
        {execucoes.length === 0 ? (
          <p className="text-[13px] text-ink-3">Nenhuma resposta da IA ainda. Cada resposta, enviada ou bloqueada, aparece aqui.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {execucoes.map((e) => (
              <li key={e.id} className="rounded-xl border border-linha p-3 text-[13px]">
                <div className="mb-1 flex flex-wrap items-center gap-2">
                  {e.enviada ? <Selo tom="bom">Enviada</Selo> : <Selo tom="atencao">Bloqueada: {MOTIVOS_BLOQUEIO[e.motivo ?? ""] ?? e.motivo}</Selo>}
                  <span className="text-ink-3">
                    {quando(e.criadoEm)} · {e.origem}
                    {e.contato ? ` · ${e.contato}` : ""}
                  </span>
                </div>
                <p className="whitespace-pre-line text-ink-2">{e.texto}</p>
                {!!e.violacoes?.length && (
                  <ul className="mt-1 list-disc pl-5 text-ink-3">
                    {e.violacoes.map((v, i) => (
                      <li key={i}>
                        {v.rotulo}: {v.detalhe}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        )}
      </Painel>
    </div>
  );
}
