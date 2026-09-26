import { Esqueleto } from "@/components/ui/basicos";
import { Pagina } from "@/components/ui/pagina";

export default function Carregando() {
  return (
    <Pagina>
      <Esqueleto className="mb-2 h-8 w-56 max-w-full" />
      <Esqueleto className="mb-6 h-4 w-72 max-w-full" />
      <div className="painel divide-y divide-linha" aria-busy="true" aria-label="Carregando">
        {Array.from({ length: 7 }).map((_, i) => (
          <div key={i} className="flex h-16 items-center gap-3 px-4">
            <Esqueleto className="size-9 shrink-0 rounded-full" />
            <div className="flex flex-1 flex-col gap-2">
              <Esqueleto className="h-3.5 w-2/5" />
              <Esqueleto className="h-3 w-3/5" />
            </div>
          </div>
        ))}
      </div>
    </Pagina>
  );
}
