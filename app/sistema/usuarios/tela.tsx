"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { KeyRound, Pencil, UserPlus } from "lucide-react";
import { PAPEIS, PERMISSOES, type Papel } from "@/lib/dominio";
import { relativo } from "@/lib/formato";
import { CabecalhoPagina, Painel, Selo } from "@/components/ui/basicos";
import { Botao } from "@/components/ui/botao";
import { Campo, Entrada, Selecao } from "@/components/ui/campos";
import { Dialogo } from "@/components/ui/dialogo";
import { EditorFoto } from "@/components/ui/editor-foto";
import { acaoAlternarAtivo, acaoCriarUsuario, acaoEditarUsuario, acaoFotoUsuario, acaoRedefinirSenha, acaoRemoverFotoUsuario } from "./acoes";

type U = { id: number; nome: string; usuario: string; email: string | null; papel: string; ativo: boolean; fotoUrl: string | null; ultimoAcessoEm: Date | null; criadoEm: Date };

const RESUMO_PAPEL: Record<Papel, string> = {
  admin: "Tudo, inclusive custo, lucro, financeiro, histórico, usuários e configurações.",
  vendedor: "Atendimento, funil, clientes, vendas, estoque (sem custo) e assistência.",
  tecnico: "Assistência técnica, clientes e estoque (sem custo).",
};

function gerarSenha() {
  const a = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const v = new Uint32Array(12);
  crypto.getRandomValues(v);
  return Array.from(v, (x) => a[x % a.length]).join("") + "7";
}

export function TelaUsuarios({ usuarios, eu }: { usuarios: U[]; eu: number }) {
  const [form, setForm] = useState<Partial<U> & { senha?: string } | null>(null);
  const [senha, setSenha] = useState<{ id: number; nome: string; valor: string } | null>(null);
  const [erros, setErros] = useState<Record<string, string>>({});
  const [pendente, iniciar] = useTransition();
  const router = useRouter();
  void PERMISSOES;

  return (
    <>
      <CabecalhoPagina
        titulo="Usuários"
        subtitulo="Quem entra no sistema e o que cada perfil pode ver."
        acoes={
          <Botao
            variante="primario"
            onClick={() => {
              setErros({});
              setForm({ papel: "vendedor", senha: gerarSenha() });
            }}
          >
            <UserPlus className="size-4" /> Novo usuário
          </Botao>
        }
      />
      <Painel className="overflow-hidden">
        <ul>
          {usuarios.map((x) => (
            <li key={x.id} className="flex flex-col gap-3 border-b border-linha px-5 py-4 last:border-0 sm:flex-row sm:items-center">
              <EditorFoto
                nome={x.nome}
                foto={x.fotoUrl}
                tamanho="md"
                className="self-start sm:self-center"
                titulo={x.id === eu ? "Sua foto" : undefined}
                aoEnviar={(dados) => acaoFotoUsuario(x.id, dados)}
                aoRemover={() => acaoRemoverFotoUsuario(x.id)}
                aoMudar={() => router.refresh()}
              />
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold">{x.nome}</span>
                  {x.id === eu && <Selo tom="info" ponto={false}>Você</Selo>}
                  {!x.ativo && <Selo tom="critico">Desativado</Selo>}
                </span>
                <span className="block text-[12.5px] text-ink-2">
                  {x.usuario} · {PAPEIS[x.papel as Papel]}
                  {x.email ? ` · ${x.email}` : ""}
                </span>
                <span className="block text-[12px] text-ink-3">{x.ultimoAcessoEm ? `Último acesso ${relativo(x.ultimoAcessoEm)}` : "Nunca entrou"}</span>
              </span>
              <span className="flex flex-wrap gap-2">
                <Botao
                  tamanho="sm"
                  onClick={() => {
                    setErros({});
                    setForm(x);
                  }}
                >
                  <Pencil className="size-4" /> Editar
                </Botao>
                <Botao tamanho="sm" onClick={() => setSenha({ id: x.id, nome: x.nome, valor: gerarSenha() })}>
                  <KeyRound className="size-4" /> Senha
                </Botao>
                {x.id !== eu && (
                  <Botao
                    tamanho="sm"
                    variante="fantasma"
                    disabled={pendente}
                    onClick={() =>
                      iniciar(async () => {
                        const r = await acaoAlternarAtivo(x.id);
                        if (!r.ok) return void toast.error(r.erro);
                        toast.success(r.mensagem);
                        router.refresh();
                      })
                    }
                  >
                    {x.ativo ? "Desativar" : "Reativar"}
                  </Botao>
                )}
              </span>
            </li>
          ))}
        </ul>
      </Painel>

      <Painel className="mt-4 p-5">
        <p className="mb-3 text-[15px] font-semibold">O que cada perfil acessa</p>
        <dl className="grid gap-3 sm:grid-cols-3">
          {(Object.keys(PAPEIS) as Papel[]).map((p) => (
            <div key={p} className="rounded-2xl bg-trilho p-3">
              <dt className="font-semibold">{PAPEIS[p]}</dt>
              <dd className="mt-1 text-[13px] text-ink-2">{RESUMO_PAPEL[p]}</dd>
            </div>
          ))}
        </dl>
      </Painel>

      <Dialogo
        aberto={!!form}
        aoMudar={(v) => !v && setForm(null)}
        titulo={form?.id ? "Editar usuário" : "Novo usuário"}
        largura="sm"
        rodape={
          <Botao
            variante="primario"
            carregando={pendente}
            onClick={() =>
              iniciar(async () => {
                if (!form) return;
                const r = form.id ? await acaoEditarUsuario(form.id, form) : await acaoCriarUsuario(form);
                if (!r.ok) {
                  setErros(r.campos ?? {});
                  return void toast.error(r.erro);
                }
                toast.success(r.mensagem);
                if (!form.id) setSenha({ id: 0, nome: form.nome ?? "", valor: form.senha ?? "" });
                setForm(null);
                router.refresh();
              })
            }
          >
            Salvar
          </Botao>
        }
      >
        {form && (
          <div className="flex flex-col gap-4">
            <Campo rotulo="Nome" obrigatorio erro={erros.nome}>
              <Entrada value={form.nome ?? ""} onChange={(e) => setForm({ ...form, nome: e.target.value })} />
            </Campo>
            <Campo rotulo="Usuário (para entrar)" obrigatorio erro={erros.usuario} dica="Letras minúsculas, sem espaço. Ex.: joao.silva">
              <Entrada value={form.usuario ?? ""} autoCapitalize="none" onChange={(e) => setForm({ ...form, usuario: e.target.value.toLowerCase() })} />
            </Campo>
            <Campo rotulo="E-mail" erro={erros.email}>
              <Entrada type="email" value={form.email ?? ""} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </Campo>
            <Campo rotulo="Perfil" obrigatorio dica={RESUMO_PAPEL[(form.papel as Papel) ?? "vendedor"]}>
              <Selecao value={form.papel} onChange={(e) => setForm({ ...form, papel: e.target.value })}>
                {Object.entries(PAPEIS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </Selecao>
            </Campo>
            {!form.id && (
              <Campo rotulo="Senha inicial" obrigatorio erro={erros[""] ?? erros.senha} dica="Gerada automaticamente. Anote para passar à pessoa; ela pode trocar em Minha conta.">
                <Entrada value={form.senha ?? ""} onChange={(e) => setForm({ ...form, senha: e.target.value })} />
              </Campo>
            )}
          </div>
        )}
      </Dialogo>

      <Dialogo
        aberto={!!senha}
        aoMudar={(v) => !v && setSenha(null)}
        titulo={senha?.id ? `Nova senha para ${senha.nome}` : `Acesso criado para ${senha?.nome}`}
        descricao={senha?.id ? "As sessões abertas dessa pessoa serão encerradas." : "Passe estes dados para a pessoa entrar."}
        largura="sm"
        rodape={
          senha?.id ? (
            <Botao
              variante="primario"
              carregando={pendente}
              onClick={() =>
                iniciar(async () => {
                  if (!senha) return;
                  const r = await acaoRedefinirSenha(senha.id, senha.valor);
                  if (!r.ok) return void toast.error(r.erro);
                  toast.success(r.mensagem);
                  setSenha(null);
                })
              }
            >
              Salvar nova senha
            </Botao>
          ) : (
            <Botao variante="primario" onClick={() => setSenha(null)}>
              Pronto
            </Botao>
          )
        }
      >
        {senha && (
          <Campo rotulo="Senha" dica="Mínimo de 10 caracteres, com letras e números.">
            <Entrada value={senha.valor} readOnly={!senha.id} onChange={(e) => setSenha({ ...senha, valor: e.target.value })} onFocus={(e) => e.target.select()} />
          </Campo>
        )}
      </Dialogo>
    </>
  );
}
