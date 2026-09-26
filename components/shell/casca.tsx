"use client";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useSyncExternalStore } from "react";
import {
  Bell,
  Bike,
  CalendarClock,
  LayoutDashboard,
  LogOut,
  Menu,
  MessageSquare,
  Moon,
  Receipt,
  ScrollText,
  Settings,
  Sparkles,
  SquareKanban,
  Sun,
  UserCog,
  UserRound,
  Users,
  Wallet,
  Wrench,
  X,
  PhoneCall,
  Camera,
  Tag,
  BookOpen,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { pode, PAPEIS, type Papel } from "@/lib/dominio";
import { sair } from "@/app/login/acoes";
import { SECOES_MENU, type ItemMenu } from "./navegacao";
import { useContadores } from "./contadores";

const ICONES: Record<string, React.ComponentType<{ className?: string }>> = {
  painel: LayoutDashboard,
  conversas: MessageSquare,
  funil: SquareKanban,
  followups: CalendarClock,
  ligacoes: PhoneCall,
  cameras: Camera,
  promocoes: Tag,
  clientes: Users,
  estoque: Bike,
  vendas: Receipt,
  assistencia: Wrench,
  financeiro: Wallet,
  logs: ScrollText,
  usuarios: UserCog,
  config: Settings,
  ia: Sparkles,
  ajuda: BookOpen,
};

function ativo(pathname: string, href: string) {
  return href === "/sistema" ? pathname === "/sistema" : pathname === href || pathname.startsWith(href + "/");
}

export function Casca({ usuario, children }: { usuario: { nome: string; papel: Papel }; children: React.ReactNode }) {
  const pathname = usePathname();
  const [menuAberto, setMenuAberto] = useState(false);
  const contadores = useContadores();
  const secoes = SECOES_MENU.map((s) => ({ ...s, itens: s.itens.filter((i) => pode(usuario.papel, i.permissao)) })).filter((s) => s.itens.length);
  const todos = secoes.flatMap((s) => s.itens);
  const atual = todos.find((i) => ativo(pathname, i.href));

  /* barra de baixo no celular: o que a pessoa mais usa, pelo perfil */
  const preferidos =
    usuario.papel === "tecnico"
      ? ["/sistema/assistencia", "/sistema/clientes", "/sistema/estoque"]
      : ["/sistema/conversas", "/sistema/funil", "/sistema/clientes"];
  const barra = preferidos.map((h) => todos.find((i) => i.href === h)).filter(Boolean) as ItemMenu[];

  const Lista = (
    <nav className="flex flex-col gap-5" aria-label="Menu principal">
      {secoes.map((s) => (
        <div key={s.titulo}>
          <p className="mb-1.5 px-3 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-ink-3">{s.titulo}</p>
          <ul className="flex flex-col gap-0.5">
            {s.itens.map((i) => {
              const Icone = ICONES[i.icone];
              const on = ativo(pathname, i.href);
              const n = i.contador ? contadores[i.contador] : 0;
              return (
                <li key={i.href}>
                  <Link
                    href={i.href}
                    onClick={() => setMenuAberto(false)}
                    aria-current={on ? "page" : undefined}
                    className={cn(
                      "flex items-center gap-3 rounded-xl px-3 py-2 text-[13.5px] transition",
                      on ? "bg-vidro-forte font-semibold text-ink shadow-[inset_0_0_0_1px_var(--linha)]" : "text-ink-2 hover:bg-trilho hover:text-ink",
                    )}
                  >
                    <Icone className="size-[18px] shrink-0" />
                    <span className="flex-1 truncate">{i.rotulo}</span>
                    {n > 0 && (
                      <span className="num min-w-5 rounded-full bg-ink px-1.5 text-center text-[11px] font-semibold leading-5 text-contra-ink">{n > 99 ? "99+" : n}</span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );

  return (
    <div className="flex min-h-dvh">
      {/* barra lateral — desktop */}
      <aside className="sticky top-0 hidden h-dvh w-[248px] shrink-0 flex-col border-r border-linha bg-[var(--cabecalho)] backdrop-blur-xl lg:flex">
        <Link href="/sistema" className="flex items-center gap-2 px-5 pb-4 pt-5">
          <span className="claro:rounded-lg claro:bg-black claro:px-1.5 claro:py-1">
            <Image src="/fotos/logo-gemeos-motors.webp" alt="Gêmeos Motors" width={96} height={48} className="h-9 w-auto" priority />
          </span>
        </Link>
        <div className="rolagem-fina flex-1 overflow-y-auto px-3 pb-4">{Lista}</div>
        <RodapeUsuario usuario={usuario} />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-linha bg-[var(--cabecalho)] px-3 backdrop-blur-xl sm:px-5">
          <button className="grid size-10 place-items-center rounded-full text-ink-2 hover:bg-trilho lg:hidden" onClick={() => setMenuAberto(true)} aria-label="Abrir menu">
            <Menu className="size-5" />
          </button>
          <p className="min-w-0 flex-1 truncate text-[14px] font-semibold">{atual?.rotulo ?? "Sistema"}</p>
          <AlertasTopo followups={contadores.followups} />
          <BotaoTema />
        </header>

        <main className="min-w-0 flex-1 pb-20 lg:pb-0">{children}</main>

        {/* barra de baixo — celular (o chat aberto cobre ela e usa a tela toda) */}
        {(
          <nav className="fixed inset-x-0 bottom-0 z-30 flex border-t border-linha bg-[var(--cabecalho)] pb-[env(safe-area-inset-bottom)] backdrop-blur-xl lg:hidden" aria-label="Atalhos">
            {barra.map((i) => {
              const Icone = ICONES[i.icone];
              const on = ativo(pathname, i.href);
              const n = i.contador ? contadores[i.contador] : 0;
              return (
                <Link key={i.href} href={i.href} className={cn("relative flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px]", on ? "text-ink" : "text-ink-3")}>
                  <Icone className="size-5" />
                  {i.rotulo.split(" ")[0]}
                  {n > 0 && <span className="absolute right-[calc(50%-18px)] top-1 size-2 rounded-full bg-marca" aria-label={`${n} pendentes`} />}
                </Link>
              );
            })}
            <button onClick={() => setMenuAberto(true)} className="flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] text-ink-3">
              <Menu className="size-5" />
              Menu
            </button>
          </nav>
        )}
      </div>

      {/* menu completo — celular e tablet */}
      {menuAberto && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <button className="absolute inset-0 bg-black/60" onClick={() => setMenuAberto(false)} aria-label="Fechar menu" />
          <div className="absolute inset-y-0 left-0 flex w-[min(300px,86vw)] flex-col border-r border-linha bg-elevado shadow-alta">
            <div className="flex items-center justify-between px-4 pb-3 pt-4">
              <span className="claro:rounded-lg claro:bg-black claro:px-1.5 claro:py-1">
                <Image src="/fotos/logo-gemeos-motors.webp" alt="Gêmeos Motors" width={96} height={48} className="h-9 w-auto" />
              </span>
              <button className="grid size-10 place-items-center rounded-full text-ink-2 hover:bg-trilho" onClick={() => setMenuAberto(false)} aria-label="Fechar menu">
                <X className="size-5" />
              </button>
            </div>
            <div className="rolagem-fina flex-1 overflow-y-auto px-3 pb-4">{Lista}</div>
            <RodapeUsuario usuario={usuario} />
          </div>
        </div>
      )}
    </div>
  );
}

function RodapeUsuario({ usuario }: { usuario: { nome: string; papel: Papel } }) {
  return (
    <div className="border-t border-linha p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
      <Link href="/sistema/conta" className="flex items-center gap-3 rounded-xl px-2 py-2 hover:bg-trilho">
        <span className="grid size-9 place-items-center rounded-full bg-vidro-forte ring-1 ring-linha">
          <UserRound className="size-4 text-ink-2" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-semibold">{usuario.nome}</span>
          <span className="block truncate text-[11.5px] text-ink-3">{PAPEIS[usuario.papel]}</span>
        </span>
      </Link>
      <form action={sair}>
        <button className="mt-1 flex w-full items-center gap-3 rounded-xl px-3 py-2 text-[13px] text-ink-2 hover:bg-trilho hover:text-ink">
          <LogOut className="size-4" /> Sair
        </button>
      </form>
    </div>
  );
}

function assinarTema(avisar: () => void) {
  const obs = new MutationObserver(avisar);
  obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => obs.disconnect();
}

function BotaoTema() {
  const claro = useSyncExternalStore(assinarTema, () => document.documentElement.getAttribute("data-theme") === "light", () => false);
  return (
    <button
      className="grid size-10 place-items-center rounded-full text-ink-2 hover:bg-trilho hover:text-ink"
      aria-label={claro ? "Usar tema escuro" : "Usar tema claro"}
      onClick={() => {
        const novo = !claro;
        if (novo) document.documentElement.setAttribute("data-theme", "light");
        else document.documentElement.removeAttribute("data-theme");
        try {
          localStorage.setItem("gm-tema", novo ? "light" : "dark");
        } catch {}
      }}
    >
      {claro ? <Moon className="size-[18px]" /> : <Sun className="size-[18px]" />}
    </button>
  );
}

function AlertasTopo({ followups }: { followups: number }) {
  return (
    <Link
      href="/sistema/follow-ups"
      className="relative grid size-10 place-items-center rounded-full text-ink-2 hover:bg-trilho hover:text-ink"
      aria-label={followups ? `${followups} follow-ups para hoje ou atrasados` : "Follow-ups"}
    >
      <Bell className="size-[18px]" />
      {followups > 0 && (
        <span className="num absolute right-1 top-1 min-w-4 rounded-full bg-marca px-1 text-center text-[10px] font-bold leading-4 text-black">{followups}</span>
      )}
    </Link>
  );
}
