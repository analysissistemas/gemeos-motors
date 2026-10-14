/* Follow-up de AQUECIMENTO (pedido de 07/10/2026, conversa da Damarys: perguntou o preço, disse "Brgd" e sumiu; nada
   ficou agendado). O cliente parou de responder depois da resposta da IA: o Milton chama de novo, sozinho, em 3
   tentativas — 1 h, 3 h e 23 h depois da última mensagem do CLIENTE (Milton, 12/10/2026: 10 min era cedo demais;
   a última fica dentro da janela de 24 h do WhatsApp). Respondeu, as tentativas que faltam são canceladas.
   A 1ª, com moto na conversa, é a pergunta do dono "O que está faltando para concluirmos a sua compra?": ela saiu
   da resposta do orçamento e só vai se o cliente não responder (Milton, 12/10/2026).
   Desde 12/10/2026 (Heverton) só sai com a loja aberta e não sai quando a loja ficou de ver algo: ver
   planejarAquecimento e lojaFicouDeVer no fim do arquivo.

   Puro (sem banco), para os testes rodarem direto no Node. Quem envia é lib/ia/workflow/aquecimento.ts, pelo único
   caminho autorizado (enviarRespostaDaIa: chave geral, permissão de envio e validador). */
import { artigo } from "./estoque-tipos.ts";
import { lojaAberta, type HorarioLoja } from "./horario.ts";

export const ETAPAS_AQUECIMENTO = [
  { etapa: 1, minutos: 60, rotulo: "1 h" },
  { etapa: 2, minutos: 3 * 60, rotulo: "3 h" },
  { etapa: 3, minutos: 23 * 60, rotulo: "23 h" },
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

/** A pergunta do dono (03/10/2026), que desde 12/10/2026 é o 1º follow-up com moto na conversa. */
export const PERGUNTA_DO_DONO = "o que está faltando para concluirmos a sua compra?";
/** A 1ª tentativa com moto na conversa é sempre a pergunta do dono, sem a IA reescrever. */
export const aquecimentoFixo = (etapa: number, modelo: string | null) => etapa === 1 && !!modelo;

/** Mensagem pronta (quando a IA não escreve ou o texto dela não passa): leve, sem preço e sem pressão. */
export function mensagemPadraoAquecimento(p: { etapa: number; nome: string | null; modelo: string | null }): string {
  const N = (t: string) => (p.nome ? `${p.nome}, ${t}` : `${t[0].toUpperCase()}${t.slice(1)}`);
  const m = p.modelo ? `${artigo(p.modelo)} *${p.modelo}*` : null;
  if (p.etapa === 1) return m ? N(`${PERGUNTA_DO_DONO.replace("?", ` d${artigo(p.modelo)} *${p.modelo}*?`)} 😊`) : N("ainda está por aí? Me conta o que você está procurando que eu te ajudo 😊");
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

/* ---------- lógica nova (análise do Heverton, 12/10/2026) ----------
   1. Só com a loja ABERTA: caiu fora do horário, vai para a abertura seguinte (nada de "desculpa a essa hora").
   2. Entre uma tentativa e outra, no mínimo 50 min (na abertura não saem duas juntas).
   3. A última precisa caber na janela de 24 h do WhatsApp: se a abertura seguinte passar dela, vai no último horário
      aberto antes do fim da janela; se nem isso der, as que faltam não saem.
   4. A loja ficou de ver alguma coisa ("a equipe confirma", "quer que eu veja com eles?"): quem deve a resposta é a
      loja. Nada de aquecimento; vira tarefa para a equipe responder o que o cliente perguntou. */
export const INTERVALO_MIN_AQUECIMENTO = 50;
const MIN = 60_000;

/** Primeiro momento com a loja aberta a partir de `t` (até 8 dias); null se a loja nunca abre. */
export function proximaAbertura(t: Date, h: HorarioLoja): Date | null {
  if (lojaAberta(h, t)) return t;
  for (let x = t.getTime() + 5 * MIN; x < t.getTime() + 8 * 24 * 60 * MIN; x += 5 * MIN) {
    if (!lojaAberta(h, new Date(x))) continue;
    /* volta minuto a minuto até a hora exata em que abriu */
    while (lojaAberta(h, new Date(x - MIN))) x -= MIN;
    return new Date(x);
  }
  return null;
}

/** Último momento com a loja aberta até `t` (olhando até 24 h para trás); null se não houver. */
export function ultimaAbertaAntes(t: Date, h: HorarioLoja): Date | null {
  for (let x = t.getTime(); x > t.getTime() - 24 * 60 * MIN; x -= 5 * MIN) if (lojaAberta(h, new Date(x))) return new Date(x);
  return null;
}

/** Quando sai cada tentativa, contando da última mensagem do cliente. Tentativa que não cabe não entra.
 *  `soUltima`: o cliente disse que ele mesmo volta a falar; sai só a de 23 h. */
export function planejarAquecimento(ultimaDoCliente: Date, h: HorarioLoja, o: { soUltima?: boolean } = {}): { etapa: number; rotulo: string; quando: Date }[] {
  const base = ultimaDoCliente.getTime();
  const limite = new Date(base + LIMITE_JANELA_MIN * MIN);
  const plano: { etapa: number; rotulo: string; quando: Date }[] = [];
  for (const e of o.soUltima ? ETAPAS_AQUECIMENTO.slice(-1) : ETAPAS_AQUECIMENTO) {
    /* loja fechada empurrou a anterior: mantém o espaço entre a 1ª e a 2ª (1 h → 3 h são 2 h; Milton, 12/10/2026).
       A última conta da mensagem do cliente (janela de 24 h): dela, só os 50 min de distância. */
    const ant = plano.at(-1);
    const ultimaEtapa = e.etapa === ETAPAS_AQUECIMENTO.length;
    const passo = !ant ? 0 : ultimaEtapa ? INTERVALO_MIN_AQUECIMENTO : Math.max(INTERVALO_MIN_AQUECIMENTO, e.minutos - ETAPAS_AQUECIMENTO[ant.etapa - 1].minutos);
    const minimo = ant ? ant.quando.getTime() + passo * MIN : 0;
    let quando: Date | null = proximaAbertura(new Date(Math.max(base + e.minutos * MIN, minimo)), h);
    if (!quando || quando > limite) {
      quando = ultimaAbertaAntes(limite, h);
      if (!quando || quando.getTime() <= Math.max(minimo, base)) break;
    }
    plano.push({ etapa: e.etapa, rotulo: e.rotulo, quando });
  }
  return plano;
}

/** A última fala da loja deixou algo para a equipe ver ("a equipe confirma", "quer que eu veja com eles?",
 *  "vou verificar"): o cliente está esperando a LOJA, não precisa ser "aquecido". */
export function lojaFicouDeVer(textoDaLoja: string): boolean {
  const t = textoDaLoja.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
  return /(?<![a-z])(?:(?:equipe|vendedor|consultor|time|pessoal|eles)\s+(?:te\s+)?(?:confirma|confirmam|verifica|verificam|informa|informam|retorna|retornam|passa|passam)|(?:confirmo|verifico|vejo|checo|pergunto|consulto)(?![a-z])[^.?!\n]{0,40}com (?:a |o )?(?:equipe|vendedor|gerencia|pessoal|time)|quer que eu (?:veja|confirme|verifique|pergunte|cheque)|vou (?:verificar|confirmar|ver com|perguntar|checar|consultar))(?![a-z])/.test(t);
}

/** O cliente disse que ELE volta a falar ("vou mostrar a ele", "te aviso", "vou pensar", "qualquer coisa te chamo"):
 *  cobrar em 1 h e 3 h é insistir ((81) 7301-7155, 11/10/2026: "Irei mostrar a ele, caso tenha interesse, solicito a
 *  você", e 10 min depois saiu o follow-up). Fica só a última tentativa. */
export function clienteVaiRetornar(textoDoCliente: string): boolean {
  const t = textoDoCliente.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
  return /(?<![a-z])(?:(?:vou|irei|deixa eu|deixe eu) (?:mostrar|passar|repassar|pensar|analisar|ver com|falar com|conversar com)|(?:te|lhe) (?:aviso|chamo|falo|retorno|procuro)|(?:qualquer coisa|se (?:ele|ela|eu) (?:tiver|gostar|quiser|decidir)|caso (?:ele |ela |eu )?(?:tenha|goste|queira|decida))[^.?!\n]{0,40}(?:chamo|falo|aviso|solicito|retorno|procuro|mando)|depois (?:eu )?(?:te )?(?:chamo|falo|volto|retorno|aviso)|(?:preciso|vou) pensar|mais tarde (?:eu )?(?:te )?(?:chamo|falo)|(?:depois|essa semana|semana que vem|amanha|qualquer dia) (?:eu )?(?:passo|dou uma passad\w*|vou) (?:ai|la|na loja|pessoalmente)|dou uma passad\w*)(?![a-z])/.test(t);
}

/** O cliente encerrou o assunto ("Já resolveu!", "obrigado, era só isso", "tudo certo", "valeu"): nada de follow-up
 *  (Mayna Dornelas, 11/10/2026: disse "Já resolveu!" e recebeu mais dois follow-ups de venda). Mensagem curta e sem
 *  pergunta; "obrigado, quanto custa a T1?" segue normal. */
export function clienteEncerrou(textoDoCliente: string): boolean {
  const t = textoDoCliente.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().trim();
  if (!t || /\?/.test(t) || t.split(/\s+/).length > 10) return false;
  return /(?<![a-z])(?:ja\s+(?:resolv\w*|consegui|deu\s+certo|sei|vi|entendi)|(?:esta\s+|ta\s+)?resolvid[oa]|(?:era|e)\s+so\s+isso|so\s+isso\s+mesmo|tudo\s+(?:certo|ok|resolvido)|deu\s+certo|nao\s+precis[ao]\s+mais|ja\s+nao\s+precis[ao]|obrigad[oa]|obgd?|brgd|brigad[oa]|valeu|vlw|agradec\w*|boas\s+vendas|ja\s+comprei|comprei\s+(?:em|na|no|com)\s+outr\w*|deixa\s+(?:quieto|pra\s+la|para\s+la)|esquece|desisti|desisto)(?![a-z])/.test(t);
}

/** O cliente disse que não quer o modelo que a loja ofereceu ("Não meu caro. Essa não", Danilo Ferreira, 09/10/2026, e o
 *  follow-up 1 minuto depois perguntou da potência da X GÊMEOS): o follow-up não cita modelo. */
export function clienteRecusouOModelo(textoDoCliente: string): boolean {
  const t = textoDoCliente.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
  return /(?<![a-z])(?:ess[ae]\s+nao|nao\s+(?:e|eh)\s+ess[ae]|nao\s+quero\s+ess[ae]|nao\s+gostei\s+dess[ae])(?![a-z])/.test(t);
}

/** A conversa já virou recado ou assistência em algum momento (o histórico mostra o texto do sistema): follow-up de
 *  VENDA não sai, a não ser que o cliente esteja falando de compra agora (Mayna, 11/10/2026: o recado foi anotado,
 *  mas na mensagem seguinte, uma foto, o sistema esqueceu e voltou a vender). */
export function conversaForaDaVenda(historico: string | null | undefined): boolean {
  return /passar o seu recado|juntei isso ao seu recado|respons[áa]veis da assist[êe]ncia|equipe da assist[êe]ncia/iu.test(historico ?? "");
}
