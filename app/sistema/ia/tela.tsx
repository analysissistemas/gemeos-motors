"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Pencil, Plus, Trash } from "lucide-react";
import { CabecalhoPagina, EstadoVazio, Painel, Selo, TituloSecao } from "@/components/ui/basicos";
import { Abas } from "@/components/ui/abas";
import { Botao } from "@/components/ui/botao";
import { AreaTexto, Alternar, Campo, Entrada, Selecao } from "@/components/ui/campos";
import { Dialogo } from "@/components/ui/dialogo";
import { cn } from "@/lib/cn";
import { CATEGORIAS_CONHECIMENTO } from "@/lib/ia/secoes";
import { acaoAlternarConhecimento, acaoDescartarRascunho, acaoExcluirConhecimento, acaoPublicar, acaoRestaurarComoRascunho, acaoSalvarConhecimento, acaoSalvarRascunho } from "./acoes";

type Versao = { id: number; versao: number; conteudo: string; status: string; nota: string | null; criadoEm: Date; publicadoEm: Date | null };
type Setor = { chave: string; titulo: string; ajuda: string; padrao: string; publicada: Versao | null; rascunho: Versao | null; historico: Versao[] };
type Item = { id: number; categoria: string; titulo: string; conteudo: string; ativo: boolean };

const data = (d: Date | null) => (d ? new Date(d).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "");

export function TelaIa({ prompts, conhecimento }: { prompts: Setor[]; conhecimento: Item[] }) {
  const [aba, setAba] = useState<"prompt" | "conhecimento">("prompt");
  return (
    <>
      <CabecalhoPagina titulo="Inteligência artificial" subtitulo="Ensine a IA de atendimento: prompt por setor e base de conhecimento. Nada muda para os clientes até você publicar." />
      <Abas
        className="mb-4"
        atual={aba}
        aoMudar={setAba}
        abas={[
          { id: "prompt", rotulo: "Prompt por setor" },
          { id: "conhecimento", rotulo: "Base de conhecimento", contador: conhecimento.length },
        ]}
      />
      {aba === "prompt" ? <AbaPrompt setores={prompts} /> : <AbaConhecimento itens={conhecimento} />}
    </>
  );
}

/* ---------------- prompt ---------------- */
function AbaPrompt({ setores }: { setores: Setor[] }) {
  const [chave, setChave] = useState(setores[0].chave);
  const setor = setores.find((s) => s.chave === chave)!;
  return (
    <div className="grid gap-4 lg:grid-cols-[240px_1fr]">
      <Painel className="h-fit p-2">
        <nav className="flex flex-row gap-1 overflow-x-auto lg:flex-col">
          {setores.map((s) => (
            <button
              key={s.chave}
              type="button"
              onClick={() => setChave(s.chave)}
              className={cn("flex shrink-0 items-center justify-between gap-2 rounded-xl px-3 py-2 text-left text-[13px] transition", s.chave === chave ? "bg-ink font-semibold text-contra-ink" : "text-ink-2 hover:bg-trilho hover:text-ink")}
            >
              {s.titulo}
              {s.rascunho && <span className="size-2 shrink-0 rounded-full bg-[var(--atencao,#f5b400)]" title="Rascunho não publicado" />}
            </button>
          ))}
        </nav>
      </Painel>
      <EditorSetor key={setor.chave + (setor.rascunho?.id ?? "x") + (setor.rascunho?.conteudo.length ?? 0)} setor={setor} />
    </div>
  );
}

function EditorSetor({ setor }: { setor: Setor }) {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();
  const emUso = setor.publicada?.conteudo ?? setor.padrao;
  const [texto, setTexto] = useState(setor.rascunho?.conteudo ?? emUso);
  const [nota, setNota] = useState(setor.rascunho?.nota ?? "");
  const mudou = texto.trim() !== (setor.rascunho?.conteudo ?? emUso).trim();

  const rodar = (fn: () => Promise<{ ok: boolean; erro?: string; mensagem?: string }>) =>
    iniciar(async () => {
      const r = await fn();
      if (!r.ok) return void toast.error(r.erro);
      toast.success(r.mensagem);
      router.refresh();
    });

  return (
    <Painel className="p-5">
      <TituloSecao
        acao={
          <div className="flex gap-2">
            {setor.publicada ? <Selo tom="bom">Em uso: versão {setor.publicada.versao}</Selo> : <Selo tom="neutro">Em uso: texto padrão</Selo>}
            {setor.rascunho && <Selo tom="atencao">Rascunho v{setor.rascunho.versao}</Selo>}
          </div>
        }
      >
        {setor.titulo}
      </TituloSecao>
      <p className="mb-3 text-[13px] text-ink-2">{setor.ajuda}</p>
      <Campo rotulo="Texto do setor" dica={`${texto.length} de 8.000 caracteres`}>
        <AreaTexto value={texto} onChange={(e) => setTexto(e.target.value)} className="min-h-[300px] font-mono text-[13px] leading-relaxed" />
      </Campo>
      <Campo rotulo="Nota da mudança (opcional)" className="mt-3">
        <Entrada value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Ex.: incluí a regra de financiamento" maxLength={200} />
      </Campo>
      <div className="mt-4 flex flex-wrap justify-end gap-2">
        {setor.rascunho && (
          <Botao carregando={pendente} onClick={() => confirm("Descartar o rascunho e voltar ao texto em uso?") && rodar(() => acaoDescartarRascunho(setor.chave))}>
            Descartar rascunho
          </Botao>
        )}
        <Botao carregando={pendente} disabled={!mudou} onClick={() => rodar(() => acaoSalvarRascunho(setor.chave, texto, nota))}>
          Salvar rascunho
        </Botao>
        <Botao
          variante="primario"
          carregando={pendente}
          disabled={!setor.rascunho || mudou}
          onClick={() => confirm("Publicar agora? A IA passa a usar este texto nas próximas conversas.") && rodar(() => acaoPublicar(setor.chave))}
        >
          Publicar
        </Botao>
      </div>
      {setor.rascunho && mudou && <p className="mt-2 text-right text-[12px] text-ink-3">Salve o rascunho antes de publicar.</p>}

      <div className="mt-6 border-t border-linha pt-4">
        <p className="mb-2 text-[12px] font-medium uppercase tracking-wide text-ink-3">Histórico</p>
        <ul className="flex flex-col gap-2 text-[13px]">
          {setor.historico.map((v) => (
            <li key={v.id} className="flex items-center justify-between gap-3 rounded-xl border border-linha px-3 py-2">
              <span className="min-w-0">
                <b>v{v.versao}</b> · {v.status === "publicada" ? "em uso" : "anterior"} · {data(v.publicadoEm ?? v.criadoEm)}
                {v.nota ? <span className="text-ink-3"> · {v.nota}</span> : null}
              </span>
              {v.status !== "publicada" && (
                <Botao tamanho="sm" carregando={pendente} onClick={() => rodar(() => acaoRestaurarComoRascunho(setor.chave, v.id))}>
                  Restaurar como rascunho
                </Botao>
              )}
            </li>
          ))}
          <li className="flex items-center justify-between gap-3 rounded-xl border border-dashed border-linha px-3 py-2">
            <span className="text-ink-3">Texto padrão do sistema</span>
            <Botao tamanho="sm" carregando={pendente} onClick={() => rodar(() => acaoRestaurarComoRascunho(setor.chave, null))}>
              Restaurar como rascunho
            </Botao>
          </li>
        </ul>
      </div>
    </Painel>
  );
}

/* ---------------- conhecimento ---------------- */
function AbaConhecimento({ itens }: { itens: Item[] }) {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();
  const [editando, setEditando] = useState<Partial<Item> | null>(null);
  const [erros, setErros] = useState<Record<string, string>>({});
  const [filtro, setFiltro] = useState("todas");
  const categorias = Array.from(new Set([...CATEGORIAS_CONHECIMENTO, ...itens.map((i) => i.categoria)]));
  const lista = itens.filter((i) => filtro === "todas" || i.categoria === filtro);

  return (
    <Painel className="p-5">
      <TituloSecao
        acao={
          <Botao variante="primario" tamanho="sm" onClick={() => { setErros({}); setEditando({ categoria: "Loja", ativo: true }); }}>
            <Plus className="size-4" /> Novo item
          </Botao>
        }
      >
        Base de conhecimento
      </TituloSecao>
      <p className="mb-3 text-[13px] text-ink-2">Tudo que a IA pode afirmar sobre a loja: endereço, horário, políticas, perguntas frequentes. O que não estiver aqui, a IA não inventa: ela passa para um vendedor.</p>
      <div className="mb-3 max-w-xs">
        <Selecao value={filtro} onChange={(e) => setFiltro(e.target.value)}>
          <option value="todas">Todas as categorias</option>
          {categorias.map((c) => <option key={c} value={c}>{c}</option>)}
        </Selecao>
      </div>
      {lista.length === 0 ? (
        <EstadoVazio titulo="Nenhum item ainda" texto="Comece pelo endereço, horário de funcionamento e formas de pagamento." />
      ) : (
        <ul className="flex flex-col gap-2">
          {lista.map((i) => (
            <li key={i.id} className={cn("rounded-xl border border-linha p-3", !i.ativo && "opacity-60")}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-[12px] text-ink-3">{i.categoria}</p>
                  <p className="text-[14px] font-semibold">{i.titulo}</p>
                </div>
                <div className="flex items-center gap-2">
                  {!i.ativo && <Selo tom="neutro">Desativado</Selo>}
                  <Botao tamanho="sm" carregando={pendente} onClick={() => iniciar(async () => { const r = await acaoAlternarConhecimento(i.id, !i.ativo); if (!r.ok) return void toast.error(r.erro); router.refresh(); })}>
                    {i.ativo ? "Desativar" : "Ativar"}
                  </Botao>
                  <Botao tamanho="sm" aria-label="Editar" onClick={() => { setErros({}); setEditando(i); }}><Pencil className="size-4" /></Botao>
                  <Botao
                    tamanho="sm"
                    aria-label="Excluir"
                    carregando={pendente}
                    onClick={() => confirm(`Excluir "${i.titulo}"?`) && iniciar(async () => { const r = await acaoExcluirConhecimento(i.id); if (!r.ok) return void toast.error(r.erro); toast.success(r.mensagem); router.refresh(); })}
                  >
                    <Trash className="size-4" />
                  </Botao>
                </div>
              </div>
              <p className="mt-1 whitespace-pre-line text-[13px] text-ink-2">{i.conteudo}</p>
            </li>
          ))}
        </ul>
      )}

      <Dialogo
        aberto={!!editando}
        aoMudar={(v) => !v && setEditando(null)}
        titulo={editando?.id ? "Editar item" : "Novo item de conhecimento"}
        rodape={
          <>
            <Botao onClick={() => setEditando(null)}>Cancelar</Botao>
            <Botao
              variante="primario"
              carregando={pendente}
              onClick={() =>
                iniciar(async () => {
                  const r = await acaoSalvarConhecimento(editando?.id ?? null, { categoria: editando?.categoria, titulo: editando?.titulo ?? "", conteudo: editando?.conteudo ?? "", ativo: editando?.ativo ?? true });
                  if (!r.ok) { setErros(r.campos ?? {}); return void toast.error(r.erro); }
                  toast.success(r.mensagem);
                  setEditando(null);
                  router.refresh();
                })
              }
            >
              Salvar
            </Botao>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <Campo rotulo="Categoria" erro={erros.categoria}>
            <Selecao value={editando?.categoria ?? "Loja"} onChange={(e) => setEditando({ ...editando, categoria: e.target.value })}>
              {categorias.map((c) => <option key={c} value={c}>{c}</option>)}
            </Selecao>
          </Campo>
          <Campo rotulo="Título" erro={erros.titulo}>
            <Entrada value={editando?.titulo ?? ""} onChange={(e) => setEditando({ ...editando, titulo: e.target.value })} placeholder="Ex.: Endereço da loja em Goiana" />
          </Campo>
          <Campo rotulo="Conteúdo" erro={erros.conteudo} dica="Escreva exatamente o que a IA pode dizer ao cliente.">
            <AreaTexto value={editando?.conteudo ?? ""} onChange={(e) => setEditando({ ...editando, conteudo: e.target.value })} className="min-h-[140px]" />
          </Campo>
          <Alternar marcado={editando?.ativo ?? true} aoMudar={(v) => setEditando({ ...editando, ativo: v })} rotulo="Item ativo" descricao="Desativado, a IA deixa de usar sem você precisar excluir." />
        </div>
      </Dialogo>
    </Painel>
  );
}
