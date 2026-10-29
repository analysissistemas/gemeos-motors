/* Valores que a tela (cliente) também usa — fora do módulo server-only. */
export const FILTROS_CONVERSA = {
  todas: "Todas",
  nao_lidas: "Não lidas",
  /* a última mensagem é do cliente: ele está esperando resposta, mesmo que alguém já tenha aberto a conversa
     (usuário, 29/10/2026: "além do Não visto, o Não respondido") */
  nao_respondidas: "Não respondidas",
  minhas: "Minhas",
  sem_responsavel: "Sem responsável",
  em_atendimento: "Em atendimento",
  aguardando_cliente: "Aguardando cliente",
  follow_up: "Follow-up",
  negociando: "Em negociação",
  fechada: "Venda fechada",
  perdida: "Venda perdida",
  /* conversas do Simulador, à parte dos clientes reais (dono, 15/10/2026: "o vendedor fica confuso para saber o que
     é cliente real e o que é simulado"). Só aparece para quem pode simular. */
  testes: "Testes",
} as const;
export type FiltroConversa = keyof typeof FILTROS_CONVERSA;
