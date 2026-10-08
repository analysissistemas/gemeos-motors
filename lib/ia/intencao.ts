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
/* revisão de 06/10/2026: patinete, bicicleta, "motinha" e os apelidos ensinados pelo dono ("pneu largo", "Motoqueiro
   Fantasma" = X Gêmeos) também são compra; sem eles, a conversa caía em "recado" e a IA parava de vender */
const RX_COMPRA =
  /(?<![\p{L}])(?:motos?|mot(?:inha|oquinha|ozinha|oca)s?|scooters?|patinetes?|bicicletas?|bikes?|pneu\s+(?:largo|gordo)|pneuz[ãa]o|motoqueiro\s+fantasma|triciclo|comprar|compra|pre[çc]os?|valor(?:es)?|quanto\s+(?:custa|[ée]|sai|fica|t[áa])|modelos?|autonomia|cores?|pronta\s+entrega|estoque|dispon[íi]ve(?:l|is)|financ\p{L}*|parcel\p{L}*|cart[ãa]o|pix|[àa]\s+vista|test\s*drive|cat[áa]logo|or[çc]amento|proposta|el[ée]tricas?|cnh|ipva|emplac\p{L}*|acess[óo]rios?|capacete|ba[úu])(?![\p{L}])/iu;

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
Ainda não está claro o que o cliente quer (ele só cumprimentou ou disse o nome). NÃO fale de moto, modelo, preço, estoque nem foto. Primeiro entenda o que ele precisa: pode ser comprar uma moto, assistência técnica, garantia, um defeito, peça ou acessório. Faça UMA pergunta aberta: "Como posso te ajudar?". O nome do cliente o sistema pergunta na abertura: você não pergunta.
Se o cliente falar de outro assunto (recado para alguém da loja, assunto pessoal, sorteio, brincadeira ou promoção da loja, trabalho, fornecedor, cobrança) ou pedir para falar com alguém: NÃO diga o que a loja faz ou deixa de fazer, NÃO recuse e NÃO puxe para moto. Diga que vai passar o recado para a equipe e coloque transferir como true com o motivo "recado: <resumo fiel do que ele pediu>".`;
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

/** O cliente quer falar com alguém ou mandar recado ("quero falar com o moço", "fala pra ele que..."). Teste real
 *  de 05/10/2026 (Dinho): pediu para falar com o dono sobre um presente e a IA respondeu "Em que posso te ajudar?". */
export const RX_RECADO =
  /(?<![\p{L}])(?:(?:quero|queria|preciso|posso|gostaria de)\s+falar\s+com|fala\s+(?:pra|para|com)\s+(?:ele|ela|o\s|a\s)|diz\s+(?:pra|para)\s+(?:ele|ela)|avisa\s+(?:pra|para|a|o)\s|manda\s+(?:um\s+)?recado|deixar\s+(?:um\s+)?recado|(?:um|o|esse|meu)\s+recado|passa\s+(?:pra|para)\s+(?:ele|ela|o\s+dono|o\s+gerente)|com\s+o\s+dono|com\s+o\s+gerente|com\s+o\s+respons[áa]vel)(?![\p{L}])/iu;

/** Texto do sistema quando o assunto não é compra nem assistência: passa o recado, sem insistir em vender e sem
 *  repetir "Como posso te ajudar?". `jaEncaminhou`: o recado já foi passado antes nesta conversa. */
export function textoRecado(p: { nome: string | null; lojaAberta: boolean; jaEncaminhou: boolean }): string {
  const n = p.nome ? `, ${p.nome}` : "";
  if (p.jaEncaminhou) return `Anotado${n}! Já juntei isso ao seu recado para a equipe 🙏`;
  return p.lojaAberta
    ? `Entendi${n}! Vou passar o seu recado agora para a nossa equipe, e o responsável fala com você por aqui 🙏`
    : `Entendi${n}! Vou passar o seu recado para a nossa equipe, e o responsável fala com você por aqui assim que a loja abrir 🙏`;
}

/** Mensagem pronta dos botões do site ("Olá! Vim pelo site da Gêmeos Motors e quero falar com um consultor."):
 *  não é pedido de falar com uma pessoa — o consultor é o Milton. Conversa real de 06/10/2026 (Any): a IA leu
 *  "quero falar com" e passou como recado para a equipe. */
export const RX_ABERTURA_SITE = /vim\s+pelo\s+site[^.!?\n]*?(?:e\s+)?quero\s+falar\s+com\s+(?:um\s+consultor|um\s+vendedor|voc[êe]s|a\s+loja|algu[ée]m)[.!]?/giu;
export const veioDoSite = (texto: string) => new RegExp(RX_ABERTURA_SITE.source, "iu").test(texto);
/** O texto do cliente sem a frase pronta do site (para as regras de recado e de pedir uma pessoa). */
export const semAberturaDoSite = (texto: string) => texto.replace(RX_ABERTURA_SITE, " ").replace(/\s+/g, " ").trim();

/** Instrução de quem chegou pelo botão do site. Damarys (07/10/2026) mandou a frase do site + "Vcs tem disponível" +
 *  "Valor", e a IA só perguntou "como posso te ajudar?" duas vezes. Perguntou algo além da frase pronta: responde. */
export function instrucaoDoSite(texto: string): string {
  if (!veioDoSite(texto)) return "";
  const resto = semAberturaDoSite(texto).replace(/^(?:ol[áa]|oi+|bom\s+dia|boa\s+tarde|boa\s+noite)[!.,\s]*/iu, "").trim();
  const base = 'O cliente chegou pelo botão do site, com a mensagem automática "Vim pelo site da Gêmeos Motors e quero falar com um consultor". O consultor é VOCÊ: NÃO transfira por causa disso e não diga que vai passar para a equipe.';
  if (!/\p{L}{2,}/u.test(resto)) return `${base} Atenda e pergunte o que ele procura.\n\n`;
  return `${base} Além da frase pronta ele perguntou: "${resto.slice(0, 200)}". RESPONDA isso agora. Perguntou se tem disponível, valor ou preço sem dizer o modelo: liste as motos EM ESTOQUE com o preço de cada (do catálogo) e pergunte qual chamou mais a atenção. NÃO pergunte "como posso te ajudar?" nem "o que você procura?": ele já disse.\n\n`;
}

/* Triciclo (06/10/2026): a IA chamou a T3 Retrô (duas rodas) de triciclo. O dono confirmou que o MM3 tem TRÊS rodas.
   Triciclo é só o modelo cuja descrição no catálogo diz "triciclo" ou "três rodas" (hoje o MM3); nenhum outro.
   `triciclos` = nomes desses modelos com unidade no estoque. */
const RX_TRICICLO = /(?<![\p{L}])(?:tric[ií]clos?|tr[êe]s\s+rodas|3\s+rodas)(?![\p{L}])/iu;
export const pediuTriciclo = (texto: string) => RX_TRICICLO.test(texto);
export function instrucaoTriciclo(texto: string, triciclos: string[] = []): string {
  if (!pediuTriciclo(texto)) return "";
  if (triciclos.length)
    return `# TRICICLO
O cliente falou de triciclo (três rodas). O triciclo da loja é ${triciclos.map((n) => `*${n}*`).join(" e ")} (três rodas): apresente ${triciclos.length > 1 ? "esses" : "ele"} com a ficha do catálogo e o preço por último. Nenhuma outra moto é triciclo (o nome "T3" NÃO quer dizer três rodas).\n\n`;
  return `# TRICICLO
O cliente falou de triciclo (três rodas). No momento a loja NÃO tem triciclo disponível no estoque: as motos disponíveis são de DUAS rodas. NÃO diga "temos sim" e NÃO chame nenhuma moto de triciclo. Diga com naturalidade que no momento não tem triciclo disponível e apresente 2 ou 3 opções do estoque que combinam com o que ele procura (conforto, carga, autonomia), com o preço por último.\n\n`;
}
/** Rede de segurança: "triciclo" numa frase que não nega e não fala do triciclo de verdade vira "moto". */
export function tirarTriciclo(resposta: string[], triciclos: string[] = []): string[] {
  const NEGA = /(?<![\p{L}])n[ãa]o\s+(?:temos|tem|trabalhamos|vendemos|h[áa]|fazemos)/iu;
  const doTriciclo = (f: string) => triciclos.some((n) => new RegExp(`(?<![\\p{L}\\p{N}])${n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\p{L}\\p{N}])`, "iu").test(f));
  return resposta.map((b) => b.replace(/[^.!?\n]+[.!?]*/gu, (f) => (RX_TRICICLO.test(f) && !NEGA.test(f) && !doTriciclo(f) ? f.replace(/(?<![\p{L}])(o|um)\s+(tric[ií]clos?\s+el[ée]tricos?|tric[ií]clos?)/giu, (_m, art: string, t: string) => `${art.toLowerCase() === "o" ? "a" : "uma"} ${/el[ée]trico/i.test(t) ? "moto elétrica" : "moto"}`).replace(/tric[ií]clos?\s+el[ée]tricos?/giu, "moto elétrica").replace(/tric[ií]clos?/giu, "moto").replace(/(?:de\s+)?(?:tr[êe]s|3)\s+rodas/giu, "de duas rodas") : f)));
}

/* Cliente reclamando do ATENDIMENTO da IA (conversa real de 06/10/2026, Arine: "Não veio foto", "Só veio a foto da T3
   retrô", "Acho que tô falando com atendente virtual. Depois passo aí pessoalmente"). Não é pergunta "é robô?": é queixa.
   Pede desculpas e chama uma pessoa da equipe, em vez de seguir insistindo. */
const RX_QUEIXA_ENVIO = /(?<![\p{L}])(?:n[ãa]o\s+(?:veio|chegou|apareceu|abriu)|s[óo]\s+(?:veio|chegou|mandou|mandaram)|veio\s+(?:errad[oa]|outr[ao])|mandou\s+(?:errad[oa]|outr[ao])|n[ãa]o\s+(?:[ée]|era)\s+(?:essa|esse|isso)|n[ãa]o\s+foi\s+(?:isso|essa|o\s+que\s+eu\s+pedi)|j[áa]\s+pedi|pedi\s+(?:outra|outro|a\s+foto)|voc[êe]\s+n[ãa]o\s+(?:entende|entendeu)|n[ãa]o\s+(?:me\s+)?entendeu)(?![\p{L}])/iu;
const RX_DESCONFIOU = /(?<![\p{L}])(?:acho|parece|t[ôo]\s+vendo|percebi|deve\s+ser|s[óo]\s+pode\s+ser)[^.!?\n]{0,40}(?:atendente\s+virtual|rob[ôo]|autom[áa]tic[oa]|m[áa]quina|ia)(?![\p{L}])|(?:depois\s+(?:eu\s+)?passo\s+a[ií]|deixa\s+pra\s+l[áa]|desisto|esquece)/iu;
export const reclamouDoAtendimento = (texto: string) => RX_QUEIXA_ENVIO.test(texto) || RX_DESCONFIOU.test(texto);

export function textoQueixa(p: { nome: string | null; lojaAberta: boolean }): string {
  const n = p.nome ? `, ${p.nome}` : "";
  return p.lojaAberta
    ? `Desculpa pela confusão${n} 🙏 Vou chamar agora alguém da nossa equipe para continuar com você por aqui e te mandar certinho o que você pediu.`
    : `Desculpa pela confusão${n} 🙏 Já deixei o seu pedido anotado com prioridade, e assim que a loja abrir alguém da nossa equipe te manda certinho o que você pediu.`;
}
