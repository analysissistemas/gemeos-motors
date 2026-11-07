/* Acessórios com foto (Manu, 07/11/2026: "Qual valor dos capacetes?" e a IA mandou uma lista de 7 capacetes em texto,
   sem imagem; usuário: "porque ela não mandou a imagem", "não ficou legal essa abordagem"). Mesmo jeito das motos:
   até 3 com foto e preço, o link do site para ver o resto e UMA pergunta. Peças puras (testadas em
   tests/unit/acessorios.test.ts); a busca no banco e o envio ficam em workflow/nos.ts. */
import { linkDoSite } from "./foto-cliente.ts";

export type Categoria = "capacete" | "bau" | "acessorio";
const norm = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

/** O cliente perguntou de acessório (capacete, baú ou acessório em geral)? */
export function pedidoDeAcessorio(texto: string): Categoria | null {
  const t = norm(texto);
  if (/(?<![a-z])capacetes?(?![a-z])/.test(t)) return "capacete";
  if (/(?<![a-z])ba[uú]s?(?![a-z])|bagageiro/.test(t)) return "bau";
  if (/(?<![a-z])acessorios?(?![a-z])/.test(t)) return "acessorio";
  return null;
}

/** Pergunta para comprar ("valor dos capacetes", "tem baú?", "quais capacetes vocês têm") */
export const RX_QUER_ACESSORIO = /(?<![\p{L}])(?:valor(?:es)?|pre[çc]os?|quanto|quais|tem|t[êe]m|vende[mn]?|quero|queria|comprar|op[çc][õo]es|modelos?|mostra|manda|fotos?)(?![\p{L}])/iu;
/** "a moto vem com capacete?", "o capacete é de brinde?": é sobre a moto, não compra de acessório */
export const RX_ACESSORIO_DA_MOTO = /(?<![\p{L}])(?:vem\s+com|acompanha|brinde|incluso|inclu[íi]do|de\s+gra[çc]a|junto\s+com\s+a\s+moto|ganho|ganha)(?![\p{L}])/iu;

export type Acessorio ={ nome: string; preco: number | null; foto: string | null; quantidade: number | null };
const brl = (x: number) => `R$ ${x.toLocaleString("pt-BR", Number.isInteger(x) ? { maximumFractionDigits: 0 } : { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const ehDa = (cat: Categoria) => (a: Acessorio) => (cat === "capacete" ? /capacete/i.test(a.nome) : cat === "bau" ? /ba[uú]|bagageiro/i.test(norm(a.nome)) : true);

/** Até 3 acessórios da categoria (com foto primeiro, do mais em conta ao mais caro, sem o que acabou), com a legenda de
 *  cada um, a abertura e a pergunta do fim (com o link do site quando há mais do que vai na foto). Nada: null. */
export function montarAcessorios(lista: Acessorio[], cat: Categoria, nome: string | null) {
  const daCat = lista.filter(ehDa(cat)).filter((a) => a.preco && a.preco > 0 && a.quantidade !== 0);
  if (!daCat.length) return null;
  const ordem = [...daCat].sort((a, b) => Number(!a.foto) - Number(!b.foto) || a.preco! - b.preco!);
  const vao = ordem.slice(0, 3);
  const rotulo = cat === "capacete" ? "capacete" : cat === "bau" ? "baú" : "acessório";
  const plural = cat === "capacete" ? "capacetes" : cat === "bau" ? "baús" : "acessórios";
  const precos = daCat.map((a) => a.preco!);
  const faixa = Math.min(...precos) === Math.max(...precos) ? brl(precos[0]) : `de ${brl(Math.min(...precos))} a ${brl(Math.max(...precos))}`;
  const quem = nome ? `${nome}, t` : "T";
  const abertura =
    daCat.length === 1
      ? `${quem}emos ${artigoDe(rotulo)} ${rotulo} a pronta entrega, por ${brl(daCat[0].preco!)}:`
      : `${quem}emos ${daCat.length} opções de ${rotulo}, ${faixa}.${daCat.length > vao.length ? " Separei algumas:" : ""}`;
  const legenda = (a: Acessorio) => `*${a.nome}*\n💰 *${brl(a.preco!)}*`;
  const resto = daCat.length > vao.length ? `Os outros ${plural}, com foto e preço, estão no nosso site: ${linkDoSite({ tipo: "acessorio" })}\n\n` : "";
  const pergunta = `${resto}${vao.length > 1 ? "Qual deles te interessou mais? 😊" : "Quer garantir o seu? 😊"}`;
  return { abertura, itens: vao.map((a) => ({ nome: a.nome, foto: a.foto, legenda: legenda(a) })), pergunta };
}
const artigoDe = (r: string) => (r === "baú" || r === "capacete" || r === "acessório" ? "um" : "uma");
