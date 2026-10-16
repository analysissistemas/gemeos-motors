"use client";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { BellOff, BellRing, Send, Share, SquarePlus } from "lucide-react";
import { Painel } from "@/components/ui/basicos";
import { Botao } from "@/components/ui/botao";
import { acaoAtivarAvisos, acaoAvisoDeTeste, acaoChavePublicaAvisos, acaoDesativarAvisos } from "./avisos-acoes";

/* Avisos no celular do Milton (dono, 15/10/2026). No iPhone o aviso só existe com o sistema na Tela de Início
   (Safari → Compartilhar → Adicionar à Tela de Início) e aberto por esse ícone, iOS 16.4 ou mais novo. */

type Estado = "carregando" | "iphone_sem_icone" | "sem_suporte" | "bloqueado" | "desligado" | "ligado";

const ehIphone = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
const instalado = () => window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;

function paraBytes(base64: string) {
  const b = (base64 + "=".repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(b), (c) => c.charCodeAt(0));
}

async function inscricaoAtual() {
  const reg = await navigator.serviceWorker.getRegistration("/sistema/");
  return (await reg?.pushManager.getSubscription()) ?? null;
}

export function AvisosNoCelular() {
  const [estado, setEstado] = useState<Estado>("carregando");
  const [pendente, iniciar] = useTransition();

  useEffect(() => {
    (async () => {
      const temPush = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
      if (ehIphone() && !instalado()) return setEstado("iphone_sem_icone");
      if (!temPush) return setEstado("sem_suporte");
      if (Notification.permission === "denied") return setEstado("bloqueado");
      setEstado((await inscricaoAtual()) ? "ligado" : "desligado");
    })().catch(() => setEstado("sem_suporte"));
  }, []);

  const ativar = () =>
    iniciar(async () => {
      try {
        if ((await Notification.requestPermission()) !== "granted") return setEstado("bloqueado");
        const reg = await navigator.serviceWorker.register("/sw-avisos.js", { scope: "/sistema/" });
        await navigator.serviceWorker.ready;
        const chave = await acaoChavePublicaAvisos();
        if (!chave.ok) return void toast.error(chave.erro);
        const s = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: paraBytes(chave.dados) }));
        const r = await acaoAtivarAvisos(s.toJSON(), ehIphone() ? "iPhone" : /android/i.test(navigator.userAgent) ? "Android" : "Computador");
        if (!r.ok) return void toast.error(r.erro);
        toast.success(r.mensagem);
        setEstado("ligado");
      } catch (e) {
        toast.error(`Não deu para ativar: ${e instanceof Error ? e.message : String(e)}`);
      }
    });

  const desativar = () =>
    iniciar(async () => {
      const s = await inscricaoAtual();
      if (s) {
        await acaoDesativarAvisos(s.endpoint);
        await s.unsubscribe();
      }
      toast.success("Avisos desativados neste aparelho");
      setEstado("desligado");
    });

  const testar = () =>
    iniciar(async () => {
      const r = await acaoAvisoDeTeste();
      if (!r.ok) return void toast.error(r.erro);
      toast.success("Aviso de teste enviado. Deve chegar em alguns segundos.");
    });

  return (
    <Painel id="avisos" className="mb-4 p-5">
      <h2 className="flex items-center gap-2 text-[16px] font-semibold">
        <BellRing className="size-4.5" /> Avisos no celular
      </h2>
      <p className="mt-1 text-[13px] text-ink-2">
        Chega no celular, mesmo com o sistema fechado: cliente pronto para fechar, cliente que mandou os dados, quem pediu uma pessoa ou está esperando, visita marcada pela IA, a hora de separar a moto da retirada e o resumo do dia às 8h. Fora do horário da loja, só o urgente.
      </p>

      {estado === "iphone_sem_icone" && (
        <ol className="mt-4 flex flex-col gap-2 rounded-2xl border border-linha bg-trilho/40 p-4 text-[13.5px]">
          <li>
            <b>1.</b> Abra este sistema no <b>Safari</b> do iPhone.
          </li>
          <li className="flex flex-wrap items-center gap-1">
            <b>2.</b> Toque em <Share className="inline size-4" /> <b>Compartilhar</b> (o quadrado com a seta, embaixo da tela).
          </li>
          <li className="flex flex-wrap items-center gap-1">
            <b>3.</b> Toque em <SquarePlus className="inline size-4" /> <b>Adicionar à Tela de Início</b> e depois em <b>Adicionar</b>.
          </li>
          <li>
            <b>4.</b> Abra o sistema pelo <b>ícone da Gêmeos</b> que apareceu na tela do iPhone, entre em <b>Minha conta</b> e toque em <b>Ativar avisos</b> aqui.
          </li>
          <li className="text-ink-2">Precisa do iOS 16.4 ou mais novo (Ajustes → Geral → Sobre).</li>
        </ol>
      )}
      {estado === "sem_suporte" && <p className="mt-4 text-[13.5px] text-ink-2">Este navegador não recebe avisos. No iPhone, use o Safari; no Android, o Chrome.</p>}
      {estado === "bloqueado" && (
        <p className="mt-4 text-[13.5px] text-ink-2">
          Os avisos foram bloqueados neste aparelho. No iPhone: <b>Ajustes → Notificações → Gêmeos</b> e ligue <b>Permitir Notificações</b>. Depois volte aqui.
        </p>
      )}
      {estado === "desligado" && (
        <Botao className="mt-4" variante="primario" carregando={pendente} onClick={ativar}>
          <BellRing className="size-4" /> Ativar avisos neste celular
        </Botao>
      )}
      {estado === "ligado" && (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className="rounded-full border border-bom/50 px-3 py-1 text-[12.5px] font-semibold text-bom">Avisos ligados neste aparelho</span>
          <Botao tamanho="sm" carregando={pendente} onClick={testar}>
            <Send className="size-4" /> Mandar aviso de teste
          </Botao>
          <Botao tamanho="sm" variante="fantasma" carregando={pendente} onClick={desativar}>
            <BellOff className="size-4" /> Desativar
          </Botao>
        </div>
      )}
    </Painel>
  );
}
