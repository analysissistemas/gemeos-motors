/* Peças puras do workflow (testadas em tests/unit/workflow.test.ts). */

/** Quebra a resposta da IA em até `max` mensagens curtas: primeiro por parágrafo;
 *  parágrafo único e longo é dividido por frases. O excesso junta no último bloco. */
export function quebrarEmBlocos(texto: string, max: number): string[] {
  const limpo = texto.replace(/\r/g, "").trim();
  if (!limpo) return [];
  let partes = limpo.split(/\n\s*\n/).map((s) => s.trim()).filter(Boolean);
  if (partes.length === 1 && limpo.length > 280 && max > 1) {
    /* unidades: linhas; item de lista ("•") fica junto da linha que o apresenta; linha comum longa vira
       frases, cortando só em pontuação seguida de espaço (assim "R$ 8.990" nunca é partido) */
    const unidades: string[] = [];
    for (const linha of limpo.split("\n").map((l) => l.trim()).filter(Boolean)) {
      if (/^•/.test(linha) && unidades.length) unidades[unidades.length - 1] += `\n${linha}`;
      else unidades.push(linha);
    }
    const frases = unidades.flatMap((u) => (u.includes("\n•") ? [u] : u.split(/(?<=[.!?])\s+(?=\S)/u))).map((s) => s.trim()).filter(Boolean);
    const alvo = Math.ceil(limpo.length / Math.min(max, Math.ceil(limpo.length / 160)));
    partes = [];
    let atual = "";
    for (const f of frases) {
      if (atual && (atual + " " + f).length > alvo) {
        partes.push(atual);
        atual = f;
      } else atual = atual ? `${atual} ${f}` : f;
    }
    if (atual) partes.push(atual);
  }
  if (partes.length <= max) return partes;
  return [...partes.slice(0, max - 1), partes.slice(max - 1).join("\n\n")];
}

/** Tira do começo da resposta o cumprimento ("Bom dia! Tudo certinho?") quando a saudação já vai
    numa mensagem separada; sem isso o cliente recebia o mesmo cumprimento duas vezes seguidas. */
export function tirarCumprimentoRepetido(texto: string) {
  let t = texto.trim();
  /* cumprimento, "tudo bem?" e apresentação ("Aqui é da Gêmeos Motors", "Sou a assistente...") no começo */
  const inicio = [
    /^(?:bom\s+dia+|boa\s+tarde+|boa\s+noite+|ol[aá]+|oi+|e\s+a[ií])(?![\p{L}])[^.!?\n]*[.!?]+\s*/iu,
    /^tudo\s+(?:bem|certinho|certo|joia|jóia|tranquilo|bom)[^.!?\n]*[?!.]+\s*/iu,
    /^(?:aqui\s+(?:é|e)\s+|(?:eu\s+)?sou\s+(?:a|o)\s+(?:assistente|atendente))[^.!?\n]*[.!?]+\s*/iu,
  ];
  inicio.push(/^aqui\s+na\s+g[êe]meos\s+motors\s*,\s*/iu);
  for (let volta = 0; volta < 3; volta++) for (const rx of inicio) t = t.replace(rx, "");
  t = t.trim();
  return t ? t[0].toUpperCase() + t.slice(1) : t;
}

/** Emoji solto no começo de uma mensagem ("😊 Para te ajudar...") parece robô: sai. */
export function tirarEmojiDoInicio(texto: string) {
  return texto.replace(/^(?:\p{Extended_Pictographic}\uFE0F?\s*)+/u, "").trim();
}

/** Saudação é só o cumprimento: frases com pergunta ou apresentação saem (vão na resposta). */
export function soCumprimento(saudacao: string) {
  const frases = saudacao.match(/[^.!?]+[.!?]*/g) ?? [saudacao];
  const CUMPRIMENTO = /^\s*(?:(?:ol[aá]+|oi+|e\s+a[ií])[\s,!]*)?(?:bom\s+dia+|boa\s+tarde+|boa\s+noite+|ol[aá]+|oi+|e\s+a[ií])?[\s,!]*(?:tudo\s+(?:bem|certinho|certo|joia|jóia|tranquilo|bom)[^.!?]*)?[.!?\s]*(?:\p{Extended_Pictographic}\uFE0F?\s*)*$/iu;
  const ficam: string[] = [];
  for (const f of frases) {
    const soEmoji = !/\p{L}/u.test(f) && /\p{Extended_Pictographic}/u.test(f);
    if (f.trim() && CUMPRIMENTO.test(f) && (/\p{L}/u.test(f) || (soEmoji && ficam.length))) ficam.push(f);
  }
  return ficam.join("").trim();
}

/** Quanto tempo uma pessoa levaria digitando este bloco no celular: ~20 letras por segundo,
    entre 2 e 9 s, com uma variação pequena para não ficar robótico. `sorte` (0 a 1) é para o teste. */
export function tempoDigitando(bloco: string, sorte = Math.random()) {
  const base = 1200 + bloco.trim().length * 50;
  const variacao = 0.85 + sorte * 0.3;
  return Math.round(Math.min(9000, Math.max(2000, base * variacao)));
}

/** Pausa antes de um bloco: o intervalo configurado, maior para texto longo (até o dobro). */
export function pausaDoBloco(bloco: string, intervaloSegundos: number) {
  const base = intervaloSegundos * 1000;
  return Math.round(Math.min(base * 2, base * (0.6 + bloco.length / 250)));
}

/** "Preto" também casa com "preta"; "Branco perolado" com "branca perolada". */
export function corNoTexto(cor: string, texto: string) {
  const padrao = cor
    .toLowerCase()
    .trim()
    .split(/\s+/)
    .map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/[oa]$/u, "[oa]"))
    .join("\\s+");
  return new RegExp(`(?<![\\p{L}])${padrao}(?![\\p{L}])`, "iu").test(texto);
}

/** Forma de pagamento escrita pelo cliente ("pago no pix", "no cartão"). */
export function pagamentoDoTexto(texto: string) {
  const t = texto.toLowerCase();
  const formas: [RegExp, string][] = [
    [/(?<![\p{L}])pix(?![\p{L}])/u, "Pix"],
    [/financ/u, "Financiamento"],
    [/cr[eé]dito|cart[aã]o/u, "Cartão de crédito"],
    [/d[eé]bito/u, "Débito"],
    [/dinheiro|[àa] vista|esp[eé]cie/u, "Dinheiro"],
    [/transfer[eê]ncia/u, "Transferência"],
  ];
  return formas.find(([rx]) => rx.test(t))?.[1] ?? null;
}

export type MensagemMemoria ={ autor: string; tipo: string; conteudo: string | null; transcricao?: string | null; criadoEm: Date };

/** Texto que representa a mensagem para a IA (mídia usa a transcrição/descrição). */
export function textoDaMensagem(m: Pick<MensagemMemoria, "tipo" | "conteudo" | "transcricao">) {
  if (m.tipo === "texto") return m.conteudo ?? "";
  const rotulo = { audio: "áudio", imagem: "imagem", documento: "documento", video: "vídeo", localizacao: "localização", contato: "contato" }[m.tipo] ?? m.tipo;
  if (m.transcricao) return `[${rotulo}] ${m.transcricao}`;
  return `[${rotulo}${m.conteudo ? `: ${m.conteudo}` : ""}]`;
}

/** Histórico no formato do n8n ("Lead: …", "Agente IA: …"), do mais antigo para o mais novo. */
export function formatarHistorico(msgs: MensagemMemoria[]) {
  return msgs
    .filter((m) => m.autor !== "sistema")
    .map((m) => `${m.autor === "cliente" ? "Lead" : m.autor === "ia" ? "Agente IA" : "Vendedor"}: ${textoDaMensagem(m)}`)
    .join("\n\n");
}

export type FatosLead = { nome?: string | null; interesse?: string | null; uso?: string | null; pagamento?: string | null; troca?: string | null; cidade?: string | null; observacoes?: string | null };

/** Junta fatos novos aos antigos: valor vazio nunca apaga o que já se sabia. */
export function mesclarFatos(antigos: FatosLead, novos: FatosLead): FatosLead {
  const r: FatosLead = { ...antigos };
  for (const [k, v] of Object.entries(novos) as [keyof FatosLead, string | null | undefined][]) if (typeof v === "string" && v.trim()) r[k] = v.trim().slice(0, 300);
  return r;
}
