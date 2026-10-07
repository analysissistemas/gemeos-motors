/* Autonomia só do catálogo (teste de 06/10/2026: "X GÊMEOS: autonomia aproximada de 45 km", sem autonomia cadastrada).
   Frase que fala de UM modelo e cita km que não está na ficha nem na descrição dele: o trecho do km vira "autonomia a
   confirmar com a equipe". Conta de economia ("rodando 50 km por semana") não entra. Puro: sem banco. */
import { ultimaCitada } from "./midia-tipos.ts";

export type FichaFatos = { nome: string; autonomia: string | null; descricao: string | null };

const RX_KM = /(?:autonomia\s+(?:aproximada\s+|m[ée]dia\s+|de\s+at[ée]\s+)?(?:de\s+)?(?:at[ée]\s+)?|anda\s+(?:at[ée]\s+|de\s+)?|at[ée]\s+|cerca\s+de\s+)?(\d+)(?:\s*(?:a|-|até)\s*(\d+))?\s*km(?:\s+(?:com\s+uma\s+carga|por\s+carga|de\s+autonomia))?/giu;
const RX_ECONOMIA = /(?:por|na|no|ao|cada)\s+(?:semana|dia|m[êe]s)|rodando|roda\s|gasolina|economi/iu;
const FRASES = /(?:[^.!?\n]|[.!?](?=\d))+[.!?]*\s*(?:\p{Extended_Pictographic}\uFE0F?\s*)*|\n/gu;

export function corrigirKmSemFonte(bloco: string, fichas: FichaFatos[]): string {
  const partes = bloco.match(FRASES) ?? [bloco];
  return partes
    .map((f) => {
      if (!/\d\s*km/iu.test(f) || RX_ECONOMIA.test(f)) return f;
      const citados = fichas.filter((m) => ultimaCitada([m], f));
      if (citados.length !== 1) return f;
      const fonte = `${citados[0].autonomia ?? ""} ${citados[0].descricao ?? ""}`;
      const numeros = new Set((fonte.match(/\d+/g) ?? []).map(Number));
      return f.replace(RX_KM, (trecho, a: string, b?: string) => {
        const ok = numeros.has(Number(a)) && (!b || numeros.has(Number(b)));
        return ok ? trecho : /^anda/iu.test(trecho) ? "tem autonomia a confirmar com a equipe" : "autonomia a confirmar com a equipe";
      });
    })
    .join("");
}
