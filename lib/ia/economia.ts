/* ============================================================
   CONTA DE ECONOMIA: moto elétrica × moto a gasolina (pedido do dono, 27/09/2026)
   A IA não faz conta: o sistema calcula aqui, pela autonomia de cada moto, e entrega os
   valores prontos no catálogo (que é fonte autorizada, então a trava de fatos aceita).
   Os números vêm da Base de conhecimento, editáveis na tela da IA:
   - "Comparação com gasolina": preço do litro e km por litro da moto a gasolina de referência;
   - "Gasto de energia e autonomia": quanto custa uma carga completa (de R$ X a R$ Y).
   Puro, sem banco: testado em tests/unit/economia.test.ts.
   ============================================================ */

export type ParametrosEconomia = { gasolina: number; kmPorLitro: number; cargaMin: number; cargaMax: number };

const numero = (s: string) => Number(s.replace(/\./g, "").replace(",", "."));

/** Lê os parâmetros dos textos da base. Falta algum número? null (a IA não fala de economia em reais). */
export function lerParametrosEconomia(textos: string[]): ParametrosEconomia | null {
  const tudo = textos.join("\n");
  const gasolina = tudo.match(/gasolina[^\n]*?R\$\s*(\d{1,2},\d{2})/iu);
  const kml = tudo.match(/(\d{1,3}(?:,\d+)?)\s*km\s*(?:por|\/|p\/)\s*litro/iu);
  const carga = tudo.match(/carga[^\n]*?R\$\s*(\d{1,3}(?:,\d{2})?)\s*(?:e|a)\s*R\$\s*(\d{1,3}(?:,\d{2})?)/iu);
  if (!gasolina || !kml || !carga) return null;
  const p = { gasolina: numero(gasolina[1]), kmPorLitro: numero(kml[1]), cargaMin: numero(carga[1]), cargaMax: numero(carga[2]) };
  return Object.values(p).every((x) => Number.isFinite(x) && x > 0) ? p : null;
}

/** Autonomia mais baixa da ficha ("40 a 45 km" → 40; "até 70 km" → 70): a conta fica do lado seguro. */
export function autonomiaMinima(texto: string | null | undefined) {
  const n = (texto ?? "").match(/\d{2,3}/u);
  return n ? Number(n[0]) : null;
}

const reais = (x: number) => `R$ ${Math.round(x).toLocaleString("pt-BR")}`;
const reaisCentavos = (x: number) => `R$ ${x.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Por dia de uso típico, 30 dias por mês. */
export const CENARIOS_KM_DIA = [20, 40, 60];

/** Texto pronto da economia de um modelo, para o catálogo que a IA recebe. */
export function textoEconomia(autonomia: number, p: ParametrosEconomia) {
  const gasolinaNaAutonomia = (autonomia / p.kmPorLitro) * p.gasolina;
  const cenarios = CENARIOS_KM_DIA.map((d) => {
    const km = d * 30;
    const cargas = km / autonomia;
    const luzMin = cargas * p.cargaMin;
    const luzMax = cargas * p.cargaMax;
    const gas = (km / p.kmPorLitro) * p.gasolina;
    return `${d} km/dia: luz ${reais(luzMin)} a ${reais(luzMax)} por mês × gasolina ${reais(gas)} por mês (economia de ${reais(Math.max(0, gas - luzMax))} a ${reais(gas - luzMin)} por mês)`;
  });
  return `economia: 1 carga (${reais(p.cargaMin)} a ${reais(p.cargaMax)}) roda ${autonomia} km; os mesmos ${autonomia} km numa moto a gasolina custam ${reaisCentavos(gasolinaNaAutonomia)} | ${cenarios.join(" | ")}`;
}
