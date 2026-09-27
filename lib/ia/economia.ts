/* ============================================================
   CONTA DE ECONOMIA: moto elétrica × moto a gasolina (pedido do dono, 27/09/2026)
   A IA não faz conta: o sistema calcula aqui, pela autonomia de cada moto e pelo quanto o
   cliente roda (se ele disse), e entrega os valores prontos, NA SEMANA e NO MÊS, no catálogo
   (que é fonte autorizada, então a trava de fatos aceita).
   Os números vêm da Base de conhecimento, editáveis na tela da IA:
   - "Comparação com gasolina": preço do litro e km por litro da moto a gasolina de referência;
   - "Gasto de energia e autonomia": quanto custa uma carga completa (de R$ X a R$ Y).
   Puro, sem banco: testado em tests/unit/economia.test.ts.
   ============================================================ */

export type ParametrosEconomia = {
  gasolina: number;
  kmPorLitro: number;
  cargaMin: number;
  cargaMax: number;
  /** de onde veio o preço da gasolina ("média de Pernambuco", "Recife"), quando é o da ANP */
  origemGasolina?: string;
};

/** Troca o preço da gasolina da base pelo da ANP para a região do cliente. */
export const comGasolinaDaRegiao = (p: ParametrosEconomia, g: { preco: number; onde: string } | null | undefined): ParametrosEconomia =>
  g ? { ...p, gasolina: g.preco, origemGasolina: g.onde } : p;

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

/** Quanto o cliente roda por SEMANA, pelo que ele escreveu ("20 km por dia", "150 km na semana",
    "600 km por mês"). Vale a última menção. Dia conta 7 por semana; mês, 30 dias. */
export function kmPorSemana(texto: string): number | null {
  const rx = /(\d{1,4})\s*(?:km|quil[oô]metros?)\s*(?:rodados?\s*)?(?:por|ao|a|p\/|\/|na|no|todo|toda|de)?\s*(dia|di[áa]rios?|semana|semanais|m[eê]s|mensais)/giu;
  let ultimo: number | null = null;
  for (const m of texto.matchAll(rx)) {
    const km = Number(m[1]);
    const p = m[2].toLowerCase();
    if (!km) continue;
    ultimo = /^di/u.test(p) ? km * 7 : /^sem/u.test(p) ? km : Math.round((km * 7) / 30);
  }
  return ultimo && ultimo <= 5000 ? ultimo : null;
}

const reais = (x: number) => `R$ ${Math.round(x).toLocaleString("pt-BR")}`;
const reaisCentavos = (x: number) => `R$ ${x.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Cenários de uso quando o cliente ainda não disse quanto roda (km por semana). */
export const CENARIOS_KM_SEMANA = [100, 200, 300];
const SEMANAS_NO_MES = 30 / 7;

function periodo(km: number, autonomia: number, p: ParametrosEconomia) {
  const cargas = km / autonomia;
  const luzMin = cargas * p.cargaMin;
  const luzMax = cargas * p.cargaMax;
  const gas = (km / p.kmPorLitro) * p.gasolina;
  return `luz ${reais(luzMin)} a ${reais(luzMax)} × gasolina ${reais(gas)} (economiza de ${reais(Math.max(0, gas - luzMax))} a ${reais(gas - luzMin)})`;
}

function cenario(kmSemana: number, autonomia: number, p: ParametrosEconomia) {
  return `${kmSemana} km por semana → na semana: ${periodo(kmSemana, autonomia, p)}; no mês: ${periodo(kmSemana * SEMANAS_NO_MES, autonomia, p)}`;
}

/** Frase pronta para o cliente, em linguagem simples (o sistema põe na resposta quando a IA esquece a conta). */
export function fraseEconomia(nome: string, autonomia: number, kmSemana: number, p: ParametrosEconomia) {
  const mes = kmSemana * SEMANAS_NO_MES;
  const conta = (km: number) => {
    const cargas = km / autonomia;
    const gas = (km / p.kmPorLitro) * p.gasolina;
    return { gas, luzMin: cargas * p.cargaMin, luzMax: cargas * p.cargaMax };
  };
  const s = conta(kmSemana);
  const m = conta(mes);
  const litro = p.origemGasolina ? ` (${reaisCentavos(p.gasolina)} o litro, ${p.origemGasolina})` : "";
  return `Fazendo a conta para o seu uso (uns ${kmSemana} km por semana) com a *${nome}*: na gasolina${litro} você gastaria ${reais(m.gas)} por mês. Com a elétrica, a luz fica de ${reais(m.luzMin)} a ${reais(m.luzMax)}. Ou seja, você economizaria de ${reais(Math.max(0, m.gas - m.luzMax))} a ${reais(m.gas - m.luzMin)} por mês (de ${reais(Math.max(0, s.gas - s.luzMax))} a ${reais(s.gas - s.luzMin)} por semana).`;
}

/** Texto pronto da economia de um modelo, para o catálogo que a IA recebe.
    Com `kmSemanaCliente`, a conta é a do uso dele; sem, vão os cenários de 100, 200 e 300 km por semana. */
export function textoEconomia(autonomia: number, p: ParametrosEconomia, kmSemanaCliente?: number | null) {
  const gasolinaNaAutonomia = (autonomia / p.kmPorLitro) * p.gasolina;
  const base = `economia: 1 carga (${reais(p.cargaMin)} a ${reais(p.cargaMax)}) anda ${autonomia} km; os mesmos ${autonomia} km numa moto a gasolina custam ${reaisCentavos(gasolinaNaAutonomia)}`;
  if (kmSemanaCliente) return `${base} | CONTA DO CLIENTE: ${cenario(kmSemanaCliente, autonomia, p)}`;
  return `${base} | ${CENARIOS_KM_SEMANA.map((k) => cenario(k, autonomia, p)).join(" | ")}`;
}
