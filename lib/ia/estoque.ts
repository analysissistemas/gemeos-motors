import "server-only";
import { db, schema } from "@/lib/db";
import { iaPode } from "./controle";
import { decidirEstoque, termoValido, type ConsultaEstoque, type ItemEstoque, type ResultadoEstoque } from "./estoque-tipos";

/* ============================================================
   FERRAMENTA DE ESTOQUE DA IA — somente leitura
   - O banco é a única fonte: nada de cópia no prompt nem cache.
   - Sem SQL escrito pela IA: o termo só entra como texto comparado em código.
   - Só saem as colunas de ItemEstoque. Custo, valor, placa, chassi, renavam,
     origem/fornecedor, observações e unidade nunca são lidos.
   - Cada linha é UM veículo (peça única); nada de quantidade genérica.
   - O casamento é por palavra inteira, então "EV1" não vira "EV10".
   Sem permissão, com termo inválido ou com erro, devolve estado que NÃO
   confirma nada; a IA então não afirma que tem nem que não tem.
   ============================================================ */
export async function consultarEstoque(consulta: ConsultaEstoque, opcoes: { ignorarPermissao?: boolean } = {}): Promise<ResultadoEstoque> {
  const nao = (estado: ResultadoEstoque["estado"]): ResultadoEstoque => ({ estado, confirmado: false, itens: [] });
  if (!opcoes.ignorarPermissao && !(await iaPode("lerEstoque"))) return nao("SEM_PERMISSAO");
  if (!termoValido(consulta.termo)) return nao("TERMO_INVALIDO");
  try {
    const v = schema.veiculos;
    const linhas: ItemEstoque[] = await db
      .select({ id: v.id, tipo: v.tipo, marca: v.marca, modelo: v.modelo, versao: v.versao, cor: v.cor, condicao: v.condicao, status: v.status })
      .from(v)
      .limit(1000);
    return decidirEstoque(linhas, consulta.termo);
  } catch {
    return nao("ERRO_CONSULTA");
  }
}
