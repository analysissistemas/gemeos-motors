/* O que o cliente quer, antes de oferecer qualquer coisa (pedido do dono, 02/10/2026: "quando ela fizer a
   abordagem, primeiro entender o que o cliente quer: talvez ele quer consultar uma garantia, um defeito,
   e ela já está oferecendo um produto"). Puro: sem banco. Quem usa é lib/ia/workflow/nos.ts.

   - assistencia: garantia, defeito, conserto, revisão, peça... A IA não oferece moto: entende o problema
     e passa para a assistência técnica da loja.
   - compra: falou de moto, modelo, preço, pagamento, estoque. Aí sim a IA apresenta as motos.
   - null: só cumprimentou ou só disse o nome. A IA pergunta o que ele precisa, sem falar de produto. */

import { RX_QUER_VISITAR } from "./agenda.ts";

export type Intencao = "compra" | "assistencia";

/* pós-venda sem dúvida: defeito, conserto, "comprei", "minha moto"... */
const RX_ASSISTENCIA =
  /(?<![\p{L}])(?:assist[êe]ncia|defeito|conserto|consertar|arrumar\s+(?:a\s+|minha\s+)?moto|quebr\p{L}*|problemas?|n[ãa]o\s+(?:liga|carrega|anda|funciona|acende|segura)|parou|desligando|barulho|travou|travando|furou|furado|reparo|devolu\p{L}*|reclama\p{L}*|esquentando|vazamento|(?<!nunca\s)comprei|minha\s+(?:moto|scooter|el[ée]trica|patinete))(?![\p{L}])/iu;
/* pode ser pergunta de quem vai comprar ("qual a garantia da T1?", "vem com carregador?"): só vale como
   assistência quando o cliente não está falando de compra */
const RX_ASSISTENCIA_TALVEZ = /(?<![\p{L}])(?:garantia|revis[ãa]o|manuten[çc][ãa]o|oficina|pe[çc]as?|carregador)(?![\p{L}])/iu;
/* "sem problema, pode ser terça", "tem problema se eu pagar no cartão?": não é defeito */
const RX_SEM_PROBLEMA =
  /(?<![\p{L}])(?:sem\s+problemas?|n[ãa]o\s+(?:tem|h[áa]|teria|vai\s+ter)\s+(?:nenhum\s+)?problemas?|nenhum\s+problema|problema\s+nenhum|tem\s+(?:algum\s+)?problema\s+(?:se|em|de|eu|pagar))(?![\p{L}])/giu;
const RX_COMPRA =
  /(?<![\p{L}])(?:motos?|scooters?|triciclo|comprar|compra|pre[çc]os?|valor(?:es)?|quanto\s+(?:custa|[ée]|sai|fica|t[áa])|modelos?|autonomia|cores?|pronta\s+entrega|estoque|dispon[íi]ve(?:l|is)|financ\p{L}*|parcel\p{L}*|cart[ãa]o|pix|[àa]\s+vista|test\s*drive|cat[áa]logo|or[çc]amento|proposta|el[ée]tricas?|cnh|ipva|emplac\p{L}*|acess[óo]rios?|capacete|ba[úu])(?![\p{L}])/iu;

const semAcento = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
const escapar = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** O texto cita alguma moto do catálogo pelo nome (palavra inteira: "AG08" não casa em "AG080"). */
function citaModelo(texto: string, nomesDeModelos: string[]) {
  const t = semAcento(texto);
  return nomesDeModelos.some((n) => {
    const nome = semAcento(n);
    return nome.length >= 2 && new RegExp(`(?<![\\p{L}\\p{N}])${escapar(nome)}(?![\\p{L}\\p{N}])`, "u").test(t);
  });
}

/** A intenção que o próprio texto do cliente mostra (assistência ganha de compra: "minha moto deu defeito"). */
export function intencaoDoTexto(texto: string, nomesDeModelos: string[] = []): Intencao | null {
  const t = texto.replace(RX_SEM_PROBLEMA, " ");
  if (RX_ASSISTENCIA.test(t)) return "assistencia";
  const compra = RX_COMPRA.test(t) || RX_QUER_VISITAR.test(t) || citaModelo(t, nomesDeModelos);
  if (!compra && RX_ASSISTENCIA_TALVEZ.test(t)) return "assistencia";
  return compra ? "compra" : null;
}

/** Pergunta aberta, sem empurrar produto: "Como posso te ajudar?", como o Milton abre (treinamento, fase 2). */
export const PERGUNTAS_INTENCAO = ["Como posso te ajudar?", "Me conta, como posso te ajudar?", "Em que posso te ajudar?"];

/* Frase que oferece produto (moto, modelo, preço, estoque, foto): sai enquanto não se sabe o que o cliente quer. */
const RX_FALA_DE_PRODUTO =
  /R\$|(?<![\p{L}])(?:modelos?|autonomia|pronta\s+entrega|estoque|scooters?|a\s+partir\s+de|motos?\s+el[ée]tricas?|cnh|ipva|emplacamento|cat[áa]logo|economi\p{L}*|bateria|km|velocidade|olha\s+ela)(?![\p{L}])/iu;
/* frase a frase; o ponto de "R$ 8.999,90" (ponto seguido de número) não encerra a frase */
const FRASES = /(?:[^.!?\n]|[.!?](?=\d))+[.!?]*\s*(?:\p{Extended_Pictographic}\u{FE0F}?\s*)*|\n/gu;

export function tirarOfertaDeProduto(bloco: string, nomesDeModelos: string[] = []): string {
  const frases = bloco.match(FRASES) ?? [bloco];
  return frases
    .filter((f) => !RX_FALA_DE_PRODUTO.test(f) && !citaModelo(f, nomesDeModelos))
    .join("")
    .trim();
}

/** O que a IA precisa saber antes de escrever. */
export function instrucaoDeIntencao(intencao: Intencao | null): string {
  if (intencao === "compra") return "";
  if (intencao === "assistencia")
    return `# O QUE O CLIENTE QUER
O cliente fala de assistência, garantia, defeito, peça ou reclamação. A venda para aqui: NÃO ofereça moto, preço nem foto. Deixe o cliente contar, mostre empatia de verdade, não discuta, não culpe o cliente e não use frase pronta. Entenda o problema (o que está acontecendo, qual é a moto e quando comprou — uma pergunta por vez). Quando entender, convide UMA vez a trazer a moto à loja para a assistência técnica avaliar (endereço e horário da base de conhecimento). Se ele disser que não pode vir ou mora longe, NÃO insista: diga que vai encaminhar o caso aos responsáveis para avaliarem a melhor forma de atendimento e combinarem os próximos passos com ele, e coloque transferir como true com o motivo "pós-venda: <resumo fiel do relato>". Cliente muito irritado: priorize passar para uma pessoa. Nunca prometa conserto, troca, reembolso ou prazo.`;
  return `# O QUE O CLIENTE QUER
Ainda não está claro o que o cliente quer (ele só cumprimentou ou disse o nome). NÃO fale de moto, modelo, preço, estoque nem foto. Primeiro entenda o que ele precisa: pode ser comprar uma moto, assistência técnica, garantia, um defeito, peça ou acessório. Faça UMA pergunta aberta: "Como posso te ajudar?". Não pergunte o nome do cliente.`;
}

/** No pós-venda, o cliente disse que não pode vir à loja: não insistir, passar para uma pessoa (Diretrizes, 04/10/2026). */
export const RX_NAO_PODE_VIR = /(?<![\p{L}])(moro longe|n[ãa]o (posso|consigo|vou|d[áa] pra|tenho como) (ir|vir|levar|perder)|sem tempo|n[ãa]o tenho tempo|longe (da|daí|dai|de vocês)|outra cidade)(?![\p{L}])/iu;
/** Cliente irritado no pós-venda: prioriza a pessoa. */
export const RX_IRRITADO = /(?<![\p{L}])(cansad[oa] disso|n[ãa]o resolvem|absurdo|palha[çc]ada|vergonha|procon|vou processar|p[ée]ssim[oa]|horr[íi]vel|descaso|ningu[ée]m resolve|enganad[oa])(?![\p{L}])/iu;
/** O cliente já disse O QUE está acontecendo com a moto ("não liga", "a bateria", "barulho no motor"), não só "estou com problema". */
export const RX_DETALHE_PROBLEMA =
  /(?<![\p{L}])(bateria|carreg\p{L}*|n[ãa]o\s+(?:liga|carrega|anda|funciona|acende|segura|freia|desliga)|parou|deslig\p{L}*|freio|pneu|motor|barulho|painel|display|luz|farol|seta|buzina|roda|corrente|chave|alarme|controle|quebr\p{L}*|vaz\p{L}*|trav\p{L}*|aceler\p{L}*|velocidade|autonomia|esquent\p{L}*|fur\p{L}*|ferrug\p{L}*|molhou|[áa]gua|banco|retrovisor|guid[ãa]o|suspens[ãa]o|amortecedor)(?![\p{L}])/iu;

/** Texto do sistema quando o pós-venda vai para uma pessoa (Diretrizes, 04/10/2026, cenário E): empatia, sem
 *  discutir, sem insistir para vir à loja, sem prometer conserto nem prazo, e sem "posso te ajudar com as motos?".
 *  `jaEncaminhou`: a loja já disse antes que o caso foi para os responsáveis (não repete a mesma frase). */
export function textoPosVenda(p: { nome: string | null; lojaAberta: boolean; jaEncaminhou: boolean; naoPodeVir: boolean; irritado: boolean; semDetalhe: boolean }): string {
  const n = p.nome ? `, ${p.nome}` : "";
  const abre = p.irritado || p.naoPodeVir ? (p.jaEncaminhou ? `Entendo${n}, e peço desculpas por isso 🙏` : `Entendo${n}, e sinto muito pelo transtorno 🙏`) : `Entendi${n} 🙏`;
  const longe = p.naoPodeVir ? " Sei que fica difícil vir até a loja." : "";
  const caso = p.jaEncaminhou
    ? p.lojaAberta
      ? " O seu caso já está com os responsáveis da assistência: eles vão avaliar a melhor forma de te atender e combinar os próximos passos com você por aqui."
      : " O seu caso já está anotado, com prioridade, para os responsáveis da assistência: assim que a loja abrir, eles avaliam a melhor forma de te atender e combinam os próximos passos com você por aqui."
    : p.lojaAberta
      ? " Vou passar o seu caso agora para os responsáveis da assistência: eles avaliam a melhor forma de te atender e combinam os próximos passos com você por aqui."
      : " Já deixei o seu caso anotado, com prioridade, para os responsáveis da assistência: assim que a loja abrir, eles avaliam a melhor forma de te atender e combinam os próximos passos com você por aqui.";
  const conta = p.semDetalhe ? "\nSe quiser, já me conta aqui o que está acontecendo com a moto, que fica tudo registrado para eles." : "";
  return `${abre}${longe}${caso}${conta}`;
}
