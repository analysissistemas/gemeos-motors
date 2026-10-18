/* A resposta que saiu foi escrita pela IA ou é um texto pronto do sistema? (dono, 18/10/2026: a Sonix propôs uma regra
   para o áudio do Jordão, mas a resposta errada era um texto fixo que o código manda; regra no prompt não muda o código.)
   Texto do sistema errado é com o desenvolvedor: a Sonix abre plano de ação "precisa mudar o código" em vez de regra.
   Desde 18/10/2026 a mensagem leva a marca (metadados.textoDoSistema); as antigas são reconhecidas pelas frases prontas
   conhecidas. Puro, sem banco. */

const FRASES_PRONTAS = [
  /me conta o que est[áa] acontecendo com o seu aparelho/i, // assistência sem relato
  /j[áa] anotei tudo! um vendedor te responde/i, // fora do horário
  /um vendedor te responde assim que a loja abrir/i,
  /nossa equipe de vendas volta assim que a loja abrir/i,
  /a loja est[áa] fechada agora, mas o atendimento continua/i,
  /vou confirmar com a equipe e te retorno assim que a loja abrir/i,
  /essa eu prefiro confirmar com a equipe/i,
  /vou checar esse detalhe com a equipe/i,
  /j[áa] estou te encaminhando para o nosso vendedor/i,
  /pra nossa equipe avaliar, me manda por aqui/i, // troca
  /(?:as que mais combinam|a que mais combina) com voc[êe]/i, // indicação da qualificação
  /recebi a sua foto|recebi o seu [áa]udio/i, // foto ou áudio do cliente
  /o seu caso j[áa] est[áa] (?:com os respons[áa]veis|anotado)/i, // pós-venda
  /vou passar o seu caso agora para os respons[áa]veis/i,
  /desculpa pela confus[ãa]o/i, // queixa
  /vou passar o seu recado|juntei isso ao seu recado/i, // recado
  /perfeito, .{1,30}! est[áa] tudo certinho ✅/i, // dados do fechamento
  /fiz a simula[çc][ãa]o pra voc[êe]|segue a simula[çc][ãa]o/i, // simulação calculada pelo sistema
];

/** A mensagem da IA é um texto pronto do sistema (o código decide e escreve), não algo que a IA escreveu. */
export function ehTextoDoSistema(conteudo: string | null | undefined, metadados?: unknown): boolean {
  const marca = (metadados as { textoDoSistema?: boolean } | null | undefined)?.textoDoSistema;
  if (typeof marca === "boolean") return marca;
  const t = conteudo ?? "";
  return FRASES_PRONTAS.some((rx) => rx.test(t));
}

/** Ação do plano para o desenvolvedor quando o erro está num texto pronto do sistema. */
export function acaoDeCodigo(p: { problema: string; trecho: string }) {
  return `Precisa mudar o código (texto pronto do sistema, uma regra no prompt não muda): ${p.problema.trim().replace(/\s+/g, " ").slice(0, 400)} Resposta que saiu: "${p.trecho.replace(/\s+/g, " ").slice(0, 200)}"`;
}
