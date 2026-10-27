/* Pergunta do cliente que não pode se perder (plano de 23/10/2026, "entender o cliente").
   Sidney, 22/10/2026: mandou "Ela vem com porta trecos?", "Entrega" e "Ok, fico no aguardo" juntos; o sistema respondeu
   com a lista de dados da entrega (texto pronto) e a pergunta da moto sumiu. Antes, mandou 3 perguntas numa mensagem
   (entrega, a scooter de lítio mais em conta, a de 1000W mais em conta) e só duas tiveram resposta.
   Aqui: achar as perguntas do cliente e ver se a resposta tocou em cada uma. Puro: sem banco (npm run test:ia). */

const norm = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

/* palavras que não dizem o assunto da pergunta */
const VAZIAS = new Set(
  "voces vcs voce qual quais quanto quanta quantos quantas como onde quando porque esse essa esses essas isso esta este ela ele elas eles dela dele tem temos vem vende vendem para pros pras pela pelo com que uma uns umas mais menos mas aqui ainda tambem seria gostaria saber queria quero pode podem posso consegue sobre favor obrigado obrigada entao tipo coisa coisas algum alguma moto motos modelo modelos voces sera teria tenho fica ficaria".split(" "),
);
/** Palavras que dizem o assunto ("porta", "trecos"; "scooter", "1000w"). */
export function palavrasChave(pergunta: string): string[] {
  return Array.from(new Set((norm(pergunta).match(/[\p{L}\d]+/gu) ?? []).filter((w) => (w.length >= 4 || /\d/.test(w)) && !VAZIAS.has(w))));
}

/** As perguntas do cliente: frase com "?" e item numerado ("3ª- Qual a scooter de 1000w mais em conta", sem "?"). */
export function perguntasDoCliente(texto: string): string[] {
  const out: string[] = [];
  for (const linha of texto.split(/\n+/)) {
    const l = linha.trim();
    if (!l || /^\[(?:imagem|áudio|vídeo|documento)/u.test(l)) continue;
    const numerada = /^\d{1,2}\s*[ªº°.)-]/u.test(l);
    const frases = l.match(/[^?]*\?/g) ?? [];
    for (const f of frases) if (palavrasChave(f).length) out.push(f.trim());
    const resto = l.replace(/[^?]*\?/g, "").trim();
    if (numerada && resto && palavrasChave(resto).length && /\b(?:qual|quais|quanto|como|onde|tem|vem|voces|vcs|fazem|aceita)/.test(norm(resto))) out.push(resto);
  }
  return Array.from(new Set(out.map((p) => p.replace(/^\d{1,2}\s*[ªº°.)-]+\s*-?\s*/u, "").trim()))).filter(Boolean);
}

/** As perguntas que a resposta não tocou: menos da metade das palavras do assunto aparece nela. */
export function perguntasSemResposta(textoCliente: string, resposta: string): string[] {
  const r = norm(resposta);
  /* pergunta de preço ("valor a vista?") com o preço na resposta já foi respondida (Gilson, 24/10/2026: os cartões da T3 e
     da T5 tinham "R$ 11.000" e mesmo assim saiu "Sobre a sua pergunta (anuncio retro valor), eu confirmo com a equipe") */
  const temPreco = /R\$\s*\d/.test(resposta);
  return perguntasDoCliente(textoCliente).filter((p) => {
    if (temPreco && /(?<![\p{L}])(?:valor|pre[çc]o|quanto|vista|custa|sai por)(?![\p{L}])/iu.test(p)) return false;
    const chaves = palavrasChave(p);
    const achou = chaves.filter((k) => r.includes(k.length > 5 ? k.slice(0, -1) : k)).length;
    return achou * 2 < chaves.length;
  });
}

/** Instrução para a IA quando o cliente fez mais de uma pergunta: responder todas, curto. */
export function instrucaoVariasPerguntas(textoCliente: string): string {
  const ps = perguntasDoCliente(textoCliente);
  if (ps.length < 2) return "";
  return `# O CLIENTE FEZ ${ps.length} PERGUNTAS\nResponda TODAS, na ordem, uma frase curta para cada (vale mais que o limite de 2 frases). Não pule nenhuma:\n${ps.map((p, i) => `${i + 1}. ${p}`).join("\n")}\n\n`;
}

/** Quando a IA não tem o dado da pergunta solta: não inventa, a equipe confirma. */
export const textoConfirmoComEquipe = (pergunta: string) => {
  const assunto = palavrasChave(pergunta).slice(0, 3).join(" ");
  return `Sobre a sua pergunta${assunto ? ` (${assunto})` : ""}, eu confirmo com a equipe e já te falo 😊`;
};
