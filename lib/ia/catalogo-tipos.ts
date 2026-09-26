/* Catálogo x estoque para a IA. Puro: sem banco. A leitura real está em catalogo.ts.

   Regras do dono: HB20 é o único carro a combustão à venda e SHI175 a única moto
   a combustão; o resto do foco é moto elétrica. Modelo elétrico pode estar no
   catálogo sem estoque. A IA nunca inventa preço, estoque nem modelo: só existe
   o que veio do banco. */
import { bateComTermo, decidirEstoque, termoValido, type ItemEstoque } from "./estoque-tipos.ts";

export type ModeloCatalogo = { id: number; tipo: string; marca: string | null; nome: string; eletrico: boolean; ativo: boolean };

export type EstadoCatalogo =
  | "DISPONIVEL" // há veículo disponível
  | "EXISTE_INDISPONIVEL" // modelo existe (catálogo e/ou veículo reservado/vendido) sem unidade disponível: registrar interesse
  | "NAO_EXISTE" // nada no catálogo nem no estoque, ou combustão fora da regra: a IA não oferece nem inventa
  | "ERRO"; // termo inválido, sem permissão ou falha de leitura: a IA não afirma nada, humano confirma

export type ResultadoCatalogo = {
  estado: EstadoCatalogo;
  /** verdadeiro só quando o banco confirmou o modelo (com ou sem estoque) */
  modeloConhecido: boolean;
  modelo: ModeloCatalogo | null;
  itens: ItemEstoque[];
  /** true = existe no banco mas é combustão que não é HB20/SHI175 (não ofertável) */
  foraDaRegra: boolean;
  /** vale registrar interesse do cliente para avisar quando voltar */
  registrarInteresse: boolean;
};

const COMBUSTAO_PERMITIDA = ["hb20", "shi175"];
export const ehCombustao = (m: { tipo: string; eletrico?: boolean }) => m.tipo === "carro" || m.tipo === "moto_combustao" || m.eletrico === false;
/** Combustão só é vendável se for HB20 ou SHI175 (por palavra inteira). */
export function combustaoPermitida(m: { marca: string | null; nome?: string; modelo?: string; versao?: string | null }) {
  return COMBUSTAO_PERMITIDA.some((p) => bateComTermo({ marca: m.marca, modelo: m.nome ?? m.modelo ?? "", versao: m.versao ?? null }, p));
}
const ofertavel = (m: { tipo: string; marca: string | null; nome?: string; modelo?: string; versao?: string | null; eletrico?: boolean }) => !ehCombustao(m) || combustaoPermitida(m);

export const vazio = (estado: EstadoCatalogo, foraDaRegra = false): ResultadoCatalogo => ({ estado, modeloConhecido: false, modelo: null, itens: [], foraDaRegra, registrarInteresse: false });

export function decidirCatalogo(modelos: ModeloCatalogo[], veiculos: ItemEstoque[], termo: string): ResultadoCatalogo {
  if (!termoValido(termo)) return vazio("ERRO");
  const doTermo = veiculos.filter((v) => bateComTermo(v, termo));
  const permitidosDoTermo = doTermo.filter((v) => ofertavel({ tipo: v.tipo, marca: v.marca, modelo: v.modelo, versao: v.versao }));
  const modelosDoTermo = modelos.filter((m) => m.ativo && bateComTermo({ marca: m.marca, modelo: m.nome, versao: null }, termo));
  const modeloOk = modelosDoTermo.find(ofertavel) ?? null;

  if (permitidosDoTermo.length > 0) {
    const r = decidirEstoque(permitidosDoTermo, termo);
    const livre = r.estado === "CONFIRMADO_DISPONIVEL";
    return { estado: livre ? "DISPONIVEL" : "EXISTE_INDISPONIVEL", modeloConhecido: true, modelo: modeloOk, itens: r.itens, foraDaRegra: false, registrarInteresse: !livre };
  }
  if (modeloOk) return { estado: "EXISTE_INDISPONIVEL", modeloConhecido: true, modelo: modeloOk, itens: [], foraDaRegra: false, registrarInteresse: true };
  if (doTermo.length > 0 || modelosDoTermo.length > 0) return vazio("NAO_EXISTE", true);
  return vazio("NAO_EXISTE");
}

/** Texto de partida para o cliente; nunca cita preço nem promete prazo. Só o que o banco confirmou. */
export function textoModeloSemEstoque(r: ResultadoCatalogo): string | null {
  if (r.estado !== "EXISTE_INDISPONIVEL") return null;
  const nome = r.modelo ? [r.modelo.marca, r.modelo.nome].filter(Boolean).join(" ") : [r.itens[0]?.marca, r.itens[0]?.modelo].filter(Boolean).join(" ");
  return `O ${nome} é um modelo nosso, mas no momento não temos unidade disponível. Posso anotar seu interesse e te avisar aqui assim que chegar?`;
}
