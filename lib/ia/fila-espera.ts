/* Fila de espera (dono, 18/10/2026: "quando o cliente mandar mensagem de um produto que não está em estoque, a IA
   começa a pegar o interesse, e quando eu cadastrar essa moto no estoque a IA lembra essa pessoa"). A IA diz que
   esgotou (com a previsão, se houver reposição), sugere a mais parecida que tem e pergunta se ele quer ser avisado.
   Só quem aceita entra na fila do aviso automático. Puro, sem banco. */

const norm = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
const escapar = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const artigo = (nome: string) => (/^\s*patinete/i.test(nome) ? "o" : "a");
const brl = (x: number) => `R$ ${x.toLocaleString("pt-BR", Number.isInteger(x) ? { maximumFractionDigits: 0 } : { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export type ModeloSemEstoque = { id: number; nome: string; tipo: string; preco: number | null; chegaEm: string | null };
export type ModeloComEstoque = { nome: string; tipo: string; preco: number | null };

/* "Quero ser avisado quando a X chegar" (botão do site), "me avisa quando chegar", "me chama quando tiver" */
const RX_PEDE_AVISO = /\b(?:quero ser avisad\w*|me avis\w*|avis\w* (?:quando|qnd|assim que)|me (?:chama|chame|fala|manda (?:mensagem|msg)) (?:quando|qnd|assim que) (?:chegar|tiver|voltar)|quando (?:chegar|tiver|voltar) me (?:avis\w*|chama|fala))\b/;
export const pediuAviso = (texto: string) => RX_PEDE_AVISO.test(norm(texto));

/** A loja acabou de perguntar se ele quer ser avisado (a resposta "sim" põe na fila). */
export const perguntouAviso = (ultimaDaLoja: string) => /quer que eu te avise aqui assim que/i.test(ultimaDaLoja);

/** O modelo sem estoque que o cliente citou nesta mensagem (palavra inteira; o pedaço com número também vale: "AG11"). */
export function citouSemEstoque(texto: string, modelos: ModeloSemEstoque[]): ModeloSemEstoque | null {
  const t = norm(texto);
  /* "tem a Tank?" (o cliente chama a TANK AG11 só de Tank): vale o pedaço com número e a palavra própria do nome */
  const GENERICOS = new Set(["moto", "motos", "patinete", "patinetes", "capacete", "gemeos", "motors", "eletrica", "eletrico", "retro", "aberto"]);
  const bate = (nome: string) => {
    const pedacos = [nome, ...nome.split(/\s+/).filter((p) => (p.length >= 2 && /\d/.test(p)) || (p.length >= 4 && !GENERICOS.has(norm(p))))].map(norm);
    return pedacos.some((p) => new RegExp(`(?<![\\p{L}\\p{N}])${escapar(p)}(?![\\p{L}\\p{N}])`, "u").test(t));
  };
  /* o nome mais longo primeiro ("Patinete 800W" antes de "800W") */
  return [...modelos].sort((a, b) => b.nome.length - a.nome.length).find((m) => bate(m.nome)) ?? null;
}

/** A mais parecida que tem: mesmo tipo, preço mais perto. */
export function maisParecida(m: ModeloSemEstoque, comEstoque: ModeloComEstoque[]): ModeloComEstoque | null {
  const mesmas = comEstoque.filter((x) => x.tipo === m.tipo && x.preco);
  if (!mesmas.length) return null;
  if (!m.preco) return mesmas[0];
  return [...mesmas].sort((a, b) => Math.abs(a.preco! - m.preco!) - Math.abs(b.preco! - m.preco!))[0];
}

/** Esgotou: a previsão (se houver), a mais parecida com pronta entrega e UMA pergunta: quer ser avisado? */
export function textoEsgotado(p: { nome: string | null; modelo: ModeloSemEstoque; parecida: ModeloComEstoque | null }) {
  const a = artigo(p.modelo.nome);
  const A = a.toUpperCase();
  const abre = `${p.nome ? `${p.nome}, ${a}` : A} *${p.modelo.nome}* esgotou no momento 😕`;
  const chega = p.modelo.chegaEm ? ` A próxima remessa tem previsão de chegar dia ${p.modelo.chegaEm}.` : "";
  const outra = p.parecida ? ` Enquanto isso, ${artigo(p.parecida.nome) === "o" ? "o mais parecido" : "a mais parecida"} com pronta entrega é ${artigo(p.parecida.nome)} *${p.parecida.nome}*${p.parecida.preco ? `, por ${brl(p.parecida.preco)}` : ""}.` : "";
  return `${abre}${chega}${outra}\n\nQuer que eu te avise aqui assim que ${a} *${p.modelo.nome}* chegar?`;
}

/** Entrou na fila: confirma sem prometer data que não existe. */
export function textoNaFila(p: { nome: string | null; modelo: ModeloSemEstoque }) {
  const a = artigo(p.modelo.nome);
  return `Combinado${p.nome ? `, ${p.nome}` : ""}! Você está na lista de espera ${a === "o" ? "do" : "da"} *${p.modelo.nome}* ✅ Assim que ${a === "o" ? "ele" : "ela"} chegar, eu te aviso aqui${p.modelo.chegaEm ? ` (a previsão é dia ${p.modelo.chegaEm})` : ""}. Se quiser conhecer outra enquanto isso, é só me falar 😊`;
}

/** O aviso quando chega (texto livre, dentro das 24 h do WhatsApp). */
export function textoChegou(p: { nome: string | null; modelo: string }) {
  const a = artigo(p.modelo);
  return `Oi${p.nome ? `, ${p.nome}` : ""}! Boa notícia: ${a} *${p.modelo}* que você pediu chegou na Gêmeos Motors 🛵 Quer que eu separe ${a === "o" ? "o seu" : "a sua"}?`;
}

/** O modelo da Meta para avisar fora das 24 h: {{1}} o nome, {{2}} a moto. */
export const MODELO_AVISO_CHEGADA = {
  nome: "aviso_chegada",
  idioma: "pt_BR",
  definicao: {
    name: "aviso_chegada",
    language: "pt_BR",
    category: "UTILITY",
    components: [
      {
        type: "BODY",
        text: "Oi, {{1}}! Você pediu para ser avisado: a {{2}} chegou na Gêmeos Motors. Quer que a gente separe a sua? É só responder esta mensagem.",
        example: { body_text: [["Ana", "TANK AG11"]] },
      },
    ],
  },
} as const;
