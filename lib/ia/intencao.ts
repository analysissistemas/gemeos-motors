/* O que o cliente quer, antes de oferecer qualquer coisa (pedido do dono, 02/10/2026: "quando ela fizer a
   abordagem, primeiro entender o que o cliente quer: talvez ele quer consultar uma garantia, um defeito,
   e ela já está oferecendo um produto"). Puro: sem banco. Quem usa é lib/ia/workflow/nos.ts.

   - assistencia: garantia, defeito, conserto, revisão, peça... A IA não oferece moto: entende o problema
     e passa para a assistência técnica da loja.
   - compra: falou de moto, modelo, preço, pagamento, estoque. Aí sim a IA apresenta as motos.
   - null: só cumprimentou ou só disse o nome. A IA pergunta o que ele precisa, sem falar de produto. */

export type Intencao = "compra" | "assistencia";

const RX_ASSISTENCIA =
  /(?<![\p{L}])(?:assist[êe]ncia|garantia|defeito|conserto|consertar|arrumar|quebr\p{L}*|problema|n[ãa]o\s+(?:liga|carrega|anda|funciona|acende|segura)|parou|desligando|revis[ãa]o|manuten[çc][ãa]o|oficina|pe[çc]as?|barulho|travou|travando|furou|furado|reparo|devolu\p{L}*|reclama\p{L}*|carregador|esquentando|vazamento)(?![\p{L}])/iu;
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
  if (RX_ASSISTENCIA.test(texto)) return "assistencia";
  if (RX_COMPRA.test(texto) || citaModelo(texto, nomesDeModelos)) return "compra";
  return null;
}

/** Pergunta aberta: o que o cliente precisa, sem empurrar produto (e sem a frase de robô "Como posso te ajudar hoje?"). */
export const PERGUNTAS_INTENCAO = [
  "Me conta: você está procurando uma moto elétrica ou é sobre assistência, garantia ou outra coisa? 😊",
  "Em que eu posso te ajudar? Pode ser compra de moto, assistência técnica, garantia, peça ou acessório 🙂",
  "O que te trouxe aqui hoje? É sobre uma moto nova, assistência, garantia ou outro assunto? 😊",
];

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
O cliente fala de assistência, garantia, defeito ou peça. NÃO ofereça moto, preço nem foto. Mostre empatia, entenda o problema (o que está acontecendo, qual é a moto e quando comprou — uma pergunta por vez) e diga que a assistência técnica da própria loja vai cuidar. Quando já souber o problema, coloque transferir como true com o motivo "assistência: <resumo do problema>".`;
  return `# O QUE O CLIENTE QUER
Ainda não está claro o que o cliente quer (ele só cumprimentou ou disse o nome). NÃO fale de moto, modelo, preço, estoque nem foto. Primeiro entenda o que ele precisa: pode ser comprar uma moto, assistência técnica, garantia, um defeito, peça ou acessório. Faça UMA pergunta aberta sobre isso (se ainda não sabe o nome, a pergunta é o nome).`;
}
