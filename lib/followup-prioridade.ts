/* Prioridade do follow-up da equipe (dono, 15/10/2026: "tem que ter uma ordem de priorização, e por que eu tenho que
   fazer o follow-up com a Manuela e não com o Lucas Mendes"). Conta simples e à vista: cada motivo soma pontos e
   aparece na tela, para o vendedor bater o olho e saber por que aquele cliente vem primeiro. Puro, sem banco. */

export type NivelPrioridade = "alta" | "media" | "baixa";
export type Motivo = { texto: string; tom: "quente" | "bom" | "neutro" | "frio" };

const ETAPA: Record<string, { pontos: number; texto: string }> = {
  negociando: { pontos: 35, texto: "Negociando" },
  proposta: { pontos: 30, texto: "Proposta enviada" },
  equipe: { pontos: 30, texto: "Aguardando a equipe" },
  visita: { pontos: 25, texto: "Visita / test drive" },
  interessado: { pontos: 15, texto: "Interessado" },
  whatsapp: { pontos: 5, texto: "Novo contato" },
  fechada: { pontos: 10, texto: "Já comprou (pós-venda)" },
  perdida: { pontos: 0, texto: "Venda perdida" },
};
const TIPO: Record<string, { pontos: number; texto: string }> = {
  revisar_ia: { pontos: 20, texto: "Reclamou do atendimento" },
  retorno_cliente: { pontos: 15, texto: "Fez uma pergunta sem resposta" },
  simulacao: { pontos: 15, texto: "Pediu simulação" },
  entrega: { pontos: 10, texto: "Quer entrega" },
};

const duracao = (h: number) => (h < 1 ? "menos de 1 h" : h < 24 ? `${Math.floor(h)} h` : `${Math.floor(h / 24)} ${Math.floor(h / 24) === 1 ? "dia" : "dias"}`);

export function prioridadeDoFollowUp(p: {
  etapa: string | null;
  /** triagem da IA: alta = quente, media = morno, baixa = frio */
  intencao: string | null;
  tipo: string | null;
  /** a última mensagem da conversa é do cliente (ele está esperando a loja) */
  clienteEsperando: boolean;
  /** horas desde a última mensagem do cliente (null: nunca escreveu) */
  horasDesdeCliente: number | null;
}): { pontos: number; nivel: NivelPrioridade; motivos: Motivo[] } {
  const motivos: Motivo[] = [];
  let pontos = 0;
  if (p.intencao === "alta") {
    pontos += 30;
    motivos.push({ texto: "Lead quente", tom: "quente" });
  } else if (p.intencao === "media") {
    pontos += 15;
    motivos.push({ texto: "Lead morno", tom: "bom" });
  }
  const e = p.etapa ? ETAPA[p.etapa] : null;
  if (e) {
    pontos += e.pontos;
    motivos.push({ texto: e.texto, tom: e.pontos >= 25 ? "bom" : "neutro" });
  }
  const t = p.tipo ? TIPO[p.tipo] : null;
  if (t) {
    pontos += t.pontos;
    motivos.push({ texto: t.texto, tom: "bom" });
  }
  if (p.clienteEsperando && p.horasDesdeCliente !== null) {
    pontos += 25;
    motivos.push({ texto: `Esperando a loja há ${duracao(p.horasDesdeCliente)}`, tom: "quente" });
  } else if (p.horasDesdeCliente !== null && p.horasDesdeCliente >= 7 * 24) {
    pontos -= 15;
    motivos.push({ texto: `Sem falar com a loja há ${duracao(p.horasDesdeCliente)}`, tom: "frio" });
  } else if (p.horasDesdeCliente === null) {
    motivos.push({ texto: "Nunca escreveu", tom: "frio" });
  }
  const nivel: NivelPrioridade = pontos >= 55 ? "alta" : pontos >= 30 ? "media" : "baixa";
  return { pontos, nivel, motivos };
}

/* As 3 tentativas da IA (lib/ia/aquecimento.ts), com nome e o que dizem, para a tela explicar a fila. */
export const TENTATIVAS_IA = [
  { etapa: 1, quando: "1 h sem resposta", nome: "Pergunta do dono", diz: "“O que está faltando para concluirmos a sua compra?”" },
  { etapa: 2, quando: "3 h sem resposta", nome: "Lembrete do benefício", diz: "Carrega na tomada de casa e esquece a gasolina + uma pergunta" },
  { etapa: 3, quando: "23 h sem resposta", nome: "Última chamada", diz: "Deixa a porta aberta e convida para o test drive na loja" },
] as const;

/** Horas desde uma data (null se não houver). */
export const horasDesde = (d: Date | string | null) => (d ? (Date.now() - new Date(d).getTime()) / 3_600_000 : null);
