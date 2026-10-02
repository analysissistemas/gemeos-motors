"use client";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, Eye, EyeOff, Film, ImageOff, ImageUp, Palette, Pencil, Plus, Power, Rocket, Trash2 } from "lucide-react";
import type { CorModelo, ItemCatalogo } from "@/lib/consultas/estoque";
import { CAMPOS_FICHA, DISPONIBILIDADES, TIPOS_CATALOGO, type Disponibilidade, type TipoCatalogo } from "@/lib/dominio";
import { brl } from "@/lib/formato";
import { cn } from "@/lib/cn";
import { EstadoVazio, Painel, Selo } from "@/components/ui/basicos";
import { Botao } from "@/components/ui/botao";
import { Alternar, AreaTexto, Campo, CampoDinheiro, Entrada, Selecao } from "@/components/ui/campos";
import { Dialogo, RodapeDialogo } from "@/components/ui/dialogo";
import { LIMITE_FOTO, TIPOS_FOTO, reduzirFoto } from "@/components/ui/editor-foto";
import { BolinhaCor, CoresDoModelo, LADO_CATALOGO } from "./cores";
import { acaoAlternarAtivo, acaoAlternarSite, acaoEnviarFotoModelo, acaoEnviarFotoWhatsapp, acaoExcluirModelo, acaoMoverModelo, acaoRemoverFotoModelo, acaoRemoverFotoWhatsapp, acaoSalvarModelo } from "./acoes-catalogo";

type Resposta = { ok: true; mensagem?: string; dados?: unknown } | { ok: false; erro: string; campos?: Record<string, string> };

/** Aba "Catálogo" do estoque: o que o site mostra, com ou sem unidade no estoque. */
export function Catalogo({ itens, cores, editar }: { itens: ItemCatalogo[]; cores: CorModelo[]; editar: boolean }) {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();
  const [editando, setEditando] = useState<ItemCatalogo | "novo" | null>(null);
  const [coresDe, setCoresDe] = useState<number | null>(null);
  const modeloCores = itens.find((i) => i.id === coresDe) ?? null;
  const ativos = itens.filter((i) => i.ativo);

  function rodar(acao: () => Promise<Resposta>) {
    return new Promise<boolean>((fim) =>
      iniciar(async () => {
        const r = await acao();
        if (!r.ok) {
          toast.error(r.erro);
          return fim(false);
        }
        if (r.mensagem) toast.success(r.mensagem);
        router.refresh();
        fim(true);
      }),
    );
  }

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-2xl text-[13px] text-ink-2">
          É o catálogo do site: cada item vira um card, mesmo sem unidade no estoque. Aqui você muda foto, preço, ficha técnica, disponibilidade e ordem, e marca
          lançamento para o cliente reservar.
        </p>
        {editar && (
          <Botao variante="primario" onClick={() => setEditando("novo")}>
            <Plus className="size-4" /> Novo modelo
          </Botao>
        )}
      </div>

      <Painel className="overflow-hidden" aria-busy={pendente}>
        {itens.length === 0 ? (
          <EstadoVazio icone={<Palette />} titulo="Nenhum modelo no catálogo" texto="Cadastre o primeiro modelo em Novo modelo." />
        ) : (
          <ul>
            {itens.map((m) => {
              const i = ativos.findIndex((a) => a.id === m.id);
              const lista = cores.filter((c) => c.modeloId === m.id);
              return (
                <li key={m.id} className={cn("flex flex-wrap items-center gap-3 border-b border-linha px-4 py-3 last:border-0", !m.ativo && "bg-trilho/50")} data-modelo={m.nome}>
                  <span className="grid size-16 shrink-0 place-items-center overflow-hidden rounded-xl bg-trilho ring-1 ring-linha">
                    {m.fotoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element -- foto pública do catálogo (/api/vitrine/foto)
                      <img src={m.fotoUrl} alt={`Foto do ${m.nome}`} className="size-full object-contain" />
                    ) : (
                      <ImageOff className="size-5 text-ink-3" aria-label="Sem foto principal" />
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2 font-semibold">
                      {m.nome}
                      {!m.ativo && <Selo tom="neutro">Desativado</Selo>}
                      {m.ativo && !m.mostrarNoSite && <Selo tom="neutro">Fora do site</Selo>}
                      {m.lancamento && <Selo tom="info">Lançamento</Selo>}
                      {m.reservasNovas > 0 && <Selo tom="atencao">{m.reservasNovas} reserva(s) nova(s)</Selo>}
                    </p>
                    <p className="text-[12px] text-ink-3">
                      {TIPOS_CATALOGO[m.tipo as TipoCatalogo] ?? m.tipo} · {m.precoTabela ? brl(m.precoTabela) : "Consultar preço"} ·{" "}
                      {DISPONIBILIDADES[m.disponibilidade as Disponibilidade] ?? m.disponibilidade}
                      {m.veiculos ? ` · ${m.veiculos} veículo(s) no estoque` : ""}
                    </p>
                    {lista.length > 0 && (
                      <span className="mt-1 flex flex-wrap gap-1">
                        {lista.map((c) => (
                          <BolinhaCor key={c.id} hex={c.hex} tamanho="sm" className={cn(!c.ativo && "opacity-40")} />
                        ))}
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-1">
                    <Botao tamanho="sm" variante="secundario" onClick={() => setCoresDe(m.id)}>
                      <Palette className="size-4" /> {editar ? "Cores" : "Ver cores"}
                    </Botao>
                    {editar && (
                      <>
                        <Botao tamanho="sm" variante="secundario" onClick={() => setEditando(m)} aria-label={`Editar ${m.nome}`}>
                          <Pencil className="size-4" /> Editar
                        </Botao>
                        {m.ativo && (
                          <>
                            <Botao tamanho="icone" variante="fantasma" aria-label={`Subir ${m.nome}`} title="Subir no site" disabled={pendente || i <= 0} onClick={() => rodar(() => acaoMoverModelo(m.id, "cima"))}>
                              <ArrowUp className="size-4" />
                            </Botao>
                            <Botao tamanho="icone" variante="fantasma" aria-label={`Descer ${m.nome}`} title="Descer no site" disabled={pendente || i < 0 || i >= ativos.length - 1} onClick={() => rodar(() => acaoMoverModelo(m.id, "baixo"))}>
                              <ArrowDown className="size-4" />
                            </Botao>
                            <Botao
                              tamanho="icone"
                              variante="fantasma"
                              aria-label={m.mostrarNoSite ? `Tirar ${m.nome} do site` : `Mostrar ${m.nome} no site`}
                              title={m.mostrarNoSite ? "Tirar do site" : "Mostrar no site"}
                              disabled={pendente}
                              onClick={() => rodar(() => acaoAlternarSite(m.id, !m.mostrarNoSite))}
                            >
                              {m.mostrarNoSite ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                            </Botao>
                          </>
                        )}
                        <Botao
                          tamanho="icone"
                          variante="fantasma"
                          aria-label={m.ativo ? `Desativar ${m.nome}` : `Reativar ${m.nome}`}
                          title={m.ativo ? "Desativar (sai do site e das listas)" : "Reativar"}
                          disabled={pendente}
                          onClick={() => {
                            if (!m.ativo || window.confirm(`Desativar ${m.nome}? Ele sai do site e das listas de escolha, mas o histórico fica.`)) void rodar(() => acaoAlternarAtivo(m.id, !m.ativo));
                          }}
                        >
                          <Power className="size-4" />
                        </Botao>
                        {!m.veiculos && !m.reservas && (
                          <Botao
                            tamanho="icone"
                            variante="fantasma"
                            aria-label={`Apagar ${m.nome}`}
                            title="Apagar do catálogo"
                            disabled={pendente}
                            onClick={() => {
                              if (window.confirm(`Apagar ${m.nome} do catálogo? As cores e fotos dele também saem.`)) void rodar(() => acaoExcluirModelo(m.id));
                            }}
                          >
                            <Trash2 className="size-4" />
                          </Botao>
                        )}
                      </>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Painel>

      <Dialogo
        aberto={!!editando}
        aoMudar={(v) => !v && setEditando(null)}
        largura="lg"
        titulo={editando === "novo" ? "Novo modelo no catálogo" : editando ? `Editar ${editando.nome}` : ""}
        descricao="O que você salvar aqui aparece no site em até 1 minuto."
      >
        {editando && <FormModelo key={editando === "novo" ? "novo" : editando.id} item={editando === "novo" ? null : editando} aoTerminar={() => setEditando(null)} rodar={rodar} pendente={pendente} />}
      </Dialogo>

      <Dialogo
        aberto={!!modeloCores}
        aoMudar={(v) => !v && setCoresDe(null)}
        largura="lg"
        titulo={modeloCores ? `Cores do ${modeloCores.nome}` : "Cores"}
        descricao="Cada cor com a foto da moto naquela cor. JPG, PNG ou WebP até 2 MB; a foto é reduzida antes de enviar."
      >
        {modeloCores && <CoresDoModelo key={modeloCores.id} modelo={modeloCores} cores={cores.filter((c) => c.modeloId === modeloCores.id)} editar={editar} />}
      </Dialogo>
    </>
  );
}

function FormModelo({ item, aoTerminar, rodar, pendente }: { item: ItemCatalogo | null; aoTerminar: () => void; rodar: (a: () => Promise<Resposta>) => Promise<boolean>; pendente: boolean }) {
  const [erros, setErros] = useState<Record<string, string>>({});
  const [nome, setNome] = useState(item?.nome ?? "");
  const [tipo, setTipo] = useState<TipoCatalogo>((item?.tipo as TipoCatalogo) ?? "moto_eletrica");
  const [marca, setMarca] = useState(item?.marca ?? "");
  const [preco, setPreco] = useState<number | null>(item?.precoTabela ?? null);
  const [descricao, setDescricao] = useState(item?.descricao ?? "");
  const [ficha, setFicha] = useState<Record<string, string>>(() => {
    const f: Record<string, string> = {};
    for (const { chave } of CAMPOS_FICHA) {
      const v = item?.ficha?.[chave];
      f[chave] = v && v !== "—" && v !== "-" ? v : "";
    }
    return f;
  });
  const [mostrarNoSite, setMostrarNoSite] = useState(item?.mostrarNoSite ?? true);
  const [disponibilidade, setDisponibilidade] = useState<Disponibilidade>((item?.disponibilidade as Disponibilidade) ?? "consultar");
  const [lancamento, setLancamento] = useState(item?.lancamento ?? false);
  const [lancamentoTexto, setLancamentoTexto] = useState(item?.lancamentoTexto ?? "");
  const [fotoUrl, setFotoUrl] = useState(item?.fotoUrl ?? null);
  const [enviando, setEnviando] = useState(false);
  const entradaFoto = useRef<HTMLInputElement>(null);
  const [fotoWhats, setFotoWhats] = useState(item?.fotoWhatsappUrl ?? null);
  const [enviandoWhats, setEnviandoWhats] = useState(false);
  const entradaWhats = useRef<HTMLInputElement>(null);
  const [videoUrl, setVideoUrl] = useState(item?.videoUrl ?? null);
  const [enviandoVideo, setEnviandoVideo] = useState(false);
  const entradaVideo = useRef<HTMLInputElement>(null);
  const acessorio = tipo === "acessorio";

  async function salvar() {
    setErros({});
    const r = await acaoSalvarModelo(item?.id ?? null, {
      nome,
      tipo,
      marca,
      precoTabela: preco,
      descricao,
      ficha,
      mostrarNoSite,
      disponibilidade,
      lancamento,
      lancamentoTexto,
    });
    if (!r.ok) {
      setErros(r.campos ?? {});
      toast.error(r.erro);
      return;
    }
    await rodar(async () => ({ ok: true, mensagem: r.mensagem }));
    aoTerminar();
  }

  async function escolherFoto(e: React.ChangeEvent<HTMLInputElement>) {
    const arquivo = e.target.files?.[0];
    e.target.value = "";
    if (!arquivo || !item) return;
    if (!TIPOS_FOTO.includes(arquivo.type)) return void toast.error("Use uma foto JPG, PNG ou WebP.");
    setEnviando(true);
    try {
      const pronto = await reduzirFoto(arquivo, { ladoMaior: LADO_CATALOGO });
      if (pronto.size > LIMITE_FOTO) return void toast.error("A foto passa de 2 MB. Escolha uma menor.");
      const dados = new FormData();
      dados.set("foto", pronto);
      const r = await acaoEnviarFotoModelo(item.id, dados);
      if (!r.ok) return void toast.error(r.erro);
      setFotoUrl(r.dados.fotoUrl);
      await rodar(async () => ({ ok: true, mensagem: r.mensagem }));
    } finally {
      setEnviando(false);
    }
  }

  /* foto só do WhatsApp: vai em JPEG (o WhatsApp não aceita WebP), lado maior até 1600 px */
  async function escolherFotoWhats(e: React.ChangeEvent<HTMLInputElement>) {
    const arquivo = e.target.files?.[0];
    e.target.value = "";
    if (!arquivo || !item) return;
    if (!TIPOS_FOTO.includes(arquivo.type)) return void toast.error("Use uma foto JPG, PNG ou WebP.");
    setEnviandoWhats(true);
    try {
      const pronto = await reduzirFoto(arquivo, { ladoMaior: 1600, formato: "image/jpeg" });
      if (pronto.size > LIMITE_FOTO) return void toast.error("A foto passa de 2 MB mesmo reduzida. Escolha uma menor.");
      const dados = new FormData();
      dados.set("foto", pronto);
      const r = await acaoEnviarFotoWhatsapp(item.id, dados);
      if (!r.ok) return void toast.error(r.erro);
      setFotoWhats(r.dados.fotoWhatsappUrl);
      await rodar(async () => ({ ok: true, mensagem: r.mensagem }));
    } finally {
      setEnviandoWhats(false);
    }
  }

  /* vídeo vai por rota própria (até 10 MB); a ação de servidor só aceita 4 MB */
  async function trocarVideo(arquivo: File | null) {
    if (!item) return;
    if (arquivo && arquivo.type !== "video/mp4") return void toast.error("Use um vídeo MP4.");
    if (arquivo && arquivo.size > 10 * 1024 * 1024) return void toast.error("O vídeo passa de 10 MB. Mande um mais curto ou mais leve.");
    setEnviandoVideo(true);
    try {
      let r: Response;
      if (arquivo) {
        const dados = new FormData();
        dados.set("video", arquivo);
        r = await fetch(`/api/catalogo/video/${item.id}`, { method: "POST", body: dados });
      } else r = await fetch(`/api/catalogo/video/${item.id}`, { method: "DELETE" });
      const j = (await r.json().catch(() => ({}))) as { videoUrl?: string | null; erro?: string };
      if (!r.ok) return void toast.error(j.erro ?? "Não foi possível guardar o vídeo.");
      setVideoUrl(j.videoUrl ?? null);
      await rodar(async () => ({ ok: true, mensagem: arquivo ? "Vídeo da moto guardado" : "Vídeo removido" }));
    } catch {
      toast.error("Sem conexão. Tente de novo.");
    } finally {
      setEnviandoVideo(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-linha p-3">
        <span className="grid size-20 shrink-0 place-items-center overflow-hidden rounded-xl bg-trilho ring-1 ring-linha">
          {fotoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- foto pública do catálogo (/api/vitrine/foto)
            <img src={fotoUrl} alt="Foto principal" className="size-full object-contain" />
          ) : (
            <ImageOff className="size-6 text-ink-3" aria-label="Sem foto principal" />
          )}
        </span>
        <div className="min-w-0 flex-1 text-[13px]">
          <p className="font-semibold">Foto principal do card</p>
          <p className="text-ink-3">{item ? "A moto inteira, de preferência com fundo claro. JPG, PNG ou WebP até 2 MB." : "Salve o modelo primeiro; depois dá para pôr a foto."}</p>
        </div>
        {item && (
          <div className="flex gap-1">
            <input ref={entradaFoto} type="file" accept={TIPOS_FOTO.join(",")} className="hidden" onChange={escolherFoto} aria-label="Escolher foto principal" />
            <Botao tamanho="sm" variante="secundario" carregando={enviando} disabled={pendente} onClick={() => entradaFoto.current?.click()}>
              <ImageUp className="size-4" /> {fotoUrl ? "Trocar foto" : "Pôr foto"}
            </Botao>
            {fotoUrl && (
              <Botao
                tamanho="icone"
                variante="fantasma"
                aria-label="Remover foto principal"
                disabled={pendente}
                onClick={async () => {
                  if (await rodar(() => acaoRemoverFotoModelo(item.id))) setFotoUrl(null);
                }}
              >
                <ImageOff className="size-4" />
              </Botao>
            )}
          </div>
        )}
      </div>

      {!acessorio && (
        <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-linha p-3">
          <span className="grid size-20 shrink-0 place-items-center overflow-hidden rounded-xl bg-trilho ring-1 ring-linha">
            {fotoWhats ? (
              // eslint-disable-next-line @next/next/no-img-element -- foto do catálogo (/api/vitrine/foto)
              <img src={fotoWhats} alt="Foto do WhatsApp" className="size-full object-contain" />
            ) : (
              <ImageOff className="size-6 text-ink-3" aria-label="Sem foto do WhatsApp" />
            )}
          </span>
          <div className="min-w-0 flex-1 text-[13px]">
            <p className="font-semibold">Foto do WhatsApp (a IA manda)</p>
            <p className="text-ink-3">
              {item
                ? "Não aparece no site. Pode ser o panfleto com a ficha. Sem ela, a IA manda a foto da cor que está no estoque. JPG, PNG ou WebP; a tela reduz sozinha."
                : "Salve o modelo primeiro; depois dá para pôr a foto."}
            </p>
          </div>
          {item && (
            <div className="flex gap-1">
              <input ref={entradaWhats} type="file" accept={TIPOS_FOTO.join(",")} className="hidden" onChange={escolherFotoWhats} aria-label="Escolher foto do WhatsApp" />
              <Botao tamanho="sm" variante="secundario" carregando={enviandoWhats} disabled={pendente} onClick={() => entradaWhats.current?.click()}>
                <ImageUp className="size-4" /> {fotoWhats ? "Trocar foto" : "Pôr foto"}
              </Botao>
              {fotoWhats && (
                <Botao
                  tamanho="icone"
                  variante="fantasma"
                  aria-label="Remover foto do WhatsApp"
                  disabled={pendente || enviandoWhats}
                  onClick={async () => {
                    if (await rodar(() => acaoRemoverFotoWhatsapp(item.id))) setFotoWhats(null);
                  }}
                >
                  <ImageOff className="size-4" />
                </Botao>
              )}
            </div>
          )}
        </div>
      )}

      {!acessorio && (
        <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-linha p-3">
          <span className="grid size-20 shrink-0 place-items-center overflow-hidden rounded-xl bg-trilho ring-1 ring-linha">
            {videoUrl ? <video src={videoUrl} muted playsInline preload="metadata" className="size-full object-cover" aria-label="Vídeo da moto" /> : <Film className="size-6 text-ink-3" aria-label="Sem vídeo" />}
          </span>
          <div className="min-w-0 flex-1 text-[13px]">
            <p className="font-semibold">Vídeo da moto</p>
            <p className="text-ink-3">{item ? "A IA manda no WhatsApp junto com a ficha, quando o cliente fala desta moto. MP4 até 10 MB." : "Salve o modelo primeiro; depois dá para pôr o vídeo."}</p>
          </div>
          {item && (
            <div className="flex gap-1">
              <input
                ref={entradaVideo}
                type="file"
                accept="video/mp4"
                className="hidden"
                aria-label="Escolher vídeo da moto"
                onChange={(e) => {
                  const arquivo = e.target.files?.[0] ?? null;
                  e.target.value = "";
                  if (arquivo) void trocarVideo(arquivo);
                }}
              />
              <Botao tamanho="sm" variante="secundario" carregando={enviandoVideo} disabled={pendente} onClick={() => entradaVideo.current?.click()}>
                <Film className="size-4" /> {videoUrl ? "Trocar vídeo" : "Pôr vídeo"}
              </Botao>
              {videoUrl && (
                <Botao tamanho="icone" variante="fantasma" aria-label="Remover vídeo da moto" disabled={pendente || enviandoVideo} onClick={() => void trocarVideo(null)}>
                  <Trash2 className="size-4" />
                </Botao>
              )}
            </div>
          )}
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <Campo rotulo="Nome" obrigatorio erro={erros.nome}>
          <Entrada value={nome} onChange={(e) => setNome(e.target.value)} maxLength={60} invalido={!!erros.nome} />
        </Campo>
        <Campo rotulo="Tipo" erro={erros.tipo}>
          <Selecao value={tipo} onChange={(e) => setTipo(e.target.value as TipoCatalogo)}>
            {(Object.keys(TIPOS_CATALOGO) as TipoCatalogo[]).map((k) => (
              <option key={k} value={k}>
                {TIPOS_CATALOGO[k]}
              </option>
            ))}
          </Selecao>
        </Campo>
        <Campo rotulo="Marca" erro={erros.marca}>
          <Entrada value={marca} onChange={(e) => setMarca(e.target.value)} maxLength={60} />
        </Campo>
        <Campo rotulo="Preço de tabela" dica="Vazio = o site mostra Consultar preço" erro={erros.precoTabela}>
          <CampoDinheiro valor={preco} aoMudar={setPreco} invalido={!!erros.precoTabela} />
        </Campo>
      </div>

      <Campo rotulo="Descrição curta" dica="Aparece no card (principalmente em acessório)." erro={erros.descricao}>
        <AreaTexto value={descricao} onChange={(e) => setDescricao(e.target.value)} rows={2} maxLength={500} />
      </Campo>

      {!acessorio && (
        <fieldset className="rounded-2xl border border-linha p-3">
          <legend className="px-1 text-[12px] font-medium text-ink-2">Ficha técnica (campo vazio não aparece no site)</legend>
          <div className="grid gap-3 sm:grid-cols-2">
            {CAMPOS_FICHA.map(({ chave, rotulo, exemplo }) => (
              <Campo key={chave} rotulo={rotulo} dica={`Ex.: ${exemplo}`} erro={erros[chave] ?? erros[`ficha.${chave}`]}>
                <Entrada value={ficha[chave] ?? ""} maxLength={60} onChange={(e) => setFicha((f) => ({ ...f, [chave]: e.target.value }))} />
              </Campo>
            ))}
          </div>
        </fieldset>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <Alternar marcado={mostrarNoSite} aoMudar={setMostrarNoSite} rotulo="Mostrar no site" descricao="Desligado, o card some do site." />
        <Campo rotulo="Disponibilidade (selo do card)">
          <Selecao value={disponibilidade} onChange={(e) => setDisponibilidade(e.target.value as Disponibilidade)}>
            {(Object.keys(DISPONIBILIDADES) as Disponibilidade[]).map((k) => (
              <option key={k} value={k}>
                {DISPONIBILIDADES[k]}
              </option>
            ))}
          </Selecao>
        </Campo>
      </div>

      <div className="flex flex-col gap-2 rounded-2xl border border-linha p-3">
        <Alternar marcado={lancamento} aoMudar={setLancamento} rotulo="Lançamento" descricao="Aparece em destaque no site, com o botão para o cliente reservar." />
        {lancamento && (
          <Campo rotulo="Frase curta do lançamento" dica='Ex.: "Chega em outubro"' erro={erros.lancamentoTexto}>
            <Entrada value={lancamentoTexto} onChange={(e) => setLancamentoTexto(e.target.value)} maxLength={60} />
          </Campo>
        )}
        {lancamento && <p className="flex items-center gap-1.5 text-[12px] text-ink-3"><Rocket className="size-3.5" /> As reservas chegam em Operação → Reservas e já abrem um negócio no funil.</p>}
      </div>

      <RodapeDialogo>
        <Botao variante="fantasma" onClick={aoTerminar}>
          Cancelar
        </Botao>
        <Botao variante="primario" carregando={pendente} onClick={salvar}>
          {item ? "Salvar" : "Criar modelo"}
        </Botao>
      </RodapeDialogo>
    </div>
  );
}
