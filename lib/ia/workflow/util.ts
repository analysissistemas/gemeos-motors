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
export function tirarCumprimentoRepetido(texto: string, manterApresentacao = false) {
  let t = texto.trim();
  /* o cliente perguntou se é robô: "Sou o assistente virtual da Gêmeos Motors" É a resposta, não repetição */
  if (manterApresentacao) {
    for (let volta = 0; volta < 3; volta++)
      t = t.replace(/^(?:bom\s+dia+|boa\s+tarde+|boa\s+noite+|ol[aá]+|oi+|e\s+a[ií])(?![\p{L}])[^.!?\n]*[.!?]+\s*/iu, "").replace(/^tudo\s+(?:bem|certinho|certo|joia|jóia|tranquilo|bom)[^.!?\n]*[?!.]+\s*/iu, "");
    t = t.trim();
    return t ? t[0].toUpperCase() + t.slice(1) : t;
  }
  /* cumprimento, "tudo bem?" e apresentação ("Aqui é da Gêmeos Motors", "Sou a assistente...", "Me chamo Milton...") no começo */
  const inicio = [
    /^(?:bom\s+dia+|boa\s+tarde+|boa\s+noite+|ol[aá]+|oi+|e\s+a[ií])(?![\p{L}])[^.!?\n]*[.!?]+\s*(?:\p{Extended_Pictographic}️?\s*)*/iu,
    /^tudo\s+(?:bem|certinho|certo|joia|jóia|tranquilo|bom)[^.!?\n]*[?!.]+\s*(?:\p{Extended_Pictographic}️?\s*)*/iu,
    /* a apresentação termina na pontuação ou no emoji ("Me chamo Milton, sou da Gêmeos Motors 😊 A T1...") */
    /^(?:aqui\s+(?:é|e)\s+|(?:eu\s+)?sou\s+(?:a|o)\s+(?:assistente|atendente|milton)|me\s+chamo\s+milton)[^.!?\n\p{Extended_Pictographic}]*(?:[.!?]+\s*(?:\p{Extended_Pictographic}️?\s*)*|(?:\p{Extended_Pictographic}️?\s*)+)/iu,
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

/** Uma frase entre várias do mesmo sentido, para o atendimento não soar repetido (pedido do dono). `sorte` (0 a 1) é para o teste. */
export function variar<T>(lista: readonly T[], sorte = Math.random()): T {
  return lista[Math.min(lista.length - 1, Math.floor(sorte * lista.length))];
}

/** Pergunta do nome em qualquer das formas que o atendimento usa. */
export const RX_PERGUNTA_NOME = /com quem (?:eu )?falo|seu nome|como (?:você|vc) se chama|como posso te chamar/iu;

/** Primeiro nome para chamar o cliente ("carla souza" → "Carla"); nada de número, emoji ou apelido estranho. */
export function primeiroNome(nome: string | null | undefined) {
  const p = (nome ?? "").trim().split(/\s+/)[0] ?? "";
  if (!/^\p{L}{2,20}$/u.test(p)) return null;
  return p[0].toUpperCase() + p.slice(1).toLowerCase();
}

/** Nome do perfil do WhatsApp que parece nome de pessoa ("Carla Souza"); número, emoji, apelido estranho ou
 *  nome de empresa ("Loja do Zé") não servem. Fase 2 do treinamento (P2): o Milton não pergunta o nome. */
export function nomeDoPerfil(perfil: string | null | undefined) {
  const n = (perfil ?? "").replace(/\s+/g, " ").trim();
  if (!n || n.length > 40 || !/^\p{L}[\p{L}' .-]*$/u.test(n) || n.split(" ").length > 4) return null;
  if (/(?<![\p{L}])(?:loja|motos?|store|oficina|ltda|com[eé]rcio|vendas|delivery|celulares?|im[oó]veis|distribuidora|mercadinho)(?![\p{L}])/iu.test(n)) return null;
  return primeiroNome(n) ? n : null;
}

/** "Boa tarde! Tudo certinho?" → "Boa tarde, Carla! Tudo certinho?". Sem nome, ou já com ele, fica como está. */
export function saudacaoComNome(saudacao: string, nome: string | null) {
  if (!nome || new RegExp(`(?<![\\p{L}])${nome}(?![\\p{L}])`, "iu").test(saudacao)) return saudacao;
  return saudacao.replace(/^((?:bo+m+\s+dia+|bo+a+\s+tarde+|bo+a+\s+noite+|ol[aá]+|oi+))\s*[!.,]*/iu, (_, g: string) => `${g}, ${nome}!`);
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

/** A cor concorda com "moto": "Preto" vira "preta", "Branco perolado" vira "branca perolada". */
export function corDaMoto(cor: string) {
  return cor
    .toLowerCase()
    .trim()
    .split(/\s+/)
    .map((p) => (/^(?:marinho)$/u.test(p) ? p : p.replace(/o$/u, "a")))
    .join(" ");
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

/** Sem balão repetido (Arine, 06/10/2026: o mesmo resumo da T3 saiu duas vezes e a mesma pergunta voltava em toda
 *  resposta). Sai o bloco igual (ou contido) a outro já enviado nesta resposta e a pergunta solta que é idêntica a
 *  uma pergunta da última mensagem da loja. */
export const RX_PERGUNTA_AJUDA = /(?:como|em\s+que)\s+(?:eu\s+)?posso\s+(?:te\s+|lhe\s+)?ajudar|posso\s+te\s+ajudar\s+com\s+(?:o\s+qu[eê]|alguma\s+coisa)/iu;
export function semRepeticao(resposta: string[], ultimaDaLoja = ""): string[] {
  const n = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  const perguntasAnteriores = (ultimaDaLoja.match(/[^.!?\n]*\?/g) ?? []).map(n).filter((p) => p.length >= 12);
  /* "Como posso te ajudar?" em qualquer variação: a loja acabou de perguntar, não pergunta de novo (Damarys, 07/10/2026) */
  const jaPerguntouAjuda = RX_PERGUNTA_AJUDA.test(ultimaDaLoja);
  const ficam: string[] = [];
  for (const b0 of resposta) {
    const b = jaPerguntouAjuda ? (b0.match(/[^.!?\n]+[.!?]*\s*(?:\p{Extended_Pictographic}️?\s*)*|\n/gu) ?? [b0]).filter((f) => !RX_PERGUNTA_AJUDA.test(f)).join("").trim() : b0;
    const nb = n(b);
    if (!nb) continue;
    if (ficam.some((f) => { const nf = n(f); return nf === nb || (nb.length >= 30 && nf.includes(nb)); })) continue;
    const soPergunta = /\?\s*(?:\p{Extended_Pictographic}\uFE0F?\s*)*$/u.test(b) && !/[.!]\s/u.test(b) && !b.includes("\n");
    if (soPergunta && perguntasAnteriores.includes(n(b.replace(/\?[\s\S]*$/u, "?")))) continue;
    ficam.push(b);
  }
  return ficam;
}

/** Perguntar o nome de novo? (dono, 07/10/2026: "a IA pergunta o nome, o cliente não responde, a IA segue o baile e não
 *  pergunta mais"). Conta quantas vezes a loja já perguntou e quantas mensagens o cliente mandou depois da última vez.
 *  Pergunta de novo depois de 2 mensagens do cliente sem o nome, no máximo 3 vezes na conversa. */
export const MAX_PERGUNTAS_NOME = 3;
export function deveRepetirPerguntaDoNome(historico: string | null | undefined): boolean {
  const blocos = (historico ?? "").split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean);
  let vezes = 0;
  let depois = 0;
  for (const b of blocos) {
    if (/^(Agente IA|Vendedor):/.test(b) && RX_PERGUNTA_NOME.test(b)) {
      vezes++;
      depois = 0;
    } else if (/^Lead:/.test(b)) depois++;
  }
  /* o histórico não traz a mensagem que acabou de chegar: ela conta como +1 (teste de 07/10/2026) */
  return vezes > 0 && vezes < MAX_PERGUNTAS_NOME && depois + 1 >= 2;
}
export const REPERGUNTAS_NOME = ["Ah, antes que eu esqueça: com quem eu falo? 😊", "E me diz, qual é o seu nome? 😊", "Só pra eu te atender melhor: como posso te chamar? 😊"];
