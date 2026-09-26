import Link from "next/link";
import { classesBotao } from "@/components/ui/botao";

/* Tela de erro no padrão da marca (amarelo e preto), para 404, 403, 500 e afins.
   Sem JavaScript obrigatório: serve para visitante da vitrine e para a equipe. */
export type AcaoErro = { rotulo: string; href?: string; aoClicar?: () => void; primaria?: boolean };

export function TelaErro({ codigo, titulo, texto, acoes, detalhe }: { codigo: string; titulo: string; texto: string; acoes: AcaoErro[]; detalhe?: string }) {
  return (
    <main className="grid min-h-dvh place-items-center bg-fundo px-4 py-10">
      <div className="flex w-full max-w-md flex-col items-center text-center">
        <span className="mb-6 rounded-full border border-marca/40 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-marca">Gêmeos Motors</span>
        <p className="text-[84px] font-extrabold leading-none tracking-tight text-marca sm:text-[104px]" aria-hidden>
          {codigo}
        </p>
        <h1 className="mt-4 text-[22px] font-semibold tracking-tight text-ink">{titulo}</h1>
        <p className="mt-2 text-[14.5px] leading-relaxed text-ink-2">{texto}</p>
        <div className="mt-7 flex flex-wrap justify-center gap-2">
          {acoes.map((a) =>
            a.href ? (
              <Link key={a.rotulo} href={a.href} className={classesBotao(a.primaria ? "primario" : "secundario", "md")}>
                {a.rotulo}
              </Link>
            ) : (
              <button key={a.rotulo} onClick={a.aoClicar} className={classesBotao(a.primaria ? "primario" : "secundario", "md")}>
                {a.rotulo}
              </button>
            ),
          )}
        </div>
        {detalhe && <p className="mt-8 text-[11.5px] text-ink-3">{detalhe}</p>}
      </div>
    </main>
  );
}
