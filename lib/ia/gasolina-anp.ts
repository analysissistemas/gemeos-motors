/* ============================================================
   PREÇO DA GASOLINA PELA ANP (pedido do dono, 27/09/2026: "o valor da gasolina sempre vai
   atualizando com base na região que a pessoa mora")
   A ANP publica toda semana o "resumo semanal" (planilha .xlsx) com o preço médio da gasolina
   comum por município pesquisado e por estado. Aqui ficam as peças puras: ler a planilha
   (sem biblioteca: .xlsx é um zip de XML) e escolher o preço para a cidade do cliente.
   Testado em tests/unit/gasolina-anp.test.ts.
   ============================================================ */
import { inflateRawSync } from "node:zlib";

export type PrecosGasolina = {
  /** nome do arquivo da ANP (identifica a semana) */
  arquivo: string;
  /** última data da semana pesquisada, "AAAA-MM-DD" */
  semanaFim: string;
  /** "PERNAMBUCO" → 6.94 */
  estados: Record<string, number>;
  /** "PERNAMBUCO|RECIFE" → 6.97 */
  municipios: Record<string, number>;
};

/** Sem acento e em maiúsculas, como a ANP escreve ("Vitória de Santo Antão" → "VITORIA DE SANTO ANTAO"). */
export const nomeAnp = (s: string) =>
  s
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();

/** Arquivos de dentro do .xlsx (zip), pelo diretório central. Só "guardado" e "deflate", que é o que o Excel usa. */
export function lerZip(buf: Buffer): Map<string, Buffer> {
  const arquivos = new Map<string, Buffer>();
  let fim = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65_557); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      fim = i;
      break;
    }
  }
  if (fim < 0) throw new Error("planilha da ANP inválida (zip sem diretório)");
  const total = buf.readUInt16LE(fim + 10);
  let p = buf.readUInt32LE(fim + 16);
  for (let n = 0; n < total; n++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error("planilha da ANP inválida (diretório)");
    const metodo = buf.readUInt16LE(p + 10);
    const tamanho = buf.readUInt32LE(p + 20);
    const lenNome = buf.readUInt16LE(p + 28);
    const lenExtra = buf.readUInt16LE(p + 30);
    const lenComent = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const nome = buf.toString("utf8", p + 46, p + 46 + lenNome);
    const inicio = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    const dado = buf.subarray(inicio, inicio + tamanho);
    if (metodo === 0) arquivos.set(nome, Buffer.from(dado));
    else if (metodo === 8) arquivos.set(nome, inflateRawSync(dado));
    p += 46 + lenNome + lenExtra + lenComent;
  }
  return arquivos;
}

const desescapar = (s: string) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");

/** Linhas de uma aba como { A: "...", B: "..." } (texto já resolvido pela tabela de textos). */
function linhasDaAba(xml: string, textos: string[]) {
  return Array.from(xml.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g), (r) => {
    const linha: Record<string, string> = {};
    for (const c of r[1].matchAll(/<c r="([A-Z]+)\d+"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const v = (c[3] ?? "").match(/<v>([\s\S]*?)<\/v>/)?.[1] ?? (c[3] ?? "").match(/<t[^>]*>([\s\S]*?)<\/t>/)?.[1] ?? "";
      linha[c[1]] = /t="s"/.test(c[2]) ? (textos[Number(v)] ?? "") : desescapar(v);
    }
    return linha;
  });
}

/** Data do Excel (número de dias desde 30/12/1899) → "AAAA-MM-DD". */
const dataExcel = (n: string) => new Date(Date.UTC(1899, 11, 30) + Number(n) * 86_400_000).toISOString().slice(0, 10);

/** Lê o resumo semanal da ANP: gasolina comum por estado e por município. */
export function lerResumoSemanal(xlsx: Buffer, arquivo: string): PrecosGasolina {
  const zip = lerZip(xlsx);
  const sst = zip.get("xl/sharedStrings.xml")?.toString("utf8") ?? "";
  const textos = Array.from(sst.matchAll(/<si>([\s\S]*?)<\/si>/g), (m) => desescapar(Array.from(m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g), (t) => t[1]).join("")));
  const wb = zip.get("xl/workbook.xml")?.toString("utf8") ?? "";
  const rels = zip.get("xl/_rels/workbook.xml.rels")?.toString("utf8") ?? "";
  const aba = (nome: string) => {
    const id = wb.match(new RegExp(`<sheet[^>]*name="${nome}"[^>]*r:id="([^"]+)"`))?.[1];
    const alvo = id && rels.match(new RegExp(`<Relationship[^>]*Id="${id}"[^>]*Target="([^"]+)"`))?.[1];
    const xml = alvo && zip.get(`xl/${alvo.replace(/^\/?xl\//, "")}`)?.toString("utf8");
    if (!xml) throw new Error(`planilha da ANP sem a aba ${nome}`);
    return linhasDaAba(xml, textos);
  };
  const gasolina = (l: Record<string, string>) => nomeAnp(l.E ?? "") === "GASOLINA COMUM" && Number(l.H) > 0;
  const estados: Record<string, number> = {};
  const municipios: Record<string, number> = {};
  let semanaFim = "";
  /* ESTADOS: A início, B fim, C região, D estado, E produto, H preço médio */
  for (const l of aba("ESTADOS").filter(gasolina)) {
    estados[nomeAnp(l.D)] = Math.round(Number(l.H) * 100) / 100;
    semanaFim ||= dataExcel(l.B);
  }
  /* MUNICIPIOS: A início, B fim, C estado, D município, E produto, H preço médio */
  for (const l of aba("MUNICIPIOS").filter(gasolina)) municipios[`${nomeAnp(l.C)}|${nomeAnp(l.D)}`] = Math.round(Number(l.H) * 100) / 100;
  if (!Object.keys(estados).length) throw new Error("planilha da ANP sem preço de gasolina por estado");
  return { arquivo, semanaFim, estados, municipios };
}

/** Link do resumo semanal mais recente na página de levantamento de preços da ANP. */
export function linkResumoMaisRecente(html: string): string | null {
  const links = Array.from(html.matchAll(/href="([^"]*resumo_semanal_lpc_[^"]+\.xlsx)"/gi), (m) => m[1]);
  /* a página lista do mais novo para o mais antigo; por garantia, ordena pela data inicial do nome */
  const data = (u: string) => u.match(/resumo_semanal_lpc_(\d{4}-\d{2}-\d{2})/)?.[1] ?? "";
  return links.sort((a, b) => data(b).localeCompare(data(a)))[0] ?? null;
}

export type PrecoDaRegiao = { preco: number; onde: string };

/** Preço da gasolina para o cliente: a cidade dele (se a ANP pesquisa), senão a média do estado. */
export function precoParaCidade(dados: PrecosGasolina, cidade: string | null | undefined, estadoPadrao: string): PrecoDaRegiao | null {
  const uf = nomeAnp(estadoPadrao);
  const c = cidade ? nomeAnp(cidade) : "";
  if (c) {
    /* mesma cidade no estado da loja primeiro; depois em qualquer estado */
    const noEstado = dados.municipios[`${uf}|${c}`];
    if (noEstado) return { preco: noEstado, onde: titulo(c) };
    const outra = Object.entries(dados.municipios).find(([k]) => k.endsWith(`|${c}`));
    if (outra) return { preco: outra[1], onde: titulo(c) };
  }
  const est = dados.estados[uf];
  return est ? { preco: est, onde: `média de ${titulo(uf)}` } : null;
}

/** Cidade que o cliente citou no texto, entre as que a ANP pesquisa no estado da loja ("moro em Igarassu"). */
export function cidadeNoTexto(dados: PrecosGasolina, texto: string, estadoPadrao: string): string | null {
  const t = ` ${nomeAnp(texto)} `;
  const uf = nomeAnp(estadoPadrao);
  const nomes = Object.keys(dados.municipios)
    .filter((k) => k.startsWith(`${uf}|`))
    .map((k) => k.split("|")[1])
    .sort((a, b) => b.length - a.length);
  return nomes.find((n) => t.includes(` ${n} `)) ?? null;
}

const MINUSCULAS = new Set(["DE", "DA", "DO", "DAS", "DOS", "E"]);
/** "VITORIA DE SANTO ANTAO" → "Vitoria de Santo Antao" (a ANP não guarda acento). */
export const titulo = (s: string) =>
  s
    .toLowerCase()
    .split(" ")
    .map((p, i) => (i > 0 && MINUSCULAS.has(p.toUpperCase()) ? p : p.charAt(0).toUpperCase() + p.slice(1)))
    .join(" ");
