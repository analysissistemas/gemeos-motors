import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, Search, Users } from "lucide-react";
import { exigirPermissao } from "@/lib/auth/dal";
import { listarClientes } from "@/lib/consultas/clientes";
import { listarEquipe } from "@/lib/consultas/equipe";
import { ORIGENS } from "@/lib/dominio";
import { formatarTelefone, relativo } from "@/lib/formato";
import { Pagina } from "@/components/ui/pagina";
import { Avatar, CabecalhoPagina, EstadoVazio, Painel, Selo } from "@/components/ui/basicos";
import { classesBotao } from "@/components/ui/botao";
import { Filtros } from "@/components/ui/filtros";
import { BotaoNovoCliente } from "./novo-cliente";

export const metadata: Metadata = { title: "Clientes" };

type Busca = { q?: string; origem?: string; resp?: string; pagina?: string };

export default async function PaginaClientes({ searchParams }: { searchParams: Promise<Busca> }) {
  await exigirPermissao("clientes.ver");
  const b = await searchParams;
  const [lista, equipe] = await Promise.all([
    listarClientes({ q: b.q, origem: b.origem, responsavelId: b.resp ? Number(b.resp) : undefined, pagina: b.pagina ? Number(b.pagina) : 1 }),
    listarEquipe(),
  ]);
  const temFiltro = !!(b.q || b.origem || b.resp);
  const link = (p: number) => `/sistema/clientes?${new URLSearchParams({ ...(b.q && { q: b.q }), ...(b.origem && { origem: b.origem }), ...(b.resp && { resp: b.resp }), pagina: String(p) })}`;

  return (
    <Pagina>
      <CabecalhoPagina
        titulo="Clientes"
        subtitulo={`${lista.total} ${lista.total === 1 ? "cliente cadastrado" : "clientes cadastrados"}${temFiltro ? " com este filtro" : ""}`}
        acoes={<BotaoNovoCliente equipe={equipe} />}
      />

      <Filtros className="mb-4">
      <form className="flex flex-col gap-2 sm:flex-row" role="search">
        <label className="relative sm:flex-1">
          <span className="sr-only">Buscar</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-3" />
          <input
            name="q"
            type="search"
            enterKeyHint="search"
            defaultValue={b.q}
            placeholder="Nome, telefone, CPF, e-mail ou cidade"
            className="h-10 w-full rounded-full border border-linha bg-plano/60 pl-9 pr-4 text-[14px] outline-none placeholder:text-ink-3 focus:border-ink-2"
          />
        </label>
        <div className="grid grid-cols-2 gap-2 sm:flex">
        <select name="origem" defaultValue={b.origem ?? ""} className="h-10 min-w-0 rounded-full border border-linha bg-plano/60 px-4 text-[13.5px]">
          <option value="">Toda origem</option>
          {Object.entries(ORIGENS).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <select name="resp" defaultValue={b.resp ?? ""} className="h-10 min-w-0 rounded-full border border-linha bg-plano/60 px-4 text-[13.5px]">
          <option value="">Todo responsável</option>
          {equipe.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nome}
            </option>
          ))}
        </select>
        </div>
        <div className="flex gap-2">
        <button className={classesBotao("secundario") + " flex-1 sm:flex-none"}>Filtrar</button>
        {temFiltro && (
          <Link href="/sistema/clientes" className={classesBotao("fantasma")}>
            Limpar
          </Link>
        )}
        </div>
      </form>
      </Filtros>

      <Painel className="overflow-hidden">
        {lista.linhas.length === 0 ? (
          <EstadoVazio
            icone={<Users />}
            titulo={temFiltro ? "Nenhum cliente com este filtro" : "Nenhum cliente cadastrado ainda"}
            texto={temFiltro ? "Tente outro nome, telefone ou tire os filtros." : "Cadastre o primeiro cliente, ou deixe que o atendimento cadastre quem chegar pelo WhatsApp."}
            acao={!temFiltro && <BotaoNovoCliente equipe={equipe} />}
          />
        ) : (
          <>
            {/* tabela — desktop */}
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-left text-[13.5px]">
                <thead className="border-b border-linha text-[11.5px] uppercase tracking-wide text-ink-3">
                  <tr>
                    <th className="px-4 py-3 font-medium">Cliente</th>
                    <th className="px-4 py-3 font-medium">Contato</th>
                    <th className="px-4 py-3 font-medium">Origem</th>
                    <th className="px-4 py-3 font-medium">Responsável</th>
                    <th className="px-4 py-3 font-medium">Negócios</th>
                    <th className="px-4 py-3 font-medium">Última atividade</th>
                  </tr>
                </thead>
                <tbody>
                  {lista.linhas.map((c) => (
                    <tr key={c.id} className="border-b border-linha last:border-0 hover:bg-trilho">
                      <td className="px-4 py-3">
                        <Link href={`/sistema/clientes/${c.id}`} className="flex items-center gap-3 font-semibold hover:underline">
                          <Avatar nome={c.nome} tamanho="sm" />
                          <span className="truncate">{c.nome}</span>
                          {c.demo && <Selo tom="atencao">Simulado</Selo>}
                        </Link>
                      </td>
                      <td className="num px-4 py-3 text-ink-2">
                        {formatarTelefone(c.whatsapp ?? c.telefone)}
                        {c.cidade && <span className="block text-[12px] text-ink-3">{[c.cidade, c.estado].filter(Boolean).join(" · ")}</span>}
                      </td>
                      <td className="px-4 py-3 text-ink-2">{c.origem ? ORIGENS[c.origem as keyof typeof ORIGENS] : "—"}</td>
                      <td className="px-4 py-3 text-ink-2">{c.responsavel ?? "—"}</td>
                      <td className="px-4 py-3">
                        <span className="flex flex-wrap gap-1">
                          {c.negociosAbertos > 0 && <Selo tom="atencao">{c.negociosAbertos} em aberto</Selo>}
                          {c.compras > 0 && <Selo tom="bom">{c.compras} {c.compras === 1 ? "compra" : "compras"}</Selo>}
                          {!c.negociosAbertos && !c.compras && <span className="text-ink-3">—</span>}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-ink-2">{relativo(c.ultimaAtividade)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {/* lista — celular */}
            <ul className="md:hidden">
              {lista.linhas.map((c) => (
                <li key={c.id} className="border-b border-linha last:border-0">
                  <Link href={`/sistema/clientes/${c.id}`} className="flex items-center gap-3 px-4 py-3 active:bg-trilho">
                    <Avatar nome={c.nome} />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="truncate font-semibold">{c.nome}</span>
                        {c.demo && <Selo tom="atencao">Simulado</Selo>}
                      </span>
                      <span className="num block truncate text-[12.5px] text-ink-2">
                        {formatarTelefone(c.whatsapp ?? c.telefone)} {c.responsavel ? `· ${c.responsavel}` : ""}
                      </span>
                      {(c.negociosAbertos > 0 || c.compras > 0) && (
                        <span className="mt-1 flex gap-1">
                          {c.negociosAbertos > 0 && <Selo tom="atencao">{c.negociosAbertos} em aberto</Selo>}
                          {c.compras > 0 && <Selo tom="bom">{c.compras} {c.compras === 1 ? "compra" : "compras"}</Selo>}
                        </span>
                      )}
                    </span>
                    <ChevronRight className="size-4 text-ink-3" />
                  </Link>
                </li>
              ))}
            </ul>
          </>
        )}
      </Painel>

      {lista.paginas > 1 && (
        <nav className="mt-4 flex items-center justify-between text-[13px] text-ink-2" aria-label="Páginas">
          <span>
            Página {lista.pagina} de {lista.paginas}
          </span>
          <span className="flex gap-2">
            {lista.pagina > 1 && (
              <Link href={link(lista.pagina - 1)} className={classesBotao("secundario", "sm")}>
                Anterior
              </Link>
            )}
            {lista.pagina < lista.paginas && (
              <Link href={link(lista.pagina + 1)} className={classesBotao("secundario", "sm")}>
                Próxima
              </Link>
            )}
          </span>
        </nav>
      )}
    </Pagina>
  );
}
