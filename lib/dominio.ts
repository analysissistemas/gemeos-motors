/* ============================================================
   REGRAS DO NEGÓCIO EM UM LUGAR SÓ
   Listas fixas, rótulos em português e cores. A tela e o servidor
   leem daqui, então o que um aceita o outro também aceita.
   ============================================================ */

export type Papel = "admin" | "vendedor" | "tecnico";
export const PAPEIS: Record<Papel, string> = {
  admin: "Administrador",
  vendedor: "Consultor de vendas",
  tecnico: "Técnico / assistência",
};

/* ---------- permissões ---------- */
const TODOS: Papel[] = ["admin", "vendedor", "tecnico"];
const VENDAS: Papel[] = ["admin", "vendedor"];
const ADMIN: Papel[] = ["admin"];

export const PERMISSOES = {
  "painel.ver": VENDAS,
  "conversas.ver": VENDAS,
  "funil.ver": VENDAS,
  "funil.editar": VENDAS,
  "clientes.ver": TODOS,
  "clientes.editar": TODOS,
  "vendas.ver": VENDAS,
  "vendas.editar": VENDAS,
  "vendas.cancelar": ADMIN,
  "estoque.ver": TODOS,
  "estoque.editar": VENDAS,
  "custo.ver": ADMIN,
  "os.ver": TODOS,
  "os.editar": TODOS,
  "financeiro.ver": ADMIN,
  "logs.ver": ADMIN,
  "usuarios.gerenciar": ADMIN,
  "config.gerenciar": ADMIN,
  "cameras.ver": ADMIN,
} as const satisfies Record<string, Papel[]>;
export type Permissao = keyof typeof PERMISSOES;

export function pode(papel: string | undefined, p: Permissao) {
  return !!papel && (PERMISSOES[p] as readonly string[]).includes(papel);
}

/* ---------- funil ---------- */
export const ETAPAS = [
  { id: "whatsapp", rotulo: "Chegou no WhatsApp", curto: "WhatsApp" },
  { id: "proposta", rotulo: "Proposta enviada", curto: "Proposta" },
  { id: "negociando", rotulo: "Negociando / troca", curto: "Negociando" },
  { id: "fechada", rotulo: "Venda fechada", curto: "Fechada" },
  { id: "perdida", rotulo: "Venda perdida", curto: "Perdida" },
] as const;
export type Etapa = (typeof ETAPAS)[number]["id"];
export const ETAPAS_ABERTAS: Etapa[] = ["whatsapp", "proposta", "negociando"];
export const rotuloEtapa = (e: string) => ETAPAS.find((x) => x.id === e)?.rotulo ?? e;

export const MOTIVOS_PERDA = {
  preco: "Preço",
  financiamento: "Financiamento não aprovado",
  troca: "Não chegou a acordo na troca",
  concorrencia: "Comprou na concorrência",
  desistencia: "Desistiu da compra",
  falta_estoque: "Falta de estoque",
  sem_resposta: "Parou de responder",
  outro: "Outro",
} as const;
export type MotivoPerda = keyof typeof MOTIVOS_PERDA;

export const ORIGENS = {
  whatsapp: "WhatsApp",
  instagram: "Instagram",
  indicacao: "Indicação",
  loja: "Passou na loja",
  site: "Site",
  outro: "Outro",
} as const;

/* ---------- veículos ---------- */
export const TIPOS_VEICULO = {
  moto_eletrica: "Moto elétrica",
  triciclo_eletrico: "Triciclo elétrico",
  moto_combustao: "Moto a combustão",
  carro: "Carro",
} as const;
export type TipoVeiculo = keyof typeof TIPOS_VEICULO;
export const ehEletrico = (t: string) => t === "moto_eletrica" || t === "triciclo_eletrico";

export const CONDICOES = {
  zero_km: "Zero km",
  vitrine: "Vitrine",
  seminovo: "Seminovo",
  usado: "Usado",
} as const;

export const STATUS_VEICULO = {
  disponivel: "Disponível",
  reservado: "Reservado",
  vendido: "Vendido",
  inativo: "Fora de venda",
} as const;

export const ORIGENS_ENTRADA = {
  fornecedor: "Fornecedor",
  troca: "Recebido na troca",
  compra: "Compra de particular",
  consignado: "Consignado",
} as const;

/* ---------- vendas ---------- */
export const FORMAS_PAGAMENTO = {
  pix: "PIX",
  dinheiro: "Dinheiro",
  credito: "Cartão de crédito",
  debito: "Cartão de débito",
  transferencia: "Transferência",
  financiamento: "Financiamento",
  troca: "Veículo na troca",
  outro: "Outro",
} as const;
export type FormaPagamento = keyof typeof FORMAS_PAGAMENTO;

export const STATUS_VENDA = {
  rascunho: "Em preenchimento",
  aguardando_assinatura: "Aguardando assinatura",
  assinada: "Assinada",
  finalizada: "Finalizada",
  cancelada: "Cancelada",
} as const;
export type StatusVenda = keyof typeof STATUS_VENDA;

/* passo a passo da venda — a tela mostra onde o vendedor está */
export const PASSOS_VENDA = [
  "Cliente",
  "Veículo",
  "Valores",
  "Condições",
  "Pagamento",
  "Documentação",
  "Revisão",
  "Documento",
  "Assinatura",
  "Finalização",
] as const;

export const CHECKLIST_DOCUMENTACAO = {
  documento_cliente: "Documento com foto do cliente conferido",
  comprovante_endereco: "Comprovante de endereço",
  nota_fiscal: "Nota fiscal / recibo do veículo",
  crlv: "CRLV / transferência (veículo emplacado)",
  manual_garantia: "Manual e termo de garantia entregues",
  chave_reserva: "Chave reserva entregue",
} as const;

/* ---------- assistência ---------- */
export const STATUS_OS = [
  { id: "aberta", rotulo: "Aberta" },
  { id: "aguardando", rotulo: "Aguardando atendimento" },
  { id: "analise", rotulo: "Em análise" },
  { id: "execucao", rotulo: "Em execução" },
  { id: "aguardando_peca", rotulo: "Aguardando peça" },
  { id: "finalizada", rotulo: "Finalizada" },
  { id: "entregue", rotulo: "Entregue" },
] as const;
export type StatusOs = (typeof STATUS_OS)[number]["id"] | "cancelada";
export const rotuloStatusOs = (s: string) =>
  s === "cancelada" ? "Cancelada" : (STATUS_OS.find((x) => x.id === s)?.rotulo ?? s);

export const TIPOS_OS = { assistencia: "Assistência", garantia: "Garantia" } as const;
export const CANAIS_RECEBIMENTO = {
  loja: "Na loja",
  oficina: "Na oficina",
  whatsapp: "Pelo WhatsApp",
  telefone: "Por telefone",
  outro: "Outro canal",
} as const;
export const RESULTADOS_OS = {
  resolvido: "Resolvido",
  parcial: "Resolvido em parte",
  sem_solucao: "Sem solução",
} as const;

/* ---------- atendimento ---------- */
export const STATUS_CONVERSA = {
  nova: "Nova",
  em_atendimento: "Em atendimento",
  aguardando_cliente: "Aguardando cliente",
  follow_up: "Follow-up",
  resolvida: "Resolvida",
  encerrada: "Encerrada",
} as const;
export type StatusConversa = keyof typeof STATUS_CONVERSA;

export const CANAIS_INTERACAO = {
  whatsapp: "WhatsApp",
  ligacao: "Ligação",
  visita: "Visita",
  email: "E-mail",
  outro: "Outro",
} as const;

export const ESTADOS_BR = [
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA", "PB",
  "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO",
] as const;
