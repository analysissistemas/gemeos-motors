/* Autonomia e velocidade só do catálogo (testes de 06 e 07/10/2026: "X GÊMEOS anda até 45 km, velocidade máxima de
   32 km/h", sem nenhum dos dois cadastrados). Frase que fala de UM modelo e cita km ou km/h que não estão na ficha nem
   na descrição dele sai inteira, e no fim entra uma frase limpa: "A autonomia da *X GÊMEOS* eu confirmo com a equipe".
   (Trocar só o número no meio da frase deixava o texto ilegível.) Conta de economia ("rodando 50 km por semana") não
   entra. Puro: sem banco. */
import { ultimaCitada } from "./midia-tipos.ts";
import { artigo } from "./estoque-tipos.ts";

export type FichaFatos = { nome: string; autonomia: string | null; velocidade?: string | null; descricao: string | null };

const RX_VELOCIDADE = /(\d+)\s*km\s*\/\s*h/giu;
const RX_DISTANCIA = /(\d+)(?:\s*(?:a|-|até)\s*(\d+))?\s*km(?!\s*\/\s*h)/giu;
const RX_ECONOMIA = /(?:por|na|no|ao|cada)\s+(?:semana|dia|m[êe]s)|rodando|roda\s|gasolina|economi/iu;
const FRASES = /(?:[^.!?\n]|[.!?](?=\d))+[.!?]*\s*(?:\p{Extended_Pictographic}️?\s*)*|\n/gu;
const numerosDe = (s: string) => new Set((s.match(/\d+/g) ?? []).map(Number));

/** "Ela também tem…" / "Além disso, ela tem…" / "Também tem…" → "A *X GÊMEOS* também tem…". Outra frase fica como está. */
function comSujeito(frase: string, nome: string): string {
  const r = frase.match(/^(\s*)(?:(além disso,?|e)\s+)?(?:(?:ela|ele|essa|esse)(?:\s+moto)?\s+|(?=também\b))/iu);
  if (!r) return frase;
  const [tudo, espaco, ligacao] = r;
  const sujeito = `${artigo(nome)} *${nome}*`;
  const ligado = ligacao ? `${ligacao[0].toUpperCase()}${ligacao.slice(1).toLowerCase()} ${sujeito}` : `${sujeito[0].toUpperCase()}${sujeito.slice(1)}`;
  return `${espaco}${ligado} ${frase.slice(tudo.length).replace(/^também\b/iu, "também")}`;
}

export function corrigirKmSemFonte(bloco: string, fichas: FichaFatos[]): string {
  const partes = bloco.match(FRASES) ?? [bloco];
  const confirmar = new Map<string, Set<"autonomia" | "velocidade">>();
  /* a frase que sai era a que dizia o nome: a seguinte que começa com "Ela também…" ganha o nome de volta, senão o
     cliente lê como se fosse da moto de antes (Simulador de 20/10/2026: "Ela também tem caixa de som" logo depois da MT4) */
  let saiu: string | null = null;
  const ficam: string[] = [];
  const fica = (f: string) => {
    if (!/\d\s*km/iu.test(f) || RX_ECONOMIA.test(f)) return true;
    const citados = fichas.filter((m) => ultimaCitada([m], f));
    if (citados.length !== 1) return true;
    const m = citados[0];
    const fonteKm = numerosDe(`${m.autonomia ?? ""} ${m.descricao ?? ""}`);
    const fonteVel = numerosDe(`${m.velocidade ?? ""} ${m.descricao ?? ""}`);
    const faltam = new Set<"autonomia" | "velocidade">();
    for (const x of f.matchAll(RX_VELOCIDADE)) if (!fonteVel.has(Number(x[1]))) faltam.add("velocidade");
    for (const x of f.matchAll(RX_DISTANCIA)) if (!fonteKm.has(Number(x[1])) || (x[2] && !fonteKm.has(Number(x[2])))) faltam.add("autonomia");
    if (!faltam.size) return true;
    confirmar.set(m.nome, new Set([...(confirmar.get(m.nome) ?? []), ...faltam]));
    saiu = m.nome;
    return false;
  };
  for (let f of partes) {
    if (saiu && f.trim()) {
      f = comSujeito(f, saiu);
      saiu = null;
    }
    if (fica(f)) ficam.push(f);
  }
  let texto = ficam.join("").replace(/\n{3,}/g, "\n\n").trim();
  for (const [nome, o] of confirmar) {
    const oque = Array.from(o).sort().map((x) => `a ${x}`).join(" e ");
    texto = `${texto}${texto ? " " : ""}${oque[0].toUpperCase()}${oque.slice(1)} d${artigo(nome)} *${nome}* eu confirmo com a equipe.`;
  }
  return texto;
}

/* Garantia só do cadastro (compilado de 20/10/2026: "a T3 Retrô tem 2 anos de garantia na bateria e 1 ano no restante",
   sem nada disso na T3; o dono: "pode corrigir"). Frase que fala de garantia com prazo (anos, meses) sai se o prazo não
   está na ficha (campo garantia) nem na descrição DAQUELE modelo; sem modelo citado, vale a base de conhecimento. No
   lugar entra "A garantia da *T3 RETRÔ* eu confirmo com a equipe". */
export type FichaGarantia = { nome: string; garantia?: string | null; descricao: string | null };
const RX_PRAZO = /(\d+)\s*(?:anos?|m[eê]s(?:es)?)/giu;
export function corrigirGarantiaSemFonte(bloco: string, fichas: FichaGarantia[], conhecimento = ""): string {
  const partes = bloco.match(FRASES) ?? [bloco];
  const confirmar = new Set<string>();
  let semModelo = false;
  const ficam = partes.filter((f) => {
    if (!/garantia/iu.test(f) || !RX_PRAZO.test(f)) return true;
    RX_PRAZO.lastIndex = 0;
    const citados = fichas.filter((m) => ultimaCitada([m], f));
    const fonte = citados.length === 1 ? `${citados[0].garantia ?? ""} ${citados[0].descricao ?? ""}` : conhecimento;
    const temGarantia = /garantia/iu.test(fonte) || (citados.length === 1 && !!citados[0].garantia);
    const prazos = numerosDe(Array.from(fonte.matchAll(RX_PRAZO), (x) => x[0]).join(" "));
    const ok = temGarantia && Array.from(f.matchAll(RX_PRAZO)).every((x) => prazos.has(Number(x[1])));
    if (ok) return true;
    if (citados.length === 1) confirmar.add(citados[0].nome);
    else semModelo = true;
    return false;
  });
  let texto = ficam.join("").replace(/\n{3,}/g, "\n\n").trim();
  for (const nome of confirmar) texto = `${texto}${texto ? " " : ""}A garantia d${artigo(nome)} *${nome}* eu confirmo com a equipe.`;
  if (semModelo && !confirmar.size) texto = `${texto}${texto ? " " : ""}A garantia certinha eu confirmo com a equipe.`;
  return texto;
}
