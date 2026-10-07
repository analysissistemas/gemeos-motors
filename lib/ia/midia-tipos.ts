/* Foto e vídeo da moto que a IA manda no WhatsApp junto com a resposta (pedido do dono, 02/10/2026:
   "a IA enviar o vídeo e a imagem atrelado às informações da moto"). Puro: sem banco. A leitura e o
   envio estão em lib/ia/workflow/nos.ts e lib/ia/envio.ts.

   Regras:
   - Só moto com unidade disponível no estoque (a mesma regra da oferta).
   - Foto da cor que está no estoque (uma por cor); sem foto da cor, a foto principal do modelo.
   - O cliente pediu foto/vídeo: manda o que pediu (e a IA sabe ANTES de escrever, para não prometer
     o que não vai). Sem pedido: a primeira vez que a moto aparece na conversa, manda foto e vídeo;
     depois não repete. */
import { artigo, norm } from "./estoque-tipos.ts";

export type TipoMidiaIa = "foto" | "video";
export type FotoDaMoto = { url: string; cor: string | null };
export type ModeloComMidia = { id: number; nome: string; fotos: FotoDaMoto[]; videoUrl: string | null };
export type ItemMidia = { tipo: TipoMidiaIa; url: string; legenda: string };
export type PlanoMidia = { modelo: ModeloComMidia | null; pedido: TipoMidiaIa[]; itens: ItemMidia[] };

const RX_FOTO = /(?<![\p{L}\p{N}])(?:fotos?|imagens?|imagem|fotinhas?)(?![\p{L}\p{N}])/iu;
const RX_VIDEO = /(?<![\p{L}\p{N}])v[ií]deos?(?![\p{L}\p{N}])/iu;
/* "quero ver a moto", "me mostra ela", "tem como ver?" */
const RX_VER = /(?<![\p{L}])(?:ver\s+(?:a\s+moto|ela|essa|esta|como\s+(?:[ée]|ela\s+[ée])|de\s+perto)|mostr(?:a|ar|e)\s+(?:a\s+moto|ela|pra\s+mim\s+(?:a\s+moto|ela)|para\s+mim\s+(?:a\s+moto|ela))|como\s+ela\s+[ée])(?![\p{L}])/iu;

/** O que o cliente pediu para ver nesta mensagem. */
export function pedidoDeMidia(texto: string): TipoMidiaIa[] {
  const foto = RX_FOTO.test(texto);
  const video = RX_VIDEO.test(texto);
  if (foto || video) return [...(foto ? (["foto"] as const) : []), ...(video ? (["video"] as const) : [])];
  return RX_VER.test(texto) ? ["foto", "video"] : [];
}

const escapar = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** Nome inteiro e os pedaços com número ("TANK AG11" → "AG11"), como na trava de estoque. */
/* palavras que não identificam um modelo sozinhas ("moto tank" → TANK AG11, mas "capacete" não é nenhum) */
const GENERICOS = new Set(["moto", "motos", "patinete", "patinetes", "capacete", "bau", "gemeos", "motors", "eletrica", "eletrico", "retro"]);
function nomesDe(nome: string) {
  const palavras = nome.split(/\s+/);
  const pedacos = palavras.filter((p) => p.length >= 2 && /\d/.test(p));
  /* a 1ª palavra também vale ("tank" → TANK AG11, teste de 05/10/2026), se tiver 3+ letras e não for genérica */
  const primeira = norm(palavras[0] ?? "");
  const extra = palavras.length > 1 && primeira.length >= 3 && !/\d/.test(primeira) && !GENERICOS.has(primeira) ? [primeira] : [];
  return Array.from(new Set([nome, ...pedacos, ...extra].map(norm)));
}
/** A moto citada por último no texto (posição da última menção). */
export function ultimaCitada<T extends { nome: string }>(modelos: T[], texto: string): T | null {
  const t = norm(texto);
  let melhor: { m: T; pos: number; tam: number } | null = null;
  for (const m of modelos)
    for (const n of nomesDe(m.nome)) {
      const rx = new RegExp(`(?<![\\p{L}\\p{N}])${escapar(n)}(?![\\p{L}\\p{N}])`, "gu");
      for (const x of t.matchAll(rx)) {
        const pos = x.index ?? -1;
        if (!melhor || pos > melhor.pos || (pos === melhor.pos && n.length > melhor.tam)) melhor = { m, pos, tam: n.length };
      }
    }
  return melhor?.m ?? null;
}

function itensDe(m: ModeloComMidia, tipos: TipoMidiaIa[]): ItemMidia[] {
  const itens: ItemMidia[] = [];
  if (tipos.includes("foto"))
    for (const f of m.fotos.slice(0, 1)) itens.push({ tipo: "foto", url: f.url, legenda: `*${m.nome}*${f.cor ? ` na cor ${f.cor}` : ""}` });
  if (tipos.includes("video") && m.videoUrl) itens.push({ tipo: "video", url: m.videoUrl, legenda: `Vídeo d${artigo(m.nome)} *${m.nome}*` });
  return itens;
}

/** Antes da IA escrever: o cliente pediu foto/vídeo? De qual moto (com estoque)? O que dá para mandar? */
export function planejarPedido(p: { modelos: ModeloComMidia[]; textoCliente: string; historicoCliente: string; interesse: string | null; /** o que a loja acabou de dizer: "foto das duas opções" fala dessas motos */ ultimasDaLoja?: string }): PlanoMidia | null {
  const pedido = pedidoDeMidia(p.textoCliente);
  if (!pedido.length) return null;
  /* o cliente não nomeou a moto e a loja acabou de apresentar 2 ou 3: a foto é de cada uma delas (teste real de 06/10/2026) */
  if (!ultimaCitada(p.modelos, p.textoCliente) && p.ultimasDaLoja) {
    const apresentadas = p.modelos.filter((m) => ultimaCitada([m], p.ultimasDaLoja!));
    if (apresentadas.length >= 2 && apresentadas.length <= 3) {
      return { modelo: { ...apresentadas[0], nome: apresentadas.map((m) => m.nome).join(" e ") }, pedido, itens: apresentadas.flatMap((m) => itensDe(m, ["foto"])) };
    }
  }
  const modelo =
    ultimaCitada(p.modelos, p.textoCliente) ??
    ultimaCitada(p.modelos, [p.interesse ?? "", p.historicoCliente].join("\n")) ??
    (p.modelos.length === 1 ? p.modelos[0] : null);
  return { modelo, pedido, itens: modelo ? itensDe(modelo, pedido) : [] };
}

/** Sem pedido: a moto que o cliente citou agora (ou a única que a resposta apresenta) e que ainda não
 *  foi apresentada nesta conversa ganha foto e vídeo. `jaEnviadas` = endereços já mandados na conversa.
 *  A foto já foi entre as opções (cliente pesquisando) e o vídeo não: vai só o que falta (teste de 04/10/2026). */
export function planejarApresentacao(p: { modelos: ModeloComMidia[]; textoCliente: string; resposta: string; jaEnviadas: string[] }): PlanoMidia | null {
  const doCliente = ultimaCitada(p.modelos, p.textoCliente);
  const naResposta = p.modelos.filter((m) => ultimaCitada([m], p.resposta));
  const modelo = doCliente ?? (naResposta.length === 1 ? naResposta[0] : null);
  if (!modelo) return null;
  const ja = new Set(p.jaEnviadas);
  if (modelo.videoUrl && ja.has(modelo.videoUrl)) return null;
  const itens = itensDe(modelo, ["foto", "video"]).filter((i) => !ja.has(i.url));
  return itens.length ? { modelo, pedido: [], itens } : null;
}

/** Cliente pesquisando (Diretrizes do Milton, 04/10/2026: "apresente de duas a três opções relevantes, com
 *  foto, nome, preço"): a resposta apresenta 2 ou 3 motos do estoque; vai uma foto de cada, ainda não mandada.
 *  Sem vídeo, para não encher a conversa: o vídeo vai quando ele escolher uma. */
export function planejarOpcoes(p: { modelos: ModeloComMidia[]; resposta: string; jaEnviadas: string[] }): PlanoMidia | null {
  const ja = new Set(p.jaEnviadas);
  const citados = p.modelos.filter((m) => ultimaCitada([m], p.resposta));
  if (citados.length < 2) return null;
  const itens: ItemMidia[] = citados
    .slice(0, 3)
    .map((m) => ({ m, f: m.fotos.find((x) => !ja.has(x.url)) }))
    .filter((x): x is { m: ModeloComMidia; f: FotoDaMoto } => !!x.f && !m_jaMostrada(x.m, ja))
    .map(({ m, f }) => ({ tipo: "foto" as const, url: f.url, legenda: `*${m.nome}*${f.cor ? ` na cor ${f.cor}` : ""}` }));
  return itens.length ? { modelo: null, pedido: [], itens } : null;
}
const m_jaMostrada = (m: ModeloComMidia, ja: Set<string>) => m.fotos.some((f) => ja.has(f.url));

/** O que a IA precisa saber antes de escrever, para o texto bater com o que vai (ou não) junto. */
export function instrucaoDeMidia(plano: PlanoMidia | null): string {
  const base = "Você não manda arquivo nem link: a foto e o vídeo da moto quem manda é o sistema, logo depois do seu texto.";
  if (!plano) return `# FOTO E VÍDEO\n${base} Nesta resposta não vai foto nem vídeo: nunca escreva que está mandando foto ou vídeo.`;
  if (!plano.modelo) return `# FOTO E VÍDEO\n${base} O cliente pediu para ver a moto, mas não disse qual: pergunte qual moto ele quer ver (só as que estão EM ESTOQUE). Não diga que está mandando.`;
  const vai = plano.itens.map((i) => (i.tipo === "foto" ? "foto" : "vídeo"));
  const faltou = plano.pedido.filter((t) => !plano.itens.some((i) => i.tipo === t)).map((t) => (t === "foto" ? "foto" : "vídeo"));
  if (!vai.length) return `# FOTO E VÍDEO\n${base} O cliente pediu ${faltou.join(" e ")} da ${plano.modelo.nome}, mas a loja ainda não tem esse arquivo no sistema: NÃO diga que está mandando; diga com naturalidade que o vendedor envia assim que possível e siga com a ficha da moto.`;
  return `# FOTO E VÍDEO\n${base} Junto com esta resposta vai: ${Array.from(new Set(vai)).join(" e ")} da ${plano.modelo.nome}. Apresente em uma frase curta (ex.: "Olha ela aí 👇") e siga a conversa.${faltou.length ? ` Não tem ${faltou.join(" nem ")} no sistema: diga que o vendedor manda depois.` : ""}`;
}

/* Frases que prometem foto/vídeo ("segue a foto", "vou te mandar o vídeo"): saem quando nada vai junto. */
const RX_PROMETE = /(?:segue[mn]?|aqui\s+est[aã]o?|te\s+mand(?:o|ei)|vou\s+(?:te\s+)?(?:mandar|enviar)|j[aá]\s+(?:te\s+)?(?:mando|envio)|enviei|mandei|envio)[^.!?\n]{0,40}(?:fotos?|v[ií]deos?|imagens?)|(?:fotos?|v[ií]deos?|imagens?)[^.!?\n]{0,25}(?:abaixo|a\s+seguir|logo\s+(?:abaixo|em\s+seguida)|👇)/iu;
export function tirarPromessaDeMidia(bloco: string): string {
  const frases = bloco.match(/(?:[^.!?\n]|[.!?](?=\d))+[.!?]*\s*(?:\p{Extended_Pictographic}️?\s*)*|\n/gu) ?? [bloco];
  return frases.filter((f) => !RX_PROMETE.test(f)).join("").trim();
}
