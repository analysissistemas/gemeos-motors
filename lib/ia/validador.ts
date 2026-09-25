/* ============================================================
   VALIDADOR DE RESPOSTA DA IA
   Função pura e determinística: sem banco, sem IA, sem rede. Toda resposta
   gerada pela IA passa por aqui antes de poder chegar ao cliente. Se qualquer
   regra reprovar, a mensagem NÃO é enviada. Na dúvida, reprova (falha fechada).
   Preço, link e ficha de veículo nunca são escritos pela IA: o sistema
   monta isso a partir do estoque. Por isso qualquer valor em reais no texto
   da IA é bloqueado.
   ============================================================ */

export type Violacao = { regra: string; rotulo: string; detalhe: string };
export type ResultadoValidacao = { aprovada: boolean; violacoes: Violacao[] };
export type OpcoesValidacao = { maxCaracteres?: number; maxLinhas?: number; promptSistema?: string };

export const MAX_CARACTERES = 700;
export const MAX_LINHAS = 6;

export const REGRAS: Record<string, string> = {
  vazia: "Resposta vazia",
  longa: "Resposta longa demais",
  emoji: "Emoji ou símbolo proibido",
  preco: "Valor em reais escrito pela IA",
  link: "Link ou endereço de site",
  parcelamento: "Menção a parcelamento, entrada ou carnê",
  desconto: "Promessa de desconto ou aprovação",
  bastidor: "Termo interno do sistema",
  interno: "Dado interno ou sensível",
  finge_humano: "Diz que é pessoa ou nega ser assistente virtual",
  vazamento_prompt: "Repete trecho das instruções internas",
};

/* Limites de palavra que entendem acento: o \b do JavaScript trata "ê" e "ô" como
   fim de palavra e deixava "carnê" e "robô" passarem. */
const I = String.raw`(?<![\p{L}\p{N}_])`;
const F = String.raw`(?![\p{L}\p{N}_])`;
const palavra = (alternativas: string) => new RegExp(`${I}(?:${alternativas})${F}`, "iu");

const RX = {
  emoji: /[\p{Extended_Pictographic}\u{FE0F}\u{200D}]/u,
  preco: new RegExp(
    String.raw`R\$\s*\d|${I}\d[\d.,]*\s*(?:reais|real)${F}|${I}mil\s+reais${F}|(?<![\p{L}\p{N}.])\d{1,3}(?:\.\d{3})+(?:,\d{2})?(?![\p{N}])|${I}\d+\s*mil${F}`,
    "iu",
  ),
  link: /https?:\/\/\S+|(?<![\p{L}\p{N}])www\.\S+|(?<![\p{L}\p{N}-])[a-z0-9-]+\.(?:com\.br|com|br|app|net|org|io)(?![\p{L}\p{N}])/iu,
  parcelamento: palavra(String.raw`parcel\p{L}*|carn[êe]|sem juros|\d{1,2}\s?x|entrada|boleto|fiado`),
  desconto: palavra("desconto|abatimento|aprova[cç][aã]o garantida|financiamento garantido"),
  bastidor: palavra("prompt|instru[cç][õo]es do sistema|system message|ferramentas?|banco de dados|api|json|crm|funil|est[aá]gio|qualificad[oa]|webhook"),
  interno: new RegExp(
    String.raw`${I}(?:custo|margem|lucro|comiss[aã]o)${F}|(?<![\p{N}])\d{3}\.\d{3}\.\d{3}-\d{2}(?![\p{N}])|${I}sk-[A-Za-z0-9_-]{10,}|${I}EAA[A-Za-z0-9]{20,}|${I}gm_[0-9a-f]{20,}`,
    "iu",
  ),
  finge_humano: palavra("sou (?:uma )?(?:pessoa|humano|humana|atendente humano)|n[aã]o sou (?:um |uma )?(?:rob[ôo]|ia|bot|assistente virtual)"),
};

const CHECAGENS = (Object.keys(RX) as (keyof typeof RX)[]).map((regra) => ({
  regra: regra as string,
  teste: (t: string): string | null => t.match(RX[regra])?.[0] ?? null,
}));

const palavras = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/).filter(Boolean);

/** Acha 8 palavras seguidas da resposta que também existam, na mesma ordem, no prompt. */
export function trechoDoPrompt(resposta: string, prompt: string, tamanho = 8): string | null {
  const r = palavras(resposta);
  if (r.length < tamanho) return null;
  const alvo = ` ${palavras(prompt).join(" ")} `;
  for (let i = 0; i + tamanho <= r.length; i++) {
    const janela = r.slice(i, i + tamanho).join(" ");
    if (alvo.includes(` ${janela} `)) return janela;
  }
  return null;
}

export function validarResposta(texto: string | null | undefined, opcoes: OpcoesValidacao = {}): ResultadoValidacao {
  const t = (texto ?? "").trim();
  const violacoes: Violacao[] = [];
  const add = (regra: string, detalhe: string) => violacoes.push({ regra, rotulo: REGRAS[regra] ?? regra, detalhe });

  if (!t) {
    add("vazia", "A IA não escreveu nada.");
    return { aprovada: false, violacoes };
  }
  const maxC = opcoes.maxCaracteres ?? MAX_CARACTERES;
  const maxL = opcoes.maxLinhas ?? MAX_LINHAS;
  const linhas = t.split(/\r?\n/).filter((l) => l.trim()).length;
  if (t.length > maxC) add("longa", `${t.length} caracteres (máximo ${maxC}).`);
  else if (linhas > maxL) add("longa", `${linhas} linhas (máximo ${maxL}).`);

  for (const c of CHECAGENS) {
    const achou = c.teste(t);
    if (achou) add(c.regra, `Trecho: "${achou}"`);
  }
  if (opcoes.promptSistema) {
    const trecho = trechoDoPrompt(t, opcoes.promptSistema);
    if (trecho) add("vazamento_prompt", `Trecho igual ao das instruções: "${trecho}"`);
  }
  return { aprovada: violacoes.length === 0, violacoes };
}
