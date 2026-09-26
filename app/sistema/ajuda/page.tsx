import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { exigirPermissao } from "@/lib/auth/dal";
import { AREAS, tutoriaisPara } from "@/lib/ajuda/tutoriais";
import { Pagina } from "@/components/ui/pagina";
import { CabecalhoPagina, Painel, TituloSecao } from "@/components/ui/basicos";

export const metadata: Metadata = { title: "Tutoriais" };

export default async function PaginaAjuda() {
  const u = await exigirPermissao("ajuda.ver");
  const lista = tutoriaisPara(u.papel);
  return (
    <Pagina>
      <CabecalhoPagina titulo="Tutoriais" subtitulo="Passo a passo de cada tela, por escrito e com imagem. Esqueceu como faz? Está aqui." />
      <div className="flex flex-col gap-7">
        {AREAS.map((area) => {
          const itens = lista.filter((t) => t.area === area);
          if (!itens.length) return null;
          return (
            <section key={area}>
              <TituloSecao>{area}</TituloSecao>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {itens.map((t) => (
                  <Link key={t.slug} href={`/sistema/ajuda/${t.slug}`} className="group">
                    <Painel className="flex h-full items-start gap-3 p-4 transition group-hover:shadow-[inset_0_0_0_1px_var(--linha-forte)]">
                      <div className="min-w-0 flex-1">
                        <p className="text-[16px] font-semibold leading-snug sm:text-[15px]">{t.titulo}</p>
                        <p className="mt-1 text-[14px] leading-relaxed text-ink-2 sm:text-[13px]">{t.resumo}</p>
                        <p className="mt-2 text-[12px] text-ink-3">{t.passos.length} passos</p>
                      </div>
                      <ChevronRight className="mt-0.5 size-5 shrink-0 text-ink-3" />
                    </Painel>
                  </Link>
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </Pagina>
  );
}
