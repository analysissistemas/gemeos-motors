import Link from "next/link";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/cn";

type Variante = "primario" | "secundario" | "fantasma" | "perigo" | "marca";
type Tamanho = "sm" | "md" | "lg" | "icone";

const base =
  "inline-flex items-center justify-center gap-2 rounded-full font-semibold whitespace-nowrap transition select-none disabled:opacity-50 disabled:pointer-events-none";
const variantes: Record<Variante, string> = {
  primario: "bg-ink text-contra-ink hover:opacity-90",
  secundario: "bg-vidro-forte text-ink border border-linha hover:border-linha-forte hover:bg-trilho",
  fantasma: "text-ink-2 hover:text-ink hover:bg-trilho",
  perigo: "bg-critico text-white hover:opacity-90",
  marca: "bg-marca text-black hover:opacity-90",
};
const tamanhos: Record<Tamanho, string> = {
  sm: "h-8 px-3 text-[13px] max-sm:min-h-10",
  md: "h-10 px-4 text-[14px] max-sm:min-h-11",
  lg: "h-12 px-6 text-[15px]",
  icone: "h-10 w-10 text-[14px] max-sm:min-h-11 max-sm:min-w-11",
};

export function classesBotao(v: Variante = "secundario", t: Tamanho = "md", extra?: string) {
  return cn(base, variantes[v], tamanhos[t], extra);
}

type Props = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variante?: Variante;
  tamanho?: Tamanho;
  carregando?: boolean;
};

export function Botao({ variante = "secundario", tamanho = "md", carregando, className, children, disabled, ...r }: Props) {
  return (
    <button className={classesBotao(variante, tamanho, className)} disabled={disabled || carregando} {...r}>
      {carregando && <Loader2 className="size-4 animate-spin" aria-hidden />}
      {children}
    </button>
  );
}

export function BotaoLink({
  href,
  variante = "secundario",
  tamanho = "md",
  className,
  children,
  ...r
}: React.ComponentProps<typeof Link> & { variante?: Variante; tamanho?: Tamanho }) {
  return (
    <Link href={href} className={classesBotao(variante, tamanho, className)} {...r}>
      {children}
    </Link>
  );
}
