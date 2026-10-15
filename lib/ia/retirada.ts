/* Retirada na loja com dia e hora (dono, 15/10/2026: "de que horas ele quer buscar? qual o dia? a IA tem que capturar
   isso para fazer o follow-up no dia e na hora certa, lembrando"). O cliente diz "amanhã às 10h" na lista de dados:
   o sistema entende a data, confirma com ele, deixa a tarefa da equipe separar a moto e o lembrete do cliente no dia.
   Puro, sem banco. */
import { dataHoraDaVisita } from "./agenda.ts";
import { lojaAberta, type HorarioLoja } from "./horario.ts";

const H = 3_600_000;
const FUSO = -3 * H; // Recife, sem horário de verão

/** Dia e hora da retirada. `problema` diz o que perguntar de novo quando não dá para marcar. */
export function quandoRetirar(texto: string, horario: HorarioLoja, agora = new Date()): { quando: Date | null; problema: "sem_dia" | "sem_hora" | "passou" | "fechada" | null } {
  const dh = dataHoraDaVisita(texto, agora);
  if (!dh.temDia) return { quando: null, problema: "sem_dia" };
  if (!dh.temHora || !dh.quando) return { quando: null, problema: "sem_hora" };
  if (dh.quando.getTime() < agora.getTime() + 15 * 60_000) return { quando: null, problema: "passou" };
  if (!lojaAberta(horario, dh.quando)) return { quando: null, problema: "fechada" };
  return { quando: dh.quando, problema: null };
}

/** Quando sai cada aviso: a equipe 3 h antes (para separar a moto) e o lembrete do cliente 2 h antes, nunca antes das
 *  8 h do dia nem em cima da hora. O lembrete só sai dentro da janela de 24 h do WhatsApp (contada da última mensagem
 *  do cliente); fora dela a equipe lembra o cliente (`lembreteEm` null, `foraDaJanela`). */
export function planoRetirada(quando: Date, agora: Date, ultimaDoCliente: Date): { equipeEm: Date; lembreteEm: Date | null; foraDaJanela: boolean } {
  const equipeEm = new Date(Math.max(agora.getTime(), quando.getTime() - 3 * H));
  const local = new Date(quando.getTime() + FUSO);
  const oitoDaManha = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate(), 8) - FUSO);
  let lembrete = new Date(Math.max(quando.getTime() - 2 * H, oitoDaManha.getTime()));
  if (lembrete.getTime() > quando.getTime() - 20 * 60_000) lembrete = new Date(quando.getTime() - 20 * 60_000);
  if (lembrete.getTime() < agora.getTime() + 60 * 60_000) return { equipeEm, lembreteEm: null, foraDaJanela: false };
  const foraDaJanela = lembrete.getTime() > ultimaDoCliente.getTime() + 24 * H - 10 * 60_000;
  return { equipeEm, lembreteEm: foraDaJanela ? null : lembrete, foraDaJanela };
}

const horaCurta = (d: Date) => {
  const l = new Date(d.getTime() + FUSO);
  return l.getUTCMinutes() ? `${l.getUTCHours()}h${String(l.getUTCMinutes()).padStart(2, "0")}` : `${l.getUTCHours()}h`;
};
const artigo = (modelo: string) => (/^(patinete|triciclo)/iu.test(modelo) ? "o seu" : "a sua");

/** O lembrete que vai no dia ("hoje às 10h"). Sem endereço nem preço: só o que o cliente combinou. */
export function textoLembreteRetirada(p: { nome: string | null; modelo: string | null; quando: Date }): string {
  const oi = p.nome ? `Oi, ${p.nome}!` : "Oi!";
  const moto = p.modelo ? `${artigo(p.modelo)} *${p.modelo}*` : "a sua moto";
  return `${oi} Passando pra lembrar que hoje, às ${horaCurta(p.quando)}, ${moto} está te esperando aqui na loja 😊 Se precisar mudar o horário, é só me avisar por aqui.`;
}

/** Só as linhas que falam de quando (a de CPF e a de endereço têm números que confundiriam a hora). */
export function trechoDeQuando(horario: string | null | undefined, textoCliente: string): string {
  if (horario?.trim()) return horario;
  const rx = /(hoje|amanh|segunda|ter[çc]a|quarta|quinta|sexta|s[áa]bado|domingo|\bdia\b|\d{1,2}\s*h\b|\d{1,2}:\d{2}|manh[ãa]|tarde)/iu;
  return textoCliente.split(/\n+/).filter((l) => rx.test(l) && !/cpf|rua|av\.|avenida|endere/iu.test(l)).join("\n");
}

/** Confirmação com o dia e a hora certos (só promete o lembrete quando ele vai sair). */
export function textoRetiradaMarcada(p: { nome: string | null; modelo: string | null; quandoExtenso: string; lembrete: boolean }): string {
  const voc = p.nome ? `, ${p.nome}` : "";
  const moto = p.modelo ? `${artigo(p.modelo)} *${p.modelo}*` : "a sua moto";
  return `Perfeito${voc}! Está tudo certinho ✅ Anotei sua retirada para ${p.quandoExtenso}. A equipe vai deixar ${moto} separada pra você${p.lembrete ? ", e no dia eu te mando um lembrete por aqui 😊" : " 😊"}`;
}
