"use client";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { toast } from "sonner";
import { BellRing, MessagesSquare } from "lucide-react";
import type { ContextoConversa, ItemConversa, MensagemChat, NotaChat } from "@/lib/consultas/conversas";
import type { FiltroConversa } from "@/lib/consultas/conversas.tipos";
import { ETAPAS, type Etapa } from "@/lib/dominio";
import { formatarTelefone } from "@/lib/formato";
import { cn } from "@/lib/cn";
import { EstadoVazio } from "@/components/ui/basicos";
import { Dialogo } from "@/components/ui/dialogo";
import { pedirAtualizacaoContadores } from "@/components/shell/contadores";
import { DialogoPerda } from "@/components/negocios/dialogo-perda";
import { DialogoFecharVenda } from "@/components/negocios/dialogo-fechar-venda";
import { FormularioNegocio, type NegocioForm } from "@/components/negocios/formulario-negocio";
import { acaoDetalheNegocio, acaoMoverNegocio } from "@/app/sistema/funil/acoes";
import {
  acaoAbrirConversa,
  acaoAssumir,
  acaoAtribuir,
  acaoContexto,
  acaoEnviarMensagem,
  acaoListarConversas,
  acaoMensagensAntigas,
  acaoNota,
  acaoStatusConversa,
} from "@/app/sistema/conversas/acoes";
import { Chat } from "./chat";
import type { EnvioChat, Resposta } from "./compositor";
import { ContextoCliente, type AlvoEtapa } from "./contexto";
import { ListaConversas } from "./lista";
import { SimuladorCliente } from "./simulador";

type Aberta = { mensagens: MensagemChat[]; notas: NotaChat[]; contexto: ContextoConversa; temMais: boolean };

const assinarNada = () => () => {};

const ordenar = (xs: ItemConversa[]) =>
  [...xs].sort((a, b) => (b.ultimaMensagemEm ? +new Date(b.ultimaMensagemEm) : 0) - (a.ultimaMensagemEm ? +new Date(a.ultimaMensagemEm) : 0) || b.id - a.id);

export function CentralConversas({
  inicial,
  conversaInicial,
  equipe,
  respostas,
  usuario,
  simulado,
  permissoes,
}: {
  inicial: { itens: ItemConversa[]; temMais: boolean };
  conversaInicial: number | null;
  equipe: { id: number; nome: string }[];
  respostas: Resposta[];
  usuario: { id: number; nome: string };
  simulado: boolean;
  permissoes: { clientes: boolean; funil: boolean; vendas: boolean };
}) {
  const [itens, setItens] = useState(inicial.itens);
  const [temMais, setTemMais] = useState(inicial.temMais);
  const [filtro, setFiltro] = useState<FiltroConversa>("todas");
  const [busca, setBusca] = useState("");
  const [carregandoLista, setCarregandoLista] = useState(false);
  const [aberta, setAberta] = useState<number | null>(conversaInicial);
  const [dados, setDados] = useState<Aberta | null>(null);
  const [carregandoChat, setCarregandoChat] = useState(false);
  const [info, setInfo] = useState(false);
  const [simulador, setSimulador] = useState(false);
  const [perda, setPerda] = useState<AlvoEtapa | null>(null);
  const [fechar, setFechar] = useState<AlvoEtapa | null>(null);
  const [formNeg, setFormNeg] = useState<NegocioForm | null>(null);
  const [, setVersaoPermissao] = useState(0);
  const podeNotificar = useSyncExternalStore(
    assinarNada,
    () => (typeof Notification === "undefined" ? "indisponivel" : Notification.permission),
    () => "indisponivel",
  );

  const abertaRef = useRef(aberta);
  const dadosRef = useRef(dados);
  const desde = useRef(new Date().toISOString());
  const itensRef = useRef(itens);
  useEffect(() => {
    abertaRef.current = aberta;
    dadosRef.current = dados;
    itensRef.current = itens;
  });

  /* ---------- abrir / fechar conversa ---------- */
  const carregarConversa = useCallback(async (id: number) => {
    try {
      const d = await acaoAbrirConversa(id);
      if (abertaRef.current === id) setDados(d);
      setItens((xs) => xs.map((x) => (x.id === id ? { ...x, naoLidas: 0 } : x)));
      pedirAtualizacaoContadores();
    } catch {
      toast.error("Não foi possível abrir a conversa.");
    }
  }, []);

  const abrir = useCallback(
    (id: number) => {
      if (abertaRef.current === id && dadosRef.current) return;
      setAberta(id);
      setDados(null);
      window.history.pushState({ conversa: id }, "", `/sistema/conversas?c=${id}`);
      carregarConversa(id);
    },
    [carregarConversa],
  );

  useEffect(() => {
    if (!conversaInicial) return;
    const t = setTimeout(() => carregarConversa(conversaInicial), 0);
    return () => clearTimeout(t);
  }, [conversaInicial, carregarConversa]);

  useEffect(() => {
    const aoVoltar = () => {
      const id = Number(new URLSearchParams(location.search).get("c")) || null;
      setAberta(id);
      setDados(null);
      setInfo(false);
      if (id) carregarConversa(id);
    };
    window.addEventListener("popstate", aoVoltar);
    return () => window.removeEventListener("popstate", aoVoltar);
  }, [carregarConversa]);

  const fecharConversa = () => {
    if (window.history.state?.conversa) window.history.back();
    else {
      window.history.replaceState(null, "", "/sistema/conversas");
      setAberta(null);
      setDados(null);
    }
  };

  const recarregarContexto = useCallback(async () => {
    const id = abertaRef.current;
    if (!id) return;
    const ctx = await acaoContexto(id);
    if (ctx && abertaRef.current === id) setDados((d) => (d ? { ...d, contexto: ctx } : d));
  }, []);

  /* ---------- lista: filtro e busca ---------- */
  const primeiraBusca = useRef(true);
  useEffect(() => {
    /* a primeira lista já veio do servidor */
    if (primeiraBusca.current) {
      primeiraBusca.current = false;
      if (filtro === "todas" && !busca) return;
    }
    const t = setTimeout(async () => {
      setCarregandoLista(true);
      try {
        const r = await acaoListarConversas(filtro, busca);
        setItens(r.itens);
        setTemMais(r.temMais);
      } finally {
        setCarregandoLista(false);
      }
    }, busca ? 300 : 0);
    return () => clearTimeout(t);
  }, [filtro, busca]);

  async function carregarMais() {
    const ultimo = itens[itens.length - 1];
    if (!ultimo?.ultimaMensagemEm) return;
    setCarregandoLista(true);
    try {
      const r = await acaoListarConversas(filtro, busca, new Date(ultimo.ultimaMensagemEm).toISOString());
      setItens((xs) => [...xs, ...r.itens.filter((n) => !xs.some((x) => x.id === n.id))]);
      setTemMais(r.temMais);
    } finally {
      setCarregandoLista(false);
    }
  }

  /* ---------- tempo real (consulta curta; ver /api/conversas/sincronizar) ---------- */
  const sincronizar = useCallback(async () => {
    const id = abertaRef.current;
    const d = dadosRef.current;
    const ultima = d?.mensagens.filter((m) => m.id > 0).at(-1)?.id ?? 0;
    const url = `/api/conversas/sincronizar?desde=${encodeURIComponent(desde.current)}${id && d ? `&conversa=${id}&ultima=${ultima}&notas=1` : ""}`;
    try {
      const r = await fetch(url, { cache: "no-store" });
      if (!r.ok) return;
      const j = (await r.json()) as { agora: string; conversas: ItemConversa[]; mensagens: MensagemChat[]; status: { id: number; status: string }[]; notas: NotaChat[] | null };
      desde.current = j.agora;

      if (j.conversas.length) {
        const antes = new Map(itensRef.current.map((x) => [x.id, x]));
        for (const c of j.conversas) {
          const velha = antes.get(c.id);
          const novasMsgs = c.naoLidas - (velha?.naoLidas ?? 0);
          if (c.id !== id && c.ultimaMensagemDirecao === "incoming" && novasMsgs > 0) {
            const nome = c.clienteNome ?? c.contatoNome ?? formatarTelefone(c.contatoTelefone);
            toast(`${nome}: ${c.ultimaMensagemTexto ?? "nova mensagem"}`, { action: { label: "Abrir", onClick: () => abrir(c.id) } });
            if (document.visibilityState !== "visible" && typeof Notification !== "undefined" && Notification.permission === "granted") {
              new Notification(nome, { body: c.ultimaMensagemTexto ?? "Nova mensagem", tag: `conversa-${c.id}` });
            }
          }
        }
        setItens((xs) => {
          const mapa = new Map(xs.map((x) => [x.id, x]));
          for (const c of j.conversas) {
            if (mapa.has(c.id)) mapa.set(c.id, c.id === id ? { ...c, naoLidas: 0 } : c);
            else if (filtro === "todas" && !busca) mapa.set(c.id, c);
          }
          return ordenar(Array.from(mapa.values()));
        });
        pedirAtualizacaoContadores();
      }

      if (id && d && abertaRef.current === id) {
        const mudouConversa = j.conversas.some((c) => c.id === id);
        setDados((atual) => {
          if (!atual || abertaRef.current !== id) return atual;
          const existentes = new Set(atual.mensagens.map((m) => m.id));
          const statusPor = new Map(j.status.map((s) => [s.id, s.status]));
          const mensagens = [...atual.mensagens.map((m) => (statusPor.has(m.id) ? { ...m, status: statusPor.get(m.id)! } : m)), ...j.mensagens.filter((m) => !existentes.has(m.id))];
          return { ...atual, mensagens, notas: j.notas && j.notas.length !== atual.notas.length ? j.notas : atual.notas };
        });
        if (mudouConversa) recarregarContexto();
      }
    } catch {
      /* rede instável: tenta de novo no próximo ciclo */
    }
  }, [abrir, filtro, busca, recarregarContexto]);

  useEffect(() => {
    let parado = false;
    let timer: ReturnType<typeof setTimeout>;
    const ciclo = async () => {
      if (parado) return;
      await sincronizar();
      timer = setTimeout(ciclo, document.visibilityState === "visible" ? 3000 : 15000);
    };
    timer = setTimeout(ciclo, 3000);
    return () => {
      parado = true;
      clearTimeout(timer);
    };
  }, [sincronizar]);

  /* o áudio vai por rota própria (arquivo de verdade, não texto codificado) */
  async function enviarAudio(id: number, blob: Blob, mime: string, duracao: number): Promise<{ ok: true; dados: { id: number } } | { ok: false; erro: string }> {
    try {
      const f = new FormData();
      f.append("audio", new File([blob], "audio", { type: mime }));
      f.append("duracao", String(duracao));
      const res = await fetch(`/api/conversas/${id}/audio`, { method: "POST", body: f });
      const j = (await res.json().catch(() => null)) as { ok?: boolean; id?: number; erro?: string } | null;
      if (!res.ok || !j?.ok || !j.id) return { ok: false, erro: j?.erro ?? "Não foi possível enviar o áudio." };
      return { ok: true, dados: { id: j.id } };
    } catch {
      return { ok: false, erro: "Sem conexão. O áudio não foi enviado." };
    }
  }

  /* ---------- ações do chat ---------- */
  async function enviar(e: EnvioChat): Promise<boolean> {
    const id = aberta;
    if (!id || !dados) return false;
    if (e.modo === "nota") {
      const r = await acaoNota(id, e.conteudo);
      if (!r.ok) {
        toast.error(r.erro);
        return false;
      }
      setDados((d) => (d ? { ...d, notas: [...d.notas, { id: r.dados.id, conteudo: e.conteudo, criadoEm: new Date(), usuarioNome: usuario.nome }] } : d));
      return true;
    }
    const temp: MensagemChat = {
      id: -Date.now(),
      direcao: "outgoing",
      autor: "usuario",
      usuarioNome: usuario.nome,
      tipo: e.tipo,
      conteudo: e.tipo === "audio" ? null : e.conteudo || null,
      midiaUrl: "midia" in e ? e.midia.url : e.tipo === "audio" ? URL.createObjectURL(e.blob) : null,
      midiaNome: "midia" in e ? e.midia.nome : null,
      midiaMime: "midia" in e ? e.midia.mime : e.tipo === "audio" ? e.mime : null,
      midiaTamanho: "midia" in e ? e.midia.tamanho : null,
      status: "pending",
      respostaA: null,
      metadados: e.tipo === "audio" ? { duracao: e.duracao } : null,
      criadoEm: new Date(),
    };
    setDados((d) => (d ? { ...d, mensagens: [...d.mensagens, temp] } : d));
    const r =
      e.tipo === "audio"
        ? await enviarAudio(id, e.blob, e.mime, e.duracao)
        : await acaoEnviarMensagem(id, { tipo: e.tipo, conteudo: e.conteudo, midia: "midia" in e ? e.midia : null });
    if (!r.ok) {
      setDados((d) => (d ? { ...d, mensagens: d.mensagens.filter((m) => m.id !== temp.id) } : d));
      toast.error(r.erro);
      return false;
    }
    setDados((d) => (d ? { ...d, mensagens: d.mensagens.map((m) => (m.id === temp.id ? { ...m, id: r.dados.id, status: "sent" } : m)) } : d));
    setItens((xs) => ordenar(xs.map((x) => (x.id === id ? { ...x, ultimaMensagemEm: new Date(), ultimaMensagemTexto: e.tipo === "texto" ? e.conteudo : e.tipo === "audio" ? "Áudio" : e.tipo === "imagem" ? "Foto" : "Documento", ultimaMensagemDirecao: "outgoing", naoLidas: 0 } : x))));
    sincronizar();
    return true;
  }

  async function executarAcao(p: Promise<{ ok: boolean; erro?: string; mensagem?: string }>) {
    const r = await p;
    if (!r.ok) return void toast.error(r.erro);
    if (r.mensagem) toast.success(r.mensagem);
    await recarregarContexto();
    sincronizar();
  }

  async function pedirEtapa(alvo: AlvoEtapa, atual: string, destino: Etapa) {
    if (destino === atual) return;
    if (destino === "perdida") return setPerda(alvo);
    if (destino === "fechada") return setFechar(alvo);
    const r = await acaoMoverNegocio(alvo.id, destino);
    if (!r.ok) return void toast.error(r.erro);
    toast.success(`Negócio em "${ETAPAS.find((x) => x.id === destino)?.rotulo}"`);
    await recarregarContexto();
    sincronizar();
  }

  async function editarNegocio() {
    const n = dados?.contexto.negocio;
    if (!n) return;
    const d = await acaoDetalheNegocio(n.id);
    if (!d) return;
    setFormNeg({
      id: d.negocio.id,
      cliente: { id: d.cliente.id, nome: d.cliente.nome },
      veiculoId: d.negocio.veiculoId,
      veiculoInteresse: d.negocio.veiculoInteresse,
      responsavelId: d.negocio.responsavelId,
      origem: d.negocio.origem,
      valorAnunciado: d.negocio.valorAnunciado,
      valorProposta: d.negocio.valorProposta,
      temTroca: d.negocio.temTroca,
      trocaDescricao: d.negocio.trocaDescricao,
      trocaValor: d.negocio.trocaValor,
      observacoes: d.negocio.observacoes,
    });
  }

  const contexto = dados?.contexto;
  const painel = contexto && (
    <ContextoCliente
      ctx={contexto}
      equipe={equipe}
      usuarioId={usuario.id}
      permissoes={permissoes}
      aoAtualizar={() => {
        recarregarContexto();
        sincronizar();
      }}
      aoPedirEtapa={pedirEtapa}
      aoEditarNegocio={editarNegocio}
      aoAtribuir={(rid) => aberta && executarAcao(acaoAtribuir(aberta, rid))}
      aoStatus={(s) => aberta && executarAcao(acaoStatusConversa(aberta, s))}
    />
  );

  return (
    <div className="flex lg:h-[calc(100dvh-3.5rem)]">
      <aside className={cn("w-full flex-col lg:w-[360px] lg:shrink-0 lg:border-r lg:border-linha xl:w-[380px]", aberta ? "hidden lg:flex" : "flex min-h-[calc(100dvh-8.5rem)]")}>
        {podeNotificar === "default" && (
          <button
            className="flex items-center gap-2 border-b border-linha bg-vidro px-4 py-2 text-left text-[12.5px] hover:bg-trilho"
            onClick={async () => {
              await Notification.requestPermission();
              setVersaoPermissao((v) => v + 1);
            }}
          >
            <BellRing className="size-4" /> Ativar aviso do navegador para novas mensagens
          </button>
        )}
        <ListaConversas
          itens={itens}
          aberta={aberta}
          filtro={filtro}
          busca={busca}
          carregando={carregandoLista}
          temMais={temMais}
          simulado={simulado}
          usuarioId={usuario.id}
          aoFiltrar={setFiltro}
          aoBuscar={setBusca}
          aoAbrir={abrir}
          aoCarregarMais={carregarMais}
          aoSimular={() => setSimulador(true)}
        />
      </aside>

      <section className={cn("min-w-0 flex-1 flex-col bg-fundo", aberta ? "fixed inset-0 z-40 flex lg:static lg:z-auto" : "hidden lg:flex")}>
        {aberta && dados ? (
          <Chat
            key={aberta}
            contexto={dados.contexto}
            mensagens={dados.mensagens}
            notas={dados.notas}
            temMais={dados.temMais}
            carregando={carregandoChat}
            equipe={equipe}
            usuarioId={usuario.id}
            respostas={respostas}
            simulado={simulado}
            aoVoltar={fecharConversa}
            aoInfo={() => setInfo(true)}
            aoCarregarAntigas={async () => {
              const primeira = dados.mensagens.find((m) => m.id > 0);
              if (!primeira) return;
              setCarregandoChat(true);
              try {
                const r = await acaoMensagensAntigas(aberta, primeira.id);
                setDados((d) => (d ? { ...d, mensagens: [...r.mensagens, ...d.mensagens], temMais: r.temMais } : d));
              } finally {
                setCarregandoChat(false);
              }
            }}
            aoEnviar={enviar}
            aoAssumir={() => executarAcao(acaoAssumir(aberta))}
            aoAtribuir={(rid) => executarAcao(acaoAtribuir(aberta, rid))}
            aoStatus={(s) => executarAcao(acaoStatusConversa(aberta, s))}
          />
        ) : aberta ? (
          <div className="flex h-full flex-col gap-3 p-6">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className={cn("h-12 animate-pulse rounded-2xl bg-trilho", i % 2 ? "ml-auto w-2/3" : "w-1/2")} />
            ))}
          </div>
        ) : (
          <div className="grid h-full place-items-center">
            <EstadoVazio icone={<MessagesSquare />} titulo="Escolha uma conversa" texto="Mensagens, dados do cliente e o negócio no funil ficam lado a lado." />
          </div>
        )}
      </section>

      {aberta && contexto && <aside className="rolagem-fina hidden w-[360px] shrink-0 overflow-y-auto border-l border-linha p-4 xl:block">{painel}</aside>}

      <Dialogo aberto={info && !!contexto} aoMudar={setInfo} tipo="gaveta" titulo={contexto ? (contexto.cliente?.nome ?? contexto.conversa.contatoNome ?? formatarTelefone(contexto.conversa.contatoTelefone)) : "Cliente"} descricao="Cliente, negócio, follow-up e histórico">
        {painel}
      </Dialogo>

      <SimuladorCliente
        aberto={simulador}
        aoMudar={setSimulador}
        conversaAtual={contexto ? { telefone: contexto.conversa.contatoTelefone, nome: contexto.conversa.contatoNome ?? "" } : null}
        aoSimulado={(id) => {
          sincronizar();
          if (id && id !== aberta) abrir(id);
          else if (id) setTimeout(sincronizar, 500);
        }}
      />
      <DialogoPerda
        negocio={perda}
        equipe={equipe}
        aoMudar={(v) => !v && setPerda(null)}
        aoConcluir={() => {
          setPerda(null);
          recarregarContexto();
          sincronizar();
        }}
      />
      <DialogoFecharVenda
        negocio={fechar}
        aoMudar={(v) => !v && setFechar(null)}
        aoConcluir={() => {
          setFechar(null);
          recarregarContexto();
          sincronizar();
        }}
      />
      <FormularioNegocio
        inicial={formNeg}
        aoMudar={(v) => !v && setFormNeg(null)}
        equipe={equipe}
        aoSalvar={() => {
          recarregarContexto();
          sincronizar();
        }}
      />
    </div>
  );
}
