/* Venda facilitada com troca (dono, 17/10/2026: "a IA está dizendo que não pega moto como entrada na troca e a Gêmeos
   faz isso sim... tem que passar o modelo, marca, ano, km rodado, fotos para a equipe avaliar e dizer o valor"; e
   "não só moto, mas carro, iPhone, JBL ou similares"). O cliente quer dar algo como parte do pagamento (troca) ou
   vender para a loja (compra): a IA pede os dados certos para aquele tipo de item e passa na hora para um vendedor.
   Ela nunca dá valor nem recusa. Puro, sem banco. */

export type TipoAvaliacao = "troca" | "compra";
export type ItemAvaliacao = "moto" | "carro" | "celular" | "outro";
export type PedidoAvaliacao = { tipo: TipoAvaliacao; item: ItemAvaliacao };

const norm = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/\s+/g, " ").trim();

/* o que o cliente tem; celular antes de moto ("moto g", "moto e" são celulares) */
const RX_CELULAR = /\b(?:iphone|celular|smartphone|samsung|galaxy|xiaomi|redmi|poco|motorola|moto\s?[geg]\d*|ipad|tablet|apple\s?watch)\b/;
const RX_MOTO =
  /\b(?:motos?|motinha|moto\s?cicleta|scooter|cg|titan|fan|biz|pop|bros|xre|lander|factor|fazer|twister|tornado|cb\s?\d*|pcx|nmax|elite|lead|neo|crosser|start|ybr|xtz|burgman|jet|shineray|haojue|dafra|honda|yamaha|suzuki|kawasaki|ninja|bmw|triumph|harley|\d{2,4}\s?cc|cilindradas?)\b/;
const RX_CARRO =
  /\b(?:carros?|automovel|gol|uno|palio|celta|onix|prisma|hb20|corsa|fiesta|sandero|logan|civic|corolla|fox|voyage|saveiro|strada|toro|hilux|s10|ranger|fiat|chevrolet|volkswagen|vw|ford|toyota|hyundai|renault|nissan|jeep|caminhonete|picape|pick\s?up)\b/;
const RX_OUTRO =
  /\b(?:jbl|caixa\s+de\s+som|caixinha|som\s+automotivo|notebook|computador|pc\s+gamer|playstation|ps[345]|xbox|nintendo|video\s?game|tv|televisao|smart\s?tv|relogio|smartwatch|drone|bicicleta|bike|patinete|camera|geladeira|ar\s+condicionado|aparelho)\b/;

export function itemDoTexto(texto: string): ItemAvaliacao | null {
  const t = norm(texto);
  if (RX_CELULAR.test(t)) return "celular";
  if (RX_CARRO.test(t)) return "carro";
  if (RX_MOTO.test(t)) return "moto";
  if (RX_OUTRO.test(t)) return "outro";
  return null;
}

/* troca de peça, de cor, de horário, de bateria, na garantia: não é dar algo na troca */
const RX_TROCA_OUTRA =
  /\btroc\w*\s+(?:de|a|o|da|do|na|no)?\s*(?:cor|horario|hora|dia|data|bateria|peca|pneu|oleo|camara|pastilha|garantia|carregador|modelo|endereco|numero|ideia)\b|\b(?:em|na)\s+troca\s+(?:da|do|de)\s+(?:bateria|peca|pneu|garantia)\b/;
const RX_TROCA_GERAL =
  /\b(?:aceita\w*|faz|fazem|faria|trabalha\w*\s+com|tem|rola|pega\w*)\s+(?:uma\s+|a\s+|com\s+)?troca\b|\b(?:pega\w*|aceita\w*|recebe\w*|dar|dou|daria|da\s+pra\s+dar|botar|colocar|entra\w*)\b.{0,40}\b(?:de|como|na|pra)\s+entrada\b|\b(?:de|como)\s+entrada\b.{0,30}\b(?:pega\w*|aceita\w*)\b|\babat\w*\b|\bcomo\s+parte\s+do\s+pagamento\b|\bparte\s+do\s+pagamento\b|\bvenda\s+facilitada\b/;
const RX_TROCA = /\b(?:troca|trocar|troco|trocaria|trocam|trocaram)\b/;
const RX_ENTRADA_COM_ITEM = /\b(?:pega\w*|aceita\w*|recebe\w*|dar|dou|daria|botar|colocar)\b.{0,50}\b(?:entrada|troca)\b/;
/* "posso trocar a moto se der defeito?": é garantia, não troca de entrada */
const RX_DEFEITO = /\b(?:defeit\w*|garantia|problema\w*|quebr\w*|nao\s+(?:liga|funciona|carrega|gostar|gostei)|arrependi\w*|devolv\w*)\b/;
/* a loja comprar o que ele tem */
const RX_LOJA_COMPRA = /\b(?:voces|vcs|vc|voce|a\s+loja|tu)\s+(?:tambem\s+)?(?:compra|compram|compraria|comprariam|comprar)\b|\bcompra\w*\s+(?:moto|carro|celular|iphone)\s+usad\w*/;
const RX_QUERO_VENDER =
  /\b(?:quero|queria|to|tou|estou|pretendo|preciso|gostaria\s+de|tenho\s+interesse\s+em|era\s+so)\s+(?:de\s+)?vend(?:er|endo|a)\b|\bvende-se\b|\bto\s+vendendo\b|\bvenda\s+mesmo\b|\bso\s+vender\b/;

/** O cliente quer dar algo na troca ou vender para a loja; null se não é isso. `antes`: o que ele já disse antes. */
export function pedidoDeAvaliacao(texto: string, antes = ""): PedidoAvaliacao | null {
  const t = norm(texto);
  const tudo = norm(`${antes}\n${texto}`);
  const item = itemDoTexto(t) ?? itemDoTexto(tudo);
  const semOutra = t.replace(RX_TROCA_OUTRA, " ");
  const troca = RX_TROCA_GERAL.test(semOutra) || (RX_TROCA.test(semOutra) && !!itemDoTexto(semOutra) && !RX_DEFEITO.test(semOutra)) || (RX_ENTRADA_COM_ITEM.test(semOutra) && !!item);
  if (troca) return { tipo: "troca", item: item ?? "outro" };
  const compra = (RX_LOJA_COMPRA.test(t) && !!item) || (RX_QUERO_VENDER.test(t) && !!item);
  if (compra) return { tipo: "compra", item: item ?? "outro" };
  return null;
}

const DADOS: Record<ItemAvaliacao, string[]> = {
  moto: ["Marca e modelo", "Ano", "Km rodado", "Está quitada e com o documento em dia?", "Tem algum detalhe ou conserto pra fazer?", "Quanto você quer nela?", "Fotos: frente, lateral, traseira e o painel mostrando o km"],
  carro: ["Marca, modelo e versão", "Ano", "Km rodado", "Está quitado e com o documento em dia?", "Tem algum detalhe na lataria ou na mecânica?", "Quanto você quer nele?", "Fotos: frente, traseira, laterais, por dentro e o painel mostrando o km"],
  celular: ["Modelo e quantos GB", "Saúde da bateria (no iPhone: Ajustes → Bateria)", "Tem algum risco, trinco ou defeito?", "Tem caixa, nota fiscal e carregador?", "Quanto você quer nele?", "Fotos: frente, verso e a tela ligada"],
  outro: ["O que é, marca e modelo", "Há quanto tempo você tem e se tem algum defeito", "Tem caixa, nota fiscal e acessórios?", "Quanto você quer nele?", "Fotos do produto"],
};
const DO_ITEM: Record<ItemAvaliacao, string> = { moto: "a sua moto", carro: "o seu carro", celular: "o seu celular", outro: "o seu produto" };
export const ROTULO_ITEM: Record<ItemAvaliacao, string> = { moto: "moto", carro: "carro", celular: "celular", outro: "produto" };

/** Texto do sistema: aceita, pede os dados daquele tipo de item e diz quando a equipe responde. Sem valor. */
export function textoPedidoAvaliacao(p: PedidoAvaliacao & { nome: string | null; lojaAberta: boolean }) {
  const frase = p.tipo === "troca" ? `aqui a gente faz venda facilitada com troca: ${DO_ITEM[p.item]} pode entrar como parte do pagamento 😊` : `a nossa equipe avalia ${DO_ITEM[p.item]} pra compra, sim 😊`;
  const abre = p.nome ? `${p.nome}, ${frase}` : frase[0].toUpperCase() + frase.slice(1);
  const lista = DADOS[p.item].map((d) => `• ${d}`).join("\n");
  const fim = p.lojaAberta ? "Com isso, um vendedor avalia e te passa o valor por aqui." : "A loja já fechou por hoje, mas pode mandar: assim que abrir, um vendedor avalia e te passa o valor por aqui.";
  return `${abre}\n\nPra nossa equipe avaliar, me manda por aqui:\n${lista}\n\n${fim}`;
}

/** A loja já pediu os dados da avaliação nesta conversa (não pede de novo). */
export const jaPediuAvaliacao = (historico: string) => /Pra nossa equipe avaliar, me manda por aqui/.test(historico);

/** Motivo da transferência, para a anotação e a tarefa do vendedor. */
export function motivoAvaliacao(p: PedidoAvaliacao & { modeloDeInteresse: string | null; relato: string }) {
  const item = ROTULO_ITEM[p.item];
  return p.tipo === "troca"
    ? `AVALIAR ${item.toUpperCase()} NA TROCA: o cliente quer dar ${item === "moto" ? "a moto" : `o ${item}`} dele como parte do pagamento${p.modeloDeInteresse ? ` da ${p.modeloDeInteresse}` : ""}. A IA pediu os dados e as fotos: avalie e passe o valor. O cliente escreveu: "${p.relato}"`
    : `COMPRA DE ${item.toUpperCase()}: o cliente quer vender ${item === "moto" ? "a moto" : `o ${item}`} dele para a loja. A IA pediu os dados e as fotos: avalie e passe o valor. O cliente escreveu: "${p.relato}"`;
}
