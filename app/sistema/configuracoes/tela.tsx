"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Pencil, Plus, Trash } from "lucide-react";
import { CabecalhoPagina, Painel, Selo, TituloSecao } from "@/components/ui/basicos";
import { Botao } from "@/components/ui/botao";
import { Alternar, AreaTexto, Campo, Entrada } from "@/components/ui/campos";
import { Dialogo } from "@/components/ui/dialogo";
import { PainelApiOficial, type ApiOficial } from "./api-oficial";
import { acaoCarregarDemo, acaoExcluirResposta, acaoLimparDemo, acaoSalvarEmpresa, acaoSalvarResposta, acaoTriagemAutomatica } from "./acoes";

type Empresa = Record<string, unknown> | null;
type Resposta = { id: number; atalho: string; titulo: string; conteudo: string; ativo: boolean };

export function TelaConfiguracoes({
  empresa,
  respostas,
  triagemLigada,
  conversasDemo,
  info,
  apiOficial,
  urlCallback,
}: {
  empresa: Empresa;
  respostas: Resposta[];
  triagemLigada: boolean;
  conversasDemo: number;
  info: { provedor: string; simulado: boolean; modeloIa: string };
  apiOficial: ApiOficial;
  urlCallback: string;
}) {
  const router = useRouter();
  const [e, setE] = useState<Record<string, string>>(() => Object.fromEntries(Object.entries(empresa ?? {}).map(([k, v]) => [k, v == null ? "" : String(v)])));
  const [erros, setErros] = useState<Record<string, string>>({});
  const [resposta, setResposta] = useState<Partial<Resposta> | null>(null);
  const [errosR, setErrosR] = useState<Record<string, string>>({});
  const [pendente, iniciar] = useTransition();
  const campo = (k: string, rotulo: string, extra?: { dica?: string; area?: boolean; className?: string }) => (
    <Campo rotulo={rotulo} erro={erros[k]} dica={extra?.dica} className={extra?.className}>
      {extra?.area ? (
        <AreaTexto value={e[k] ?? ""} onChange={(x) => setE({ ...e, [k]: x.target.value })} className="min-h-[110px]" />
      ) : (
        <Entrada value={e[k] ?? ""} onChange={(x) => setE({ ...e, [k]: x.target.value })} />
      )}
    </Campo>
  );

  return (
    <>
      <CabecalhoPagina titulo="Configurações" subtitulo="Dados da empresa, atendimento, IA e demonstração." />

      <div className="mb-4">
        <PainelApiOficial inicial={apiOficial} urlCallback={urlCallback} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Painel className="p-5 lg:col-span-2">
          <TituloSecao>Dados da empresa (saem nos PDFs de venda e de OS)</TituloSecao>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {campo("nomeFantasia", "Nome fantasia")}
            {campo("razaoSocial", "Razão social")}
            {campo("cnpj", "CNPJ")}
            {campo("whatsapp", "WhatsApp")}
            {campo("instagram", "Instagram")}
            {campo("email", "E-mail")}
            {campo("endereco", "Endereço", { className: "sm:col-span-2" })}
            {campo("cidade", "Cidade")}
            {campo("estado", "Estado (UF)")}
            {campo("condicoesVenda", "Condições padrão da venda", { area: true, className: "sm:col-span-2", dica: "Entram em todo termo de venda. Revise com a contabilidade ou o jurídico da loja." })}
            {campo("condicoesOs", "Condições padrão da ordem de serviço", { area: true, className: "sm:col-span-2" })}
          </div>
          <div className="mt-4 flex justify-end">
            <Botao
              variante="primario"
              carregando={pendente}
              onClick={() =>
                iniciar(async () => {
                  const r = await acaoSalvarEmpresa(e);
                  if (!r.ok) {
                    setErros(r.campos ?? {});
                    return void toast.error(r.erro);
                  }
                  setErros({});
                  toast.success(r.mensagem);
                  router.refresh();
                })
              }
            >
              Salvar dados da empresa
            </Botao>
          </div>
        </Painel>

        <div className="flex flex-col gap-4">
          <Painel className="p-5">
            <TituloSecao>Atendimento e IA</TituloSecao>
            <dl className="mb-4 flex flex-col gap-2 text-[13px]">
              <div className="flex justify-between gap-2">
                <dt className="text-ink-3">Canal</dt>
                <dd>{info.simulado ? <Selo tom="atencao">{info.provedor}</Selo> : <Selo tom="bom">{info.provedor}</Selo>}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-ink-3">Modelo da IA</dt>
                <dd className="num">{info.modeloIa}</dd>
              </div>
            </dl>
            <Alternar
              marcado={triagemLigada}
              aoMudar={(v) =>
                iniciar(async () => {
                  const r = await acaoTriagemAutomatica(v);
                  if (!r.ok) return void toast.error(r.erro);
                  toast.success(r.mensagem);
                  router.refresh();
                })
              }
              rotulo="Triagem automática da IA"
              descricao="A IA responde a primeira mensagem, entende o interesse e passa para um consultor."
            />
            {info.simulado && (
              <p className="mt-3 text-[12px] leading-relaxed text-ink-3">
                O WhatsApp está em modo simulado: nenhuma mensagem sai do sistema. Para ligar o WhatsApp real, preencha o painel WhatsApp — API Oficial (Meta), no topo desta página.
              </p>
            )}
          </Painel>

          <Painel className="p-5">
            <TituloSecao>Dados de demonstração</TituloSecao>
            <p className="mb-3 text-[13px] text-ink-2">
              Conversas, clientes e negócios de exemplo para ver o atendimento funcionando. Levam o selo &quot;Simulado&quot; e não entram nas métricas. {conversasDemo ? `Hoje há ${conversasDemo} conversa(s) de demonstração.` : "Nenhum carregado agora."}
            </p>
            <div className="flex flex-wrap gap-2">
              <Botao
                carregando={pendente}
                onClick={() =>
                  iniciar(async () => {
                    const r = await acaoCarregarDemo();
                    if (!r.ok) return void toast.error(r.erro);
                    toast.success(r.dados.mensagem);
                    router.refresh();
                  })
                }
              >
                Carregar demonstração
              </Botao>
              <Botao
                variante="fantasma"
                carregando={pendente}
                onClick={() =>
                  iniciar(async () => {
                    const r = await acaoLimparDemo();
                    if (!r.ok) return void toast.error(r.erro);
                    toast.success(`Removidos: ${r.dados.conversas} conversas, ${r.dados.negocios} negócios, ${r.dados.clientes} clientes`);
                    router.refresh();
                  })
                }
              >
                Limpar demonstração
              </Botao>
            </div>
          </Painel>
        </div>

        <Painel className="p-5 lg:col-span-3">
          <TituloSecao
            acao={
              <Botao
                tamanho="sm"
                onClick={() => {
                  setErrosR({});
                  setResposta({ ativo: true });
                }}
              >
                <Plus className="size-4" /> Nova resposta
              </Botao>
            }
          >
            Respostas rápidas do atendimento
          </TituloSecao>
          <ul className="grid gap-2 md:grid-cols-2">
            {respostas.map((r) => (
              <li key={r.id} className="flex items-start gap-3 rounded-2xl border border-linha p-3">
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2 text-[13.5px] font-semibold">
                    /{r.atalho} <span className="font-normal text-ink-3">· {r.titulo}</span>
                    {!r.ativo && <Selo tom="neutro">Inativa</Selo>}
                  </span>
                  <span className="mt-0.5 line-clamp-2 block text-[12.5px] text-ink-2">{r.conteudo}</span>
                </span>
                <Botao
                  tamanho="icone"
                  variante="fantasma"
                  aria-label={`Editar /${r.atalho}`}
                  onClick={() => {
                    setErrosR({});
                    setResposta(r);
                  }}
                >
                  <Pencil className="size-4" />
                </Botao>
                <Botao
                  tamanho="icone"
                  variante="fantasma"
                  aria-label={`Excluir /${r.atalho}`}
                  onClick={() =>
                    iniciar(async () => {
                      const x = await acaoExcluirResposta(r.id);
                      if (!x.ok) return void toast.error(x.erro);
                      toast.success(x.mensagem);
                      router.refresh();
                    })
                  }
                >
                  <Trash className="size-4" />
                </Botao>
              </li>
            ))}
          </ul>
        </Painel>
      </div>

      <Dialogo
        aberto={!!resposta}
        aoMudar={(v) => !v && setResposta(null)}
        titulo={resposta?.id ? "Editar resposta rápida" : "Nova resposta rápida"}
        largura="sm"
        rodape={
          <Botao
            variante="primario"
            carregando={pendente}
            onClick={() =>
              iniciar(async () => {
                if (!resposta) return;
                const r = await acaoSalvarResposta(resposta.id ?? null, resposta);
                if (!r.ok) {
                  setErrosR(r.campos ?? {});
                  return void toast.error(r.erro);
                }
                toast.success(r.mensagem);
                setResposta(null);
                router.refresh();
              })
            }
          >
            Salvar
          </Botao>
        }
      >
        {resposta && (
          <div className="flex flex-col gap-4">
            <Campo rotulo="Atalho" obrigatorio erro={errosR.atalho} dica="O consultor digita /atalho no chat.">
              <Entrada value={resposta.atalho ?? ""} onChange={(x) => setResposta({ ...resposta, atalho: x.target.value })} placeholder="saudacao" />
            </Campo>
            <Campo rotulo="Título" obrigatorio erro={errosR.titulo}>
              <Entrada value={resposta.titulo ?? ""} onChange={(x) => setResposta({ ...resposta, titulo: x.target.value })} />
            </Campo>
            <Campo rotulo="Mensagem" obrigatorio erro={errosR.conteudo}>
              <AreaTexto value={resposta.conteudo ?? ""} onChange={(x) => setResposta({ ...resposta, conteudo: x.target.value })} />
            </Campo>
            <Alternar marcado={resposta.ativo ?? true} aoMudar={(v) => setResposta({ ...resposta, ativo: v })} rotulo="Ativa" />
          </div>
        )}
      </Dialogo>
    </>
  );
}
