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
  /(?<![\p{L}])(test\s?drive|testar a moto|dar uma volta|andar nela|ver (ela |a moto |as motos )?pessoalmente|ver de perto|ir (ai|a[ií]|na loja|ate a loja|ate ai|ate a[ií])|passar (ai|a[ií]|na loja)|dar uma passad\p{L}*|dou uma passad\p{L}*|passo (ai|a[ií]|l[aá]|na loja)|dou um pulo|dar um pulo|visitar|conhecer a loja|vou (ai|a[ií]|na loja|passar ai|passar a[ií])|posso ir|quero ir|da pra ir|agendar (uma )?visita|marcar (uma )?visita)(?![\p{L}])/iu;
/** A última mensagem da loja perguntou o dia e a hora da visita? */
export const RX_PEDIU_HORARIO_VISITA = /dia e hor[aá]rio[^?]{0,60}(vir|visita|test drive|passar)|que horas[^?]{0,40}(vir|passar|visita)|qual dia[^?]{0,40}(vir|passar|visita)|(me |nos )?(fala|diz|informa|manda)\s+(o|qual)\s+dia|que horas fica (melhor|bom)/iu;
/** A loja convidou para vir ("quer vir ver amanhã?", "pode passar aqui sábado?"): o dia que o cliente responder vai para a
 *  agenda (Simulador, 20/10/2026: o vendedor convidou, o cliente disse "só sábado de manhã" e a IA perguntou se agendava). */
export const RX_CONVIDOU_VISITA = /\b(quer|queira|pode|podia|consegue|gostaria de|bora|vem|venha)\b[^?]{0,30}\b(vir|passar|visitar|conhecer|dar uma passada|fazer (um|o) test drive)\b[^?]{0,60}\?/iu;
/** "Talvez sábado", "vou ver se sexta dá", "se der eu passo": o cliente ainda não decidiu. Nada vai para a agenda; a IA
 *  pergunta (dono, 20/10/2026: "tem que ser o mais linear possível, para a IA não marcar nada errado"). */
export const RX_DIA_INCERTO = /(?<![\p{L}])(talvez|acho que|quem sabe|se der|se eu puder|se conseguir|vou ver|vejo|ver se|n[aã]o sei|depende|pode ser que|tento|vou tentar|ainda n[aã]o|te (falo|aviso|digo|confirmo)|depois (te )?(falo|aviso|digo|confirmo|vejo))(?![\p{L}])/iu;
/** "Onde fica a loja?", "qual o endereço?", "manda a localização": quem pergunta onde fica quer vir (dono, 14/10/2026:
 *  "quando o cliente pergunta aonde fica, a IA já pega o horário que ele vai e coloca como test drive"). */
export const RX_PERGUNTA_ENDERECO = /(?<![\p{L}])(onde (fica|[ée]|voc[êe]s ficam|ficam|est[aã]o)|aonde (fica|[ée])|qual (o|[ée] o) endere[çc]o|endere[çc]o da loja|me (manda|passa|envia) (o endere[çc]o|a localiza[çc][ãa]o)|localiza[çc][ãa]o( da loja)?\??$)(?![\p{L}])/iu;

const DIAS_SEMANA: Record<string, number> = { domingo: 0, segunda: 1, terca: 2, quarta: 3, quinta: 4, sexta: 5, sabado: 6 };
const MESES: Record<string, number> = { janeiro: 0, fevereiro: 1, marco: 2, abril: 3, maio: 4, junho: 5, julho: 6, agosto: 7, setembro: 8, outubro: 9, novembro: 10, dezembro: 11 };

/** diaDito: o cliente escreveu o dia; sem ele, "às 10h" sozinho vira hoje ou amanhã (temDia) */
export type DataHoraVisita = {
  quando: Date | null;
  temDia: boolean;
  temHora: boolean;
  diaDito: boolean;
  /** o dia entendido (dito ou suposto) e a hora, separados, para juntar com outra mensagem ou remarcar */
  dia: { ano: number; mes: number; dia: number } | null;
  hora: { hora: number; min: number } | null;
};

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

  /* dia. "amanhã não dá, só sábado": o dia negado não conta (Simulador, 20/10/2026) */
  const td = t.replace(/\b(depois de amanha|amanha|hoje|domingo|segunda|terca|quarta|quinta|sexta|sabado)(?:[- ]feira)?\s*,?\s*(?:eu\s+)?nao\s+(?:da|posso|consigo|vai dar|rola|vou|vai)\b/g, " ");
  let dia: { ano: number; mes: number; dia: number } | null = null;
  const d1 = /(?<!\d)(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?(?!\d)/.exec(td);
  /* "dia 30 de novembro", "5 de dezembro" (Milton, 19/10/2026: "dia 30 de novembro eu compro") */
  const d3 = /(?<!\d)(\d{1,2})\s+de\s+(janeiro|fevereiro|marco|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)\b/.exec(td);
  const d2 = /\bdia\s+(\d{1,2})(?!\d)/.exec(td);
  const semana = /\b(domingo|segunda|terca|quarta|quinta|sexta|sabado)\b/.exec(td);
  if (/\bdepois de amanha\b/.test(td)) dia = mais(hoje, 2);
  else if (/\bamanha\b/.test(td)) dia = mais(hoje, 1);
  else if (/\bhoje\b/.test(td)) dia = mais(hoje, 0);
  else if (d3) {
    const mes = MESES[d3[2]];
    const passou = mes < hoje.mes || (mes === hoje.mes && Number(d3[1]) < hoje.dia);
    dia = { ano: hoje.ano + (passou ? 1 : 0), mes, dia: Number(d3[1]) };
  } else if (d1) {
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
    /* "quinta que vem" dito numa quinta, ou "quinta" sem hora dito numa quinta já no fim do dia: a próxima
       (Simulador de 15/10/2026, quinta às 22h: "na verdade vou na quinta feira" virou hoje, que já tinha passado) */
    if (n === 0 && (/\b(que vem|proxim[ao])\b/.test(td) || (hora === null && hoje.hora >= 17))) n = 7;
    dia = mais(hoje, n);
  }
  const diaDito = !!dia;
  /* só a hora ("às 15h"): hoje, se ainda dá; senão amanhã */
  if (!dia && hora !== null && /\b(hoje|agora|mais tarde)\b|^\D*\d{1,2}\s*(h|:)/.test(t)) dia = mais(hoje, hora > hoje.hora ? 0 : 1);

  const quando = dia && hora !== null ? instante(dia.ano, dia.mes, dia.dia, hora, min) : null;
  return { quando, temDia: !!dia, temHora: hora !== null, diaDito, dia, hora: hora !== null ? { hora, min } : null };
}

function mais(h: { ano: number; mes: number; dia: number }, n: number) {
  const d = new Date(Date.UTC(h.ano, h.mes, h.dia + n));
  return { ano: d.getUTCFullYear(), mes: d.getUTCMonth(), dia: d.getUTCDate() };
}

/** "Dia 30 de novembro eu compro", "sexta eu fecho", "semana que vem venho buscar": o cliente marcou o dia da compra.
 *  Milton, 19/10/2026: "ele entende e já joga no test drive, e na aba fiquem em primeiro os mais próximos". Só com o dia
 *  dito; "não vou comprar agora" não conta. */
const RX_COMPRA_PREVISTA = /(?<![a-z])(?:compro|fecho|fechamos|fecharemos|pego ela|pego a moto|vou (?:comprar|fechar|pegar|buscar)|venho (?:comprar|fechar|pegar|buscar)|(?:vou|passo) (?:ai|la|na loja) (?:pra |para )?(?:comprar|fechar|pegar|buscar))(?![a-z])/;
export function compraPrevista(texto: string, agora: Date = new Date()): { ano: number; mes: number; dia: number } | null {
  const t = semAcento(texto);
  if (!RX_COMPRA_PREVISTA.test(t) || /\bnao (?:vou |da pra |posso )?(?:compr|fech|peg|busc)/.test(t) || RX_DIA_INCERTO.test(texto)) return null;
  const dh = dataHoraDaVisita(texto, agora);
  return dh.diaDito && dh.dia ? dh.dia : null;
}

/** O dia ficou claro? Dito pelo cliente ("quarta", "amanhã", "21/10") ou "hoje"/"agora"/"mais tarde". Só a hora
    ("por volta das 14:00") não é dia claro: a IA pergunta o dia, nunca supõe amanhã (Elton, 15/10/2026: disse quarta,
    a hora veio na mensagem seguinte e o test drive foi parar na sexta). */
export function diaClaro(dh: DataHoraVisita, texto: string) {
  return dh.diaDito || /\b(hoje|agora|mais tarde)\b/.test(semAcento(texto));
}

/** Remarcação: o que o cliente disse agora vale; o que ele não disse fica como estava ("quarta" mantém as 14h). */
export function remarcarPara(dh: DataHoraVisita, atual: Date): Date | null {
  if (!dh.diaDito && !dh.temHora) return null;
  const a = local(atual);
  const d = dh.diaDito && dh.dia ? dh.dia : { ano: a.ano, mes: a.mes, dia: a.dia };
  const h = dh.hora ?? { hora: a.hora, min: a.min };
  return instante(d.ano, d.mes, d.dia, h.hora, h.min);
}

/** "quarta, 21/10" no fuso de Recife (a IA repete o dia ao perguntar a hora: fica escrito na conversa). */
export function diaPorExtenso(d: { ano: number; mes: number; dia: number }) {
  const sem = new Date(Date.UTC(d.ano, d.mes, d.dia)).getUTCDay();
  const dias = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
  return `${dias[sem]}, ${String(d.dia).padStart(2, "0")}/${String(d.mes + 1).padStart(2, "0")}`;
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
