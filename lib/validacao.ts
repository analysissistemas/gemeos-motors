import { z } from "zod";
import {
  CANAIS_INTERACAO,
  CANAIS_RECEBIMENTO,
  CONDICOES,
  ESTADOS_BR,
  FORMAS_PAGAMENTO,
  MOTIVOS_PERDA,
  ORIGENS,
  ORIGENS_ENTRADA,
  PAPEIS,
  STATUS_VEICULO,
  TIPOS_OS,
  TIPOS_VEICULO,
} from "@/lib/dominio";
import { soDigitos, validarCpf } from "@/lib/formato";

/* mensagens padrão do zod em português: o que escapar das mensagens próprias
   chega na tela legível, não "Invalid input" */
z.config(z.locales.pt());

/* texto opcional: vazio vira null (o banco guarda ausência, não "") */
const opcional = (max = 300) =>
  z
    .string()
    .trim()
    .max(max, `Use no máximo ${max} caracteres`)
    .optional()
    .nullable()
    .transform((v) => (v ? v : null));

const chaves = <T extends Record<string, string>>(o: T) => Object.keys(o) as [keyof T & string, ...(keyof T & string)[]];
const enumOpcional = <T extends Record<string, string>>(o: T) =>
  z
    .union([z.null(), z.literal(""), z.enum(chaves(o))])
    .optional()
    .transform((v) => (v ? v : null));

const idOpcional = z
  .union([z.null(), z.literal(""), z.coerce.number().int().positive()])
  .optional()
  .transform((v) => (typeof v === "number" ? v : null));

const dinheiroOpcional = z
  .union([z.null(), z.literal(""), z.coerce.number().min(0, "Valor inválido").max(99_999_999, "Valor muito alto")])
  .optional()
  .transform((v) => (typeof v === "number" ? Math.round(v * 100) / 100 : null));

const telefone = z
  .string()
  .optional()
  .nullable()
  .transform((v) => soDigitos(v) || null)
  .refine((v) => !v || (v.length >= 10 && v.length <= 13), "Telefone incompleto");

export const esquemaCliente = z
  .object({
    nome: z.string().trim().min(3, "Informe o nome completo").max(160),
    cpf: z
      .string()
      .optional()
      .nullable()
      .transform((v) => soDigitos(v) || null)
      .refine((v) => !v || validarCpf(v), "CPF inválido"),
    telefone,
    whatsapp: telefone,
    email: z
      .string()
      .trim()
      .optional()
      .nullable()
      .transform((v) => (v ? v.toLowerCase() : null))
      .refine((v) => !v || z.email().safeParse(v).success, "E-mail inválido"),
    nascimento: z
      .string()
      .optional()
      .nullable()
      .transform((v) => (v ? v : null))
      .refine((v) => !v || (/^\d{4}-\d{2}-\d{2}$/.test(v) && new Date(v) < new Date() && new Date(v) > new Date("1900-01-01")), "Data inválida"),
    cep: z
      .string()
      .optional()
      .nullable()
      .transform((v) => soDigitos(v) || null)
      .refine((v) => !v || v.length === 8, "CEP com 8 números"),
    endereco: opcional(200),
    numero: opcional(20),
    complemento: opcional(80),
    bairro: opcional(80),
    cidade: opcional(80),
    estado: z
      .union([z.null(), z.literal(""), z.enum(ESTADOS_BR)])
      .optional()
      .transform((v) => (v ? v : null)),
    origem: enumOpcional(ORIGENS),
    responsavelId: idOpcional,
    observacoes: opcional(3000),
  })
  .refine((c) => c.telefone || c.whatsapp, { message: "Informe um telefone ou WhatsApp", path: ["whatsapp"] });
export type DadosCliente = z.infer<typeof esquemaCliente>;

export const esquemaInteracao = z.object({
  clienteId: z.coerce.number().int().positive(),
  negocioId: idOpcional,
  canal: z.enum(chaves(CANAIS_INTERACAO)),
  resumo: z.string().trim().min(3, "Descreva a interação").max(2000),
});

export const esquemaVeiculo = z.object({
  modeloId: idOpcional,
  teste: z.boolean().optional(),
  tipo: z.enum(chaves(TIPOS_VEICULO)),
  marca: opcional(60),
  modelo: z.string().trim().min(1, "Informe o modelo").max(80),
  versao: opcional(80),
  cor: opcional(40),
  anoFabricacao: z
    .union([z.null(), z.literal(""), z.coerce.number().int().min(1950).max(new Date().getFullYear() + 1)])
    .optional()
    .transform((v) => (typeof v === "number" ? v : null)),
  anoModelo: z
    .union([z.null(), z.literal(""), z.coerce.number().int().min(1950).max(new Date().getFullYear() + 2)])
    .optional()
    .transform((v) => (typeof v === "number" ? v : null)),
  placa: z
    .string()
    .optional()
    .nullable()
    .transform((v) => (v ? v.toUpperCase().replace(/[^A-Z0-9]/g, "") : null))
    .refine((v) => !v || /^[A-Z]{3}\d[A-Z0-9]\d{2}$/.test(v), "Placa inválida (ABC1D23)"),
  chassi: z
    .string()
    .optional()
    .nullable()
    .transform((v) => (v ? v.toUpperCase().replace(/\s/g, "") : null))
    .refine((v) => !v || (v.length >= 6 && v.length <= 20), "Chassi inválido"),
  renavam: z
    .string()
    .optional()
    .nullable()
    .transform((v) => soDigitos(v) || null)
    .refine((v) => !v || v.length === 11, "Renavam com 11 números"),
  km: z
    .union([z.null(), z.literal(""), z.coerce.number().int().min(0).max(2_000_000)])
    .optional()
    .transform((v) => (typeof v === "number" ? v : null)),
  condicao: z.enum(chaves(CONDICOES)),
  valorAnunciado: dinheiroOpcional,
  custo: dinheiroOpcional,
  status: z.enum(chaves(STATUS_VEICULO)),
  unidadeId: idOpcional,
  origemEntrada: enumOpcional(ORIGENS_ENTRADA),
  observacoes: opcional(2000),
  entradaEm: z
    .string()
    .optional()
    .nullable()
    .transform((v) => (v ? v : null)),
});

export const esquemaNegocio = z.object({
  clienteId: z.coerce.number().int().positive("Escolha o cliente"),
  veiculoId: idOpcional,
  veiculoInteresse: opcional(160),
  responsavelId: idOpcional,
  origem: enumOpcional(ORIGENS),
  valorAnunciado: dinheiroOpcional,
  valorProposta: dinheiroOpcional,
  temTroca: z.coerce.boolean().default(false),
  trocaDescricao: opcional(300),
  trocaValor: dinheiroOpcional,
  observacoes: opcional(2000),
});

export const esquemaPerda = z.object({
  negocioId: z.coerce.number().int().positive(),
  motivo: z.enum(chaves(MOTIVOS_PERDA), { message: "Escolha o motivo da perda" }),
  objecao: opcional(500),
  observacoes: z.string().trim().min(10, "Conte em poucas palavras o que aconteceu (mínimo 10 letras)").max(3000),
  atendimentoHumanoId: idOpcional,
});

export const esquemaPagamento = z.object({
  forma: z.enum(chaves(FORMAS_PAGAMENTO)),
  valor: z.coerce.number().positive("Valor do pagamento precisa ser maior que zero"),
  entrada: z.coerce.boolean().default(false),
  instituicao: opcional(80),
  observacao: opcional(300),
});
export type DadosPagamento = z.infer<typeof esquemaPagamento>;

export const esquemaOs = z.object({
  tipo: z.enum(chaves(TIPOS_OS)),
  clienteId: z.coerce.number().int().positive("Escolha o cliente"),
  veiculoId: idOpcional,
  vendaId: idOpcional,
  veiculoDescricao: z.string().trim().min(2, "Descreva o veículo").max(160),
  placa: z
    .string()
    .optional()
    .nullable()
    .transform((v) => (v ? v.toUpperCase().replace(/[^A-Z0-9]/g, "") : null)),
  chassi: opcional(20),
  km: z
    .union([z.null(), z.literal(""), z.coerce.number().int().min(0).max(2_000_000)])
    .optional()
    .transform((v) => (typeof v === "number" ? v : null)),
  unidadeId: idOpcional,
  canalRecebimento: z.enum(chaves(CANAIS_RECEBIMENTO)),
  problemaRelatado: z.string().trim().min(5, "Descreva o problema relatado").max(3000),
  observacoes: opcional(3000),
  tecnicoId: idOpcional,
  previsaoEntrega: z
    .string()
    .optional()
    .nullable()
    .transform((v) => (v ? v : null)),
});

export const esquemaUsuario = z.object({
  nome: z.string().trim().min(3, "Informe o nome").max(120),
  usuario: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9._-]{3,32}$/, "Use de 3 a 32 letras minúsculas, números, ponto ou traço"),
  email: z
    .string()
    .trim()
    .optional()
    .nullable()
    .transform((v) => (v ? v.toLowerCase() : null))
    .refine((v) => !v || z.email().safeParse(v).success, "E-mail inválido"),
  papel: z.enum(chaves(PAPEIS)),
});

export const senhaForte = z
  .string()
  .min(10, "A senha precisa de pelo menos 10 caracteres")
  .max(128)
  .refine((s) => /[a-zA-Z]/.test(s) && /\d/.test(s), "Use letras e números");
