/* Horário de funcionamento da loja (puro). Editado em Inteligência artificial →
   Base de conhecimento; entra no prompt como fonte autorizada, então a IA só
   afirma o horário que estiver aqui. Fuso da loja: America/Recife. */

export const DIAS = [
  { id: "seg", nome: "Segunda" },
  { id: "ter", nome: "Terça" },
  { id: "qua", nome: "Quarta" },
  { id: "qui", nome: "Quinta" },
  { id: "sex", nome: "Sexta" },
  { id: "sab", nome: "Sábado" },
  { id: "dom", nome: "Domingo" },
] as const;
export type Dia = (typeof DIAS)[number]["id"];
export type HorarioDia = { aberto: boolean; abre: string; fecha: string };
export type HorarioLoja = { dias: Record<Dia, HorarioDia>; observacao: string };

const util: HorarioDia = { aberto: true, abre: "08:00", fecha: "18:00" };
export const HORARIO_PADRAO: HorarioLoja = {
  dias: { seg: util, ter: util, qua: util, qui: util, sex: util, sab: util, dom: { aberto: false, abre: "08:00", fecha: "18:00" } },
  observacao: "",
};

const HORA = /^([01]\d|2[0-3]):[0-5]\d$/;

export function normalizarHorario(v: unknown): HorarioLoja {
  const x = (v ?? {}) as Partial<HorarioLoja>;
  const dias = Object.fromEntries(
    DIAS.map(({ id }) => {
      const d = (x.dias?.[id] ?? {}) as Partial<HorarioDia>;
      const p = HORARIO_PADRAO.dias[id];
      return [id, { aberto: typeof d.aberto === "boolean" ? d.aberto : p.aberto, abre: HORA.test(d.abre ?? "") ? d.abre! : p.abre, fecha: HORA.test(d.fecha ?? "") ? d.fecha! : p.fecha }];
    }),
  ) as Record<Dia, HorarioDia>;
  return { dias, observacao: typeof x.observacao === "string" ? x.observacao.trim().slice(0, 300) : "" };
}

/** "08:00" → "8h"; "08:30" → "8h30". */
const curta = (h: string) => {
  const [hh, mm] = h.split(":");
  return `${Number(hh)}h${mm === "00" ? "" : mm}`;
};

/** Texto para o cliente e para a IA, juntando dias seguidos com o mesmo horário.
 *  Ex.: "Segunda a sábado: das 8h às 18h (08:00 às 18:00). Domingo: fechado." */
export function textoHorario(h: HorarioLoja) {
  const chave = (d: HorarioDia) => (d.aberto ? `${d.abre}-${d.fecha}` : "fechado");
  const grupos: { de: string; ate: string; dia: HorarioDia }[] = [];
  for (const { id, nome } of DIAS) {
    const d = h.dias[id];
    const ultimo = grupos.at(-1);
    if (ultimo && chave(ultimo.dia) === chave(d)) ultimo.ate = nome;
    else grupos.push({ de: nome, ate: nome, dia: d });
  }
  const linhas = grupos.map((g) => {
    const dias = g.de === g.ate ? g.de : `${g.de} a ${g.ate.toLowerCase()}`;
    return g.dia.aberto ? `${dias}: das ${curta(g.dia.abre)} às ${curta(g.dia.fecha)} (${g.dia.abre} às ${g.dia.fecha}).` : `${dias}: fechado.`;
  });
  return [...linhas, h.observacao].filter(Boolean).join("\n");
}

/** Data, hora e dia da semana agora no fuso da loja. */
export function agoraNaLoja(agora = new Date()) {
  const partes = Object.fromEntries(
    new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Recife", weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
      .formatToParts(agora)
      .map((p) => [p.type, p.value]),
  );
  const mapa: Record<string, Dia> = { seg: "seg", ter: "ter", qua: "qua", qui: "qui", sex: "sex", sáb: "sab", sab: "sab", dom: "dom" };
  const dia = mapa[(partes.weekday ?? "").replace(".", "").toLowerCase()] ?? "seg";
  const hora = `${partes.hour}:${partes.minute}`;
  const extenso = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Recife", dateStyle: "full", timeStyle: "short" }).format(agora);
  return { dia, hora, extenso };
}

export function lojaAberta(h: HorarioLoja, agora = new Date()) {
  const { dia, hora } = agoraNaLoja(agora);
  const d = h.dias[dia];
  return d.aberto && hora >= d.abre && hora < d.fecha;
}

/** Cumprimento pelo horário de Recife (bom dia até 12h, boa tarde até 18h, boa noite depois). */
export function saudacaoDoHorario(agora = new Date()) {
  const h = Number(agoraNaLoja(agora).hora.slice(0, 2));
  return h < 12 ? "bom dia" : h < 18 ? "boa tarde" : "boa noite";
}
