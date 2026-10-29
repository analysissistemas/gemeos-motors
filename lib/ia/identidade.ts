/* Quem está atendendo (Milton, 29/10/2026: a cliente perguntou "pra saber com quem eu mantive o contato" e "você
   perguntou meu nome... você não pode falar o seu?", e a IA desconversou; "pode dizer que é um agente de IA").
   Pergunta curta sobre quem atende: o sistema responde que é o Milton, agente de IA da loja, sem fingir ser pessoa.
   Pergunta longa (com outro assunto junto) fica com a IA, que tem a mesma regra no prompt. Puro, sem banco. */

const norm = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/\s+/g, " ").trim();

const RX_QUEM =
  /\bcom\s+quem\s+(?:eu\s+)?(?:falo|to\s+falando|tou\s+falando|estou\s+falando|t[oô]\s+conversando|estou\s+conversando|converso|mantive|mantenho|falei)\b|\bquem\s+(?:e|eh|seria)\s+(?:voce|vc|tu|o\s+senhor|a\s+senhora)\b|\bquem\s+(?:ta|esta)\s+(?:falando|atendendo|me\s+atendendo)\b|\bquem\s+fala\b|\bqual\s+(?:e\s+)?(?:o\s+)?(?:seu|teu)\s+nome\b|\b(?:pode|podia|consegue|vai)\s+(?:me\s+)?(?:falar|dizer|passar)\s+o\s+(?:seu|teu)(?:\s+nome)?\b|\b(?:voce|vc|tu)\s+(?:e|eh)\s+(?:um\s+|uma\s+)?(?:robo|bot|ia|inteligencia\s+artificial|humano|pessoa|atendente\s+virtual|maquina)\b|\b(?:e|eh)\s+(?:um\s+)?(?:robo|bot)\b/;

/** O cliente perguntou quem está atendendo (nome, se é robô ou pessoa), sem outro assunto junto. */
export function perguntouQuemAtende(texto: string) {
  const t = norm(texto);
  return t.length <= 120 && RX_QUEM.test(t);
}

export const textoQuemAtende = (nome: string | null) =>
  `${nome ? `${nome}, aqui` : "Aqui"} quem te atende é o Milton, o agente de IA da Gêmeos Motors 😊\n\nFaço o primeiro atendimento por aqui e, quando precisar, te passo pra um vendedor da equipe. Me conta: como posso te ajudar?`;

export const jaDisseQuemAtende = (ultimaDaLoja: string | null | undefined) => !!ultimaDaLoja && /é o Milton, o agente de IA/.test(ultimaDaLoja);
