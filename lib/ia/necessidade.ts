/* Qualificação consultiva (dono, 18/10/2026: "a IA tem que ter uma qualificação fenomenal... ela será o diferencial";
   "primeiro a recepção calorosa, depois a qualificação, afunilar o que o cliente precisa, para aí sim a curadoria do
   estoque personalizada"). Ensinada com as conversas reais (61 conversas, 18/10/2026): o valor é a 1ª coisa que o
   cliente quer saber (35 de 60), o peso que a moto aguenta aparece em 12, o uso vem como "na cidade, 20 km",
   "pra entregas", "pra idoso"; o vendedor responde faixa com as motos dela ("tenho várias abaixo de 10.000").

   O sistema lê do que o cliente escreve: uso, km por dia, garupa/carga, peso, faixa de valor e tipo. Escolhe a próxima
   pergunta (uma por vez, só o que falta) e, com o suficiente, indica no máximo 2 motos do estoque com o porquê de
   cada uma. Puro, sem banco. */

export type Uso = "trabalho" | "entregas" | "cidade" | "passeio" | "outra_pessoa";
export type Necessidade = {
  uso: Uso | null;
  kmDia: number | null;
  garupa: boolean | null;
  carga: boolean | null;
  pesoKg: number | null;
  faixaAte: number | null;
  faixaDe: number | null;
  maisBarata: boolean;
  tipo: "moto" | "triciclo" | "patinete" | null;
};
export type ChavePergunta = "uso" | "km" | "garupa" | "faixa";

export const NECESSIDADE_VAZIA: Necessidade = { uso: null, kmDia: null, garupa: null, carga: null, pesoKg: null, faixaAte: null, faixaDe: null, maisBarata: false, tipo: null };

const norm = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/\s+/g, " ").trim();

/** Lê a necessidade guardada na memória (JSON); qualquer coisa estranha vira vazia. */
export function lerNecessidade(guardada: string | null | undefined): Necessidade {
  if (!guardada) return { ...NECESSIDADE_VAZIA };
  try {
    return { ...NECESSIDADE_VAZIA, ...(JSON.parse(guardada) as Partial<Necessidade>) };
  } catch {
    return { ...NECESSIDADE_VAZIA };
  }
}

/* ---------------- o que a loja acabou de perguntar ---------------- */
const RX_PERGUNTOU: Record<ChavePergunta, RegExp> = {
  uso: /vai usar|usar (?:a moto |ela |o patinete )?(?:mais )?(?:pra|para)|(?:pra|para) que (?:voce )?(?:vai|quer)|mais pra trabalh|pro dia a dia na cidade ou/,
  km: /quantos (?:km|quilometros)|roda mais ou menos/,
  garupa: /garupa|levar alguem|leva alguem|levar carga|usar bau/,
  faixa: /faixa de valor|pensa em investir|quer investir|pretende investir|dentro do seu bolso/,
};
export function perguntaPendente(ultimaDaLoja: string): ChavePergunta | null {
  const t = norm(ultimaDaLoja);
  const q = (t.match(/[^.!?\n]*\?/g) ?? []).join(" ");
  for (const k of ["faixa", "garupa", "km", "uso"] as ChavePergunta[]) if (RX_PERGUNTOU[k].test(q)) return k;
  return null;
}

/* ---------------- leitura do que o cliente escreveu ---------------- */
const RX_USO: [Uso, RegExp][] = [
  ["entregas", /\b(?:entregas?|entregador|delivery|ifood|i food|motoboy|rappi|99\s?food|uber\s?eats|fazer frete|frete)\b/],
  ["outra_pessoa", /\b(?:pra|para|pro) (?:a |o )?(?:minha|meu) (?:filh\w*|espos\w*|mulher|marido|mae|pai|av[oó]\w*|vo|irm\w*|namorad\w*|sobrinh\w*|net\w*|sogr\w*)\b|\bpra (?:um |uma )?idos\w*|\bpresente\b/],
  ["trabalho", /\b(?:trabalh\w*|servico|emprego|firma|fabrica|usina|trampo|batente|ir e voltar|expediente)\b/],
  ["passeio", /\b(?:passe(?:io|ar)|lazer|fim de semana|final de semana|curtir|dar uma volta|dar um role)\b/],
  ["cidade", /\b(?:dia a dia|na cidade|pela cidade|mercado|feira|faculdade|escola|colegio|resolver (?:as )?coisas|uso pessoal|locomo\w*|me locomover)\b/],
];
const RX_GARUPA_SIM = /\bgarupa\b(?!\s*n)|\blev(?:ar|o|a|amos) (?:o |a |meu |minha |minhas |meus |um |uma )?(?:filh\w*|espos\w*|mulher|marido|namorad\w*|crianc\w*|menin\w*|mae|pai|alguem|pessoa|carona)|\bduas pessoas\b|\b2 pessoas\b|\bpassageir\w*|\bcom (?:minha|meu) (?:espos\w*|mulher|marido|filh\w*)\b/;
const RX_GARUPA_NAO = /\b(?:so eu|sozinh\w*|nao levo (?:ninguem|garupa)|sem garupa|ninguem na garupa|apenas eu|somente eu)\b/;
const RX_CARGA = /\b(?:ba[uú]|bagageiro|carga|mercadoria|compras|botij\w*|gas|caixas?|isopor|encomendas?)\b/;
const RX_PESO = /(\d{2,3})\s*(?:kg|quilos?|kilos?)\b/;
const RX_PESADO = /\b(?:obes\w*|acima do peso|sou (?:bem |muito )?(?:pesad\w*|gord\w*|grande|fort\w*))\b/;
const RX_MAIS_BARATA = /\b(?:mais (?:barat\w*|em conta|economic\w*)|baratinh\w*|menor (?:valor|preco)|mais simples)\b/;
const RX_PATINETE = /\bpatinete/;
const RX_TRICICLO = /\b(?:triciclo|tres rodas|3 rodas)\b/;

/** "7 mil" → 7000; "7.500" → 7500; "10k" → 10000; "7" sozinho (resposta da faixa) → 7000. */
function valor(txt: string, soNumeroEhMil = false): number | null {
  const m = txt.match(/(\d{1,3}(?:[.,]\d{3})+|\d+(?:,\d+)?)\s*(mil|k(?![a-z]))?/);
  if (!m) return null;
  let n = Number(m[1].replace(/\.(?=\d{3})/g, "").replace(",", "."));
  if (m[2] || (soNumeroEhMil && n < 100)) n *= 1000;
  return n >= 1000 && n <= 200000 ? Math.round(n) : null;
}

/** Faixa de valor que o cliente disse ("até 7 mil", "abaixo de 10k", "entre 7 e 10", "acima de 10 mil"). */
export function faixaDoTexto(texto: string, respondendoFaixa = false): { de: number | null; ate: number | null } | null {
  const t = norm(texto).replace(/r\$\s*/g, "");
  const entre = t.match(/\bentre\s+(\d[\d.,]*)\s*(?:mil|k(?![a-z]))?\s+e\s+(\d[\d.,]*)\s*(mil|k(?![a-z]))?/);
  if (entre) {
    const ate = valor(`${entre[2]} ${entre[3] ?? ""}`, true);
    const de = valor(`${entre[1]} ${entre[3] ?? ""}`, true);
    if (de && ate) return { de, ate };
  }
  /* todas as ocorrências: "rodo uns 25 km ... até uns 12 mil" (Simulador, 18/10/2026: parava no "uns 25" do km) */
  for (const acima of t.matchAll(/\b(?:acima|mais)\s+de\s+(\d[\d.,]*\s*(?:mil|k(?![a-z]))?)/g)) {
    if (!respondendoFaixa && !/mil|k|\d{4}/.test(acima[1])) continue;
    const de = valor(acima[1], true);
    if (de) return { de, ate: null };
  }
  for (const ate of t.matchAll(/\b(?:ate|abaixo d[eo]s?|menos d[eo]s?|no maximo|max|uns|tenho|disponho de|posso (?:pagar|gastar|investir)|orcamento de|na faixa de|em torno de|por volta de)\s+(?:uns\s+|de\s+)?(\d[\d.,]*\s*(?:mil|k(?![a-z]))?)/g)) {
    if (!respondendoFaixa && !/mil|k|\d{4}|\d\.\d{3}/.test(ate[1])) continue;
    const v = valor(ate[1], true);
    if (v) return { de: null, ate: v };
  }
  if (respondendoFaixa) {
    const solto = t.match(/^\D{0,12}(\d[\d.,]*\s*(?:mil|k(?![a-z]))?)\D{0,12}$/);
    if (solto) {
      const v = valor(solto[1], true);
      if (v) return { de: null, ate: v };
    }
  }
  return null;
}

/** Km por dia ("20 km por dia", "uns 15 km", "100 km na semana", e o número solto quando a loja perguntou os km). */
export function kmDiaDoTexto(texto: string, respondendoKm = false): number | null {
  const t = norm(texto);
  const semana = t.match(/(\d{1,4})\s*(?:km|quilometros?)\s*(?:por|na|a|p\/|\/)?\s*semana/);
  if (semana) return Math.max(1, Math.round(Number(semana[1]) / 6));
  const mes = t.match(/(\d{1,4})\s*(?:km|quilometros?)\s*(?:por|no|ao|p\/|\/)?\s*mes/);
  if (mes) return Math.max(1, Math.round(Number(mes[1]) / 26));
  const ida = /ida e volta/.test(t);
  const longe = /\b(?:fica a|fica uns|de distancia|daqui (?:pra|ate)|distante)\b/.test(t);
  const km = t.match(/(\d{1,3})(?:\s*(?:a|e|ou)\s*(\d{1,3}))?\s*(?:km|quilometros?|kms)\b/);
  if (km) {
    const n = Number(km[2] ?? km[1]);
    if (n > 0 && n <= 400) return longe && !ida ? n * 2 : n;
  }
  if (respondendoKm) {
    const solto = t.match(/^\D{0,15}(\d{1,3})(?:\s*(?:a|e|ou)\s*(\d{1,3}))?\D{0,20}$/);
    if (solto && !/mil|reais|r\$|x\b|vezes/.test(t)) {
      const n = Number(solto[2] ?? solto[1]);
      if (n > 0 && n <= 400) return n;
    }
    if (/\b(?:pert\w*|pouc\w*|curt\w*)\b/.test(t)) return 10;
  }
  return null;
}

const sim = (t: string) => /^(?:sim|s|levo|costumo|isso|claro|com certeza|as vezes|de vez em quando|uhum|aham)\b/.test(t);
const nao = (t: string) => /^(?:nao|n|nunca|nenhum\w*|ninguem|nada|so eu|sozinho\w*|apenas eu)\b/.test(t);

/** Junta o que o cliente acabou de escrever ao que já se sabia. `ultimaDaLoja`: para ler respostas curtas ("sim", "20"). */
export function lerDoCliente(texto: string, anterior: Necessidade = NECESSIDADE_VAZIA, ultimaDaLoja = ""): Necessidade {
  const t = norm(texto);
  const pend = perguntaPendente(ultimaDaLoja);
  const n: Necessidade = { ...anterior };
  for (const [uso, rx] of RX_USO)
    if (rx.test(t)) {
      /* "trabalho" e "entregas" juntos: entregas é o mais exigente */
      if (!n.uso || uso === "entregas" || (n.uso === "cidade" && uso !== "outra_pessoa")) n.uso = uso;
      break;
    }
  const km = kmDiaDoTexto(t, pend === "km");
  if (km) n.kmDia = km;
  if (RX_GARUPA_NAO.test(t) || (pend === "garupa" && nao(t))) n.garupa = false;
  else if (RX_GARUPA_SIM.test(t) || (pend === "garupa" && sim(t))) n.garupa = true;
  if (RX_CARGA.test(t)) n.carga = true;
  else if (pend === "garupa" && nao(t) && n.carga === null) n.carga = false;
  const peso = t.match(RX_PESO);
  if (peso && Number(peso[1]) >= 40 && Number(peso[1]) <= 250 && !/aguenta|suporta|capacidade|carga/.test(t)) n.pesoKg = Number(peso[1]);
  else if (RX_PESADO.test(t) && !n.pesoKg) n.pesoKg = 120;
  const faixa = faixaDoTexto(t, pend === "faixa");
  if (faixa) {
    n.faixaDe = faixa.de;
    n.faixaAte = faixa.ate;
  }
  if (RX_MAIS_BARATA.test(t)) n.maisBarata = true;
  if (pend === "faixa" && /\b(?:tanto faz|nao sei|qualquer|depende)\b/.test(t)) n.maisBarata = n.maisBarata || false;
  if (RX_PATINETE.test(t)) n.tipo = "patinete";
  else if (RX_TRICICLO.test(t)) n.tipo = "triciclo";
  else if (/\bmot(?:o|os|inha|oca|ocinha)\b/.test(t) && !n.tipo) n.tipo = "moto";
  return n;
}

/** Faixa respondida (com valor, "a mais barata" ou "tanto faz" à pergunta da faixa). */
const sabeFaixa = (n: Necessidade) => !!(n.faixaAte || n.faixaDe || n.maisBarata);
const sabe: Record<ChavePergunta, (n: Necessidade) => boolean> = {
  uso: (n) => !!n.uso,
  km: (n) => !!n.kmDia,
  garupa: (n) => n.garupa !== null || n.carga !== null,
  faixa: sabeFaixa,
};

/** Quantas vezes a loja já fez cada pergunta (para não insistir: 2 vezes sem resposta, pula). */
export function perguntasFeitas(falasDaLoja: string[]): Record<ChavePergunta, number> {
  const r: Record<ChavePergunta, number> = { uso: 0, km: 0, garupa: 0, faixa: 0 };
  for (const f of falasDaLoja) {
    const k = perguntaPendente(f);
    if (k) r[k]++;
  }
  return r;
}

/* cliente apressado: pediu as opções de novo, a lista, o catálogo */
const RX_QUER_OPCOES = /\b(?:quais (?:as )?(?:opcoes|motos|modelos|tem|voces tem|vcs tem|voce tem|vc tem)|o que (?:voces|vcs|voce|vc) tem|manda (?:as )?(?:opcoes|fotos|a lista|todas|o catalogo|os modelos|os valores|os precos)|me (?:passa|manda|mostra) (?:as |os )?(?:opcoes|modelos|valores|precos|motos)|lista|catalogo|tabela|todas as motos|todos os modelos)\b/;
export const pediuOpcoes = (texto: string) => RX_QUER_OPCOES.test(norm(texto));

export type Passo = { acao: "perguntar"; chave: ChavePergunta } | { acao: "indicar" };

/** Próximo passo da qualificação: a próxima pergunta que falta (uma por vez) ou indicar as motos.
 *  Ordem: uso → km → garupa/carga → faixa; a faixa sobe para 2ª quando o cliente já perguntou de valor.
 *  Indica quando sabe uso + faixa + (km ou garupa), quando tudo já foi perguntado, ou quando o cliente pede as opções
 *  pela 2ª vez (a 1ª vez ele recebe o "a partir de" e a pergunta). */
export function proximoPasso(n: Necessidade, feitas: Record<ChavePergunta, number>, p: { falouDeValor: boolean; pediuOpcoesAntes: boolean; pedeOpcoesAgora: boolean }): Passo {
  if (p.pedeOpcoesAgora && p.pediuOpcoesAntes) return { acao: "indicar" };
  if (n.uso && sabeFaixa(n) && (n.kmDia || n.garupa !== null || n.carga !== null)) return { acao: "indicar" };
  let ordem: ChavePergunta[] = p.falouDeValor ? ["uso", "faixa", "km", "garupa"] : ["uso", "km", "garupa", "faixa"];
  /* entregas: carga logo depois do uso (é o que decide a moto) */
  if (n.uso === "entregas") ordem = ["uso", "garupa", ...ordem.filter((k) => k !== "uso" && k !== "garupa")];
  const falta = ordem.find((k) => !sabe[k](n) && feitas[k] < 2);
  return falta ? { acao: "perguntar", chave: falta } : { acao: "indicar" };
}

/* ---------------- as perguntas ---------------- */
const mil = (x: number) => `${Math.round(x / 1000)} mil`;
/** Faixas montadas com os preços do estoque (terços, arredondados para o mil): "até uns 7 mil, entre 7 e 10 mil, ou acima de 10 mil". */
export function faixasDoEstoque(precos: number[]): [number, number] | null {
  const ps = precos.filter((x) => x > 0).sort((a, b) => a - b);
  if (ps.length < 3) return null;
  const c1 = Math.round(ps[Math.floor(ps.length / 3)] / 1000) * 1000;
  const c2 = Math.round(ps[Math.floor((2 * ps.length) / 3)] / 1000) * 1000;
  return c2 > c1 ? [c1, c2] : null;
}

export function textoPergunta(chave: ChavePergunta, p: { n: Necessidade; precos: number[]; sorte?: number }): string {
  const s = p.sorte ?? Math.random();
  const escolher = (v: string[]) => v[Math.min(v.length - 1, Math.floor(s * v.length))];
  const coisa = p.n.tipo === "patinete" ? "o patinete" : "a moto";
  switch (chave) {
    case "uso":
      return escolher([`Me conta: você vai usar ${coisa} mais pra trabalhar, pro dia a dia na cidade ou pra passear? 😊`, `Pra eu te indicar ${coisa} certa: vai ser mais pra trabalho, pro dia a dia na cidade ou pra passeio? 😊`]);
    case "km":
      return p.n.uso === "entregas"
        ? "E num dia de entregas, você roda mais ou menos quantos km?"
        : escolher(["E mais ou menos quantos km você roda por dia?", "Quantos km você costuma rodar por dia, mais ou menos?"]);
    case "garupa":
      return p.n.uso === "entregas"
        ? "Você vai usar baú ou levar carga nas entregas?"
        : escolher(["Você costuma levar alguém na garupa ou alguma carga, tipo compras?", "E vai levar alguém na garupa ou carga com você?"]);
    case "faixa": {
      const f = faixasDoEstoque(p.precos);
      return f ? `Pra eu te indicar dentro do seu bolso: você pensa em investir até uns ${mil(f[0])}, entre ${Math.round(f[0] / 1000)} e ${mil(f[1])}, ou acima de ${mil(f[1])}?` : "Pra eu te indicar dentro do seu bolso: tem uma faixa de valor que você pensa em investir?";
    }
  }
}

/* ---------------- a indicação ---------------- */
export type MotoParaIndicar = { nome: string; tipo: string; preco: number | null; autonomia: string | null; carga: string | null; velocidade: string | null; descricao: string | null };

const numeros = (s: string | null) => (s ?? "").match(/\d{2,3}/g)?.map(Number) ?? [];
const RX_GARUPA_MOTO = /garupa|passageir|duas pessoas|2 pessoas|banco duplo/i;
const RX_CESTA = /\b(ba[uú]|cesta|bagageiro|porta[- ]?objetos?|suporte de carga)\b/i;
const RX_TRICICLO_MOTO = /triciclo|tr[eê]s rodas|3 rodas/i;

type Indicada = { moto: MotoParaIndicar; motivos: string[]; pontos: number };

/** As motos que mais combinam (no máximo `max`), cada uma com os motivos tirados da ficha e da descrição. */
export function indicarMotos(n: Necessidade, motos: MotoParaIndicar[], max = 2): Indicada[] {
  let lista = motos.filter((m) => m.preco && m.preco > 0);
  if (n.tipo === "patinete") lista = lista.filter((m) => m.tipo === "patinete");
  else {
    lista = lista.filter((m) => m.tipo === "moto_eletrica");
    lista = n.tipo === "triciclo" ? lista.filter((m) => RX_TRICICLO_MOTO.test(m.descricao ?? "")) : lista;
  }
  if (!lista.length) return [];
  const maisBarata = Math.min(...lista.map((m) => m.preco!));
  const avaliadas: Indicada[] = lista.map((m) => {
    const motivos: string[] = [];
    let pontos = 0;
    const [autMin, autMax] = [Math.min(...numeros(m.autonomia)), Math.max(...numeros(m.autonomia))];
    const cargaKg = Math.max(0, ...numeros(m.carga));
    if (n.kmDia && Number.isFinite(autMin)) {
      if (autMin >= n.kmDia * 1.3) {
        pontos += 3;
        motivos.push(`roda ${m.autonomia!.trim()} com uma carga, folga pros seus ${n.kmDia} km por dia`);
      } else if (autMax >= n.kmDia) {
        pontos += 1;
        motivos.push(`roda ${m.autonomia!.trim()}, dá pros seus ${n.kmDia} km por dia`);
      } else pontos -= 6;
    }
    if (n.garupa) {
      if (RX_GARUPA_MOTO.test(m.descricao ?? "")) {
        pontos += 3;
        motivos.push("aceita garupa");
      } else pontos -= 2;
    }
    if (n.carga || n.uso === "entregas") {
      const cesta = (m.descricao ?? "").match(RX_CESTA);
      if (cesta) {
        pontos += 2;
        motivos.push(`tem ${cesta[1].toLowerCase()}`);
      }
    }
    const precisaPeso = (n.pesoKg ?? 0) + (n.garupa ? 70 : 0);
    if (cargaKg && (n.pesoKg || n.garupa || n.carga || n.uso === "entregas")) {
      if (precisaPeso && cargaKg < precisaPeso) pontos -= 4;
      else {
        pontos += cargaKg >= 180 ? 2 : 1;
        motivos.push(`aguenta até ${m.carga!.trim()}`);
      }
    }
    if ((n.uso === "trabalho" || n.uso === "entregas") && Number.isFinite(autMax)) pontos += autMax >= 60 ? 1 : 0;
    if (n.uso === "passeio" && /retr[oô]|cl[aá]ssic|estilo|charme/i.test(`${m.nome} ${m.descricao ?? ""}`)) {
      pontos += 1;
      motivos.push("tem o visual retrô");
    }
    if (n.faixaAte) {
      if (m.preco! <= n.faixaAte) {
        pontos += 3;
        motivos.push("cabe na faixa que você falou");
      } else if (m.preco! <= n.faixaAte * 1.15) pontos -= 1;
      else pontos -= 5;
    }
    if (n.faixaDe && m.preco! < n.faixaDe * 0.85) pontos -= 1;
    if (n.maisBarata || (!n.faixaAte && !n.faixaDe)) pontos += m.preco === maisBarata ? 1 : 0;
    if (m.preco === maisBarata && (n.maisBarata || n.faixaAte)) motivos.push("a mais em conta");
    return { moto: m, motivos, pontos };
  });
  return avaliadas
    .sort((a, b) => b.pontos - a.pontos || (n.faixaDe ? b.moto.preco! - a.moto.preco! : a.moto.preco! - b.moto.preco!))
    .slice(0, max)
    .filter((x, i) => i === 0 || x.pontos >= -2);
}

const brl = (x: number) => `R$ ${x.toLocaleString("pt-BR", Number.isInteger(x) ? { maximumFractionDigits: 0 } : { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const ROTULO_USO: Record<Uso, string> = { trabalho: "pro trabalho", entregas: "pras entregas", cidade: "pro dia a dia na cidade", passeio: "pra passear", outra_pessoa: "pra presentear alguém da família" };

/** O que o cliente contou, em poucas palavras ("pro trabalho, uns 20 km por dia, levando alguém na garupa"). */
export function resumoDaNecessidade(n: Necessidade): string {
  const partes = [
    n.uso ? ROTULO_USO[n.uso] : null,
    n.kmDia ? `uns ${n.kmDia} km por dia` : null,
    n.garupa ? "levando alguém na garupa" : null,
    n.carga ? "com carga" : null,
    n.faixaDe && n.faixaAte ? `entre ${Math.round(n.faixaDe / 1000)} e ${mil(n.faixaAte)}` : n.faixaAte ? `até uns ${mil(n.faixaAte)}` : n.faixaDe ? `acima de ${mil(n.faixaDe)}` : n.maisBarata ? "procurando a mais em conta" : null,
  ].filter(Boolean);
  return partes.join(", ");
}

/** Texto da indicação (do sistema): o que ele contou, 1 ou 2 motos com o porquê e o preço, e UMA pergunta. */
export function textoIndicacao(p: { nome: string | null; n: Necessidade; indicadas: Indicada[] }): string | null {
  if (!p.indicadas.length) return null;
  const resumo = resumoDaNecessidade(p.n);
  const uma = p.indicadas.length === 1;
  const abre = resumo
    ? `${p.nome ? `${p.nome}, p` : "P"}elo que você me contou (${resumo}), ${uma ? "a que mais combina com você é" : "as que mais combinam com você são"}:`
    : `${p.nome ? `${p.nome}, ` : ""}${uma ? "a que eu te indico é" : "as que eu te indico são"}:`;
  const linhas = p.indicadas.map((x) => `• *${x.moto.nome}*: ${x.motivos.length ? `${x.motivos.slice(0, 3).join(", ")}. ` : ""}${brl(x.moto.preco!)}`);
  const acimaDaFaixa = p.n.faixaAte && p.indicadas.every((x) => x.moto.preco! > p.n.faixaAte!);
  const aviso = acimaDaFaixa ? "\nFicam um pouco acima da faixa que você falou, mas dá pra parcelar no cartão em até 21x." : "";
  return `${abre}\n${linhas.join("\n")}${aviso}\n\n${uma ? "Quer conhecer melhor? Te mando a foto e o vídeo 😊" : "Qual delas você quer conhecer melhor? 😊"}`;
}

/** A loja já indicou as motos nesta conversa (o sistema não indica de novo). */
export const jaIndicou = (historico: string) => /(?:as que mais combinam|a que mais combina) com voc[eê]|as que eu te indico s[aã]o|a que eu te indico [eé]/i.test(historico);

/** O que já se sabe, para a instrução da IA e o painel ("Uso: trabalho · 20 km/dia · garupa: sim · faixa: até 7 mil"). */
export function fichaDaNecessidade(n: Necessidade): string {
  const r = [
    `uso: ${n.uso ? ROTULO_USO[n.uso].replace(/^pr[oa]s? /, "") : "?"}`,
    `km por dia: ${n.kmDia ?? "?"}`,
    `garupa: ${n.garupa === null ? "?" : n.garupa ? "sim" : "não"}`,
    `carga: ${n.carga === null ? "?" : n.carga ? "sim" : "não"}`,
    `faixa de valor: ${n.faixaAte ? `até ${mil(n.faixaAte)}` : n.faixaDe ? `acima de ${mil(n.faixaDe)}` : n.maisBarata ? "a mais em conta" : "?"}`,
  ];
  if (n.pesoKg) r.push(`peso de quem pilota: uns ${n.pesoKg} kg`);
  if (n.tipo && n.tipo !== "moto") r.push(`procura: ${n.tipo}`);
  return r.join(" · ");
}

/* ---------------- a resposta da IA durante a qualificação ---------------- */
const RX_FRASE = /(?:[^.!?\n]|[.!?](?=\d))+[.!?]*\s*(?:\p{Extended_Pictographic}️?\s*)*/gu;
const escapar = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** Na qualificação a IA só comenta ou responde: sai frase com pergunta (o sistema faz a dele), preço, modelo, estoque
 *  ou lista. Sobra só o comentário caloroso. */
export function limparParaQualificacao(blocos: string[], nomesDeModelos: string[]): string[] {
  const modelos = nomesDeModelos.filter((n) => n.trim().length >= 2).map((n) => new RegExp(`(?<![\\p{L}\\p{N}])${escapar(norm(n))}(?![\\p{L}\\p{N}])`, "u"));
  const proibida = (f: string) => {
    const t = norm(f);
    return /\?/.test(f) || /r\$/.test(t) || /^\s*[•\-*]/.test(f) || /\b(?:estoque|catalogo|pronta entrega|disponive(?:l|is)|temos (?:estas|essas|estes|esses|as seguintes)|a partir de)\b/.test(t) || modelos.some((rx) => rx.test(t));
  };
  return blocos
    .map((b) => b.split("\n").filter((l) => !/^\s*[•\-*]/.test(l)).join("\n"))
    /* "…pra uma elétrica 👍 A T1 sai por…": emoji seguido de maiúscula também fecha a frase */
    .map((b) =>
      b
        .split(/(?<=\p{Extended_Pictographic}️?)\s+(?=[\p{Lu}*])/u)
        .map((p) => (p.match(RX_FRASE) ?? [p]).filter((f) => f.trim() && !proibida(f)).join("").trim())
        .filter(Boolean)
        .join(" "),
    )
    .filter((b) => /\p{L}/u.test(b));
}

/** Instrução para a IA na fase de qualificação: só um comentário caloroso ou a resposta ao que ele perguntou, sem
 *  produto e sem pergunta (a pergunta é do sistema e vai logo depois). */
export function instrucaoQualificacao(n: Necessidade): string {
  return `# QUALIFICAÇÃO (o diferencial do atendimento)
Agora você está entendendo o que o cliente precisa, para depois indicar a moto certa pra ele. O que já se sabe: ${fichaDaNecessidade(n)}.
Nesta resposta escreva SÓ 1 ou 2 frases curtas e calorosas, sem pergunta nenhuma: o sistema faz a próxima pergunta logo depois da sua frase.
- Comente com naturalidade o que ele acabou de contar (ex.: "20 km por dia é tranquilo pra uma elétrica 👍", "pra entregas faz toda a diferença não gastar com gasolina").
- Se ele perguntou algo, responda sem citar modelo nem preço: parcelamento, "dá pra parcelar em até 21x no cartão, e no Pix sai melhor"; garantia, entrega e loja, só o que estiver na base de conhecimento.
- Se ele disse que vai ver com alguém (esposa, família) ou que volta depois: respeite com carinho e diga que você só quer deixar separadas as opções certas pra ele mostrar.
- NÃO cite nenhum modelo, preço, autonomia, cor, estoque nem catálogo, e não liste motos: a indicação vem depois, feita sob medida.

`;
}
