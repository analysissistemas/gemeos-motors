/* Condução até o fechamento (pedido do dono, 03/10/2026: "faltou aquela pergunta: o que está faltando para
   concluirmos a sua compra"; objeção de preço vira economia; outra objeção, afunilar até o motivo real;
   decidiu, "parabéns, ótima aquisição" e "retirar na loja ou delivery?"). Puro: sem banco.
   Quem usa é lib/ia/workflow/nos.ts. Decisões do treinamento: P8, P11, P18, P20.

   Momentos (o que a última mensagem do cliente mostra):
   - interesse: quer a moto (cita o modelo e fala em comprar, preço, condição), ainda avaliando
   - decidido: "vou querer", "fechado", "quero essa"
   - objecao_preco: "achei caro", "tem desconto?"
   - objecao: "vou pensar", "não sei", "vou falar com minha esposa"
   - escolheu_entrega / escolheu_retirada: respondeu a pergunta "retirar ou entrega?"
   - mandou_dados: mandou os dados pedidos (com CPF); dados_parciais: mandou parte, sem CPF */

import { dataHoraDaVisita, RX_PEDIU_HORARIO_VISITA, RX_QUER_VISITAR } from "./agenda.ts";

export type Momento = "quer_parcelar" | "pediu_simulacao" | "quer_visitar" | "informou_visita" | "interesse" | "decidido" | "objecao_preco" | "objecao" | "informou_km" | "escolheu_entrega" | "escolheu_retirada" | "mandou_dados" | "dados_parciais";

/** Nestes momentos a IA não passa a conversa ao vendedor por conta própria: o fechamento segue até os dados
 *  chegarem (aí o sistema passa). Só passa antes se o cliente pedir uma pessoa. */
export const MOMENTOS_SEM_TRANSFERIR: Momento[] = ["quer_parcelar", "pediu_simulacao", "quer_visitar", "informou_visita", "interesse", "decidido", "objecao_preco", "objecao", "informou_km", "escolheu_entrega", "escolheu_retirada", "dados_parciais"];
export const RX_PEDE_PESSOA = /(?<![\p{L}])(atendente|humano|pessoa|vendedor|gerente|falar com (algu[eé]m|voc[eê]s|o dono)|ligar|liga pra mim)(?![\p{L}])/iu;

const semAcento = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

const RX_PEDIU_ESCOLHA = /retir\w*[^?]{0,60}entreg|entreg\w*[^?]{0,60}retir|buscar[^?]{0,40}entreg|delivery/;
const RX_PEDIU_DADOS = /nome completo/;
const RX_ENTREGA = /(?<![a-z])(entrega\w*|entregar|delivery|deliv[e]ry|receber (em casa|aqui)|manda(r)? (pra|para) (mim|casa|ca)|em casa|na minha casa)(?![a-z])/;
const RX_RETIRADA = /(?<![a-z])(retir\w*|buscar|busco|pegar (ai|na loja|aqui)|vou ai|vou na loja|ir na loja|passo ai|eu pego|eu busco)(?![a-z])/;
const RX_CPF = /(?<!\d)\d{3}\.?\d{3}\.?\d{3}-?\d{2}(?!\d)/;
const RX_OUTRO_DADO = /(?<!\d)\d{5}-?\d{3}(?!\d)|(?<!\d)\d{1,2}\/\d{1,2}\/\d{2,4}(?!\d)|(?<![a-z])(rua|avenida|av\.|bairro|cep|travessa)(?![a-z])/;

const RX_DECIDIDO =
  /(?<![a-z])(vou (querer|levar|ficar com|fechar|comprar)|fechad[oa]|pode fechar|vamos fechar|bora fechar|ta fechado|fecho|quero (essa|esse|ela|fechar)|pode separar|como (faco|faz) (pra|para) (comprar|fechar|pagar)|quero comprar (a|o|essa|esse)|ja quero|decidi)(?![a-z])/;
/* "cara" sozinho é gíria ("cara, quero essa"): só conta com "achei", "tá", "muito"... */
const RX_PRECO_OBJ =
  /(?<![a-z])((achei|ta|esta|muito|meio|bem|bastante|um pouco|mt|mto|que) car[oa]|carissim[oa]|salgad[oa]|puxad[oa]|pesad[oa] (no bolso|pra mim)|(nao|n) (tenho|to com|estou com) (esse |todo esse )?(dinheiro|grana|valor)|sem (dinheiro|grana)|desconto|abaix(a|ar|ou) (o preco|o valor|pra|para|um pouco)|faz (por|mais barato)|ta alto|valor alto|fora do (meu )?orcamento|nao cabe no|muito dinheiro)(?![a-z])/;
const RX_DUVIDA =
  /(?<![a-z])(vou pensar|deixa eu (ver|pensar)|preciso pensar|vou ver|depois (eu )?(vejo|falo|volto|decido)|nao sei|to em duvida|estou em duvida|indecis\w*|medo|receio|sera que|(falar|conversar|ver) com (a |o )?(minha |meu )?(esposa|marido|mulher|namorad[oa]|pai|mae|familia)|nao tenho certeza|ainda nao)(?![a-z])/;
const RX_INTERESSE = /(?<![a-z])(quero|queria|interess\w*|comprar|compra|preco|valor|quanto|condic\w*|pagamento|parcel\w*|a vista|pix|cartao|disponivel|tem (a|o|essa|esse))(?![a-z])/;

/** Em que momento da compra o cliente está, pela mensagem dele e pela última mensagem da loja. */
export function detectarMomento(p: { textoCliente: string; ultimaDaLoja: string; conheceModelo: boolean; agora?: Date }): Momento | null {
  const t = semAcento(p.textoCliente);
  const loja = semAcento(p.ultimaDaLoja);
  /* respondendo a lista de dados */
  if (RX_PEDIU_DADOS.test(loja)) {
    if (RX_CPF.test(t)) return "mandou_dados";
    if (RX_OUTRO_DADO.test(t) || t.split(/\n/).filter((l) => l.trim()).length >= 3) return "dados_parciais";
  }
  /* respondendo "retirar ou entrega?" */
  if (RX_PEDIU_ESCOLHA.test(loja)) {
    const entrega = RX_ENTREGA.test(t);
    const retirada = RX_RETIRADA.test(t);
    if (entrega && !retirada) return "escolheu_entrega";
    if (retirada && !entrega) return "escolheu_retirada";
  }
  /* parcelamento: respondeu "em quantas vezes / qual a bandeira", ou já disse os dois */
  const sim = simulacaoPedida(p.textoCliente);
  if (RX_PEDIU_PARCELAS.test(loja) && (sim.parcelas || sim.bandeira)) return "pediu_simulacao";
  if (sim.parcelas && sim.bandeira) return "pediu_simulacao";
  if (RX_QUER_PARCELAR.test(t)) return "quer_parcelar";
  /* visita / test drive: respondeu o dia e a hora que a loja perguntou, ou já pediu com dia e hora */
  const dh = dataHoraDaVisita(p.textoCliente, p.agora ?? new Date());
  if (RX_PEDIU_HORARIO_VISITA.test(p.ultimaDaLoja) && (dh.temDia || dh.temHora)) return "informou_visita";
  if (RX_QUER_VISITAR.test(p.textoCliente)) return dh.temDia && dh.temHora ? "informou_visita" : "quer_visitar";
  /* respondeu quantos km roda, depois do "me fala os km que eu faço a conta da economia" */
  if (/econom/.test(loja) && /km/.test(loja) && /(?<!\d)\d{1,4}\s*(km|quil)/.test(t)) return "informou_km";
  if (RX_PRECO_OBJ.test(t)) return "objecao_preco";
  if (RX_DUVIDA.test(t)) return "objecao";
  if (p.conheceModelo && RX_DECIDIDO.test(t)) return "decidido";
  if (p.conheceModelo && RX_INTERESSE.test(t)) return "interesse";
  return null;
}

/* ---------- textos prontos (variam para não parecer robô) ---------- */
export const PERGUNTAS_FALTA = [
  "O que está faltando para concluirmos a sua compra? 😊",
  "O que falta pra gente fechar a sua compra? 🙂",
  "Ficou alguma dúvida, ou o que falta pra concluirmos a sua compra? 😊",
];
export const PERGUNTAS_ENTREGA_OU_RETIRADA = [
  "Você prefere retirar aqui na loja ou receber por entrega? 😊",
  "Prefere vir buscar aqui na loja ou que a gente entregue pra você? 🛵",
];
/* ---------- parcelamento no cartão (simulação feita pelo vendedor, P5/P19) ---------- */
const RX_QUER_PARCELAR = /(?<![a-z])(parcel\w*|divid\w*|dividir|em quantas vezes|quantas vezes|no cartao|cartao de credito|credito|vezes no cartao|simula\w*)(?![a-z])/;
const RX_PEDIU_PARCELAS = /quantas vezes|bandeira/;
const BANDEIRAS: [RegExp, string][] = [
  [/\bvisa\b/, "Visa"],
  [/\bmaster(card)?\b/, "Mastercard"],
  [/\belo\b/, "Elo"],
  [/\bhiper(card)?\b/, "Hipercard"],
  [/\bamex\b|american express/, "American Express"],
  [/\bdiners\b/, "Diners"],
];
/** Parcelas e bandeira que o cliente escreveu ("12x no Visa", "em 10 vezes", "master"). */
export function simulacaoPedida(texto: string): { parcelas: number | null; bandeira: string | null } {
  const t = semAcento(texto);
  const p = /(?<!\d)(\d{1,2})\s*(?:x|vezes|parcelas)(?![a-z])/.exec(t);
  const parcelas = p ? Number(p[1]) : null;
  const bandeira = BANDEIRAS.find(([rx]) => rx.test(t))?.[1] ?? null;
  return { parcelas: parcelas && parcelas >= 1 && parcelas <= 36 ? parcelas : null, bandeira };
}
export const PERGUNTA_PARCELAS = "Em quantas vezes você gostaria de dividir? E qual é a bandeira do cartão? 😊";
/** Confirmação da simulação, depois que o sistema avisou o vendedor (nunca com valores). */
export function textoSimulacao(p: { parcelas: number | null; bandeira: string | null; modelo: string | null }) {
  const vezes = p.parcelas ? (p.parcelas > 21 ? "em até 21x" : `de ${p.parcelas}x`) : "";
  const no = p.bandeira ? ` no ${p.bandeira}` : "";
  const moto = p.modelo ? ` pra *${p.modelo}*` : "";
  return `Perfeito! Já passei pro nosso vendedor fazer a simulação${vezes ? ` ${vezes}` : ""}${no}${moto}, e ele te manda os valores certinhos por aqui 🙏 Enquanto isso, quer saber mais alguma coisa da moto?`;
}

export const PERGUNTAS_VISITA = [
  "Qual dia e horário fica melhor pra você vir? 😊",
  "Que dia e horário fica bom pra você vir aqui na loja? 🛵",
];
export const PERGUNTAS_KM = [
  "Quantos km você roda por dia, mais ou menos? Assim te mostro quanto você vai economizar 💰",
  "Me fala quantos km você roda por dia, mais ou menos, que eu faço a conta da sua economia 💰",
];
export const parabens = (modelo: string | null) => {
  const m = modelo ? `a *${modelo}*` : "essa moto";
  const M = modelo ? `A *${modelo}*` : "Essa moto";
  return [
    `Parabéns pela escolha! 🎉 ${M} é uma ótima aquisição: você vai ter economia de verdade no dia a dia, sem gastar com gasolina, IPVA nem emplacamento.`,
    `Que ótima escolha! 🙌 Com ${m} você ganha economia e conforto no dia a dia, e nunca mais gasta com gasolina.`,
    `Parabéns! 🎉 ${M} vai te trazer economia e praticidade: nada de gasolina, IPVA ou emplacamento.`,
  ];
};
export const RX_PARABENS = /parab[eé]ns|[óo]tima (escolha|aquisi[çc][ãa]o)|excelente escolha/iu;
export const RX_PERGUNTA_USO_KM = /para que|pra que|quantos km|qual (vai ser )?o uso|uso principal|trabalho,? (o )?dia a dia|dia a dia ou/iu;
export const RX_JA_PERGUNTOU_FALTA = /falta(ndo|ria)?\s+(pra|para)\s+(a gente\s+)?(fechar|concluir|concluirmos)/iu;

/** Os dados que o Milton pede (lista do dono, P8/P11), sem o que o cliente já informou. */
export function listaDeDados(modo: "entrega" | "retirada", ja: { cidade?: string | null; pagamento?: string | null }) {
  if (modo === "retirada") {
    return `Combinado! Para registrar sua compra e a equipe separar a moto pra você, me manda por aqui:\n• Nome completo\n• CPF\n• Que dia e horário você pretende vir?`;
  }
  /* os mesmos campos da lista do Milton, agrupados para caber numa mensagem (o validador limita a 12 linhas) */
  const campos = [
    "Nome completo",
    "CPF",
    "Número para contato",
    "Data de nascimento",
    ja.cidade?.trim() ? "CEP" : "Cidade e CEP",
    "Rua, número e bairro",
    "Ponto de referência",
    "Até que horas você pode receber?",
    ...(ja.pagamento?.trim() ? [] : ["Forma de pagamento"]),
  ];
  return `Show! Para finalizar seu pedido, me manda por aqui:\n${campos.map((c) => `• ${c}`).join("\n")}`;
}

/** Entrega fora de Goiana: a IA não sabe se atende nem a taxa; avisa que a equipe confirma (balão separado). */
export function notaDeEntrega(cidade: string | null | undefined) {
  return cidade?.trim() && !/goiana/i.test(semAcento(cidade)) ? `Sobre a entrega em ${cidade.trim()}, a nossa equipe confirma se atende aí e te fala certinho 😊` : null;
}

/** A lista de dados que a loja mandou era a da retirada ("que dia e horário você pretende vir")? */
export const pediuDadosDeRetirada = (ultimaDaLoja: string) => /pretende vir/i.test(ultimaDaLoja) && !/\bCEP\b/i.test(ultimaDaLoja);

/** Recebeu os dados (pedido do dono, 03/10/2026: "ele está doido por uma confirmação; o repasse tem que ser
 *  totalmente humanizado: 'Perfeito, Carlos, está tudo certinho, vou repassar os dados para a minha equipe
 *  combinar contigo o melhor horário de entrega'"). Com o nome, a moto e o próximo passo certo; sem repetir
 *  dado pessoal e sem dizer que a compra está concluída. Fora do horário, a equipe chama quando a loja abrir. */
export function textoDadosRecebidos(p: { nome?: string | null; modelo?: string | null; modo: "entrega" | "retirada"; lojaAberta: boolean }, sorte = Math.random()) {
  const voc = p.nome ? `, ${p.nome}` : "";
  const moto = p.modelo ? `sua *${p.modelo}*` : "sua moto";
  const passo = p.modo === "entrega" ? `o melhor horário pra entregar a ${moto} 🛵` : `a separação da ${moto} e o horário que você vem buscar 🙌`;
  const verbo = p.modo === "entrega" ? "combinar" : "confirmar";
  const variantes = p.lojaAberta
    ? [
        `Perfeito${voc}! Está tudo certinho ✅ Vou repassar seus dados pra minha equipe, que vai ${verbo} com você ${passo}`,
        `Show${voc}! Recebi tudo certinho ✅ Já vou repassar pra nossa equipe, que vai te chamar aqui pra ${verbo} ${passo}`,
      ]
    : [
        `Perfeito${voc}! Está tudo certinho ✅ Vou repassar seus dados pra minha equipe, e assim que a loja abrir eles vão ${verbo} com você ${passo}`,
        `Show${voc}! Recebi tudo certinho ✅ Já vou repassar pra nossa equipe, que te chama aqui assim que a loja abrir pra ${verbo} ${passo}`,
      ];
  return variantes[Math.min(variantes.length - 1, Math.floor(sorte * variantes.length))];
}

/** O que a IA precisa saber antes de escrever, em cada momento. */
export function instrucaoDeFechamento(momento: Momento | null, modelo: string | null): string {
  const m = modelo ? `a ${modelo}` : "a moto";
  switch (momento) {
    case "interesse":
      return `# MOMENTO DA COMPRA
O cliente tem interesse em ${m}. Responda o que ele perguntou (ficha e preço do catálogo) e termine com UMA pergunta de fechamento, como "O que está faltando para concluirmos a sua compra?". Não pergunte uso nem km agora.`;
    case "decidido":
      return `# MOMENTO DA COMPRA
O cliente decidiu comprar ${m}. Parabenize com entusiasmo e naturalidade (ótima aquisição: economia no dia a dia, sem gasolina, sem IPVA nem emplacamento, conforto) e pergunte só: "Você prefere retirar aqui na loja ou receber por entrega?".`;
    case "objecao_preco":
      return `# MOMENTO DA COMPRA
O cliente achou caro. Não ofereça desconto (quem negocia é o vendedor). Mostre o valor: com a moto elétrica ele nunca mais gasta com gasolina e não paga IPVA nem emplacamento. Se souber quanto ele roda, use a CONTA DO CLIENTE do catálogo; se não souber, pergunte quantos km ele roda por dia para calcular a economia. Pode lembrar que dá para parcelar no cartão.`;
    case "quer_parcelar":
      return `# MOMENTO DA COMPRA
O cliente quer parcelar. Comece pelo valor da moto (preço de tabela do catálogo) e diga que no cartão de crédito dá para dividir em até 21x, com uma pequena taxa da maquininha, e que a loja faz uma simulação para achar uma parcela que caiba no orçamento. Pergunte em quantas vezes ele quer dividir e a bandeira do cartão. Nunca diga valor de parcela, taxa ou juros, não liste bandeiras e nunca peça número do cartão, código ou senha.`;
    case "pediu_simulacao":
      return `# MOMENTO DA COMPRA
O cliente passou os dados da simulação. O sistema avisa o vendedor e confirma: escreva só uma frase curta, sem valores.`;
    case "quer_visitar":
      return `# MOMENTO DA COMPRA
O cliente quer vir à loja (visita ou test drive). Ótimo! Responda com entusiasmo e pergunte só qual dia e horário fica melhor para ele vir. Não diga que já agendou: o sistema agenda quando ele responder.`;
    case "informou_visita":
      return `# MOMENTO DA COMPRA
O cliente disse quando vem à loja. O sistema agenda e confirma: escreva só uma frase curta e calorosa, sem perguntas e sem dizer o horário.`;
    case "informou_km":
      return `# MOMENTO DA COMPRA
O cliente disse quanto roda. A conta da economia é a CONTA DO CLIENTE que já vem pronta no catálogo: use só esses números, nunca faça conta. Termine com UMA pergunta de fechamento, como "O que está faltando para concluirmos a sua compra?".`;
    case "objecao":
      return `# MOMENTO DA COMPRA
O cliente está em dúvida. Com empatia e sem pressionar, entenda o motivo real com UMA pergunta aberta (ex.: "O que está pesando na sua decisão?") e responda a dúvida com dados do catálogo e da base. Não repita a pergunta de fechamento.`;
    case "escolheu_entrega":
    case "escolheu_retirada":
      return `# MOMENTO DA COMPRA
O cliente escolheu ${momento === "escolheu_entrega" ? "receber por entrega" : "retirar na loja"}. O sistema manda a lista de dados: escreva só uma frase curta de confirmação, sem perguntas.`;
    case "dados_parciais":
      return `# MOMENTO DA COMPRA
O cliente mandou parte dos dados que você pediu. Agradeça e peça só o que ainda falta da lista (o CPF é obrigatório). Não repita os dados dele.`;
    default:
      return "";
  }
}
