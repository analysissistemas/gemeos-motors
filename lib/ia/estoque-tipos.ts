/* Contrato da ferramenta de estoque da IA. Puro: sem banco. A consulta real
   está em estoque.ts.

   Regra do dono: se a ferramenta não consegue CONFIRMAR que o veículo existe
   e está disponível, a IA assume que NÃO SABE e encaminha para confirmação
   humana. NAO_ENCONTRADO e ERRO_CONSULTA nunca viram "temos" nem "não temos".
   Cada linha do estoque é UM veículo (peça única), nunca quantidade de produto. */

export type ConsultaEstoque = { termo: string };

/** Só o que pode chegar ao contexto da IA. Nunca custo, valor, placa, chassi,
 *  renavam, fornecedor/origem, observações internas ou unidade. */
export type ItemEstoque = {
  id: number;
  tipo: string;
  marca: string | null;
  modelo: string;
  versao: string | null;
  cor: string | null;
  condicao: string;
  status: string;
};

export type EstadoEstoque =
  | "CONFIRMADO_DISPONIVEL"
  | "CONFIRMADO_INDISPONIVEL"
  | "NAO_ENCONTRADO"
  | "ERRO_CONSULTA"
  | "SEM_PERMISSAO"
  | "TERMO_INVALIDO";

export type ResultadoEstoque = { estado: EstadoEstoque; confirmado: boolean; itens: ItemEstoque[] };

export const MAX_ITENS_ESTOQUE = 3;
export const CAMPOS_DO_ITEM: (keyof ItemEstoque)[] = ["id", "tipo", "marca", "modelo", "versao", "cor", "condicao", "status"];

export const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
export const tokens = (s: string) => norm(s).split(/[^a-z0-9]+/).filter(Boolean);

export function termoValido(termo: string) {
  const t = termo.trim();
  return t.length >= 2 && t.length <= 80 && tokens(t).length > 0;
}

/** Casamento por palavra inteira: "ev1" NÃO casa com "ev10" nem com "ev12". */
export function bateComTermo(item: Pick<ItemEstoque, "marca" | "modelo" | "versao">, termo: string) {
  const dele = new Set(tokens([item.marca, item.modelo, item.versao].filter(Boolean).join(" ")));
  const pedidos = tokens(termo);
  return pedidos.length > 0 && pedidos.every((t) => dele.has(t));
}

/** Copia só os campos permitidos: qualquer coluna a mais (custo, placa...) que apareça na linha é descartada. */
const soPermitidos = (l: ItemEstoque): ItemEstoque => Object.fromEntries(CAMPOS_DO_ITEM.map((c) => [c, l[c]])) as ItemEstoque;

/** Só há confirmação de disponibilidade com ao menos um veículo DISPONÍVEL que bate com o termo. */
export function decidirEstoque(linhas: ItemEstoque[], termo: string): ResultadoEstoque {
  const certas = linhas.filter((l) => bateComTermo(l, termo)).map(soPermitidos);
  if (certas.length === 0) return { estado: "NAO_ENCONTRADO", confirmado: false, itens: [] };
  const disponiveis = certas.filter((l) => l.status === "disponivel");
  if (disponiveis.length > 0) return { estado: "CONFIRMADO_DISPONIVEL", confirmado: true, itens: disponiveis.slice(0, MAX_ITENS_ESTOQUE) };
  return { estado: "CONFIRMADO_INDISPONIVEL", confirmado: true, itens: certas.slice(0, MAX_ITENS_ESTOQUE) };
}
