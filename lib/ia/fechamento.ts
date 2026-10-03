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

export type Momento = "interesse" | "decidido" | "objecao_preco" | "objecao" | "escolheu_entrega" | "escolheu_retirada" | "mandou_dados" | "dados_parciais";

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
export function detectarMomento(p: { textoCliente: string; ultimaDaLoja: string; conheceModelo: boolean }): Momento | null {
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
  const campos = [
    "Nome completo",
    "CPF",
    "Número para contato",
    "Data de nascimento",
    ...(ja.cidade?.trim() ? [] : ["Cidade"]),
    "CEP",
    "Rua",
    "Bairro",
    "Número",
    "Ponto de referência",
    "Até que horas você pode receber?",
    ...(ja.pagamento?.trim() ? [] : ["Forma de pagamento"]),
  ];
  const fora = ja.cidade?.trim() && !/goiana/i.test(semAcento(ja.cidade)) ? `\n\nSobre a entrega em ${ja.cidade.trim()}, a nossa equipe confirma se atende aí 😊` : "";
  return `Show! Para finalizar seu pedido, me manda por aqui:\n${campos.map((c) => `• ${c}`).join("\n")}${fora}`;
}

/** Recebeu os dados: agradece e passa ao vendedor, sem repetir dado pessoal nem dizer que a compra está concluída. */
export function textoDadosRecebidos(lojaAberta: boolean) {
  return lojaAberta
    ? "Recebi seus dados, obrigado! ✅ Vou passar pro nosso vendedor conferir e confirmar o seu pedido com você por aqui 🙌"
    : "Recebi seus dados, obrigado! ✅ Nosso vendedor confere e confirma o seu pedido com você por aqui assim que a loja abrir 🙌";
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
