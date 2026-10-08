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

export function corrigirKmSemFonte(bloco: string, fichas: FichaFatos[]): string {
  const partes = bloco.match(FRASES) ?? [bloco];
  const confirmar = new Map<string, Set<"autonomia" | "velocidade">>();
  const ficam = partes.filter((f) => {
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
    return false;
  });
  let texto = ficam.join("").replace(/\n{3,}/g, "\n\n").trim();
  for (const [nome, o] of confirmar) {
    const oque = Array.from(o).sort().map((x) => `a ${x}`).join(" e ");
    texto = `${texto}${texto ? " " : ""}${oque[0].toUpperCase()}${oque.slice(1)} d${artigo(nome)} *${nome}* eu confirmo com a equipe.`;
  }
  return texto;
}
