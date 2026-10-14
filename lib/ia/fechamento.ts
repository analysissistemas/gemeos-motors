/* Condução até o fechamento (pedido do dono, 03/10/2026: "faltou aquela pergunta: o que está faltando para
   concluirmos a sua compra"; objeção de preço vira economia; outra objeção, afunilar até o motivo real;
   decidiu, "parabéns, ótima aquisição" e "retirar na loja ou delivery?"). Puro: sem banco.
   Quem usa é lib/ia/workflow/nos.ts. Decisões do treinamento: P8, P11, P18, P20.

   Momentos (o que a última mensagem do cliente mostra):
   - interesse: quer a moto (cita o modelo e fala em comprar, preço, condição), ainda avaliando
   - decidido: "vou querer", "fechado", "quero essa"
   - objecao_preco: "achei caro", "tem desconto?", "faz 1800 à vista?", "deixa quieto" logo depois do preço (1ª vez: persuasão)
   - negociar: insistiu no desconto depois da persuasão, ou falou do preço de um anúncio (o vendedor assume)
   - objecao: "vou pensar", "não sei", "vou falar com minha esposa"
   - escolheu_entrega / escolheu_retirada: respondeu a pergunta "retirar ou entrega?"
   - mandou_dados: mandou os dados pedidos (com CPF); dados_parciais: mandou parte, sem CPF */

import { dataHoraDaVisita, RX_PEDIU_HORARIO_VISITA, RX_QUER_VISITAR } from "./agenda.ts";
import { artigo } from "./estoque-tipos.ts";

export type Momento = "pesquisando" | "sem_modelo" | "quer_parcelar" | "pediu_simulacao" | "recusou_simulacao" | "negociar" | "quer_visitar" | "informou_visita" | "interesse" | "decidido" | "objecao_preco" | "objecao" | "informou_km" | "escolheu_entrega" | "escolheu_retirada" | "mandou_dados" | "dados_parciais";

/** Nestes momentos a IA não passa a conversa ao vendedor por conta própria: o fechamento segue até os dados
 *  chegarem (aí o sistema passa). Só passa antes se o cliente pedir uma pessoa. */
export const MOMENTOS_SEM_TRANSFERIR: Momento[] = ["pesquisando", "sem_modelo", "quer_parcelar", "pediu_simulacao", "quer_visitar", "informou_visita", "interesse", "decidido", "objecao_preco", "objecao", "informou_km", "escolheu_entrega", "escolheu_retirada", "dados_parciais"];
export const RX_PEDE_PESSOA = /(?<![\p{L}])(atendente|humano|pessoa|vendedor|gerente|falar com (algu[eé]m|voc[eê]s|o dono)|ligar|liga pra mim)(?![\p{L}])/iu;

const semAcento = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

const RX_PEDIU_ESCOLHA = /retir\w*[^?]{0,60}entreg|entreg\w*[^?]{0,60}retir|buscar[^?]{0,40}entreg|delivery/;
const RX_PEDIU_DADOS = /nome completo/;
/* "entreg\w*" pega entrega, entregar, entregue, entreguem ("quero que entregue", teste de 05/10/2026) */
const RX_ENTREGA = /(?<![a-z])(entreg\w*|delivery|receber (em casa|aqui|la em casa)|manda(r)? (pra|para) (mim|casa|ca)|leva(r)? (pra mim|ate mim|aqui)|em casa|na minha casa)(?![a-z])/;
const RX_RETIRADA = /(?<![a-z])(retir\w*|buscar|busco|pegar (ai|na loja|aqui)|vou ai|vou na loja|ir na loja|passo ai|eu pego|eu busco)(?![a-z])/;
const RX_CPF = /(?<!\d)\d{3}\.?\d{3}\.?\d{3}-?\d{2}(?!\d)/;
const RX_OUTRO_DADO = /(?<!\d)\d{5}-?\d{3}(?!\d)|(?<!\d)\d{1,2}\/\d{1,2}\/\d{2,4}(?!\d)|(?<![a-z])(rua|avenida|av\.|bairro|cep|travessa)(?![a-z])/;

const RX_DECIDIDO =
  /(?<![a-z])(vou (querer|levar|ficar com|fechar|comprar)|fechad[oa]|pode fechar|vamos fechar|bora fechar|ta fechado|fecho|quero (essa|esse|ela|fechar)|pode separar|como (faco|faz) (pra|para) (comprar|fechar|pagar)|quero comprar (a|o|essa|esse)|ja quero|decidi)(?![a-z])/;
/* "cara" sozinho é gíria ("cara, quero essa"): só conta com "achei", "tá", "muito"... */
const RX_PRECO_OBJ =
  /(?<![a-z])((achei|ta|esta|muito|meio|bem|bastante|um pouco|mt|mto|que) car[oa]|carissim[oa]|salgad[oa]|puxad[oa]|pesad[oa] (no bolso|pra mim)|(nao|n) (tenho|to com|estou com) (esse |todo esse )?(dinheiro|grana|valor)|sem (dinheiro|grana)|desconto|abaix(a|ar|ou) (o preco|o valor|pra|para|um pouco)|faz (por|mais barato)|ta alto|valor alto|fora do (meu )?orcamento|nao cabe no|muito dinheiro)(?![a-z])/;
/* Pedido de desconto e contraproposta (Andressa Souto, 08/10/2026: "Vc faz 1800 a vista?", a IA disse "sem possibilidade
   de desconto" e o vendedor topou negociar no dia seguinte). Dono, 13/10/2026: primeiro persuadir com os ganhos; se o
   cliente insistir, passar para o vendedor. Texto sem acento. */
export const RX_NEGOCIA =
  /(?<![a-z])(faz (?:por |em |a |pra )?(?:r\$ ?)?(?:\d{3,}|\d{1,3}[.,]\d{3}|\d+ ?mil)(?![\dx])|deixa (?:por|em|a) (?:r\$ ?)?\d|(?:da|consegue|pode|tem como) (?:pra |para )?(?:fazer|deixar|fechar) (?:por|em|a) (?:r\$ ?)?\d|(?:da|consegue|pode|tem como) (?:pra |para )?(?:baixar|melhorar|abaixar) (?:o |um |esse )?(?:preco|valor|pouco|precinho)|(?:fazer|faz) mais barato|menor (?:valor|preco)|ultimo (?:valor|preco)|precinho|chorar)(?![a-z])/;
/* preço visto num anúncio (Danilo, 10/10/2026: "e esse do anúncio? Neste preço do anúncio, não tem?" e a IA inventou
   "igual ao do anúncio"): a IA não sabe o preço dos anúncios, então o vendedor confere */
export const RX_ANUNCIO_PRECO = /(?:preco|valor)[^?\n]{0,30}(?:anuncio|anunciad|propaganda)|(?:anuncio|propaganda)[^?\n]{0,40}(?:preco|valor)|ess[ea] do anuncio/;
/* desistiu logo depois do preço ("Então deixa quieto", Danilo, 10/10/2026) */
const RX_DESISTIU = /(?<![a-z])(deixa (?:quieto|pra la|para la)|esquece|nao vou (?:mais )?(?:querer|levar)|vou deixar (?:pra la|quieto|para depois|pra depois)|fica pra (?:proxima|outra)|desisto|desisti)(?![a-z])/;
/* só agradeceu logo depois do preço ("Brgd", Damarys, 07/10/2026): é o "achei caro" calado */
const RX_SO_OBRIGADO = /^(?:ok|blz|beleza|ta|certo|ah)?[\s,.!]*(?:brgd|obg|obgd|obrigad[oa]|valeu|vlw|agradeco|grat[ao])[\s,.!]*$/;
/** Pedido de desconto, contraproposta, preço de anúncio ou objeção de preço numa mensagem do cliente (sem o contexto). */
export const falaDePreco = (texto: string) => {
  const t = semAcento(texto);
  return RX_PRECO_OBJ.test(t) || RX_NEGOCIA.test(t) || RX_ANUNCIO_PRECO.test(t) || RX_DESISTIU.test(t);
};
/** Quantas mensagens anteriores do cliente já foram objeção de preço ou pedido de desconto (a persuasão já foi). */
export const objecoesDePrecoAntes = (leadAntes: string) => (leadAntes ?? "").split("\n").filter((l) => /^Lead:/.test(l) && falaDePreco(l)).length;

const RX_DUVIDA =
  /(?<![a-z])(vou pensar|deixa eu (ver|pensar)|preciso pensar|vou ver|depois (eu )?(vejo|falo|volto|decido)|nao sei|to em duvida|estou em duvida|indecis\w*|medo|receio|sera que|(falar|conversar|ver) com (a |o )?(minha |meu )?(esposa|marido|mulher|namorad[oa]|pai|mae|familia)|nao tenho certeza|ainda nao)(?![a-z])/;
const RX_OPCOES = /(?<![a-z])(quais (modelos|motos|opcoes|voces tem)|que (modelos|motos)|(mais|menor|o mais) (barat\w*|em conta|acessive\w*)|opcoes|catalogo|o que voces tem|tem o que|mostra (as|os) (motos|modelos)|estou pesquisando|to pesquisando|so pesquisando|comparar)(?![a-z])/;
const RX_QUER_COMPRAR = /(?<![a-z])(quero (comprar|uma moto|um patinete|adquirir)|procurando (uma )?(moto|patinete)|queria (comprar|uma moto)|pensando em comprar)(?![a-z])/;
const RX_INTERESSE = /(?<![a-z])(quero|queria|interess\w*|comprar|compra|preco|valor|quanto|condic\w*|pagamento|parcel\w*|a vista|pix|cartao|disponivel|tem (a|o|essa|esse))(?![a-z])/;

/** Em que momento da compra o cliente está, pela mensagem dele e pela última mensagem da loja. */
export function detectarMomento(p: { textoCliente: string; ultimaDaLoja: string; conheceModelo: boolean; agora?: Date; objecoesAntes?: number }): Momento | null {
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
  const sim = simulacaoPedida(p.textoCliente, RX_LOJA_PERGUNTOU_VEZES.test(loja));
  /* respondendo "o seu cartão permite parcelar em 18 vezes?" (Amex acima de 12x) ou "pra qual moto é a simulação?" */
  if (RX_PERGUNTOU_AMEX.test(loja) && respostaSimNao(p.textoCliente)) return "pediu_simulacao";
  if (RX_PERGUNTOU_MOTO.test(loja) && p.conheceModelo) return "pediu_simulacao";
  if (RX_PEDIU_PARCELAS.test(loja) && (sim.parcelas || sim.bandeira || sim.debito)) return "pediu_simulacao";
  if (sim.parcelas && sim.bandeira) return "pediu_simulacao";
  if (sim.bandeira && RX_QUER_PARCELAR.test(t) && /simula/.test(t)) return "pediu_simulacao";
  /* débito: com a bandeira, ou com a moto já escolhida (o sistema pergunta a bandeira) */
  if (sim.debito && (sim.bandeira || p.conheceModelo)) return "pediu_simulacao";
  /* "Posso separar a sua?" (fecho da simulação) e o cliente disse sim: decidiu */
  if (/posso separar/.test(loja) && !sim.parcelas && respostaSimNao(p.textoCliente) === "sim" && !RX_PRECO_OBJ.test(t)) return "decidido";
  /* perguntou o total depois da simulação (a simulação vai só com a parcela, usuário 12/10/2026) */
  if (RX_SIMULACAO_ENVIADA.test(loja) && RX_PEDE_TOTAL.test(t) && !sim.parcelas) return "pediu_simulacao";
  /* não aceitou a simulação que o sistema mandou: o vendedor consulta a gerência (relatório do dono, 10/10/2026) */
  if (RX_SIMULACAO_ENVIADA.test(loja) && !sim.parcelas && !RX_VAI_DE_PIX.test(t) && (RX_RECUSA.test(t) || RX_PRECO_OBJ.test(t))) return "recusou_simulacao";
  /* desconto, contraproposta, anúncio, "deixa quieto" ou só "obrigado" logo depois do preço: na 1ª vez a IA persuade com
     os ganhos; insistiu (ou é preço de anúncio, que a IA não sabe), o vendedor assume (dono, 13/10/2026) */
  const depoisDoPreco = /r\$\s*\d/.test(loja) && !RX_SIMULACAO_ENVIADA.test(loja);
  const pedeCondicao = RX_NEGOCIA.test(t) || RX_ANUNCIO_PRECO.test(t) || RX_PRECO_OBJ.test(t) || (depoisDoPreco && (RX_DESISTIU.test(t) || RX_SO_OBRIGADO.test(t.trim())));
  if (pedeCondicao) return RX_ANUNCIO_PRECO.test(t) || (p.objecoesAntes ?? 0) >= 1 ? "negociar" : "objecao_preco";
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
  /* sem modelo: pediu opções ("quais motos", "as mais baratas") ou só disse que quer comprar */
  if (!p.conheceModelo && RX_OPCOES.test(t)) return "pesquisando";
  if (!p.conheceModelo && RX_QUER_COMPRAR.test(t)) return "sem_modelo";
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
/** A loja perguntou as parcelas: "em quantas vezes?", ou a simulação enviada ("simulo em outro número de parcelas"):
 *  aí "em 18" ou "10, 12 e 18" sem o x valem como parcelas (Milton, 12/10/2026). Texto sem acento. */
export const RX_LOJA_PERGUNTOU_VEZES = /quantas vezes|numero de parcelas|em mais vezes|(?:fiz|segue) a simulacao/;
const RX_PEDIU_PARCELAS = /quantas vezes|bandeira|numero de parcelas|em mais vezes|(?:fiz|segue) a simulacao/;
const BANDEIRAS: [RegExp, string][] = [
  [/\bvisa\b/, "Visa"],
  [/\bmaster(card)?\b/, "Mastercard"],
  [/\belo\b/, "Elo"],
  [/\bhiper(card)?\b/, "Hipercard"],
  [/\bamex\b|american express/, "American Express"],
  [/\bdiners\b/, "Diners"],
];
/* frases dos textos do sistema (sem acento, como detectarMomento compara a fala da loja) */
export const RX_PERGUNTOU_AMEX = /american express[^?]*seu cartao permite/;
export const RX_PERGUNTOU_MOTO = /pra qual moto voce quer a simulacao/;
/* a simulação, ou a conta do total que o cliente pediu depois dela */
export const RX_SIMULACAO_ENVIADA = /(?:fiz|segue) a simulacao|o total fica assim/;
const RX_RECUSA =
  /(?<![a-z])(nao (da|deu|rola|cabe|aceito|compensa|consigo|gostei|fica bom|ficou bom|tenho como)|ficou (caro|alto|pesad[oa]|salgad[oa]|puxad[oa])|(muito|bem|mt|mto) (caro|alto|juros)|juros? (alto|muito|demais)|taxa (alta|muito|demais)|caro demais|achei (caro|alto|salgado|puxado))(?![a-z])/;
/* "não, vou pagar no pix" não é recusa: é outra forma de pagar */
const RX_VAI_DE_PIX = /(?<![a-z])(pix|dinheiro|a vista|em especie)(?![a-z])/;
/** "sim" / "não" do cliente à pergunta do Amex ("permite sim", "não permite", "pode", "acho que não"). */
export function respostaSimNao(texto: string): "sim" | "nao" | null {
  const t = semAcento(texto).trim();
  if (/(?<![a-z])(nao|n|nem|negativo|nao permite|acho que nao)(?![a-z])/.test(t)) return "nao";
  if (/(?<![a-z])(sim|s|permite|pode|claro|isso|libera|aceita|ok|positivo|da sim|consigo|tenho|parcela)(?![a-z])/.test(t)) return "sim";
  return null;
}
/* parcelas por extenso ("doze vezes", "vinte e uma parcelas"), 10/10/2026 */
const UNIDADES: Record<string, number> = { uma: 1, um: 1, duas: 2, dois: 2, tres: 3, quatro: 4, cinco: 5, seis: 6, sete: 7, oito: 8, nove: 9 };
const NUMEROS: Record<string, number> = {
  ...UNIDADES, dez: 10, onze: 11, doze: 12, treze: 13, quatorze: 14, catorze: 14, quinze: 15, dezesseis: 16, dezessete: 17, dezoito: 18, dezenove: 19, vinte: 20, trinta: 30,
};
const RX_PARCELAS_NUM = /(?<![\d,.])(\d{1,2})\s*(?:x|vezes|parcelas?)(?![a-z])/g;
const RX_PARCELAS_EXTENSO = /(?<![a-z])(uma|um|duas|dois|tres|quatro|cinco|seis|sete|oito|nove|dez|onze|doze|treze|quatorze|catorze|quinze|dezesseis|dezessete|dezoito|dezenove|vinte|trinta)(?:\s+e\s+(uma|um|duas|dois|tres|quatro|cinco|seis|sete|oito|nove))?\s+(?:vezes|parcelas?)(?![a-z])/g;
/* "parcelar em 12", "dividir em 10 no visa" (sem o "x"); "em 12 mil" e "em 10%" não contam */
const RX_PARCELAS_VERBO = /(?<![a-z])(?:parcel\w*|divid\w*)\s+(?:(?:ela|a moto|o valor|tudo)\s+)?em\s+(?:ate\s+)?(\d{1,2})(?!\d|[.,]\d|\s*(?:mil|reais|%|por\s*cento))/g;
const RX_DEBITO = /(?<![a-z])debito(?![a-z])/;
/* respondendo "em quantas vezes?": o número sozinho vale ("em 21", "21", "até 18 no visa"; Leandro, 11/10/2026).
   Dinheiro, porcentagem, dias, horas, km e anos não contam */
const RX_PARCELAS_SOLTAS =
  /(?<![\d,.$]|\$\s)(?:(?:em|ate)\s+)?(\d{1,2})(?![\d%]|[.,]\d)(?!\s*(?:mil|reais|real|por\s*cento|dias?|horas?|h|min\w*|km|anos?|kg|de entrada)(?![a-z]))/g;

/** Parcelas e bandeira que o cliente escreveu ("12x no Visa", "em 10 vezes", "doze vezes", "master", "no débito").
 *  `todas` = todas as quantidades citadas ("12x ou 18x"), na ordem, sem repetir; `parcelas` = a primeira.
 *  `respondendoVezes`: a loja acabou de perguntar em quantas vezes, então "em 21" sozinho é a resposta. */
export function simulacaoPedida(texto: string, respondendoVezes = false): { parcelas: number | null; todas: number[]; bandeira: string | null; debito: boolean } {
  const t = semAcento(texto);
  const achados: { pos: number; n: number }[] = [];
  for (const m of t.matchAll(RX_PARCELAS_NUM)) achados.push({ pos: m.index ?? 0, n: Number(m[1]) });
  if (respondendoVezes && !achados.length) for (const m of t.matchAll(RX_PARCELAS_SOLTAS)) achados.push({ pos: m.index ?? 0, n: Number(m[1]) });
  for (const m of t.matchAll(RX_PARCELAS_EXTENSO)) {
    if (m[1] === "uma" || m[1] === "um") continue; // "uma vez" não é parcelamento ("à vista, de uma vez")
    achados.push({ pos: m.index ?? 0, n: NUMEROS[m[1]] + (m[2] ? UNIDADES[m[2]] : 0) });
  }
  for (const m of t.matchAll(RX_PARCELAS_VERBO)) achados.push({ pos: m.index ?? 0, n: Number(m[1]) });
  const todas = Array.from(new Set(achados.sort((a, b) => a.pos - b.pos).map((a) => a.n).filter((n) => n >= 1 && n <= 36)));
  const bandeira = BANDEIRAS.find(([rx]) => rx.test(t))?.[1] ?? null;
  return { parcelas: todas[0] ?? null, todas, bandeira, debito: RX_DEBITO.test(t) };
}
/* Milton (12/10/2026): primeiro avisa da taxa e pergunta SÓ em quantas vezes; a bandeira vem depois, se faltar */
export const PERGUNTA_PARCELAS = "No cartão de crédito tem a taxa da maquininha, que é repassada no valor. Em quantas vezes você gostaria de dividir? 😊";
/** Amex, o cliente disse que o cartão não passa de 12x: pergunta em quantas (sem a tabela, Milton 12/10/2026). */
export const PERGUNTA_AMEX_ATE_12 = "Sem problema! No American Express dá pra parcelar em até 12 vezes. Em quantas vezes você quer? 😊";
/** Confirmação da simulação, depois que o sistema avisou o vendedor (nunca com valores). */
export function textoSimulacao(p: { parcelas: number | null; bandeira: string | null; modelo: string | null }) {
  /* "em 10 vezes", não "10x": o validador só aceita "Nx" que esteja escrito na base (teste de 04/10/2026) */
  const vezes = p.parcelas ? (p.parcelas > 21 ? "em até 21 vezes" : `em ${p.parcelas} ${p.parcelas === 1 ? "vez" : "vezes"}`) : "";
  const no = p.bandeira ? ` no ${p.bandeira}` : "";
  const moto = p.modelo ? ` pra *${p.modelo}*` : "";
  return `Perfeito! Já passei pro nosso vendedor fazer a simulação${vezes ? ` ${vezes}` : ""}${no}${moto}, e ele te manda os valores certinhos por aqui 🙏 Enquanto isso, quer saber mais alguma coisa ${artigo(p.modelo) === "o" ? "do patinete" : "da moto"}?`;
}

const brl = (x: number) => `R$ ${x.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
/** Simulação pronta (feita pelo sistema, com a tabela da maquininha): a moto, o valor à vista e a parcela. Sem "10x":
 *  escreve "em 10 vezes", como o resto do atendimento. */
export function textoSimulacaoPronta(p: { nome: string | null; modelo: string; aVista: number; parcelas: number; bandeira: string; parcela: number; total: number; entrada?: number }) {
  const abre = p.nome ? `${p.nome}, fiz a simulação pra você 😊` : "Fiz a simulação pra você 😊";
  const ent = p.entrada && p.entrada > 0 ? `• Entrada: ${brl(p.entrada)}
` : "";
  if (p.parcelas === 1)
    return `${abre}
• Moto: *${p.modelo}*
• No cartão ${p.bandeira}, em 1 vez: *${brl(p.total)}* (sem acréscimo)
No *dinheiro ou Pix* o valor é o mesmo, sem taxa 😉 ${persuasao(p.modelo)}`;
  /* sem o total (usuário, 12/10/2026: "se o cliente perguntar o valor total a IA fala, se não, não precisa") */
  return `${abre}
• Moto: *${p.modelo}*
• Valor à vista: ${brl(p.aVista)}
${ent}• No ${p.bandeira}: *${p.parcelas}x de ${brl(p.parcela)}*
No *dinheiro ou Pix* fica ${brl(p.aVista)}, sem nenhuma taxa 😉 ${persuasao(p.modelo)}`;
}
/** Fecho da simulação com persuasão, sem "o vendedor consulta a gerência" (usuário, 12/10/2026: "a IA tem que ter
 *  persuasão"): o benefício da elétrica e o fechamento assumido. Uma mensagem só, sem linha em branco (senão vira 3). */
export function persuasao(modelo: string) {
  const a = artigo(modelo);
  return `Com ${a} *${modelo}* você esquece a gasolina e não paga IPVA nem emplacamento. Posso separar ${a === "o" ? "o seu" : "a sua"}?`;
}
/** Simulação no débito (relatório do dono, 10/10/2026: o cliente paga a taxa do débito). */
export function textoSimulacaoDebito(p: { nome: string | null; modelo: string; aVista: number; bandeira: string; total: number }) {
  const abre = p.nome ? `${p.nome}, fiz a simulação pra você 😊` : "Fiz a simulação pra você 😊";
  return `${abre}
• Moto: *${p.modelo}*
• Valor à vista: ${brl(p.aVista)}
• No débito ${p.bandeira}: *${brl(p.total)}* (com a taxa da maquininha)
Pagando em *dinheiro ou Pix* fica ${brl(p.aVista)}, sem nenhuma taxa 😉 ${persuasao(p.modelo)}`;
}
/** O cliente pediu simulação sem a loja saber de qual moto (Beatriz, 07/10/2026, ficou esperando o vendedor). */
export const PERGUNTA_QUAL_MOTO = "Pra qual moto você quer a simulação? 😊";
/** Amex acima de 12x (relatório do dono, 10/10/2026): a loja pergunta se o cartão do cliente permite. */
export const textoPerguntaAmex = (parcelas: number) =>
  `No American Express, parcelar acima de 12 vezes depende do cartão. O seu cartão permite parcelar em ${parcelas} vezes? 😊`;
/** Não aceitou a simulação (relatório do dono, 10/10/2026: "consultar a gerência antes de concluir a negociação"). */
export function textoConsultaGerencia(p: { nome: string | null; modelo: string | null; aVista: number | null; lojaAberta: boolean }) {
  const voc = p.nome ? `, ${p.nome}` : "";
  const quando = p.lojaAberta ? "e te retorno por aqui" : "e assim que a loja abrir te retorno por aqui";
  const pix = p.aVista && p.modelo ? ` Lembrando que no *Pix ou dinheiro* ${artigo(p.modelo)} *${p.modelo}* sai por ${brl(p.aVista)}, sem taxa 😉` : "";
  return `Entendo${voc}! Vou levar o seu caso pra nossa gerência ver o que dá pra fazer ${quando} 🙏${pix}`;
}
/** Tabela (dono, 06/10/2026: "é só mandar a tabela completa pro cliente"): 2x a 21x da bandeira, num bloco só, ou só as
 *  parcelas pedidas ("12x ou 18x"). American Express: até 12x, salvo com o cliente confirmando que o cartão permite. */
export function textoTabelaCompleta(p: { nome: string | null; modelo: string; bandeira: string; aVista: number; entrada?: number; amexConfirmado?: boolean; linhas: { parcelas: number; parcela: number; total: number }[] }) {
  const abre = p.nome ? `${p.nome}, segue a simulação` : "Segue a simulação";
  const ent = p.entrada && p.entrada > 0 ? ` com entrada de ${brl(p.entrada)}` : "";
  /* só a parcela, sem o total (usuário, 12/10/2026); numa mensagem só */
  const linha = (l: { parcelas: number; parcela: number; total: number }) => `• ${l.parcelas}x de ${brl(l.parcela)}`;
  const tabela = p.linhas.map(linha).join("\n");
  const amex = p.bandeira === "American Express" && !p.amexConfirmado && p.linhas.length > 2 ? "\nNo American Express, acima de 12 vezes depende do cartão: se o seu permitir, me fala em quantas vezes que eu simulo 😉" : "";
  return `${abre} d${artigo(p.modelo)} *${p.modelo}* no ${p.bandeira}${ent} (à vista ${brl(p.aVista)}):\n${tabela}${amex}\nNo *dinheiro ou Pix* fica ${brl(p.aVista)}, sem taxa 😉 Com ${artigo(p.modelo)} *${p.modelo}* você esquece a gasolina e não paga IPVA nem emplacamento. Qual dessas fica melhor pra você?`;
}
/** O cliente perguntou o total depois da simulação: a conta sai da própria simulação enviada (parcelas × valor). */
export function textoTotais(ultimaDaLoja: string): { texto: string; registro: string } | null {
  const valor = (x: string) => Number(x.replace(/\./g, "").replace(",", "."));
  const linhas = Array.from(ultimaDaLoja.matchAll(/(\d{1,2})x de R\$\s*([\d.]+,\d{2})/g)).map((m) => ({ n: Number(m[1]), parcela: valor(m[2]) }));
  if (!linhas.length) return null;
  const entrada = /Entrada:\s*R\$\s*([\d.]+,\d{2})/.exec(ultimaDaLoja);
  const ent = entrada ? valor(entrada[1]) : 0;
  const total = (l: { n: number; parcela: number }) => Math.round((l.n * l.parcela + ent) * 100) / 100;
  const corpo = linhas.map((l) => `• ${l.n}x de ${brl(l.parcela)}: total de *${brl(total(l))}*`).join("\n");
  return {
    texto: `No cartão, o total fica assim${ent ? " (com a entrada)" : ""}:\n${corpo}\nNo *dinheiro ou Pix* sai mais em conta, sem taxa 😉 Qual fica melhor pra você?`,
    registro: linhas.map((l) => `${l.n}x: total ${total(l).toFixed(2)}`).join("; "),
  };
}
export const RX_PEDE_TOTAL = /(?<![a-z])(?:total|valor final|no final|ao todo|tudo junto|quanto (?:da|fica|vai dar) (?:tudo|no total|no final))(?![a-z])/;
/** Casos em que a conta não sai direto: Amex acima de 12x (pergunta ao cliente), acima de 21x (pergunta de novo) e o
 *  resto (o vendedor faz). */
export function textoSimulacaoConsultar(p: { motivo: "amex_acima_12" | "bandeira_sem_tabela" | "parcelas_acima_de_21" | "dados_incompletos"; modelo: string | null; parcelas?: number | null }) {
  const moto = p.modelo ? ` pra *${p.modelo}*` : "";
  if (p.motivo === "amex_acima_12") return textoPerguntaAmex(p.parcelas ?? 13);
  if (p.motivo === "parcelas_acima_de_21") return `No cartão a gente parcela em até 21 vezes. Em quantas vezes você quer que eu simule${moto}? 😊`;
  return `Já passei pro nosso vendedor fazer a simulação${moto}, e ele te manda os valores certinhos por aqui 🙏`;
}

export const PERGUNTA_TEM_MODELO = "Você já tem algum modelo em mente ou está pesquisando para conhecer as opções? 😊";

export const PERGUNTAS_VISITA = [
  "Qual dia e horário fica melhor pra você vir? 😊",
  "Que dia e horário fica bom pra você vir aqui na loja? 🛵",
];
export const PERGUNTAS_KM = [
  "Quantos km você roda por dia, mais ou menos? Assim te mostro quanto você vai economizar 💰",
  "Me fala quantos km você roda por dia, mais ou menos, que eu faço a conta da sua economia 💰",
];
export const parabens = (modelo: string | null) => {
  const a = artigo(modelo);
  const m = modelo ? `${a} *${modelo}*` : "essa moto";
  const M = modelo ? `${a.toUpperCase()} *${modelo}*` : "Essa moto";
  return [
    `Parabéns pela escolha! 🎉 ${M} é uma ótima aquisição: você vai ter economia de verdade no dia a dia, sem gastar com gasolina, IPVA nem emplacamento.`,
    `Que ótima escolha! 🙌 Com ${m} você ganha economia e conforto no dia a dia, e nunca mais gasta com gasolina.`,
    `Parabéns! 🎉 ${M} vai te trazer economia e praticidade: nada de gasolina, IPVA ou emplacamento.`,
  ];
};
export const RX_PARABENS = /parab[eé]ns|[óo]tima (escolha|aquisi[çc][ãa]o)|excelente escolha/iu;
export const RX_PERGUNTA_USO_KM = /para que|pra que|quantos km|qual (vai ser )?o uso|uso principal|trabalho,? (o )?dia a dia|dia a dia ou/iu;
export const RX_JA_PERGUNTOU_FALTA = /falta(ndo|ria)?\s+(pra|para)\s+(a gente\s+)?(fechar|concluir|concluirmos)/iu;

const RX_FRASES = /(?:[^.!?\n]|[.!?](?=\d))+[.!?]*\s*(?:\p{Extended_Pictographic}️?\s*)*/gu;
/* "O que está faltando para concluirmos a sua compra? 😊", colada ou não no fim da frase do preço */
const RX_FRASE_FALTA = /(?:ficou alguma d[uú]vida,?\s*ou\s+)?o\s+que\s+(?:est[áa]\s+|t[áa]\s+)?falta(?:ndo|ria)?\s+(?:pra|para)[^?]*\?\s*(?:\p{Extended_Pictographic}️?\s*)*/giu;
/** Milton (12/10/2026): no orçamento, sem "o que falta para concluirmos?" (vira o 1º follow-up) e sem pergunta de uso/km.
 *  Só essas perguntas saem; o resto da frase e as outras perguntas ficam. */
export function semPerguntaDeFechamento(resposta: string[]) {
  const usoKm = (f: string) => /\?/.test(f) && (RX_PERGUNTA_USO_KM.test(f) || /trabalho ou (?:passeio|lazer|dia a dia)|(?:passeio|lazer|dia a dia) ou trabalho/iu.test(f));
  return resposta
    .map((b) =>
      b
        .replace(RX_FRASE_FALTA, "")
        .split("\n")
        .map((l) => (l.match(RX_FRASES) ?? [l]).filter((f) => !usoKm(f)).join("").trimEnd())
        .join("\n")
        .trim(),
    )
    .filter((b) => /\p{L}/u.test(b));
}

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

/** A última fala da loja: todas as mensagens da IA ou do vendedor depois da última mensagem do cliente
 *  (a lista de dados e o aviso de entrega vão em balões separados; olhar só o último perdia a lista). */
export function ultimaFalaDaLoja(historico: string) {
  const blocos = (historico ?? "").split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean);
  const fala: string[] = [];
  for (let i = blocos.length - 1; i >= 0; i--) {
    if (/^Lead:/.test(blocos[i])) break;
    if (/^(Agente IA|Vendedor):/.test(blocos[i])) fala.unshift(blocos[i].replace(/^(Agente IA|Vendedor):\s*/, ""));
  }
  return fala.join("\n\n");
}

/** Proposta antiga (saiu na decisão P20): se a IA ainda escrever, a frase/bloco sai da resposta. */
export function tirarPropostaAntiga(resposta: string[]) {
  return resposta
    .filter((b) => !/proposta\s+g[eê]meos\s+motors/iu.test(b))
    .map((b) => (/\n/.test(b) ? b : b.split(/(?<=[.!?:])\s+/u).filter((f) => !/(mont\w*|prepar\w*|segue|vou (te )?(mandar|enviar)) (a |uma |sua )?proposta/iu.test(f)).join(" ").trim()))
    .filter((b) => /\p{L}/u.test(b));
}

/** A lista de dados que a loja mandou era a da retirada ("que dia e horário você pretende vir")? */
export const pediuDadosDeRetirada = (ultimaDaLoja: string) => /pretende vir/i.test(ultimaDaLoja) && !/\bCEP\b/i.test(ultimaDaLoja);

/** Recebeu os dados (pedido do dono, 03/10/2026: "ele está doido por uma confirmação; o repasse tem que ser
 *  totalmente humanizado: 'Perfeito, Carlos, está tudo certinho, vou repassar os dados para a minha equipe
 *  combinar contigo o melhor horário de entrega'"). Com o nome, a moto e o próximo passo certo; sem repetir
 *  dado pessoal e sem dizer que a compra está concluída. Fora do horário, a equipe chama quando a loja abrir. */
export function textoDadosRecebidos(p: { nome?: string | null; modelo?: string | null; modo: "entrega" | "retirada"; lojaAberta: boolean }, sorte = Math.random()) {
  const voc = p.nome ? `, ${p.nome}` : "";
  const a = artigo(p.modelo);
  const moto = p.modelo ? `${a === "o" ? "seu" : "sua"} *${p.modelo}*` : "sua moto";
  const passo = p.modo === "entrega" ? `o melhor horário pra entregar ${a} ${moto} 🛵` : `a separação d${a} ${moto} e o horário que você vem buscar 🙌`;
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
  const m = modelo ? `${artigo(modelo)} ${modelo}` : "a moto";
  switch (momento) {
    case "interesse":
      return `# MOMENTO DA COMPRA
O cliente tem interesse em ${m}. Responda SÓ o que ele perguntou, com os dados do catálogo: perguntou o preço, diga o preço, a cor e que tem a pronta entrega; perguntou autonomia, bateria ou garantia, responda isso. Não despeje a ficha inteira de uma vez (a foto e o vídeo vão junto). NÃO pergunte "o que está faltando para concluirmos?" agora: o sistema manda essa pergunta depois, se o cliente não responder. Não pergunte uso nem km agora.`;
    case "decidido":
      return `# MOMENTO DA COMPRA
O cliente decidiu comprar ${m}. Parabenize com entusiasmo e naturalidade (ótima aquisição: economia no dia a dia, sem gasolina, sem IPVA nem emplacamento, conforto) e pergunte só: "Você prefere retirar aqui na loja ou receber por entrega?".`;
    case "objecao_preco":
      return `# MOMENTO DA COMPRA
O cliente achou caro, pediu desconto ou propôs um valor menor. NUNCA diga que não tem desconto, que o preço é fixo ou que não dá para baixar, e não prometa desconto: quem negocia é o vendedor, e o sistema passa para ele se o cliente insistir. Vire o jogo: em vez de falar do preço, mostre o que ele GANHA e o que deixa de gastar todo mês com ${m}: nunca mais gasolina, sem IPVA nem emplacamento, manutenção simples e barata, carrega na tomada de casa. Num patinete, o ganho é a passagem de ônibus, o mototáxi ou o aplicativo que ele deixa de pagar todo dia. Mostre que o valor se paga com essa economia. Se souber quanto ele roda, use a CONTA DO CLIENTE do catálogo; se não souber, pergunte quantos km ele roda por dia para calcular. Pode lembrar que no Pix sai o melhor valor e que dá para parcelar no cartão. Tom caloroso, sem discutir com o cliente.`;
    case "pesquisando":
      return `# MOMENTO DA COMPRA
O cliente ainda não escolheu e quer conhecer as opções. NÃO sugira nem escolha modelos por ele (dono, 09/10/2026: a IA errava e só oferecia a mesma moto). Mande o catálogo para ele ver, em uma frase curta: "dá uma olhada no nosso catálogo com todos os modelos, fotos e preços: gemeosmotors.com.br" (escreva o endereço exatamente assim) e faça UMA pergunta: qual modelo chamou a atenção dele. Só fale de um modelo específico se o cliente perguntar por ele pelo nome.`;
    case "sem_modelo":
      return `# MOMENTO DA COMPRA
O cliente quer comprar, mas ainda não falou de um modelo. Pergunte só: "Você já tem algum modelo em mente ou está pesquisando para conhecer as opções?".`;
    case "quer_parcelar":
      return `# MOMENTO DA COMPRA
O cliente quer parcelar. Comece pelo valor da moto (preço de tabela do catálogo) e incentive, sem pressionar, pagar em dinheiro ou Pix, que é o melhor valor (sem taxa). Se ele quiser parcelar mesmo assim, diga que no cartão de crédito dá para dividir em até 21x. NÃO pergunte as parcelas nem a bandeira: o sistema avisa da taxa da maquininha e pergunta em quantas vezes logo depois da sua resposta. Nunca diga valor de parcela, taxa ou juros (o sistema calcula e manda a simulação quando ele disser as parcelas e a bandeira), não liste bandeiras e nunca peça número do cartão, código ou senha.`;
    case "pediu_simulacao":
      return `# MOMENTO DA COMPRA
O cliente passou os dados da simulação. O sistema calcula e manda a simulação (ou pergunta o que falta): escreva só uma frase curta, sem valores.`;
    case "quer_visitar":
      return `# MOMENTO DA COMPRA
O cliente quer vir à loja (visita ou test drive). Ótimo! Responda com entusiasmo e pergunte só qual dia e horário fica melhor para ele vir. Não diga que já agendou: o sistema agenda quando ele responder.`;
    case "informou_visita":
      return `# MOMENTO DA COMPRA
O cliente disse quando vem à loja. O sistema agenda e confirma: escreva só uma frase curta e calorosa, sem perguntas e sem dizer o horário.`;
    case "informou_km":
      return `# MOMENTO DA COMPRA
O cliente disse quanto roda. A conta da economia é a CONTA DO CLIENTE que já vem pronta no catálogo: use só esses números, nunca faça conta. NÃO pergunte "o que está faltando para concluirmos?" (o sistema manda depois, se o cliente não responder).`;
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

/** O cliente insistiu no desconto depois da persuasão, ou falou do preço de um anúncio: o vendedor assume (dono,
 *  13/10/2026: "passar para o vendedor, mas primeiro tentar persuadir"). Sem prometer desconto e sem valor. */
export function textoNegociacao(p: { nome: string | null; anuncio: boolean; lojaAberta: boolean }) {
  const voc = p.nome ? `, ${p.nome}` : "";
  const quando = p.lojaAberta ? "e ele te responde por aqui" : "e assim que a loja abrir ele te responde por aqui";
  return p.anuncio
    ? `Entendi${voc}! Vou pedir pro nosso vendedor conferir esse anúncio que você viu ${quando} 🙏`
    : `Entendi${voc}! Vou passar o seu pedido agora pro nosso vendedor ver o que ele consegue fazer pra você ${quando} 🙏`;
}

/* Frase que a IA não pode dizer (conversas de 08 a 10/10/2026): fechar a porta da negociação ("sem possibilidade de
   desconto", e o vendedor negociou no dia seguinte) e inventar sobre preço de anúncio ("igual ao do anúncio", "o preço
   divulgado pode variar conforme promoções"). Sai só a frase; o resto da resposta fica. Texto sem acento no teste. */
const RX_FRASE_PROIBIDA =
  /(?:sem|n[ãa]o\s+(?:tem|temos|h[áa]|existe|trabalhamos\s+com))\s+(?:a\s+)?(?:possibilidade\s+de\s+|como\s+(?:dar|fazer)\s+)?desconto|n[ãa]o\s+(?:podemos|conseguimos|d[áa]\s+(?:pra|para)|[ée]\s+poss[íi]vel|tem\s+como)\s+(?:reduzir|baixar|diminuir|abaixar|dar\s+desconto|mexer|fazer\s+por)|pre[çc]o\s+(?:[ée]\s+)?(?:fixo|tabelado)|igual\s+ao\s+(?:do\s+|que\s+(?:voc[êe]\s+)?viu\s+no\s+)?an[úu]ncio|(?:pre[çc]o|valor)\s+(?:divulgado|anunciado|do\s+an[úu]ncio)\s+pode\s+variar|promo[çc](?:[ãa]o|[õo]es)\s+pontua/iu;
export function tirarFraseProibida(resposta: string[]): string[] {
  const FRASES = /(?:[^.!?\n]|[.!?](?=\d))+[.!?]*\s*(?:\p{Extended_Pictographic}️?\s*)*|\n/gu;
  return resposta
    .map((b) => (RX_FRASE_PROIBIDA.test(b) ? (b.match(FRASES) ?? [b]).filter((f) => !RX_FRASE_PROIBIDA.test(f)).join("").trim() : b))
    .filter((b) => /\p{L}/u.test(b));
}

/* Frase que adia a venda ("O que acha de conversarmos melhor amanhã?", "A loja está fechada neste momento"):
   sai da resposta de quem quer comprar. Pedido de 05/10/2026: mesmo com a loja fechada, a IA vai até o sim. */
const RX_ADIA = /(?<![\p{L}])(?:conversar\p{L}*\s+(?:melhor\s+)?amanh[ãa]|amanh[ãa]\s+(?:a\s+gente|conversamos|te\s+chamo|falamos|confirmamos)|loja\s+(?:est[áa]|t[áa])\s+fechada|quando\s+a\s+loja\s+abrir\s+(?:a\s+gente\s+)?(?:confirma|fecha|conversa))/iu;
export function tirarAdiamento(resposta: string[]): string[] {
  const FRASES = /(?:[^.!?\n]|[.!?](?=\d))+[.!?]*\s*(?:\p{Extended_Pictographic}️?\s*)*|\n/gu;
  return resposta
    .map((b) => (b.match(FRASES) ?? [b]).filter((f) => !RX_ADIA.test(f)).join("").trim())
    .filter((b) => /\p{L}/u.test(b));
}

export const PERGUNTA_SO_PARCELAS = "E em quantas vezes você gostaria de dividir? 😊";
export const PERGUNTA_SO_BANDEIRA = "E qual é a bandeira do cartão? 😊";
/** A loja já perguntou SÓ o que falta (a pergunta do sistema, sozinha) e o cliente seguiu sem responder: não pergunta de
 *  novo. Pergunta da IA com as duas coisas ("Em quantas vezes...? E qual é a bandeira?") não conta: o cliente que respondeu
 *  só "Visa" ainda tem que dizer as parcelas (Arine, 06/10/2026). */
export function jaPerguntouSoOQueFalta(ultimaDaLoja: string, falta: "parcelas" | "bandeira") {
  const t = ultimaDaLoja.trim();
  const perguntas = (t.match(/\?/g) ?? []).length;
  const alvo = falta === "parcelas" ? /e\s+em\s+quantas\s+vezes/iu : /e\s+qual\s+[ée]\s+a\s+bandeira/iu;
  return perguntas === 1 && alvo.test(t);
}

/* o cliente perguntou de ficha técnica (autonomia, bateria, motor, velocidade, peso, garantia...) */
const RX_PEDIU_FICHA = /(?<![a-z])(?:autonomia|bateria|motor|potencia|km|quilometr\w*|velocidade|carrega\w*|recarga|peso|kg|aguenta|suporta|garantia|ficha|detalhes?|especifica\w*|tamanho|aro|freio|roda|watts?)(?![a-z])/;
/* frase de ficha: autonomia, bateria, motor, potência, velocidade, carga, recarga */
const RX_FRASE_FICHA = /autonomia|bateria|motor|pot[êe]ncia|velocidade|recarga|carrega(?!mos)|l[íi]tio|suporta|aguenta|\d+\s*(?:W|V|Ah|km|kg)(?![\p{L}])|km\/h/iu;
/** Milton (12/10/2026): "quero a M6" ou "quanto custa a M6?" → o orçamento (preço, cor, pronta entrega) e a foto, numa
 *  mensagem só; a ficha (motor, bateria, autonomia) só se ele perguntar. Teste de 12/10/2026: a IA mandou motor,
 *  autonomia e bateria em 3 mensagens para quem só perguntou o preço. */
export function soOQuePerguntou(resposta: string[], textoCliente: string): string[] {
  if (RX_PEDIU_FICHA.test(semAcento(textoCliente))) return resposta;
  const r = resposta
    .map((b) => (/\n\s*[•\-]/.test(b) ? b : (b.match(RX_FRASES) ?? [b]).filter((f) => /R\$/.test(f) || !RX_FRASE_FICHA.test(f)).join("").trim()))
    .filter((b) => /\p{L}/u.test(b));
  /* sobrou pouco texto: vai junto, numa mensagem */
  const junto = r.join(" ");
  return r.length > 1 && junto.length <= 400 && !r.some((b) => /\n/.test(b)) ? [junto] : r;
}

/** Não aceitou a simulação ("ficou caro, não dá"): persuasão em vez de "vou levar pra gerência" (usuário, 12/10/2026:
 *  "lembrar da economia, oferecer outra quantidade de parcelas ou o Pix, oferecer uma moto mais em conta"). Uma
 *  mensagem, as saídas em lista e UMA pergunta. `maiorParcela`: a maior quantidade já simulada (21 = não oferece mais
 *  vezes). `maisEmConta`: modelo do mesmo tipo, mais barato e com unidade disponível. */
export function textoRecusouSimulacao(p: { nome: string | null; modelo: string | null; aVista: number | null; maiorParcela: number | null; maisEmConta: { nome: string; preco: number } | null }) {
  const voc = p.nome ? `, ${p.nome}` : "";
  const a = artigo(p.modelo);
  const opcoes = [
    p.aVista && p.modelo ? `• No *Pix ou dinheiro* ${a} *${p.modelo}* sai por ${brl(p.aVista)}, sem nenhuma taxa` : "• No *Pix ou dinheiro* sai sem nenhuma taxa",
    ...((p.maiorParcela ?? 0) < 21 ? ["• Dá pra simular em mais vezes, com a parcela menor (até 21 vezes)"] : []),
    ...(p.maisEmConta ? [`• Se preferir, tem ${artigo(p.maisEmConta.nome)} *${p.maisEmConta.nome}* por ${brl(p.maisEmConta.preco)}, também com pronta entrega`] : []),
  ];
  const eletrico = artigo(p.modelo) === "o" ? "o patinete elétrico" : "a moto elétrica";
  return `Entendo${voc}! Vamos achar um jeito que caiba no seu bolso 😊\n${opcoes.join("\n")}\nE lembra: com ${eletrico} você esquece a gasolina, e essa economia já ajuda a pagar a parcela. Qual dessas fica melhor pra você?`;
}
