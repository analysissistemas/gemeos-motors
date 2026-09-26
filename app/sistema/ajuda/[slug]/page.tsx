import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CircleAlert, Lightbulb, ShieldCheck } from "lucide-react";
import { exigirPermissao } from "@/lib/auth/dal";
import { pode } from "@/lib/dominio";
import { tutorialPorSlug } from "@/lib/ajuda/tutoriais";
import { Pagina } from "@/components/ui/pagina";
import { Painel } from "@/components/ui/basicos";
import { BotaoLink, classesBotao } from "@/components/ui/botao";
import { FiguraTutorial } from "@/components/ajuda/figura";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const t = tutorialPorSlug((await params).slug);
  return { title: t ? `Tutorial: ${t.titulo}` : "Tutorial" };
}

export default async function PaginaTutorial({ params }: { params: Promise<{ slug: string }> }) {
  const u = await exigirPermissao("ajuda.ver");
  const t = tutorialPorSlug((await params).slug);
  /* tutorial de tela que o perfil não usa: como se não existisse */
  if (!t || (t.permissao && !pode(u.papel, t.permissao))) notFound();

  return (
    <Pagina estreita>
      <div className="mb-4 flex items-center gap-3">
        <Link href="/sistema/ajuda" className={classesBotao("fantasma", "icone")} aria-label="Voltar para os tutoriais">
          <ArrowLeft className="size-5" />
        </Link>
        <p className="text-[13px] text-ink-3">{t.area}</p>
      </div>
      <h1 className="text-[24px] font-bold leading-tight tracking-tight sm:text-[28px]">{t.titulo}</h1>
      <p className="mt-2 text-[16px] leading-relaxed text-ink-2 sm:text-[15px]">{t.resumo}</p>
      {t.tela && (
        <BotaoLink href={t.tela} className="mt-4">
          Abrir a tela
        </BotaoLink>
      )}

      <ol className="mt-6 flex flex-col gap-4">
        {t.passos.map((p, i) => (
          <li key={i}>
            <Painel className="p-4 sm:p-5">
              <div className="flex gap-3">
                <span className="num grid size-8 shrink-0 place-items-center rounded-full bg-marca text-[14px] font-bold text-black">{i + 1}</span>
                <p className="min-w-0 flex-1 pt-1 text-[16px] leading-relaxed sm:text-[15px]">{p.texto}</p>
              </div>
              {p.imagem && <FiguraTutorial src={p.imagem} legenda={p.legenda} />}
            </Painel>
          </li>
        ))}
      </ol>

      {t.regras?.length ? (
        <Bloco icone={<ShieldCheck className="size-5" />} titulo="Regras da loja (não esquecer)">
          <ul className="flex list-disc flex-col gap-2 pl-5">
            {t.regras.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
        </Bloco>
      ) : null}

      {t.dicas?.length ? (
        <Bloco icone={<Lightbulb className="size-5" />} titulo="Dicas">
          <ul className="flex list-disc flex-col gap-2 pl-5">
            {t.dicas.map((d, i) => (
              <li key={i}>{d}</li>
            ))}
          </ul>
        </Bloco>
      ) : null}

      {t.errosComuns?.length ? (
        <Bloco icone={<CircleAlert className="size-5" />} titulo="Deu errado? Veja aqui">
          <dl className="flex flex-col gap-3">
            {t.errosComuns.map((e, i) => (
              <div key={i}>
                <dt className="font-semibold">{e.problema}</dt>
                <dd className="mt-0.5 text-ink-2">{e.solucao}</dd>
              </div>
            ))}
          </dl>
        </Bloco>
      ) : null}

      <div className="mt-8">
        <Link href="/sistema/ajuda" className="text-[14px] text-ink-2 underline">
          Ver todos os tutoriais
        </Link>
      </div>
    </Pagina>
  );
}

function Bloco({ icone, titulo, children }: { icone: React.ReactNode; titulo: string; children: React.ReactNode }) {
  return (
    <Painel className="mt-5 p-4 sm:p-5">
      <p className="mb-3 flex items-center gap-2 text-[16px] font-semibold sm:text-[15px]">
        {icone}
        {titulo}
      </p>
      <div className="text-[16px] leading-relaxed sm:text-[15px]">{children}</div>
    </Painel>
  );
}
