"use client";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, Check, Eye, EyeOff, ImageOff, ImageUp, Palette, Pencil, Plus, Trash2, X } from "lucide-react";
import type { CorModelo } from "@/lib/consultas/estoque";
import { PALETA_CORES, corClara, normalizarHex } from "@/lib/cores";
import { cn } from "@/lib/cn";
import { EstadoVazio, Selo } from "@/components/ui/basicos";
import { Botao } from "@/components/ui/botao";
import { Campo, Entrada } from "@/components/ui/campos";
import { LIMITE_FOTO, TIPOS_FOTO, reduzirFoto } from "@/components/ui/editor-foto";
import { adicionarCor, alternarCor, editarCor, enviarFotoCor, moverCor, removerCor, removerFotoCor } from "./acoes-cores";

type ModeloCatalogo = { id: number; nome: string };
type Resposta = { ok: true; mensagem?: string } | { ok: false; erro: string; campos?: Record<string, string> };

/* A foto do catálogo é a moto inteira: mantém a proporção, lado maior até 1200 px. */
export const LADO_CATALOGO = 1200;

/** Bolinha com a cor. Cor clara ganha contorno, senão some no fundo branco. */
export function BolinhaCor({ hex, tamanho = "md", className }: { hex: string; tamanho?: "sm" | "md" | "lg"; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn("inline-block shrink-0 rounded-full ring-1", corClara(hex) ? "ring-linha-forte" : "ring-black/10", tamanho === "sm" ? "size-4" : tamanho === "lg" ? "size-8" : "size-5", className)}
      style={{ background: hex }}
    />
  );
}

/** Cores de um modelo, com a foto da moto em cada cor (janela "Cores" da aba Catálogo). */
export function CoresDoModelo({ modelo, cores, editar }: { modelo: ModeloCatalogo; cores: CorModelo[]; editar: boolean }) {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();

  /** Roda a ação, avisa e recarrega os dados da tela. Devolve se deu certo. */
  function rodar(acao: () => Promise<Resposta>, aoFalhar?: (r: Extract<Resposta, { ok: false }>) => void) {
    return new Promise<boolean>((fim) =>
      iniciar(async () => {
        const r = await acao();
        if (!r.ok) {
          toast.error(r.erro);
          aoFalhar?.(r);
          return fim(false);
        }
        if (r.mensagem) toast.success(r.mensagem);
        router.refresh();
        fim(true);
      }),
    );
  }

  return (
    <div className="flex flex-col gap-5" aria-busy={pendente}>
      {cores.length === 0 ? (
        <EstadoVazio compacto icone={<Palette />} titulo="Nenhuma cor cadastrada" texto="Sem cor aqui, a vitrine mostra a cor de sempre do modelo." />
      ) : (
        <ul className="flex flex-col gap-2" aria-label={`Cores do ${modelo.nome}`}>
          {cores.map((c, i) => (
            <LinhaCor key={c.id} cor={c} primeira={i === 0} ultima={i === cores.length - 1} editar={editar} pendente={pendente} rodar={rodar} />
          ))}
        </ul>
      )}
      {editar && <NovaCor modeloId={modelo.id} existentes={cores.map((c) => c.nome.toLowerCase())} pendente={pendente} rodar={rodar} />}
    </div>
  );
}

function LinhaCor({
  cor,
  primeira,
  ultima,
  editar,
  pendente,
  rodar,
}: {
  cor: CorModelo;
  primeira: boolean;
  ultima: boolean;
  editar: boolean;
  pendente: boolean;
  rodar: (acao: () => Promise<Resposta>, aoFalhar?: (r: Extract<Resposta, { ok: false }>) => void) => Promise<boolean>;
}) {
  const [editando, setEditando] = useState(false);
  const [nome, setNome] = useState(cor.nome);
  const [hex, setHex] = useState(cor.hex);
  const [enviando, setEnviando] = useState(false);
  const entrada = useRef<HTMLInputElement>(null);

  async function escolherFoto(e: React.ChangeEvent<HTMLInputElement>) {
    const arquivo = e.target.files?.[0];
    e.target.value = "";
    if (!arquivo) return;
    if (!TIPOS_FOTO.includes(arquivo.type)) return void toast.error("Use uma foto JPG, PNG ou WebP.");
    setEnviando(true);
    try {
      const pronto = await reduzirFoto(arquivo, { ladoMaior: LADO_CATALOGO });
      if (pronto.size > LIMITE_FOTO) return void toast.error("A foto passa de 2 MB. Escolha uma menor.");
      const dados = new FormData();
      dados.set("foto", pronto);
      await rodar(() => enviarFotoCor(cor.id, dados));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <li className={cn("flex flex-wrap items-center gap-3 rounded-2xl border border-linha p-2.5", !cor.ativo && "bg-trilho/50")} data-cor={cor.nome}>
      <span className="grid size-16 shrink-0 place-items-center overflow-hidden rounded-xl bg-trilho ring-1 ring-linha">
        {cor.fotoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- foto pública do catálogo (/api/vitrine/foto)
          <img src={cor.fotoUrl} alt={`Foto na cor ${cor.nome}`} className="size-full object-contain" />
        ) : (
          <ImageOff className="size-5 text-ink-3" aria-label="Sem foto" />
        )}
      </span>

      {editando ? (
        <div className="flex min-w-0 flex-1 flex-wrap items-end gap-2">
          <Campo rotulo="Nome" className="min-w-32 flex-1">
            <Entrada value={nome} onChange={(e) => setNome(e.target.value)} maxLength={40} />
          </Campo>
          <SeletorTom hex={hex} aoMudar={setHex} />
          <Botao
            tamanho="icone"
            variante="primario"
            aria-label="Salvar cor"
            disabled={pendente}
            onClick={async () => {
              if (await rodar(() => editarCor(cor.id, { nome, hex }))) setEditando(false);
            }}
          >
            <Check className="size-4" />
          </Botao>
          <Botao
            tamanho="icone"
            variante="fantasma"
            aria-label="Cancelar edição"
            onClick={() => {
              setNome(cor.nome);
              setHex(cor.hex);
              setEditando(false);
            }}
          >
            <X className="size-4" />
          </Botao>
        </div>
      ) : (
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <BolinhaCor hex={cor.hex} />
          <span className="min-w-0">
            <span className="block truncate font-semibold">{cor.nome}</span>
            <span className="num block text-[12px] text-ink-3">
              {cor.hex}
              {primeira ? " · abre no card" : ""}
            </span>
          </span>
          {!cor.ativo && <Selo tom="neutro">Escondida</Selo>}
          {!cor.fotoUrl && cor.ativo && <Selo tom="atencao">Sem foto</Selo>}
        </div>
      )}

      {editar && !editando && (
        <div className="flex flex-wrap items-center gap-1">
          <Botao tamanho="sm" variante="secundario" carregando={enviando} disabled={pendente} onClick={() => entrada.current?.click()}>
            <ImageUp className="size-4" /> {cor.fotoUrl ? "Trocar foto" : "Pôr foto"}
          </Botao>
          {cor.fotoUrl && (
            <Botao tamanho="icone" variante="fantasma" aria-label={`Remover a foto da cor ${cor.nome}`} title="Remover foto" disabled={pendente} onClick={() => rodar(() => removerFotoCor(cor.id))}>
              <ImageOff className="size-4" />
            </Botao>
          )}
          <Botao tamanho="icone" variante="fantasma" aria-label={`Subir ${cor.nome}`} title="Subir" disabled={pendente || primeira} onClick={() => rodar(() => moverCor(cor.id, "cima"))}>
            <ArrowUp className="size-4" />
          </Botao>
          <Botao tamanho="icone" variante="fantasma" aria-label={`Descer ${cor.nome}`} title="Descer" disabled={pendente || ultima} onClick={() => rodar(() => moverCor(cor.id, "baixo"))}>
            <ArrowDown className="size-4" />
          </Botao>
          <Botao tamanho="icone" variante="fantasma" aria-label={`Editar ${cor.nome}`} title="Editar nome e tom" disabled={pendente} onClick={() => setEditando(true)}>
            <Pencil className="size-4" />
          </Botao>
          <Botao
            tamanho="icone"
            variante="fantasma"
            aria-label={cor.ativo ? `Esconder ${cor.nome} da vitrine` : `Mostrar ${cor.nome} na vitrine`}
            title={cor.ativo ? "Esconder da vitrine" : "Mostrar na vitrine"}
            disabled={pendente}
            onClick={() => rodar(() => alternarCor(cor.id, !cor.ativo))}
          >
            {cor.ativo ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </Botao>
          <Botao
            tamanho="icone"
            variante="fantasma"
            aria-label={`Remover a cor ${cor.nome}`}
            title="Remover cor"
            disabled={pendente}
            onClick={() => {
              if (window.confirm(`Tirar a cor ${cor.nome}${cor.fotoUrl ? " e a foto dela" : ""}?`)) void rodar(() => removerCor(cor.id));
            }}
          >
            <Trash2 className="size-4 text-critico" />
          </Botao>
          <input ref={entrada} type="file" accept={TIPOS_FOTO.join(",")} className="sr-only" tabIndex={-1} aria-label={`Foto da cor ${cor.nome}`} onChange={escolherFoto} />
        </div>
      )}
    </li>
  );
}

/** Tom da cor: o seletor do sistema e o código (#6d1f33), um espelhando o outro. */
function SeletorTom({ hex, aoMudar, erro }: { hex: string; aoMudar: (v: string) => void; erro?: string }) {
  const [texto, setTexto] = useState(hex);
  const [anterior, setAnterior] = useState(hex);
  if (hex !== anterior) {
    setAnterior(hex);
    setTexto(hex);
  }
  return (
    <Campo rotulo="Tom" erro={erro} className="w-40">
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={normalizarHex(hex) ?? "#8e8e93"}
          onChange={(e) => aoMudar(e.target.value)}
          aria-label="Escolher o tom"
          className="h-10 w-11 shrink-0 cursor-pointer rounded-xl border border-linha bg-plano/60 p-1"
        />
        <Entrada
          value={texto}
          maxLength={7}
          aria-label="Código do tom"
          className="num"
          onChange={(e) => {
            setTexto(e.target.value);
            const h = normalizarHex(e.target.value);
            if (h) aoMudar(h);
          }}
          invalido={!!erro}
        />
      </div>
    </Campo>
  );
}

function NovaCor({
  modeloId,
  existentes,
  pendente,
  rodar,
}: {
  modeloId: number;
  existentes: string[];
  pendente: boolean;
  rodar: (acao: () => Promise<Resposta>, aoFalhar?: (r: Extract<Resposta, { ok: false }>) => void) => Promise<boolean>;
}) {
  const [nome, setNome] = useState("");
  const [hex, setHex] = useState("#1f2020");
  const [erros, setErros] = useState<Record<string, string>>({});
  const sugestoes = PALETA_CORES.filter((p) => !existentes.includes(p.nome.toLowerCase()));

  async function salvar() {
    setErros({});
    const ok = await rodar(() => adicionarCor(modeloId, { nome, hex }), (r) => setErros(r.campos ?? {}));
    if (ok) setNome("");
  }

  return (
    <div className="rounded-2xl border border-dashed border-linha-forte p-3.5">
      <p className="mb-2.5 text-[13px] font-semibold">Acrescentar cor</p>
      {sugestoes.length > 0 && (
        <div className="mb-3">
          <p className="mb-1.5 text-[12px] text-ink-3">Cores que a vitrine já conhece (toque para usar):</p>
          <div className="flex flex-wrap gap-1.5">
            {sugestoes.map((p) => (
              <button
                key={p.nome}
                type="button"
                onClick={() => {
                  setNome(p.nome);
                  setHex(p.hex);
                }}
                className={cn("flex items-center gap-1.5 rounded-full border py-1 pl-1 pr-2.5 text-[12.5px] transition", nome === p.nome ? "border-ink bg-trilho" : "border-linha hover:border-linha-forte")}
              >
                <BolinhaCor hex={p.hex} tamanho="sm" />
                {p.nome}
              </button>
            ))}
          </div>
        </div>
      )}
      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void salvar();
        }}
      >
        <Campo rotulo="Nome da cor" erro={erros.nome} className="min-w-40 flex-1">
          <Entrada
            value={nome}
            onChange={(e) => {
              setNome(e.target.value);
              if (erros.nome) setErros((x) => ({ ...x, nome: "" }));
            }}
            placeholder="Vinho, Azul fosco…"
            maxLength={40}
            invalido={!!erros.nome}
          />
        </Campo>
        <SeletorTom hex={hex} aoMudar={setHex} erro={erros.hex} />
        <Botao type="submit" variante="primario" carregando={pendente} disabled={!nome.trim()}>
          <Plus className="size-4" /> Acrescentar
        </Botao>
      </form>
      <p className="mt-2 text-[12px] text-ink-3">Depois de acrescentar, use &quot;Pôr foto&quot; na cor para mostrar a moto naquela cor.</p>
    </div>
  );
}
