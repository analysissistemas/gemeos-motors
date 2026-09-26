import { cn } from "@/lib/cn";

type Tom = "neutro" | "bom" | "atencao" | "serio" | "critico" | "marca" | "info";
const tons: Record<Tom, string> = {
  neutro: "bg-trilho text-ink-2 border-linha",
  bom: "bg-[color-mix(in_oklab,var(--bom)_16%,transparent)] text-ink border-[color-mix(in_oklab,var(--bom)_40%,transparent)]",
  atencao: "bg-[color-mix(in_oklab,var(--atencao)_16%,transparent)] text-ink border-[color-mix(in_oklab,var(--atencao)_40%,transparent)]",
  serio: "bg-[color-mix(in_oklab,var(--serio)_16%,transparent)] text-ink border-[color-mix(in_oklab,var(--serio)_40%,transparent)]",
  critico: "bg-[color-mix(in_oklab,var(--critico)_16%,transparent)] text-ink border-[color-mix(in_oklab,var(--critico)_40%,transparent)]",
  marca: "bg-[color-mix(in_oklab,var(--marca)_18%,transparent)] text-ink border-[color-mix(in_oklab,var(--marca)_45%,transparent)]",
  info: "bg-vidro-forte text-ink border-linha-forte",
};
const pontos: Partial<Record<Tom, string>> = {
  bom: "bg-bom",
  atencao: "bg-atencao",
  serio: "bg-serio",
  critico: "bg-critico",
  marca: "bg-marca",
};

/** Selo com ponto colorido: a cor nunca aparece sozinha, sempre com o texto. */
export function Selo({ tom = "neutro", children, className, ponto = true }: { tom?: Tom; children: React.ReactNode; className?: string; ponto?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2 py-0.5 text-[11.5px] font-medium", tons[tom], className)}>
      {ponto && pontos[tom] && <span className={cn("size-1.5 rounded-full", pontos[tom])} aria-hidden />}
      {children}
    </span>
  );
}

export function Painel({ className, children, ...r }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("painel", className)} {...r}>
      {children}
    </div>
  );
}

export function CabecalhoPagina({
  titulo,
  subtitulo,
  acoes,
  className,
}: {
  titulo: React.ReactNode;
  subtitulo?: React.ReactNode;
  acoes?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mb-5 flex flex-wrap items-end justify-between gap-3", className)}>
      <div className="min-w-0">
        <h1 className="text-[24px] font-bold leading-tight tracking-tight sm:text-[28px]">{titulo}</h1>
        {subtitulo && <p className="mt-1 text-[13.5px] text-ink-2">{subtitulo}</p>}
      </div>
      {acoes && <div className="flex flex-wrap items-center gap-2">{acoes}</div>}
    </div>
  );
}

export function TituloSecao({ children, acao, className }: { children: React.ReactNode; acao?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("mb-3 flex items-center justify-between gap-3", className)}>
      <h2 className="text-[15px] font-semibold tracking-tight">{children}</h2>
      {acao}
    </div>
  );
}

export function EstadoVazio({
  icone,
  titulo,
  texto,
  acao,
  className,
  compacto,
}: {
  icone?: React.ReactNode;
  titulo: string;
  texto?: React.ReactNode;
  acao?: React.ReactNode;
  className?: string;
  compacto?: boolean;
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center text-center", compacto ? "gap-1.5 px-4 py-8" : "gap-2 px-6 py-14", className)}>
      {icone && <div className="mb-1 grid size-11 place-items-center rounded-2xl bg-trilho text-ink-2 [&_svg]:size-5">{icone}</div>}
      <p className="text-[15px] font-semibold">{titulo}</p>
      {texto && <p className="max-w-sm text-[13px] leading-relaxed text-ink-2">{texto}</p>}
      {acao && <div className="mt-2">{acao}</div>}
    </div>
  );
}

export function Esqueleto({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-lg bg-trilho", className)} aria-hidden />;
}

/* com foto, o Avatar precisa do navegador (volta às iniciais se a imagem falhar) */
export { Avatar } from "./avatar";

export function ItemInfo({ rotulo, children, className }: { rotulo: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("min-w-0", className)}>
      <dt className="text-[11.5px] text-ink-3">{rotulo}</dt>
      <dd className="mt-0.5 truncate text-[13.5px] text-ink">{children || "—"}</dd>
    </div>
  );
}

/** Indicador de etapa do funil com a cor validada da etapa. */
export function PontoEtapa({ etapa, className }: { etapa: string; className?: string }) {
  return <span className={cn("inline-block size-2.5 shrink-0 rounded-full", className)} style={{ background: `var(--etapa-${etapa})` }} aria-hidden />;
}
