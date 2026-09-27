/* Arrumação do texto da IA antes de ir para o WhatsApp (pedido do dono, 27/09/2026: "humanizado,
   mas organizado"). Não muda o que a IA disse, só o formato: tira marcação que o WhatsApp não
   entende e padroniza lista, negrito e espaços. Sem `server-only`, para os testes rodarem no Node. */

export function organizarTexto(texto: string): string {
  let t = texto.replace(/\r/g, "");
  /* link em markdown [texto](url) vira só o texto (link já é proibido pelas regras) */
  t = t.replace(/\[([^\]]+)\]\((?:[^)\s]+)\)/g, "$1");
  /* título markdown vira negrito do WhatsApp */
  t = t.replace(/^[ \t]*#{1,6}[ \t]+(.+?)[ \t]*#*[ \t]*$/gm, "*$1*");
  /* **negrito** e __negrito__ viram o negrito do WhatsApp (*negrito*) */
  t = t.replace(/\*\*(.+?)\*\*/g, "*$1*").replace(/__(.+?)__/g, "*$1*");
  /* item de lista com hífen, asterisco, travessão ou bolinha: sempre "• " */
  t = t.replace(/^[ \t]*[-*–—•·][ \t]+/gm, "• ");
  /* espaços: nada de espaço duplo, espaço antes de pontuação nem espaço no fim da linha */
  t = t.replace(/[ \t]{2,}/g, " ").replace(/ +([,.!?;:])/g, "$1").replace(/[ \t]+$/gm, "");
  /* no máximo uma linha em branco entre parágrafos */
  t = t.replace(/\n{3,}/g, "\n\n");
  return t.trim();
}
