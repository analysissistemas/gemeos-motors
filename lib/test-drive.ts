/* ============================================================
   TEST DRIVE — o que a tela e o servidor compartilham
   (rótulos, duração do horário e o texto de confirmação do WhatsApp).
   As regras que mexem no banco ficam em lib/servicos/test-drive.ts.
   ============================================================ */
import { FUSO } from "@/lib/formato";

export const STATUS_TEST_DRIVE = {
  agendado: "Agendado",
  confirmado: "Confirmado",
  realizado: "Realizado",
  nao_compareceu: "Não compareceu",
  cancelado: "Cancelado",
} as const;
export type StatusTestDrive = keyof typeof STATUS_TEST_DRIVE;
/** Ainda vai acontecer (ou aconteceu e falta registrar o resultado). */
export const STATUS_ABERTOS: StatusTestDrive[] = ["agendado", "confirmado"];

/** Cada test drive ocupa o veículo por 45 minutos. */
export const DURACAO_TEST_DRIVE_MIN = 45;

/* O campo datetime-local é hora de Recife (UTC-3, sem horário de verão). */
export const doCampoLocal = (v: string) => new Date(`${v}:00-03:00`);
export function paraCampoLocal(d: Date) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", { timeZone: FUSO, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
      .formatToParts(d)
      .map((x) => [x.type, x.value]),
  );
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}

/** "sábado, 27/09, às 10h" (ou "às 10h30"). */
export function quandoPorExtenso(d: Date) {
  const f = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("pt-BR", { timeZone: FUSO, ...o }).format(d);
  const [h, m] = f({ hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).split(":");
  return `${f({ weekday: "long" })}, ${f({ day: "2-digit", month: "2-digit" })}, às ${Number(h)}h${m === "00" ? "" : m}`;
}

/* A loja física é uma só (a entrega cobre a região, o ponto é Goiana). */
export const LOJA_TEST_DRIVE = "Goiana";
export const ENDERECO_LOJA = "Rodovia Margem da PE-75, nº 1418, Goiana – PE";

/** Mensagem curta e sem emoji (emoji chega como "?" em alguns celulares). */
export function textoConfirmacao(d: { quando: Date; remarcado?: boolean }) {
  return `Seu test drive na Gêmeos Motors de ${LOJA_TEST_DRIVE} ${d.remarcado ? "foi remarcado" : "está marcado"} para ${quandoPorExtenso(d.quando)}. Endereço: ${ENDERECO_LOJA}. Qualquer mudança é só avisar por aqui.`;
}
