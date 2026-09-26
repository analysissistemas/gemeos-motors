import type { Metadata } from "next";
import { desc, eq, isNotNull } from "drizzle-orm";
import { Tag } from "lucide-react";
import { exigirPermissao } from "@/lib/auth/dal";
import { db, schema } from "@/lib/db";
import { brl, dataHora } from "@/lib/formato";
import { formatarRestante, promocaoVale } from "@/lib/promocao";
import { Pagina } from "@/components/ui/pagina";
import { CabecalhoPagina, EstadoVazio, Painel } from "@/components/ui/basicos";
import { EncerrarPromocao, FormPromocao } from "./form-promocao";

export const metadata: Metadata = { title: "Promoções" };

export default async function PaginaPromocoes() {
  await exigirPermissao("estoque.editar");
  const [modelos, lista] = await Promise.all([
    db.select({ id: schema.modelos.id, nome: schema.modelos.nome, precoTabela: schema.modelos.precoTabela }).from(schema.modelos).where(isNotNull(schema.modelos.precoTabela)).orderBy(schema.modelos.nome),
    db
      .select({ id: schema.promocoes.id, modelo: schema.modelos.nome, precoNormal: schema.modelos.precoTabela, precoPromocional: schema.promocoes.precoPromocional, inicioEm: schema.promocoes.inicioEm, fimEm: schema.promocoes.fimEm, ativo: schema.promocoes.ativo })
      .from(schema.promocoes)
      .innerJoin(schema.modelos, eq(schema.modelos.id, schema.promocoes.modeloId))
      .orderBy(desc(schema.promocoes.fimEm))
      .limit(50),
  ]);
  const agora = new Date();
  return (
    <Pagina>
      <CabecalhoPagina titulo="Promoções" subtitulo="Preço por tempo limitado. Quando o prazo acaba, o valor volta ao normal sozinho." />
      <Painel className="mb-5 p-4">
        {modelos.length ? <FormPromocao modelos={modelos.map((m) => ({ ...m, precoTabela: m.precoTabela! }))} /> : <p className="text-[13px] text-ink-2">Nenhum modelo tem preço de tabela cadastrado ainda.</p>}
      </Painel>
      {lista.length === 0 ? (
        <Painel>
          <EstadoVazio icone={<Tag />} titulo="Nenhuma promoção criada" texto="Crie a primeira acima." />
        </Painel>
      ) : (
        <Painel className="overflow-hidden">
          <ul>
            {lista.map((p) => {
              const vale = promocaoVale({ precoPromocional: p.precoPromocional, inicioEm: p.inicioEm, fimEm: p.fimEm, ativo: p.ativo }, agora);
              const situacao = !p.ativo ? "Encerrada" : vale ? `No ar · faltam ${formatarRestante(p.fimEm.getTime() - agora.getTime())}` : p.inicioEm > agora ? "Agendada" : "Terminou";
              return (
                <li key={p.id} className="flex flex-col gap-2 border-b border-linha px-4 py-3 last:border-0 sm:flex-row sm:items-center sm:justify-between">
                  <span className="min-w-0">
                    <span className="block font-semibold">
                      {p.modelo} · <span className="line-through text-ink-3">{brl(p.precoNormal)}</span> {brl(p.precoPromocional)}
                    </span>
                    <span className="block text-[12.5px] text-ink-2">
                      {dataHora(p.inicioEm)} até {dataHora(p.fimEm)} · {situacao}
                    </span>
                  </span>
                  {vale && <EncerrarPromocao id={p.id} />}
                </li>
              );
            })}
          </ul>
        </Painel>
      )}
    </Pagina>
  );
}
