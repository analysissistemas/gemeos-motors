/* Visita e test drive marcados pela IA (pedido do dono, 03/10/2026: "o cliente vai querer ir lá na loja,
   então agendar test drive tem que estar conectado à IA"). Aqui fica só o que é puro: entender o dia e a
   hora que o cliente escreveu e se ele quer vir à loja. Quem agenda é lib/servicos/test-drive.ts (a mesma
   regra de conflito da equipe), chamado por lib/ia/workflow/nos.ts. Fuso de Recife (UTC-3, sem verão). */

const FUSO_MIN = -3 * 60;
const semAcento = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

function local(d: Date) {
  const l = new Date(d.getTime() + FUSO_MIN * 60_000);
  return { ano: l.getUTCFullYear(), mes: l.getUTCMonth(), dia: l.getUTCDate(), semana: l.getUTCDay(), hora: l.getUTCHours(), min: l.getUTCMinutes() };
}
function instante(ano: number, mes: number, dia: number, hora: number, min: number) {
  return new Date(Date.UTC(ano, mes, dia, hora, min) - FUSO_MIN * 60_000);
}

/** O cliente quer vir à loja (visita ou test drive)? */
export const RX_QUER_VISITAR =
  /(?<![\p{L}])(test\s?drive|testar a moto|dar uma volta|andar nela|ver (ela |a moto |as motos )?pessoalmente|ver de perto|ir (ai|a[ií]|na loja|ate a loja|ate ai|ate a[ií])|passar (ai|a[ií]|na loja)|dar uma passada|visitar|conhecer a loja|vou (ai|a[ií]|na loja|passar ai|passar a[ií])|posso ir|quero ir|da pra ir|agendar (uma )?visita|marcar (uma )?visita)(?![\p{L}])/iu;
/** A última mensagem da loja perguntou o dia e a hora da visita? */
export const RX_PEDIU_HORARIO_VISITA = /dia e hor[aá]rio[^?]{0,60}(vir|visita|test drive|passar)|que horas[^?]{0,40}(vir|passar|visita)|qual dia[^?]{0,40}(vir|passar|visita)/iu;

const DIAS_SEMANA: Record<string, number> = { domingo: 0, segunda: 1, terca: 2, quarta: 3, quinta: 4, sexta: 5, sabado: 6 };

export type DataHoraVisita = { quando: Date | null; temDia: boolean; temHora: boolean };

/** Dia e hora que o cliente escreveu ("sábado às 10h", "amanhã 15h", "dia 6 às 9", "06/10 14:30", "hoje às 4 da tarde"). */
export function dataHoraDaVisita(texto: string, agora: Date = new Date()): DataHoraVisita {
  const t = semAcento(texto);
  const hoje = local(agora);

  /* hora */
  let hora: number | null = null;
  let min = 0;
  const h1 = /(?<!\d)(\d{1,2})\s*(?:h|:|hs|horas?)\s*(\d{2})?(?!\d)/.exec(t);
  const h2 = /\b(?:as|a partir das|umas|tipo)\s+(\d{1,2})(?:\s*(?:da|de)\s*(manha|tarde|noite))?(?!\s*\/)(?!\d)/.exec(t);
  const h3 = /(?<!\d)(\d{1,2})\s*(?:da|de)\s*(manha|tarde|noite)/.exec(t);
  if (/\bmeio[ -]?dia\b/.test(t)) hora = 12;
  else if (h1) {
    hora = Number(h1[1]);
    min = h1[2] ? Number(h1[2]) : 0;
  } else if (h3) hora = Number(h3[1]) + (/(tarde|noite)/.test(h3[2]) && Number(h3[1]) < 12 ? 12 : 0);
  else if (h2) hora = Number(h2[1]) + (h2[2] && /(tarde|noite)/.test(h2[2]) && Number(h2[1]) < 12 ? 12 : 0);
  /* "às 3" sem "da tarde": horário comercial, então 1 a 7 é da tarde */
  if (hora !== null && hora >= 1 && hora <= 7 && !/(?<!a)manha/.test(t)) hora += 12;
  if (hora !== null && (hora > 23 || min > 59)) hora = null;

  /* dia */
  let dia: { ano: number; mes: number; dia: number } | null = null;
  const d1 = /(?<!\d)(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?(?!\d)/.exec(t);
  const d2 = /\bdia\s+(\d{1,2})(?!\d)/.exec(t);
  const semana = /\b(domingo|segunda|terca|quarta|quinta|sexta|sabado)\b/.exec(t);
  if (/\bdepois de amanha\b/.test(t)) dia = mais(hoje, 2);
  else if (/\bamanha\b/.test(t)) dia = mais(hoje, 1);
  else if (/\bhoje\b/.test(t)) dia = mais(hoje, 0);
  else if (d1) {
    const mes = Number(d1[2]) - 1;
    let ano = d1[3] ? Number(d1[3]) : hoje.ano;
    if (ano < 100) ano += 2000;
    if (!d1[3] && (mes < hoje.mes || (mes === hoje.mes && Number(d1[1]) < hoje.dia))) ano += 1;
    dia = { ano, mes, dia: Number(d1[1]) };
  } else if (d2) {
    let mes = hoje.mes;
    let ano = hoje.ano;
    if (Number(d2[1]) < hoje.dia) [mes, ano] = mes === 11 ? [0, ano + 1] : [mes + 1, ano];
    dia = { ano, mes, dia: Number(d2[1]) };
  } else if (semana) {
    let n = (DIAS_SEMANA[semana[1]] - hoje.semana + 7) % 7;
    /* "sábado" dito no próprio sábado: hoje, se a hora ainda não passou; senão o próximo */
    if (n === 0 && hora !== null && (hora < hoje.hora || (hora === hoje.hora && min <= hoje.min))) n = 7;
    dia = mais(hoje, n);
  }
  /* só a hora ("às 15h"): hoje, se ainda dá; senão amanhã */
  if (!dia && hora !== null && /\b(hoje|agora|mais tarde)\b|^\D*\d{1,2}\s*(h|:)/.test(t)) dia = mais(hoje, hora > hoje.hora ? 0 : 1);

  const quando = dia && hora !== null ? instante(dia.ano, dia.mes, dia.dia, hora, min) : null;
  return { quando, temDia: !!dia, temHora: hora !== null };
}

function mais(h: { ano: number; mes: number; dia: number }, n: number) {
  const d = new Date(Date.UTC(h.ano, h.mes, h.dia + n));
  return { ano: d.getUTCFullYear(), mes: d.getUTCMonth(), dia: d.getUTCDate() };
}

/** "sábado, 04/10, às 10h" no fuso de Recife. */
export function quandoPorExtenso(d: Date) {
  const l = local(d);
  const dias = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
  const hora = l.min ? `${l.hora}h${String(l.min).padStart(2, "0")}` : `${l.hora}h`;
  return `${dias[l.semana]}, ${String(l.dia).padStart(2, "0")}/${String(l.mes + 1).padStart(2, "0")}, às ${hora}`;
}

/** Endereço oficial passado pelo usuário em 03/10/2026 (também na Base de conhecimento). */
export const ENDERECO_LOJA = "Rodovia Margem da PE-75, nº 1418, Goiana — PE";
/** Localização da loja no Google Maps (link passado pelo usuário em 03/10/2026). */
export const LOCAL_LOJA = { latitude: -7.5663383, longitude: -35.0064274, nome: "Gêmeos Motors", endereco: ENDERECO_LOJA };
