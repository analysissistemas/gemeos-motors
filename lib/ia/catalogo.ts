import "server-only";
import { db, schema } from "@/lib/db";
import { iaPode } from "./controle";
import { decidirCatalogo, vazio, type ModeloCatalogo, type ResultadoCatalogo } from "./catalogo-tipos";
import type { ItemEstoque } from "./estoque-tipos";

/* Ferramenta de catálogo + estoque da IA. Leitura do banco; somente leitura. O registro de interesse
   é de lib/servicos/interesses.ts. Sem permissão ou com erro devolve ERRO: a IA não afirma nada e um humano confirma. */
export async function consultarCatalogo(termo: string, opcoes: { ignorarPermissao?: boolean } = {}): Promise<ResultadoCatalogo> {
  const falha = vazio("ERRO");
  if (!opcoes.ignorarPermissao && !(await iaPode("lerEstoque"))) return falha;
  try {
    const m = schema.modelos;
    const v = schema.veiculos;
    const modelos: ModeloCatalogo[] = await db.select({ id: m.id, tipo: m.tipo, marca: m.marca, nome: m.nome, eletrico: m.eletrico, ativo: m.ativo }).from(m).limit(500);
    const veiculos: ItemEstoque[] = await db.select({ id: v.id, tipo: v.tipo, marca: v.marca, modelo: v.modelo, versao: v.versao, cor: v.cor, condicao: v.condicao, status: v.status }).from(v).limit(1000);
    return decidirCatalogo(modelos, veiculos, termo);
  } catch {
    return falha;
  }
}
