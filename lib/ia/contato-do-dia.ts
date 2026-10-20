/* Contato no dia combinado (dono, 20/10/2026: "a IA tem que perguntar o horário ou o período para fazer o follow-up e
   disparar automaticamente" e "a IA tem que ser uma vendedora mais esperta").

   1. "Talvez sábado eu passo aí": nada vai para a agenda. A IA pergunta se é de manhã ou à tarde e programa uma
      mensagem para o cliente no dia (manhã 8h, tarde 11h, hora dita 2 h antes, sem resposta 9h).
   2. Visita avisada sem hora ("sexta vou aí"): às 8h do dia a IA pergunta o horário ao cliente.
   3. No dia, dentro da janela de 24 h do WhatsApp vai texto; fora dela, o modelo aprovado pela Meta (confirmar_visita
      ou lembrete_visita). Sem modelo aprovado, vira tarefa para a equipe com o texto pronto.

   Puro (sem banco), para os testes rodarem direto no Node. */
import { dataHoraDaVisita } from "./agenda.ts";

const FUSO_MIN = -3 * 60;
const semAcento = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

export type Dia = { ano: number; mes: number; dia: number };
export type Periodo = "manha" | "tarde" | { hora: number; min: number };

/** "de manhã", "à tarde", "lá pras 15h", "depois do almoço". null = não disse. */
export function periodoDoTexto(texto: string, agora: Date = new Date()): Periodo | null {
  const dh = dataHoraDaVisita(texto, agora);
  if (dh.hora) return dh.hora;
  /* "boa tarde" é cumprimento, não período */
  const t = semAcento(texto).replace(/\b(boa (tarde|noite)|bom dia)\b/g, " ");
  if (/\b(tarde|depois do almoco|apos o almoco|fim do dia)\b/.test(t)) return "tarde";
  if (/\b(manha|cedo|cedinho)\b/.test(t)) return "manha";
  return null;
}

/** Instante (Recife) de um dia e hora locais. */
function instante(d: Dia, hora: number, min = 0) {
  return new Date(Date.UTC(d.ano, d.mes, d.dia, hora, min) - FUSO_MIN * 60_000);
}

/** Quando a mensagem do dia sai: manhã 8h, tarde 11h, hora dita 2 h antes (nunca antes das 8h), sem período 9h. */
export function horaDoContato(dia: Dia, p: Periodo | null): Date {
  if (p === "manha") return instante(dia, 8);
  if (p === "tarde") return instante(dia, 11);
  if (p) return new Date(Math.max(instante(dia, 8).getTime(), instante(dia, p.hora, p.min).getTime() - 2 * 3_600_000));
  return instante(dia, 9);
}

/** "de manhã", "à tarde", "por volta das 15h". */
export function periodoPorExtenso(p: Periodo | null): string {
  if (!p) return "";
  if (p === "manha") return "de manhã";
  if (p === "tarde") return "à tarde";
  return `por volta das ${p.hora}h${p.min ? String(p.min).padStart(2, "0") : ""}`;
}

const maiuscula = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** A pergunta da IA no "talvez sábado" (o dia vai por extenso: "sábado, 24/10"). */
export function textoPerguntaPeriodo(p: { nome: string | null; diaExtenso: string }): string {
  return `Fica à vontade${p.nome ? `, ${p.nome}` : ""}! ${maiuscula(p.diaExtenso.split(",")[0])} você pensa em vir mais de manhã ou à tarde? Assim no dia eu te chamo por aqui pra confirmar 😊`;
}
/** A última fala da loja foi a pergunta do período? */
export const RX_PERGUNTOU_PERIODO = /mais de manh[ãa] ou [àa] tarde/iu;

/** Período combinado: a IA confirma que chama no dia (sem anotar visita). Sem "é só me chamar": o filtro de enchimento
 *  (nos.ts) tiraria a frase inteira (Simulador, 20/10/2026: saiu só "Fechado!"). */
export function textoContatoCombinado(p: { nome: string | null; diaExtenso: string; periodo: Periodo | null }): string {
  const quando = [p.diaExtenso.split(",")[0], periodoPorExtenso(p.periodo)].filter(Boolean).join(" ");
  return `Fechado${p.nome ? `, ${p.nome}` : ""}! ${maiuscula(quando)} eu te chamo por aqui pra confirmar ✅`;
}

/** A mensagem do dia, dentro da janela de 24 h ("talvez" ou visita avisada sem hora). */
export function textoDoDia(p: { nome: string | null; modelo: string | null; periodo: Periodo | null }): string {
  const moto = p.modelo ? `a *${p.modelo}*` : "as nossas motos";
  const quando = periodoPorExtenso(p.periodo) || "hoje";
  return `Oi${p.nome ? `, ${p.nome}` : ""}! Hoje é o dia de ver ${moto} de perto 😊 Ainda dá pra você passar aqui ${quando}? Me fala que horas fica melhor pra você que eu deixo tudo pronto.`;
}

/* ---------- modelos da Meta (fora da janela de 24 h) ---------- */

type DefinicaoModelo = { nome: string; idioma: "pt_BR"; corpo: string; exemplo: string[] };

/** Contato do dia: "talvez" e visita avisada sem hora. {{1}} nome, {{2}} moto. */
export const MODELO_CONFIRMAR_VISITA: DefinicaoModelo = {
  nome: "confirmar_visita",
  idioma: "pt_BR",
  corpo: "Oi, {{1}}! Aqui é o Milton, da Gêmeos Motors. Você comentou que pensava em vir aqui na loja hoje ver a {{2}}. Ainda está de pé? Me responde com o horário que fica melhor pra você que eu deixo tudo pronto.",
  exemplo: ["Edimilson", "N2"],
};
/** Lembrete da visita ou do test drive com hora. {{1}} nome, {{2}} "da sua visita" / "do seu test drive da N2", {{3}} hora. */
export const MODELO_LEMBRETE_VISITA: DefinicaoModelo = {
  nome: "lembrete_visita",
  idioma: "pt_BR",
  corpo: "Oi, {{1}}! Aqui é o Milton, da Gêmeos Motors. Passando pra lembrar {{2}} hoje, às {{3}}, aqui na loja. Se precisar mudar o horário, é só responder esta mensagem.",
  exemplo: ["Edimilson", "da sua visita", "15h"],
};
export const MODELOS_DO_CLIENTE = [MODELO_CONFIRMAR_VISITA, MODELO_LEMBRETE_VISITA];

/** O que vai para a Meta na criação (categoria Utilidade: lembrete do que o cliente combinou). */
export function definicaoParaMeta(m: DefinicaoModelo) {
  return { name: m.nome, language: m.idioma, category: "UTILITY", components: [{ type: "BODY", text: m.corpo, example: { body_text: [m.exemplo] } }] };
}

/** O modelo preenchido, como fica no chat. */
export function textoDoModelo(m: DefinicaoModelo, valores: string[]): string {
  return m.corpo.replace(/\{\{(\d+)\}\}/g, (_, i) => valores[Number(i) - 1] ?? "");
}

/** Os campos do modelo: sem nome, "tudo bem" ("Oi, tudo bem! Aqui é o Milton…"); a Meta não aceita campo vazio. */
export function valoresConfirmar(p: { nome: string | null; modelo: string | null }): string[] {
  return [p.nome || "tudo bem", p.modelo || "moto"];
}
export function valoresLembrete(p: { nome: string | null; descricao: string | null; hora: string }): string[] {
  const visita = !p.descricao || /^visita/iu.test(p.descricao);
  return [p.nome || "tudo bem", visita ? "da sua visita" : `do seu test drive da ${p.descricao}`, p.hora];
}
