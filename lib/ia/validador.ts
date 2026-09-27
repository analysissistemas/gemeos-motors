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
export type OpcoesValidacao = {
  maxCaracteres?: number;
  maxLinhas?: number;
  promptSistema?: string;
  /** textos da base de conhecimento ativa: valor, parcela e desconto só passam se estiverem, iguais, aqui */
  fontesAutorizadas?: string[];
};

/* Emojis leves que o dono aprovou para o tom humanizado (27/09/2026). Qualquer outro continua bloqueado. */
export const EMOJIS_PERMITIDOS = [
  "🙏", "🙏🏻", "🙏🏼", "🙏🏽", "😊", "🙂", "🤝", "✅", "😉",
  /* do assunto, ainda profissionais (pedido do dono, 27/09/2026: "coloque emojis mas não deixe informal demais") */
  "⚡", "🔋", "🛵", "🏍️", "🏍", "💰", "📍", "🔌", "✨", "🙌", "👍", "😃", "🎉", "📲", "🛠️", "🛠", "💚",
];
export const MAX_EMOJIS = 2;

export const MAX_CARACTERES = 1000;
export const MAX_LINHAS = 12;

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
  dados_pessoais: "Dado pessoal (e-mail, telefone, CPF ou CNPJ)",
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
    String.raw`R\$\s*\d[\d.,]*\d|R\$\s*\d|${I}\d[\d.,]*\s*(?:reais|real)${F}|${I}mil\s+reais${F}|(?<![\p{L}\p{N}.])\d{1,3}(?:\.\d{3})+(?:,\d{2})?(?![\p{N}])|${I}\d+\s*mil${F}`,
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
  dados_pessoais: new RegExp(
    String.raw`[\w.+-]+@[\w-]+\.[\w.-]+|(?<![\p{N}])\d{11}(?![\p{N}])|(?<![\p{N}])\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}(?![\p{N}])|(?<![\p{N}])\(?\d{2}\)?\s?9?\d{4}[-\s]?\d{4}(?![\p{N}])`,
    "iu",
  ),
  finge_humano: palavra("sou (?:uma )?(?:pessoa|humano|humana|atendente humano)|n[aã]o sou (?:um |uma )?(?:rob[ôo]|ia|bot|assistente virtual)"),
};

const CHECAGENS = (Object.keys(RX) as (keyof typeof RX)[]).map((regra) => ({ regra: regra as string }));

/* sempre bloqueados, mesmo que a base cite: promessa que a loja não faz */
const NUNCA = /sem juros|carn[êe]|boleto|fiado|garantid[oa]/iu;
const AUTORIZAVEIS = new Set(["preco", "parcelamento", "desconto"]);
const normalizar = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/\s+/g, " ");
function todos(t: string, regra: string) {
  const rx = RX[regra as keyof typeof RX];
  return Array.from(t.matchAll(new RegExp(rx.source, rx.flags.includes("g") ? rx.flags : rx.flags + "g")), (m) => m[0]);
}
function autorizado(trecho: string, base: string) {
  if (!base || NUNCA.test(trecho)) return false;
  const n = normalizar(trecho).trim();
  /* "21x" também vale se a base escrever "21 vezes" */
  const vezes = n.match(/^(\d{1,2})\s?x$/);
  if (vezes) return base.includes(`${vezes[1]}x`) || base.includes(`${vezes[1]} x`) || base.includes(`${vezes[1]} vezes`);
  /* palavra com radical (parcelamos, parcelado): basta a base falar de parcelamento */
  if (/^parcel/.test(n)) return base.includes("parcel");
  return base.includes(n);
}

const palavras = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/).filter(Boolean);

/** Só as seções que são instrução interna de verdade (regras e quando transferir). Identidade, tom,
    roteiro de vendas, produtos, pagamento e respostas-modelo são falas feitas PARA o cliente ouvir
    ("não precisa de CNH, emplacamento nem IPVA"): repetir essas frases é o certo, não vazamento.
    Prompt sem os títulos de seção (testes, formato antigo): vale o prompt todo, como antes. */
export function secoesInternas(prompt: string) {
  const antesDaBase = prompt.split("# BASE DE CONHECIMENTO")[0];
  const secoes = antesDaBase.split(/^# /m).slice(1);
  if (!secoes.length) return antesDaBase;
  return secoes.filter((s) => /^(REGRAS E PROIBI|QUANDO PASSAR PARA O VENDEDOR)/.test(s)).join("\n");
}

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

  /* emojis aprovados saem da conferência (até MAX_EMOJIS); o que sobrar de emoji reprova */
  let semEmojisOk = t;
  let emojis = 0;
  for (const e of [...EMOJIS_PERMITIDOS].sort((a, b) => b.length - a.length)) {
    emojis += semEmojisOk.split(e).length - 1;
    semEmojisOk = semEmojisOk.split(e).join(" ");
  }
  if (emojis > MAX_EMOJIS) add("emoji", `${emojis} emojis (máximo ${MAX_EMOJIS}).`);
  const base = normalizar((opcoes.fontesAutorizadas ?? []).join(" \n "));

  for (const c of CHECAGENS) {
    const achados = c.regra === "emoji" ? [semEmojisOk.match(RX.emoji)?.[0]].filter((x): x is string => !!x) : todos(t, c.regra);
    /* valor, parcela e desconto só passam quando a base de conhecimento diz exatamente isso */
    const pendentes = AUTORIZAVEIS.has(c.regra) ? achados.filter((a) => !autorizado(a, base)) : achados;
    if (pendentes.length) add(c.regra, `Trecho: "${pendentes[0]}"`);
  }
  if (opcoes.promptSistema) {
    /* a base de conhecimento existe para ser dita ao cliente, e as falas-exemplo entre aspas existem
       para serem imitadas: só o resto das instruções conta como vazamento */
    const trecho = trechoDoPrompt(t, secoesInternas(opcoes.promptSistema).replace(/"[^"\n]*"/g, " zzcortezz "));
    if (trecho) add("vazamento_prompt", `Trecho igual ao das instruções: "${trecho}"`);
  }
  return { aprovada: violacoes.length === 0, violacoes };
}
