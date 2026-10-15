/* Quem escreve não é cliente (dono, 15/10/2026: "a IA ficou conversando com a TIM que estava oferecendo serviço... a IA
   querendo oferecer o produto e a TIM o serviço, e entrou em loop"). Operadora, banco, agência e robô de atendimento
   não compram moto: a IA responde uma vez (ou nada, se for robô), passa para a equipe e para. Puro, sem banco. */

const norm = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/\s+/g, " ").trim();

/* Só frases de quem vende para a loja. "Claro", "vivo" e "oi" sozinhos são palavras comuns; "empréstimo" e
   "maquininha" sozinhos podem ser pergunta de cliente ("aceita maquininha?"): ficam de fora. */
const RX_OFERTA = new RegExp(
  [
    // operadora pelo nome, com contexto de quem fala por ela
    String.raw`(?:sou|somos|aqui [eé]|falo|falamos|consultora?|representante|parceir[oa]|loja|equipe|time)\s+(?:d[aoe]\s+)?(?:tim|vivo|claro|oi|algar|brisanet|sky|nextel)\b`,
    String.raw`\b(?:tim|vivo|claro|oi|algar|brisanet)\s+(?:empresas?|fibra|black|controle|live|ultrafibra|neg[oó]cios|pj)\b`,
    // o produto que oferecem
    String.raw`\bplanos?\s+(?:de\s+)?(?:internet|celular|telefonia|m[oó]vel|movel|p[oó]s[- ]?pago|controle|empresarial|corporativo|de dados)\b`,
    String.raw`\binternet\s+(?:fibra|empresarial|corporativa|dedicada|banda larga)\b`,
    String.raw`\bfibra\s+[oó]ptica\b`,
    String.raw`\bportabilidade\b`,
    String.raw`\blinhas?\s+(?:m[oó]ve(?:l|is)|telef[oô]nicas?|corporativas?)\b`,
    // falando com a empresa, não com uma pessoa que quer comprar
    String.raw`\b(?:para|pra|p\/)\s+(?:a\s+)?(?:sua|tua)\s+empresa\b`,
    String.raw`\b(?:sua|tua)\s+empresa\s+(?:foi|est[aá]|tem)\b`,
    String.raw`\b(?:para|pra)\s+(?:o\s+)?(?:seu|teu)\s+neg[oó]cio\b`,
    String.raw`\bseu\s+cnpj\b|\bpara\s+(?:o\s+)?cnpj\b`,
    String.raw`\bcr[eé]dito\s+pr[eé][- ]?aprovado\b`,
    String.raw`\b(?:marketing digital|tr[aá]fego pago|gest[aã]o de (?:redes sociais|tr[aá]fego)|google meu neg[oó]cio)\b`,
    String.raw`\bproposta\s+comercial\b|\bparceria\s+comercial\b`,
    String.raw`\b(?:oferta|condi[cç][aã]o|promo[cç][aã]o)\s+(?:exclusiva|especial)\s+(?:para|pra)\s+(?:voc[eê]s|a\s+loja|empresas?|o\s+seu\s+neg[oó]cio)\b`,
  ].join("|"),
  "iu",
);

/** O texto é alguém oferecendo serviço para a loja (operadora, banco, agência). */
export const ofertaDeServico = (texto: string) => RX_OFERTA.test(norm(texto));

/* Menu e aviso de robô: responder alimenta o robô e vira loop. */
const RX_AUTOMATICA =
  /\b(?:digite|tecle|responda com|envie|selecione|escolha)\s+(?:o\s+n[uú]mero|uma\s+das\s+op[cç][oõ]es|a\s+op[cç][aã]o|\d\b|"?sair"?|"?sim"?)|\bop[cç][aã]o\s+inv[aá]lida\b|\bmensagem\s+autom[aá]tica\b|\bn[aã]o\s+responda\s+(?:a\s+)?esta\s+mensagem\b|\bpara\s+(?:n[aã]o\s+receber\s+mais|deixar\s+de\s+receber|cancelar\s+o\s+recebimento)\b|\bn[aã]o\s+(?:entendi|compreendi)\s+(?:a\s+sua|sua)\s+(?:resposta|mensagem|op[cç][aã]o)\b/iu;

/** Mensagem de robô (menu "digite 1", "opção inválida", "mensagem automática"). */
export const mensagemAutomatica = (texto: string) => RX_AUTOMATICA.test(norm(texto));

/** Freio de loop: o outro lado repete a mesma mensagem longa que já mandou antes (robô) depois de a IA já ter
 *  respondido várias vezes na última hora, ou a IA já mandou mensagens demais na última hora. */
export function conversaEmLoop(p: { texto: string; anterioresDoCliente: string[]; mensagensDaIaUltimaHora: number }): boolean {
  if (p.mensagensDaIaUltimaHora >= 30) return true;
  const t = norm(p.texto);
  if (t.length < 20 || p.mensagensDaIaUltimaHora < 6) return false;
  return p.anterioresDoCliente.some((a) => norm(a) === t);
}

export type NaoCliente = "oferta" | "robo" | "loop";

/** Por que a IA para nesta conversa (null: é cliente, segue normal). */
export function naoEhCliente(p: { texto: string; anterioresDoCliente: string[]; mensagensDaIaUltimaHora: number }): NaoCliente | null {
  if (mensagemAutomatica(p.texto)) return "robo";
  if (conversaEmLoop(p)) return "loop";
  if (ofertaDeServico(p.texto)) return "oferta";
  return null;
}

/** Única resposta para quem oferece serviço; robô e loop não recebem nada (responder alimenta o robô). */
export const TEXTO_OFERTA_SERVICO =
  "Obrigado pelo contato! Aqui é a Gêmeos Motors, loja de motos elétricas. Vou deixar a sua mensagem registrada para a nossa equipe, e se houver interesse eles retornam por aqui 🙏";

export const MOTIVO_NAO_CLIENTE: Record<NaoCliente, string> = {
  oferta: "Não é cliente: alguém oferecendo serviço para a loja (operadora, banco, agência). A IA respondeu uma vez e parou",
  robo: "Não é cliente: mensagem automática de robô (menu, \"digite 1\"). A IA não respondeu para não entrar em loop",
  loop: "A conversa entrou em loop (a mesma mensagem voltando várias vezes). A IA parou para não ficar respondendo sem fim",
};
