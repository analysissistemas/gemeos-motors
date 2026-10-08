/* Follow-up de AQUECIMENTO (pedido de 07/10/2026, conversa da Damarys: perguntou o preço, disse "Brgd" e sumiu; nada
   ficou agendado). O cliente parou de responder depois da resposta da IA: o Milton chama de novo, sozinho, em 3
   tentativas — 10 min, 1 h e 23 h 53 min depois da última mensagem do CLIENTE (a última fica dentro da janela de
   24 h do WhatsApp, depois dela só mensagem modelo). Fora do horário da loja, a mensagem começa pedindo desculpa
   pelo horário. Respondeu, as tentativas que faltam são canceladas.

   Puro (sem banco), para os testes rodarem direto no Node. Quem envia é lib/ia/workflow/aquecimento.ts, pelo único
   caminho autorizado (enviarRespostaDaIa: chave geral, permissão de envio e validador). */
import { artigo } from "./estoque-tipos.ts";

export const ETAPAS_AQUECIMENTO = [
  { etapa: 1, minutos: 10, rotulo: "10 min" },
  { etapa: 2, minutos: 60, rotulo: "1 h" },
  { etapa: 3, minutos: 23 * 60 + 53, rotulo: "23 h 53 min" },
] as const;

/** Janela do WhatsApp: depois de 24 h sem mensagem do cliente, texto livre é recusado. Margem de 3 min. */
export const LIMITE_JANELA_MIN = 24 * 60 - 3;

export type MotivoPular =
  | "ia_desligada"
  | "cliente_respondeu"
  | "vendedor_assumiu"
  | "conversa_encerrada"
  | "fora_da_janela"
  | "loja_deve_resposta"
  | null;

export const ROTULO_PULAR: Record<Exclude<MotivoPular, null>, string> = {
  ia_desligada: "a IA ou o envio automático está desligado",
  cliente_respondeu: "o cliente respondeu",
  vendedor_assumiu: "um vendedor assumiu a conversa",
  conversa_encerrada: "a conversa foi encerrada",
  fora_da_janela: "passou da janela de 24 h do WhatsApp",
  loja_deve_resposta: "o cliente está esperando a loja (simulação, entrega ou revisão pendente)",
};

/** Na hora de enviar, confere de novo se ainda faz sentido chamar o cliente. null = pode enviar. */
export function decidirAquecimento(p: {
  iaPodeEnviar: boolean;
  modo: string;
  status: string;
  /** o cliente mandou mensagem depois que o follow-up foi agendado */
  clienteFalouDepois: boolean;
  /** minutos desde a última mensagem do cliente */
  minDesdeCliente: number;
  /** há tarefa pendente da equipe para este cliente (simulação, entrega, revisar IA): quem deve resposta é a loja
   *  (Beatriz, 07/10/2026: pediu a simulação em 20x e ficou esperando o vendedor) */
  lojaDeveResposta?: boolean;
}): MotivoPular {
  if (!p.iaPodeEnviar) return "ia_desligada";
  if (p.clienteFalouDepois) return "cliente_respondeu";
  if (["resolvida", "encerrada"].includes(p.status)) return "conversa_encerrada";
  if (p.modo === "humano") return "vendedor_assumiu";
  if (p.lojaDeveResposta) return "loja_deve_resposta";
  if (p.minDesdeCliente >= LIMITE_JANELA_MIN) return "fora_da_janela";
  return null;
}

/** Mensagem pronta (quando a IA não escreve ou o texto dela não passa): leve, sem preço e sem pressão. */
export function mensagemPadraoAquecimento(p: { etapa: number; nome: string | null; modelo: string | null }): string {
  const N = (t: string) => (p.nome ? `${p.nome}, ${t}` : `${t[0].toUpperCase()}${t.slice(1)}`);
  const m = p.modelo ? `${artigo(p.modelo)} *${p.modelo}*` : null;
  const dm = p.modelo ? `d${m}` : null;
  if (p.etapa === 1) return m ? N(`conseguiu ver as fotos e o vídeo ${dm}? Ficou alguma dúvida que eu possa te ajudar? 😊`) : N("ainda está por aí? Me conta o que você está procurando que eu te ajudo 😊");
  if (p.etapa === 2)
    return m
      ? N(`lembrando que ${m} é elétric${artigo(p.modelo)}: você carrega na tomada de casa e esquece a gasolina. Quer que eu te explique como fica pra você? 😊`)
      : N("aqui na Gêmeos Motors a moto é elétrica: você carrega na tomada de casa e esquece a gasolina. Quer que eu te mostre as opções? 😊");
  return m
    ? N(`vou deixar o seu atendimento separado aqui. Se quiser, pode vir conhecer ${m} pessoalmente e fazer um test drive na loja. É só me chamar por aqui 😊`)
    : N("vou deixar o seu atendimento separado aqui. Quando quiser, é só me chamar por aqui que eu te ajudo 😊");
}

/** Texto que a IA escreveu para o follow-up: só passa curto, sem número (preço, parcela, prazo, km), sem link e sem
 *  cumprimento de abertura. Não passou, vai a mensagem pronta. */
export function textoDeAquecimentoAceito(texto: string | null | undefined): boolean {
  const t = (texto ?? "").trim();
  if (t.length < 15 || t.length > 320) return false;
  if (/\d|r\$|https?:|www\.|@/iu.test(t)) return false;
  if (/^(?:oi+|ol[áa]|bom\s+dia|boa\s+tarde|boa\s+noite)\b/iu.test(t)) return false;
  if (/desconto|promo[çc][ãa]o|[úu]ltima\s+unidade|s[óo]\s+hoje|garant[io]\s+que/iu.test(t)) return false;
  return /\?/.test(t);
}

/** Fora do horário: "Damarys, desculpa estar te mandando mensagem a essa hora 🙏" antes da mensagem (pedido de 07/10/2026). */
export function comDesculpaDoHorario(texto: string, nome: string | null, lojaAberta: boolean): string {
  if (lojaAberta) return texto;
  const corpo = nome ? texto.replace(new RegExp(`^${nome.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")},\\s*`, "iu"), "") : texto;
  const abre = `${nome ? `${nome}, d` : "D"}esculpa estar te mandando mensagem a essa hora 🙏`;
  return `${abre} ${corpo[0].toUpperCase()}${corpo.slice(1)}`;
}

/** Instrução para a IA escrever o follow-up a partir da conversa (como o "followUp - Mari" do n8n, com as travas da loja). */
export function instrucaoAquecimento(p: { etapa: number; nome: string | null; modelo: string | null }): string {
  const objetivo =
    p.etapa === 1
      ? "Retome de leve o último assunto da conversa e faça UMA pergunta simples que dê vontade de responder (uma dúvida que ficou, o que achou da moto)."
      : p.etapa === 2
        ? "Traga UM benefício que combine com o que o cliente falou (carrega na tomada de casa, esquece a gasolina, pronta entrega se a conversa disse isso) e faça UMA pergunta."
        : "É a última tentativa: deixe a porta aberta sem pressão e convide para conhecer a moto na loja e fazer um test drive, ou para chamar quando quiser.";
  return `Você é o Milton, vendedor da Gêmeos Motors (motos elétricas, Goiana-PE), no WhatsApp. O cliente parou de responder. Escreva UMA mensagem de follow-up curta (1 ou 2 frases, até 280 caracteres), humana e calorosa, em português do Brasil.
${objetivo}
Regras: ${p.nome ? `chame o cliente de ${p.nome} no começo; ` : "não invente nome; "}${p.modelo ? `a moto de interesse é a ${p.modelo} (escreva *${p.modelo}*); ` : ""}NUNCA escreva número (preço, parcela, km, prazo, horário), desconto, promoção, link ou "última unidade"; não cumprimente ("oi", "bom dia"); não repita a última mensagem da loja; no máximo 1 emoji (😊, 🙂 ou 🙏); termine com uma pergunta. Responda só com a mensagem.`;
}
