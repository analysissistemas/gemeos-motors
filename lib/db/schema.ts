/* ============================================================
   ESQUEMA DO BANCO — Gêmeos Motors
   ------------------------------------------------------------
   Nomes em camelCase aqui e snake_case no Postgres (casing do Drizzle).
   Domínios fixos (etapa, status, papel) ficam como texto e são validados
   pelo app em lib/dominio.ts: acrescentar um valor novo não exige migration
   de tipo, só atualizar a lista.

   Valores em dinheiro: numeric(12,2) lido como number.
   ============================================================ */
import { sql } from "drizzle-orm";
import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  bigint,
} from "drizzle-orm/pg-core";

const dinheiro = () => numeric({ precision: 12, scale: 2, mode: "number" });
const quando = () => timestamp({ withTimezone: true, mode: "date" });
const criadoEm = () => quando().notNull().defaultNow();

/* ---------- pessoas com acesso ---------- */
export const usuarios = pgTable("usuarios", {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  nome: text().notNull(),
  usuario: text().notNull().unique(),
  email: text(),
  senhaHash: text().notNull(),
  papel: text().notNull(), // admin | vendedor | tecnico
  ativo: boolean().notNull().default(true),
  /* sobe quando a senha muda ou o acesso é desativado: derruba sessões antigas */
  sessaoVersao: integer().notNull().default(1),
  ultimoAcessoEm: quando(),
  criadoEm: criadoEm(),
  atualizadoEm: criadoEm(),
});

/* ---------- lojas (Goiana, Carpina) ---------- */
export const unidades = pgTable("unidades", {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  nome: text().notNull().unique(),
  cidade: text(),
  estado: text(),
  endereco: text(),
  ativo: boolean().notNull().default(true),
  criadoEm: criadoEm(),
});

/* ---------- dados da empresa (uma linha só) — usados nos PDFs ---------- */
export const empresa = pgTable("empresa", {
  id: integer().primaryKey(),
  nomeFantasia: text().notNull(),
  razaoSocial: text(),
  cnpj: text(),
  telefone: text(),
  whatsapp: text(),
  email: text(),
  instagram: text(),
  endereco: text(),
  cidade: text(),
  estado: text(),
  cep: text(),
  condicoesVenda: text(),
  condicoesOs: text(),
  atualizadoEm: criadoEm(),
  atualizadoPor: integer().references(() => usuarios.id, { onDelete: "set null" }),
});

/* ---------- clientes ---------- */
export const clientes = pgTable(
  "clientes",
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    nome: text().notNull(),
    cpf: text(), // só dígitos
    telefone: text(),
    whatsapp: text(),
    email: text(),
    nascimento: date({ mode: "string" }),
    cep: text(),
    endereco: text(),
    numero: text(),
    complemento: text(),
    bairro: text(),
    cidade: text(),
    estado: text(),
    origem: text(), // whatsapp | instagram | indicacao | loja | site | outro
    responsavelId: integer().references(() => usuarios.id, { onDelete: "set null" }),
    observacoes: text(),
    /* criado pelo WhatsApp simulado: some das métricas e sai no "limpar demonstração" */
    demo: boolean().notNull().default(false),
    criadoPor: integer().references(() => usuarios.id, { onDelete: "set null" }),
    criadoEm: criadoEm(),
    atualizadoEm: criadoEm(),
  },
  (t) => [
    uniqueIndex("clientes_cpf_unico").on(t.cpf).where(sql`${t.cpf} is not null`),
    index("clientes_nome_idx").on(sql`lower(${t.nome})`),
    index("clientes_responsavel_idx").on(t.responsavelId),
  ],
);

/* ---------- catálogo de modelos (ficha técnica e preço de tabela) ---------- */
export const modelos = pgTable(
  "modelos",
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    tipo: text().notNull(), // moto_eletrica | triciclo_eletrico | moto_combustao | carro
    marca: text(),
    nome: text().notNull(),
    precoTabela: dinheiro(),
    eletrico: boolean().notNull().default(true),
    ficha: jsonb().$type<Record<string, string>>(),
    ativo: boolean().notNull().default(true),
    criadoEm: criadoEm(),
  },
  (t) => [uniqueIndex("modelos_nome_unico").on(t.nome)],
);

/* ---------- veículos: cada um é peça única ---------- */
export const veiculos = pgTable(
  "veiculos",
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    modeloId: integer().references(() => modelos.id, { onDelete: "set null" }),
    tipo: text().notNull(),
    marca: text(),
    modelo: text().notNull(),
    versao: text(),
    cor: text(),
    anoFabricacao: integer(),
    anoModelo: integer(),
    placa: text(),
    chassi: text(),
    renavam: text(),
    km: integer(),
    condicao: text().notNull(), // zero_km | seminovo | vitrine | usado
    valorAnunciado: dinheiro(),
    custo: dinheiro(), // só administrador vê
    status: text().notNull().default("disponivel"), // disponivel | reservado | vendido | inativo
    unidadeId: integer().references(() => unidades.id, { onDelete: "set null" }),
    origemEntrada: text(), // fornecedor | troca | compra | consignado
    observacoes: text(),
    entradaEm: date({ mode: "string" }).notNull().default(sql`current_date`),
    vendidoEm: quando(),
    criadoPor: integer().references(() => usuarios.id, { onDelete: "set null" }),
    criadoEm: criadoEm(),
    atualizadoEm: criadoEm(),
  },
  (t) => [
    uniqueIndex("veiculos_chassi_unico").on(t.chassi).where(sql`${t.chassi} is not null`),
    uniqueIndex("veiculos_placa_unica").on(t.placa).where(sql`${t.placa} is not null`),
    index("veiculos_status_idx").on(t.status),
  ],
);

/* ---------- funil de vendas ---------- */
export const negocios = pgTable(
  "negocios",
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    clienteId: integer()
      .notNull()
      .references(() => clientes.id, { onDelete: "restrict" }),
    veiculoId: integer().references(() => veiculos.id, { onDelete: "set null" }),
    veiculoInteresse: text(),
    responsavelId: integer().references(() => usuarios.id, { onDelete: "set null" }),
    etapa: text().notNull().default("whatsapp"), // whatsapp | proposta | negociando | fechada | perdida
    origem: text(),
    valorAnunciado: dinheiro(),
    valorProposta: dinheiro(),
    temTroca: boolean().notNull().default(false),
    trocaDescricao: text(),
    trocaValor: dinheiro(),
    etapaDesde: criadoEm(),
    ultimaInteracaoEm: quando(),
    /* resumo da triagem feita pela IA de atendimento, quando houver integração */
    triagemIa: text(),
    /* quem assumiu o atendimento humano depois da triagem */
    atendimentoHumanoId: integer().references(() => usuarios.id, { onDelete: "set null" }),
    perdaMotivo: text(),
    perdaObjecao: text(),
    perdaObservacoes: text(),
    perdidoEm: quando(),
    diagnosticoIa: jsonb().$type<DiagnosticoPerda>(),
    diagnosticoEm: quando(),
    diagnosticoModelo: text(),
    fechadoEm: quando(),
    observacoes: text(),
    demo: boolean().notNull().default(false),
    criadoPor: integer().references(() => usuarios.id, { onDelete: "set null" }),
    criadoEm: criadoEm(),
    atualizadoEm: criadoEm(),
  },
  (t) => [
    index("negocios_etapa_idx").on(t.etapa),
    index("negocios_cliente_idx").on(t.clienteId),
    index("negocios_responsavel_idx").on(t.responsavelId),
    index("negocios_criado_idx").on(t.criadoEm),
  ],
);

export type DiagnosticoPerda = {
  provavelMotivo: string;
  objecoes: string[];
  momentoPerdaInteresse: string;
  comportamentoCliente: string;
  acaoQuePoderiaAjudar: string;
  recomendacaoConsultor: string;
  classificacao: string;
  confianca: "baixa" | "media" | "alta";
  lacunas: string[];
};

export const negocioEventos = pgTable(
  "negocio_eventos",
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    negocioId: integer()
      .notNull()
      .references(() => negocios.id, { onDelete: "cascade" }),
    tipo: text().notNull(),
    descricao: text().notNull(),
    dados: jsonb().$type<Record<string, unknown>>(),
    usuarioId: integer().references(() => usuarios.id, { onDelete: "set null" }),
    criadoEm: criadoEm(),
  },
  (t) => [index("negocio_eventos_negocio_idx").on(t.negocioId, t.criadoEm)],
);

/* ---------- interações (mensagem, ligação, visita) ---------- */
export const interacoes = pgTable(
  "interacoes",
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    clienteId: integer()
      .notNull()
      .references(() => clientes.id, { onDelete: "cascade" }),
    negocioId: integer().references(() => negocios.id, { onDelete: "set null" }),
    canal: text().notNull(), // whatsapp | ligacao | visita | email | outro
    resumo: text().notNull(),
    usuarioId: integer().references(() => usuarios.id, { onDelete: "set null" }),
    criadoEm: criadoEm(),
  },
  (t) => [
    index("interacoes_cliente_idx").on(t.clienteId, t.criadoEm),
    index("interacoes_negocio_idx").on(t.negocioId),
  ],
);

/* ---------- vendas ---------- */
export const vendas = pgTable(
  "vendas",
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    negocioId: integer().references(() => negocios.id, { onDelete: "set null" }),
    clienteId: integer()
      .notNull()
      .references(() => clientes.id, { onDelete: "restrict" }),
    veiculoId: integer().references(() => veiculos.id, { onDelete: "set null" }),
    vendedorId: integer().references(() => usuarios.id, { onDelete: "set null" }),
    valorAnunciado: dinheiro(),
    valorVendido: dinheiro(),
    condicoes: text(),
    observacoes: text(),
    documentacao: jsonb().$type<Record<string, boolean>>(),
    /* rascunho | aguardando_assinatura | assinada | finalizada | cancelada */
    status: text().notNull().default("rascunho"),
    documentoHash: text(),
    documentoGeradoEm: quando(),
    documentoSnapshot: jsonb().$type<Record<string, unknown>>(),
    assinaturaModo: text(), // eletronica | presencial
    finalizadaEm: quando(),
    finalizadaPor: integer().references(() => usuarios.id, { onDelete: "set null" }),
    canceladaEm: quando(),
    cancelamentoMotivo: text(),
    criadoPor: integer().references(() => usuarios.id, { onDelete: "set null" }),
    criadoEm: criadoEm(),
    atualizadoEm: criadoEm(),
  },
  (t) => [
    uniqueIndex("vendas_negocio_unico")
      .on(t.negocioId)
      .where(sql`${t.negocioId} is not null and ${t.status} <> 'cancelada'`),
    index("vendas_status_idx").on(t.status),
    index("vendas_finalizada_idx").on(t.finalizadaEm),
    index("vendas_cliente_idx").on(t.clienteId),
  ],
);

export const vendaPagamentos = pgTable(
  "venda_pagamentos",
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    vendaId: integer()
      .notNull()
      .references(() => vendas.id, { onDelete: "cascade" }),
    /* Sem parcelas e sem pagamento pendente: a loja não trabalha com isso.
       Financiamento entra pelo valor que o banco paga, e só. */
    forma: text().notNull(), // dinheiro | pix | credito | debito | transferencia | financiamento | troca | outro
    valor: dinheiro().notNull(),
    entrada: boolean().notNull().default(false),
    instituicao: text(),
    observacao: text(),
    criadoEm: criadoEm(),
  },
  (t) => [index("venda_pagamentos_venda_idx").on(t.vendaId)],
);

/* ---------- assinaturas (venda e OS) ---------- */
export const assinaturas = pgTable(
  "assinaturas",
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    documentoTipo: text().notNull(), // venda | os
    documentoId: integer().notNull(),
    token: text().notNull().unique(),
    modo: text().notNull(), // eletronica | presencial
    status: text().notNull().default("pendente"), // pendente | assinado | cancelado
    documentoHash: text().notNull(),
    assinanteNome: text(),
    assinanteCpf: text(),
    assinaturaImagem: text(),
    ip: text(),
    userAgent: text(),
    assinadoEm: quando(),
    expiraEm: quando(),
    confirmadoPor: integer().references(() => usuarios.id, { onDelete: "set null" }),
    criadoPor: integer().references(() => usuarios.id, { onDelete: "set null" }),
    criadoEm: criadoEm(),
  },
  (t) => [index("assinaturas_documento_idx").on(t.documentoTipo, t.documentoId)],
);

/* ---------- assistência técnica / garantia ---------- */
export const ordensServico = pgTable(
  "ordens_servico",
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    tipo: text().notNull(), // assistencia | garantia
    clienteId: integer()
      .notNull()
      .references(() => clientes.id, { onDelete: "restrict" }),
    veiculoId: integer().references(() => veiculos.id, { onDelete: "set null" }),
    vendaId: integer().references(() => vendas.id, { onDelete: "set null" }),
    veiculoDescricao: text().notNull(),
    placa: text(),
    chassi: text(),
    km: integer(),
    unidadeId: integer().references(() => unidades.id, { onDelete: "set null" }),
    canalRecebimento: text().notNull(), // loja | oficina | whatsapp | telefone | outro
    /* aberta | aguardando | analise | execucao | aguardando_peca | finalizada | entregue | cancelada */
    status: text().notNull().default("aberta"),
    problemaRelatado: text().notNull(),
    diagnosticoTecnico: text(),
    solucaoAplicada: text(),
    servicosRealizados: text(),
    observacoes: text(),
    resultado: text(), // resolvido | parcial | sem_solucao
    previsaoEntrega: date({ mode: "string" }),
    abertaPor: integer().references(() => usuarios.id, { onDelete: "set null" }),
    recebidaPor: integer().references(() => usuarios.id, { onDelete: "set null" }),
    tecnicoId: integer().references(() => usuarios.id, { onDelete: "set null" }),
    finalizadaPor: integer().references(() => usuarios.id, { onDelete: "set null" }),
    entreguePor: integer().references(() => usuarios.id, { onDelete: "set null" }),
    abertaEm: criadoEm(),
    recebidaEm: quando(),
    finalizadaEm: quando(),
    entregueEm: quando(),
    iaAssistencia: jsonb().$type<AssistenciaIa>(),
    iaEm: quando(),
    criadoEm: criadoEm(),
    atualizadoEm: criadoEm(),
  },
  (t) => [
    index("os_status_idx").on(t.status),
    index("os_cliente_idx").on(t.clienteId),
    index("os_aberta_idx").on(t.abertaEm),
  ],
);

export type AssistenciaIa = {
  resumoProblema: string;
  possiveisCausas: string[];
  verificacoesSugeridas: string[];
  resumoParaConsultor: string;
  mensagemParaCliente: string;
  lacunas: string[];
};

export const osItens = pgTable(
  "os_itens",
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    osId: integer()
      .notNull()
      .references(() => ordensServico.id, { onDelete: "cascade" }),
    tipo: text().notNull(), // peca | servico
    descricao: text().notNull(),
    quantidade: numeric({ precision: 10, scale: 2, mode: "number" }).notNull().default(1),
    valorUnitario: dinheiro().notNull().default(0),
    criadoEm: criadoEm(),
  },
  (t) => [index("os_itens_os_idx").on(t.osId)],
);

export const osEventos = pgTable(
  "os_eventos",
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    osId: integer()
      .notNull()
      .references(() => ordensServico.id, { onDelete: "cascade" }),
    tipo: text().notNull(),
    descricao: text().notNull(),
    deStatus: text(),
    paraStatus: text(),
    dados: jsonb().$type<Record<string, unknown>>(),
    usuarioId: integer().references(() => usuarios.id, { onDelete: "set null" }),
    criadoEm: criadoEm(),
  },
  (t) => [index("os_eventos_os_idx").on(t.osId, t.criadoEm)],
);

/* ============================================================
   ATENDIMENTO / CONVERSAS
   ------------------------------------------------------------
   O modelo é o mesmo para qualquer canal e qualquer provedor: o provedor
   (hoje o simulado, amanhã a Cloud API da Meta) só traduz de e para estas
   tabelas. Por isso `canal` e `provedor` são colunas, não tabelas separadas.
   ============================================================ */
export const conversas = pgTable(
  "conversas",
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    canal: text().notNull().default("whatsapp"), // whatsapp | instagram | site ...
    provedor: text().notNull(), // mock | whatsapp_cloud
    contatoTelefone: text().notNull(), // só dígitos, com DDI
    contatoNome: text(),
    clienteId: integer().references(() => clientes.id, { onDelete: "set null" }),
    negocioId: integer().references(() => negocios.id, { onDelete: "set null" }),
    responsavelId: integer().references(() => usuarios.id, { onDelete: "set null" }),
    /* nova | em_atendimento | aguardando_cliente | follow_up | resolvida | encerrada */
    status: text().notNull().default("nova"),
    prioridade: text().notNull().default("normal"), // normal | alta
    modo: text().notNull().default("ia"), // ia | humano
    triagemIa: jsonb().$type<TriagemIa>(),
    triagemEm: quando(),
    atendimentoHumanoPor: integer().references(() => usuarios.id, { onDelete: "set null" }),
    atendimentoHumanoEm: quando(),
    ultimaMensagemEm: quando(),
    ultimaMensagemTexto: text(),
    ultimaMensagemDirecao: text(),
    naoLidas: integer().notNull().default(0),
    externoId: text(),
    demo: boolean().notNull().default(false),
    criadoEm: criadoEm(),
    atualizadoEm: criadoEm(),
  },
  (t) => [
    uniqueIndex("conversas_contato_unico").on(t.canal, t.contatoTelefone),
    index("conversas_ultima_idx").on(t.ultimaMensagemEm),
    index("conversas_responsavel_idx").on(t.responsavelId),
    index("conversas_cliente_idx").on(t.clienteId),
  ],
);

export type TriagemIa = {
  resumo: string;
  interesse: string | null;
  veiculo: string | null;
  temTroca: boolean | null;
  trocaDescricao: string | null;
  intencaoCompra: "alta" | "media" | "baixa" | "indefinida";
  dadosColetados: string[];
  faltaPerguntar: string[];
  prontoParaHumano: boolean;
};

export const mensagens = pgTable(
  "mensagens",
  {
    id: bigint({ mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    conversaId: integer()
      .notNull()
      .references(() => conversas.id, { onDelete: "cascade" }),
    direcao: text().notNull(), // incoming | outgoing | system
    autor: text().notNull(), // cliente | usuario | ia | sistema
    usuarioId: integer().references(() => usuarios.id, { onDelete: "set null" }),
    /* texto | imagem | video | documento | audio | localizacao | contato | sistema */
    tipo: text().notNull().default("texto"),
    conteudo: text(),
    midiaUrl: text(),
    midiaNome: text(),
    midiaMime: text(),
    midiaTamanho: integer(),
    /* saída: pending | sent | delivered | read | failed — entrada: received */
    status: text().notNull(),
    externoId: text(),
    respostaA: bigint({ mode: "number" }),
    metadados: jsonb().$type<Record<string, unknown>>(),
    lidaEm: quando(),
    criadoEm: criadoEm(),
  },
  (t) => [
    index("mensagens_conversa_idx").on(t.conversaId, t.id),
    uniqueIndex("mensagens_externo_unico").on(t.externoId).where(sql`${t.externoId} is not null`),
  ],
);

export const conversaNotas = pgTable(
  "conversa_notas",
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    conversaId: integer()
      .notNull()
      .references(() => conversas.id, { onDelete: "cascade" }),
    usuarioId: integer().references(() => usuarios.id, { onDelete: "set null" }),
    conteudo: text().notNull(),
    criadoEm: criadoEm(),
  },
  (t) => [index("conversa_notas_conversa_idx").on(t.conversaId, t.criadoEm)],
);

export const followUps = pgTable(
  "follow_ups",
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    conversaId: integer().references(() => conversas.id, { onDelete: "cascade" }),
    clienteId: integer().references(() => clientes.id, { onDelete: "cascade" }),
    negocioId: integer().references(() => negocios.id, { onDelete: "set null" }),
    usuarioId: integer().references(() => usuarios.id, { onDelete: "set null" }),
    agendadoPara: quando().notNull(),
    status: text().notNull().default("pendente"), // pendente | concluido | cancelado
    notas: text(),
    concluidoEm: quando(),
    concluidoPor: integer().references(() => usuarios.id, { onDelete: "set null" }),
    criadoPor: integer().references(() => usuarios.id, { onDelete: "set null" }),
    criadoEm: criadoEm(),
    /* contexto: por que existe este follow-up e de onde veio */
    tipo: text(), // retorno_cliente | pagamento | consulta_terceiro | estoque | manual
    motivo: text(),
    origem: text(), // ia | equipe | estoque
    modeloId: integer().references(() => modelos.id, { onDelete: "set null" }),
    contexto: jsonb().$type<Record<string, unknown>>(),
    exigeAprovacao: boolean().notNull().default(false),
  },
  (t) => [
    index("follow_ups_agenda_idx").on(t.status, t.agendadoPara),
    index("follow_ups_conversa_idx").on(t.conversaId),
  ],
);

export const respostasRapidas = pgTable("respostas_rapidas", {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  atalho: text().notNull().unique(), // sem a barra: "saudacao"
  titulo: text().notNull(),
  conteudo: text().notNull(),
  ativo: boolean().notNull().default(true),
  criadoEm: criadoEm(),
  atualizadoEm: criadoEm(),
});

/* ---------- configurações simples (chave → valor) ---------- */
export const configuracoes = pgTable("configuracoes", {
  chave: text().primaryKey(),
  valor: jsonb().$type<unknown>().notNull(),
  atualizadoEm: criadoEm(),
  atualizadoPor: integer().references(() => usuarios.id, { onDelete: "set null" }),
});

/* ---------- histórico geral (auditoria) ---------- */
export const logs = pgTable(
  "logs",
  {
    id: bigint({ mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    usuarioId: integer().references(() => usuarios.id, { onDelete: "set null" }),
    usuarioNome: text(),
    acao: text().notNull(),
    entidade: text().notNull(),
    entidadeId: text(),
    descricao: text().notNull(),
    dados: jsonb().$type<Record<string, unknown>>(),
    origem: text().notNull().default("sistema"), // sistema | assinatura_publica | script
    ip: text(),
    criadoEm: criadoEm(),
  },
  (t) => [
    index("logs_criado_idx").on(t.criadoEm),
    index("logs_entidade_idx").on(t.entidade, t.entidadeId),
    index("logs_usuario_idx").on(t.usuarioId),
  ],
);

/* ---------- central de IA: prompt por setor (com versões) e conhecimento ---------- */
export const iaPromptVersoes = pgTable(
  "ia_prompt_versoes",
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    secao: text().notNull(), // chave do setor, ver lib/ia/secoes.ts
    versao: integer().notNull(),
    conteudo: text().notNull(),
    status: text().notNull(), // rascunho | publicada | arquivada
    nota: text(),
    criadoPor: integer().references(() => usuarios.id, { onDelete: "set null" }),
    criadoEm: criadoEm(),
    publicadoEm: quando(),
  },
  (t) => [
    uniqueIndex("ia_prompt_secao_versao_uq").on(t.secao, t.versao),
    uniqueIndex("ia_prompt_um_rascunho_uq").on(t.secao).where(sql`${t.status} = 'rascunho'`),
    uniqueIndex("ia_prompt_uma_publicada_uq").on(t.secao).where(sql`${t.status} = 'publicada'`),
  ],
);

export const iaConhecimento = pgTable(
  "ia_conhecimento",
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    categoria: text().notNull(),
    titulo: text().notNull(),
    conteudo: text().notNull(),
    ativo: boolean().notNull().default(true),
    criadoEm: criadoEm(),
    atualizadoEm: criadoEm(),
    atualizadoPor: integer().references(() => usuarios.id, { onDelete: "set null" }),
  },
  (t) => [index("ia_conhecimento_categoria_idx").on(t.categoria)],
);

/* ---------- registro de cada resposta gerada pela IA (enviada ou bloqueada) ---------- */
export const iaExecucoes = pgTable(
  "ia_execucoes",
  {
    id: bigint({ mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    conversaId: integer().references(() => conversas.id, { onDelete: "set null" }),
    origem: text().notNull(), // triagem | ...
    texto: text().notNull(),
    aprovada: boolean().notNull(), // passou no validador
    enviada: boolean().notNull(),
    motivo: text(), // null = enviada | sem_permissao | validador | falha_envio
    violacoes: jsonb().$type<{ regra: string; rotulo: string; detalhe: string }[]>(),
    promptVersoes: jsonb().$type<Record<string, number | null>>(), // setor -> versão publicada (null = texto padrão)
    modelo: text(),
    tokensEntrada: integer(),
    tokensSaida: integer(),
    custoUsd: numeric({ precision: 10, scale: 6, mode: "number" }),
    criadoEm: criadoEm(),
  },
  (t) => [index("ia_execucoes_criado_idx").on(t.criadoEm), index("ia_execucoes_conversa_idx").on(t.conversaId)],
);

/* ---------- interesse do cliente num modelo (para avisar quando voltar ao estoque) ---------- */
export const interessesModelo = pgTable(
  "interesses_modelo",
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    conversaId: integer().notNull().references(() => conversas.id, { onDelete: "cascade" }),
    clienteId: integer().references(() => clientes.id, { onDelete: "set null" }),
    telefone: text().notNull(),
    modeloId: integer().notNull().references(() => modelos.id, { onDelete: "cascade" }),
    origem: text().notNull().default("equipe"), // ia | equipe
    criadoEm: criadoEm(),
    avisadoEm: quando(),
    followUpId: integer().references(() => followUps.id, { onDelete: "set null" }),
  },
  (t) => [
    /* um interesse aberto por conversa e modelo */
    uniqueIndex("interesses_abertos_uq").on(t.conversaId, t.modeloId).where(sql`${t.avisadoEm} is null`),
    index("interesses_modelo_idx").on(t.modeloId),
  ],
);

/* ---------- pedidos de ligação ---------- */
export const solicitacoesLigacao = pgTable(
  "solicitacoes_ligacao",
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    conversaId: integer().references(() => conversas.id, { onDelete: "set null" }),
    clienteId: integer().references(() => clientes.id, { onDelete: "set null" }),
    nomeContato: text(),
    telefone: text().notNull(),
    motivo: text(),
    preferencia: text(), // texto livre: "depois das 14h", "amanhã de manhã"
    status: text().notNull().default("pendente"), // pendente | em_andamento | concluida | nao_atendida | reagendada
    responsavelId: integer().references(() => usuarios.id, { onDelete: "set null" }),
    agendadoPara: quando(),
    foraDoHorario: boolean().notNull().default(false),
    origem: text().notNull().default("cliente"),
    criadoEm: criadoEm(),
    atualizadoEm: criadoEm(),
  },
  (t) => [index("ligacoes_status_idx").on(t.status, t.criadoEm), index("ligacoes_conversa_idx").on(t.conversaId)],
);

export const ligacoesHistorico = pgTable(
  "ligacoes_historico",
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    solicitacaoId: integer().notNull().references(() => solicitacoesLigacao.id, { onDelete: "cascade" }),
    usuarioId: integer().references(() => usuarios.id, { onDelete: "set null" }),
    resultado: text().notNull(), // atendida | nao_atendida | ocupado | numero_errado | reagendada
    duracaoSegundos: integer(),
    notas: text(),
    proximaAcao: text(),
    ocorridaEm: criadoEm(),
  },
  (t) => [index("ligacoes_hist_sol_idx").on(t.solicitacaoId)],
);

/* ---------- câmeras (estrutura pronta; nenhuma conectada) ---------- */
export const cameras = pgTable(
  "cameras",
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    posicao: integer().notNull(),
    nome: text().notNull(),
    fonte: text().notNull(), // rtsp | ip_camera | nvr
    provedor: text().notNull().default("nao_conectado"),
    endereco: text(), // preenchido no cadastro, nunca inventado
    canalNvr: integer(),
    segredoRef: text(), // NOME da variável de ambiente; a senha nunca fica no banco
    status: text().notNull().default("nao_conectada"),
    ativo: boolean().notNull().default(true),
    criadoEm: criadoEm(),
    atualizadoEm: criadoEm(),
  },
  (t) => [uniqueIndex("cameras_posicao_uq").on(t.posicao)],
);

export const cameraEventos = pgTable(
  "camera_eventos",
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    cameraId: integer().notNull().references(() => cameras.id, { onDelete: "cascade" }),
    tipo: text().notNull(),
    descricao: text(),
    ocorridoEm: quando().notNull(),
    criadoEm: criadoEm(),
  },
  (t) => [index("camera_eventos_cam_data_idx").on(t.cameraId, t.ocorridoEm)],
);

export const cameraSnapshots = pgTable(
  "camera_snapshots",
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    cameraId: integer().notNull().references(() => cameras.id, { onDelete: "cascade" }),
    eventoId: integer().references(() => cameraEventos.id, { onDelete: "set null" }),
    arquivoUrl: text().notNull(), // armazenamento de arquivos, não o banco
    tipoMime: text().notNull(),
    capturadoEm: quando().notNull(),
  },
  (t) => [index("camera_snapshots_cam_data_idx").on(t.cameraId, t.capturadoEm)],
);

/* ---------- promoções por tempo limitado (o preço volta ao normal sozinho quando acaba) ---------- */
export const promocoes = pgTable(
  "promocoes",
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    modeloId: integer().notNull().references(() => modelos.id, { onDelete: "cascade" }),
    precoPromocional: dinheiro().notNull(),
    inicioEm: quando().notNull(),
    fimEm: quando().notNull(),
    ativo: boolean().notNull().default(true), // false = encerrada à mão
    criadoPor: integer().references(() => usuarios.id, { onDelete: "set null" }),
    criadoEm: criadoEm(),
  },
  (t) => [index("promocoes_modelo_idx").on(t.modeloId, t.fimEm)],
);
