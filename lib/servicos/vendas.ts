import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/lib/db";
import { ErroRegra } from "@/lib/acao";
import { registrarLog } from "@/lib/logs";
import { CHECKLIST_DOCUMENTACAO, CONDICOES, FORMAS_PAGAMENTO, TIPOS_VEICULO, ehEletrico } from "@/lib/dominio";
import { brl, formatarCpf, numeroDoc, soDigitos } from "@/lib/formato";
import { esquemaPagamento } from "@/lib/validacao";
import { conferirPagamentos } from "./negocios";
import { anotarNegocioNaConversa } from "@/lib/mensageria/anotacoes";

type Quem = { id: number; nome: string };
const VALIDADE_LINK_DIAS = 7;

/* ============================================================
   VENDA: rascunho → documento → assinatura → finalizada
   O documento é uma FOTOGRAFIA dos dados (snapshot) com código (hash).
   Mudou algo depois de gerar? O documento antigo deixa de valer e
   precisa ser gerado e assinado de novo — o cliente assina o que viu.
   ============================================================ */

export const esquemaRascunho = z.object({
  clienteId: z.coerce.number().int().positive("Escolha o cliente"),
  veiculoId: z
    .union([z.null(), z.literal(""), z.coerce.number().int().positive()])
    .transform((v) => (typeof v === "number" ? v : null)),
  valorAnunciado: z.union([z.null(), z.coerce.number().min(0)]).transform((v) => v ?? null),
  valorVendido: z.union([z.null(), z.coerce.number().min(0)]).transform((v) => v ?? null),
  condicoes: z.string().max(4000).nullable().optional().transform((v) => v?.trim() || null),
  observacoes: z.string().max(4000).nullable().optional().transform((v) => v?.trim() || null),
  documentacao: z.record(z.string(), z.boolean()).default({}),
  pagamentos: z.array(esquemaPagamento.extend({ valor: z.coerce.number().min(0) })).default([]),
});

export async function criarVendaDireta(u: Quem, clienteId: number) {
  return db.transaction(async (tx) => {
    const [c] = await tx.select({ nome: schema.clientes.nome }).from(schema.clientes).where(eq(schema.clientes.id, clienteId)).limit(1);
    if (!c) throw new ErroRegra("Cliente não encontrado.");
    const [v] = await tx.insert(schema.vendas).values({ clienteId, vendedorId: u.id, criadoPor: u.id, status: "rascunho" }).returning({ id: schema.vendas.id });
    await registrarLog(u, { acao: "venda.criada", entidade: "venda", entidadeId: v.id, descricao: `Iniciou a venda ${numeroDoc("V", v.id)} para ${c.nome}` }, tx);
    return v.id;
  });
}

export async function salvarRascunho(u: Quem, vendaId: number, entrada: unknown) {
  const d = esquemaRascunho.parse(entrada);
  return db.transaction(async (tx) => {
    const [venda] = await tx.select().from(schema.vendas).where(eq(schema.vendas.id, vendaId)).limit(1);
    if (!venda) throw new ErroRegra("Venda não encontrada.");
    if (venda.status === "finalizada" || venda.status === "cancelada") throw new ErroRegra("Venda encerrada não pode ser alterada.");
    if (venda.negocioId && venda.clienteId !== d.clienteId) throw new ErroRegra("A venda veio de um negócio: o cliente não muda.");

    if (d.veiculoId && d.veiculoId !== venda.veiculoId) {
      const [v] = await tx.select({ status: schema.veiculos.status }).from(schema.veiculos).where(eq(schema.veiculos.id, d.veiculoId)).limit(1);
      if (!v) throw new ErroRegra("Veículo não encontrado.");
      if (v.status === "vendido") throw new ErroRegra("Este veículo já foi vendido.");
      if (venda.veiculoId) await tx.update(schema.veiculos).set({ status: "disponivel" }).where(and(eq(schema.veiculos.id, venda.veiculoId), eq(schema.veiculos.status, "reservado")));
      await tx.update(schema.veiculos).set({ status: "reservado" }).where(and(eq(schema.veiculos.id, d.veiculoId), eq(schema.veiculos.status, "disponivel")));
    }

    const validos = d.pagamentos.filter((p) => p.valor > 0);
    /* documento já gerado + mudança de dado = documento invalidado */
    const antigos = await tx.select().from(schema.vendaPagamentos).where(eq(schema.vendaPagamentos.vendaId, vendaId));
    const chavePag = (ps: { forma: string; valor: number; entrada: boolean; instituicao?: string | null; observacao?: string | null }[]) =>
      JSON.stringify(ps.map((p) => [p.forma, Number(p.valor), p.entrada, p.instituicao ?? null, p.observacao ?? null]));
    const mudouDocumento =
      !!venda.documentoHash &&
      (venda.clienteId !== d.clienteId ||
        venda.veiculoId !== d.veiculoId ||
        venda.valorAnunciado !== d.valorAnunciado ||
        venda.valorVendido !== d.valorVendido ||
        (venda.condicoes ?? null) !== d.condicoes ||
        (venda.observacoes ?? null) !== d.observacoes ||
        chavePag(antigos) !== chavePag(validos));

    await tx
      .update(schema.vendas)
      .set({
        clienteId: d.clienteId,
        veiculoId: d.veiculoId,
        valorAnunciado: d.valorAnunciado,
        valorVendido: d.valorVendido,
        condicoes: d.condicoes,
        observacoes: d.observacoes,
        documentacao: d.documentacao,
        atualizadoEm: new Date(),
        ...(mudouDocumento && { status: "rascunho", documentoHash: null, documentoGeradoEm: null, documentoSnapshot: null, assinaturaModo: null }),
      })
      .where(eq(schema.vendas.id, vendaId));
    await tx.delete(schema.vendaPagamentos).where(eq(schema.vendaPagamentos.vendaId, vendaId));
    if (validos.length) await tx.insert(schema.vendaPagamentos).values(validos.map((p) => ({ ...p, vendaId })));

    if (mudouDocumento) {
      await tx.update(schema.assinaturas).set({ status: "cancelado" }).where(and(eq(schema.assinaturas.documentoTipo, "venda"), eq(schema.assinaturas.documentoId, vendaId), ne(schema.assinaturas.status, "cancelado")));
      await registrarLog(u, { acao: "venda.documento_invalidado", entidade: "venda", entidadeId: vendaId, descricao: `Alterou dados da venda ${numeroDoc("V", vendaId)} depois do documento gerado: documento e assinaturas anteriores deixaram de valer` }, tx);
    }
    if (chavePag(antigos) !== chavePag(validos))
      await registrarLog(u, { acao: "venda.pagamento_alterado", entidade: "venda", entidadeId: vendaId, descricao: `Alterou os pagamentos da venda ${numeroDoc("V", vendaId)}` }, tx);
    await registrarLog(u, { acao: "venda.editada", entidade: "venda", entidadeId: vendaId, descricao: `Salvou a venda ${numeroDoc("V", vendaId)}` }, tx);
    return { documentoInvalidado: mudouDocumento };
  });
}

/** O que falta para gerar o documento. Lista vazia = pode gerar. */
export async function pendenciasDocumento(vendaId: number) {
  const [linha] = await db
    .select({ venda: schema.vendas, cliente: schema.clientes })
    .from(schema.vendas)
    .innerJoin(schema.clientes, eq(schema.clientes.id, schema.vendas.clienteId))
    .where(eq(schema.vendas.id, vendaId))
    .limit(1);
  if (!linha) return ["Venda não encontrada"];
  const p: string[] = [];
  if (!soDigitos(linha.cliente.cpf)) p.push("CPF do cliente (edite o cadastro)");
  if (!linha.venda.veiculoId) p.push("Veículo vendido");
  if (!linha.venda.valorAnunciado) p.push("Valor anunciado");
  if (!linha.venda.valorVendido) p.push("Valor vendido");
  const pags = await db.select().from(schema.vendaPagamentos).where(eq(schema.vendaPagamentos.vendaId, vendaId));
  if (!pags.length) p.push("Forma de pagamento");
  else if (linha.venda.valorVendido) {
    const soma = Math.round(pags.reduce((s, x) => s + x.valor, 0) * 100);
    if (soma !== Math.round(linha.venda.valorVendido * 100)) p.push("Pagamentos somando o valor vendido");
  }
  return p;
}

export type SnapshotVenda = Awaited<ReturnType<typeof montarSnapshot>>;

async function montarSnapshot(vendaId: number) {
  const [l] = await db
    .select({ venda: schema.vendas, cliente: schema.clientes, veiculo: schema.veiculos, vendedor: schema.usuarios.nome })
    .from(schema.vendas)
    .innerJoin(schema.clientes, eq(schema.clientes.id, schema.vendas.clienteId))
    .leftJoin(schema.veiculos, eq(schema.veiculos.id, schema.vendas.veiculoId))
    .leftJoin(schema.usuarios, eq(schema.usuarios.id, schema.vendas.vendedorId))
    .where(eq(schema.vendas.id, vendaId))
    .limit(1);
  const [emp] = await db.select().from(schema.empresa).where(eq(schema.empresa.id, 1)).limit(1);
  const pags = await db.select().from(schema.vendaPagamentos).where(eq(schema.vendaPagamentos.vendaId, vendaId)).orderBy(schema.vendaPagamentos.id);
  const c = l.cliente;
  const v = l.veiculo!;
  return {
    numero: numeroDoc("V", vendaId),
    geradoEm: new Date().toISOString(),
    empresa: {
      nome: emp?.nomeFantasia ?? "Gêmeos Motors",
      razaoSocial: emp?.razaoSocial ?? null,
      cnpj: emp?.cnpj ?? null,
      endereco: [emp?.endereco, emp?.cidade, emp?.estado].filter(Boolean).join(" — ") || null,
      telefone: emp?.whatsapp ?? emp?.telefone ?? null,
      instagram: emp?.instagram ?? null,
    },
    cliente: {
      nome: c.nome,
      cpf: formatarCpf(c.cpf),
      telefone: c.whatsapp ?? c.telefone,
      email: c.email,
      endereco: [[c.endereco, c.numero].filter(Boolean).join(", "), c.complemento, c.bairro, [c.cidade, c.estado].filter(Boolean).join("/"), c.cep ? `CEP ${c.cep}` : null].filter(Boolean).join(" — ") || null,
    },
    veiculo: {
      tipo: TIPOS_VEICULO[v.tipo as keyof typeof TIPOS_VEICULO] ?? v.tipo,
      marca: v.marca,
      modelo: [v.modelo, v.versao].filter(Boolean).join(" "),
      cor: v.cor,
      ano: v.anoModelo ? `${v.anoFabricacao ?? v.anoModelo}/${v.anoModelo}` : null,
      placa: ehEletrico(v.tipo) ? null : v.placa,
      chassi: v.chassi,
      renavam: ehEletrico(v.tipo) ? null : v.renavam,
      km: v.km,
      condicao: CONDICOES[v.condicao as keyof typeof CONDICOES] ?? v.condicao,
    },
    valores: {
      anunciado: l.venda.valorAnunciado!,
      vendido: l.venda.valorVendido!,
      desconto: Math.max(0, Math.round(((l.venda.valorAnunciado ?? 0) - (l.venda.valorVendido ?? 0)) * 100) / 100),
    },
    pagamentos: pags.map((p) => ({ forma: FORMAS_PAGAMENTO[p.forma as keyof typeof FORMAS_PAGAMENTO] ?? p.forma, valor: p.valor, entrada: p.entrada, detalhe: p.instituicao ?? p.observacao ?? null })),
    entrada: pags.filter((p) => p.entrada).reduce((s, p) => s + p.valor, 0),
    condicoesPadrao: emp?.condicoesVenda ?? null,
    condicoes: l.venda.condicoes,
    observacoes: l.venda.observacoes,
    documentacao: Object.entries(l.venda.documentacao ?? {})
      .filter(([, ok]) => ok)
      .map(([k]) => CHECKLIST_DOCUMENTACAO[k as keyof typeof CHECKLIST_DOCUMENTACAO] ?? k),
    vendedor: l.vendedor,
  };
}

/** Texto canônico (chaves ordenadas) → hash estável do documento. */
export function hashDocumento(dados: unknown) {
  const ordenar = (x: unknown): unknown =>
    Array.isArray(x) ? x.map(ordenar) : x && typeof x === "object" ? Object.fromEntries(Object.keys(x).sort().map((k) => [k, ordenar((x as Record<string, unknown>)[k])])) : x;
  return createHash("sha256").update(JSON.stringify(ordenar(dados))).digest("hex");
}

export async function gerarDocumentoVenda(u: Quem, vendaId: number) {
  const pend = await pendenciasDocumento(vendaId);
  if (pend.length) throw new ErroRegra(`Falta para gerar o documento: ${pend.join(", ")}.`);
  const snapshot = await montarSnapshot(vendaId);
  const hash = hashDocumento(snapshot);
  await db.transaction(async (tx) => {
    const [v] = await tx.select({ status: schema.vendas.status }).from(schema.vendas).where(eq(schema.vendas.id, vendaId)).limit(1);
    if (v.status === "finalizada" || v.status === "cancelada") throw new ErroRegra("Venda encerrada.");
    await tx.update(schema.assinaturas).set({ status: "cancelado" }).where(and(eq(schema.assinaturas.documentoTipo, "venda"), eq(schema.assinaturas.documentoId, vendaId), eq(schema.assinaturas.status, "pendente")));
    await tx
      .update(schema.vendas)
      .set({ documentoSnapshot: snapshot, documentoHash: hash, documentoGeradoEm: new Date(), status: "aguardando_assinatura", assinaturaModo: null, atualizadoEm: new Date() })
      .where(eq(schema.vendas.id, vendaId));
    await registrarLog(u, { acao: "documento.gerado", entidade: "venda", entidadeId: vendaId, descricao: `Gerou o documento da venda ${snapshot.numero} (código ${hash.slice(0, 12)})` }, tx);
  });
  return hash;
}

export async function criarLinkAssinatura(u: Quem, documentoTipo: "venda" | "os", documentoId: number, documentoHash: string) {
  const token = randomBytes(32).toString("base64url");
  await db.transaction(async (tx) => {
    await tx.update(schema.assinaturas).set({ status: "cancelado" }).where(and(eq(schema.assinaturas.documentoTipo, documentoTipo), eq(schema.assinaturas.documentoId, documentoId), eq(schema.assinaturas.status, "pendente")));
    await tx.insert(schema.assinaturas).values({
      documentoTipo,
      documentoId,
      token,
      modo: "eletronica",
      documentoHash,
      expiraEm: new Date(Date.now() + VALIDADE_LINK_DIAS * 86400000),
      criadoPor: u.id,
    });
    await registrarLog(u, { acao: "assinatura.link_criado", entidade: documentoTipo, entidadeId: documentoId, descricao: `Gerou link de assinatura do documento ${numeroDoc(documentoTipo === "venda" ? "V" : "OS", documentoId)} (válido por ${VALIDADE_LINK_DIAS} dias)` }, tx);
  });
  return token;
}

export async function confirmarAssinaturaPresencial(u: Quem, vendaId: number, nomeAssinante: string) {
  if (nomeAssinante.trim().length < 3) throw new ErroRegra("Informe o nome de quem assinou.");
  return db.transaction(async (tx) => {
    const [v] = await tx.select().from(schema.vendas).where(eq(schema.vendas.id, vendaId)).limit(1);
    if (!v?.documentoHash) throw new ErroRegra("Gere o documento antes.");
    if (v.status !== "aguardando_assinatura") throw new ErroRegra("Esta venda não está aguardando assinatura.");
    await tx.update(schema.assinaturas).set({ status: "cancelado" }).where(and(eq(schema.assinaturas.documentoTipo, "venda"), eq(schema.assinaturas.documentoId, vendaId), eq(schema.assinaturas.status, "pendente")));
    await tx.insert(schema.assinaturas).values({
      documentoTipo: "venda",
      documentoId: vendaId,
      token: randomBytes(24).toString("base64url"),
      modo: "presencial",
      status: "assinado",
      documentoHash: v.documentoHash,
      assinanteNome: nomeAssinante.trim(),
      assinadoEm: new Date(),
      confirmadoPor: u.id,
      criadoPor: u.id,
    });
    await tx.update(schema.vendas).set({ status: "assinada", assinaturaModo: "presencial", atualizadoEm: new Date() }).where(eq(schema.vendas.id, vendaId));
    await registrarLog(u, { acao: "assinatura.presencial", entidade: "venda", entidadeId: vendaId, descricao: `Confirmou que ${nomeAssinante.trim()} assinou no papel o documento da venda ${numeroDoc("V", vendaId)}` }, tx);
    if (v.negocioId) await tx.insert(schema.negocioEventos).values({ negocioId: v.negocioId, tipo: "assinatura", descricao: "Documento assinado presencialmente", usuarioId: u.id });
  });
}

export async function assinarPublico(token: string, entrada: { nome: string; cpf: string; aceite: boolean; imagem: string }, ip: string | null, ua: string | null) {
  if (!entrada.aceite) throw new ErroRegra("Marque que leu e concorda com o documento.");
  if (entrada.nome.trim().length < 5) throw new ErroRegra("Digite seu nome completo.");
  if (!/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(entrada.imagem) || entrada.imagem.length > 400_000) throw new ErroRegra("Faça sua assinatura no quadro.");
  // Limite de CPF errado por link, contado no histórico (sem coluna nova).
  const [tk] = await db.select({ id: schema.assinaturas.id }).from(schema.assinaturas).where(eq(schema.assinaturas.token, token)).limit(1);
  if (tk && (await tentativasCpfErrado(tk.id)) >= MAX_TENTATIVAS_CPF) throw new ErroRegra("Muitas tentativas com CPF incorreto. Peça um novo link à loja.");
  const res = await db.transaction(async (tx) => {
    const [a] = await tx.select().from(schema.assinaturas).where(eq(schema.assinaturas.token, token)).limit(1);
    if (!a || a.status === "cancelado") throw new ErroRegra("Este link não é mais válido. Peça um novo à loja.");
    if (a.status === "assinado") throw new ErroRegra("Este documento já foi assinado.");
    if (a.expiraEm && a.expiraEm < new Date()) throw new ErroRegra("Este link expirou. Peça um novo à loja.");
    if (a.documentoTipo !== "venda") throw new ErroRegra("Documento inválido.");
    const [linha] = await tx
      .select({ venda: schema.vendas, cpf: schema.clientes.cpf })
      .from(schema.vendas)
      .innerJoin(schema.clientes, eq(schema.clientes.id, schema.vendas.clienteId))
      .where(eq(schema.vendas.id, a.documentoId))
      .limit(1);
    if (!linha || linha.venda.documentoHash !== a.documentoHash || linha.venda.status !== "aguardando_assinatura") throw new ErroRegra("O documento foi alterado pela loja. Peça o link novo.");
    if (soDigitos(entrada.cpf) !== soDigitos(linha.cpf)) return { cpfErrado: a.id, documentoId: a.documentoId };
    await tx
      .update(schema.assinaturas)
      .set({ status: "assinado", assinanteNome: entrada.nome.trim(), assinanteCpf: soDigitos(entrada.cpf), assinaturaImagem: entrada.imagem, ip, userAgent: ua?.slice(0, 300) ?? null, assinadoEm: new Date() })
      .where(eq(schema.assinaturas.id, a.id));
    await tx.update(schema.vendas).set({ status: "assinada", assinaturaModo: "eletronica", atualizadoEm: new Date() }).where(eq(schema.vendas.id, a.documentoId));
    if (linha.venda.negocioId) await tx.insert(schema.negocioEventos).values({ negocioId: linha.venda.negocioId, tipo: "assinatura", descricao: "Cliente assinou o documento pelo link" });
    await registrarLog(null, { acao: "assinatura.eletronica", entidade: "venda", entidadeId: a.documentoId, descricao: `Cliente ${entrada.nome.trim()} assinou pelo link o documento da venda ${numeroDoc("V", a.documentoId)}`, origem: "assinatura_publica" }, tx);
    return null;
  });
  if (res?.cpfErrado) {
    // Fora da transação: a falha precisa ficar gravada para contar.
    await registrarLog(null, { acao: "assinatura.cpf_errado", entidade: "assinatura", entidadeId: res.cpfErrado, descricao: `CPF incorreto ao assinar a venda ${numeroDoc("V", res.documentoId)}`, origem: "assinatura_publica" });
    const restam = MAX_TENTATIVAS_CPF - (await tentativasCpfErrado(res.cpfErrado));
    throw new ErroRegra(restam > 0 ? `O CPF não confere com o cadastro desta venda. Restam ${restam} tentativa(s).` : "Muitas tentativas com CPF incorreto. Peça um novo link à loja.");
  }
}

const MAX_TENTATIVAS_CPF = 5;
const JANELA_CPF_MS = 60 * 60 * 1000;
async function tentativasCpfErrado(assinaturaId: number) {
  const [r] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.logs)
    .where(and(eq(schema.logs.acao, "assinatura.cpf_errado"), eq(schema.logs.entidade, "assinatura"), eq(schema.logs.entidadeId, String(assinaturaId)), gt(schema.logs.criadoEm, new Date(Date.now() - JANELA_CPF_MS))));
  return r?.n ?? 0;
}

export async function finalizarVenda(u: Quem, vendaId: number) {
  return db.transaction(async (tx) => {
    const [v] = await tx.select().from(schema.vendas).where(eq(schema.vendas.id, vendaId)).limit(1);
    if (!v) throw new ErroRegra("Venda não encontrada.");
    if (v.status === "finalizada") throw new ErroRegra("Esta venda já está finalizada.");
    if (v.status !== "assinada") throw new ErroRegra("A venda só é finalizada depois do documento gerado e assinado.");
    const pags = await tx.select().from(schema.vendaPagamentos).where(eq(schema.vendaPagamentos.vendaId, vendaId));
    conferirPagamentos(v.valorVendido ?? 0, pags);
    const [veic] = await tx.select().from(schema.veiculos).where(eq(schema.veiculos.id, v.veiculoId!)).limit(1);
    if (!veic || veic.status === "vendido") throw new ErroRegra("O veículo desta venda já consta como vendido.");
    const agora = new Date();
    await tx.update(schema.vendas).set({ status: "finalizada", finalizadaEm: agora, finalizadaPor: u.id, atualizadoEm: agora }).where(eq(schema.vendas.id, vendaId));
    await tx.update(schema.veiculos).set({ status: "vendido", vendidoEm: agora, atualizadoEm: agora }).where(eq(schema.veiculos.id, veic.id));
    if (v.negocioId) {
      await tx.update(schema.negocios).set({ etapa: "fechada", fechadoEm: agora, atualizadoEm: agora }).where(eq(schema.negocios.id, v.negocioId));
      await tx.insert(schema.negocioEventos).values({ negocioId: v.negocioId, tipo: "venda", descricao: `Venda finalizada: ${brl(v.valorVendido)}`, usuarioId: u.id });
      await anotarNegocioNaConversa(tx, v.negocioId, `Venda finalizada: ${brl(v.valorVendido)} (por ${u.nome})`);
    }
    await registrarLog(u, { acao: "venda.finalizada", entidade: "venda", entidadeId: vendaId, descricao: `Finalizou a venda ${numeroDoc("V", vendaId)}: ${veic.modelo} por ${brl(v.valorVendido)}` }, tx);
  });
}

export async function cancelarVenda(u: Quem, vendaId: number, motivo: string) {
  if (motivo.trim().length < 5) throw new ErroRegra("Informe o motivo do cancelamento.");
  return db.transaction(async (tx) => {
    const [v] = await tx.select().from(schema.vendas).where(eq(schema.vendas.id, vendaId)).limit(1);
    if (!v) throw new ErroRegra("Venda não encontrada.");
    if (v.status === "cancelada") throw new ErroRegra("Venda já cancelada.");
    const agora = new Date();
    await tx.update(schema.vendas).set({ status: "cancelada", canceladaEm: agora, cancelamentoMotivo: motivo.trim(), atualizadoEm: agora }).where(eq(schema.vendas.id, vendaId));
    await tx.update(schema.assinaturas).set({ status: "cancelado" }).where(and(eq(schema.assinaturas.documentoTipo, "venda"), eq(schema.assinaturas.documentoId, vendaId), eq(schema.assinaturas.status, "pendente")));
    if (v.veiculoId) await tx.update(schema.veiculos).set({ status: "disponivel", vendidoEm: null, atualizadoEm: agora }).where(and(eq(schema.veiculos.id, v.veiculoId), ne(schema.veiculos.status, "inativo")));
    if (v.negocioId) {
      await tx.update(schema.negocios).set({ etapa: "negociando", etapaDesde: agora, fechadoEm: null, atualizadoEm: agora }).where(eq(schema.negocios.id, v.negocioId));
      await tx.insert(schema.negocioEventos).values({ negocioId: v.negocioId, tipo: "venda", descricao: `Venda cancelada (${motivo.trim()}); negócio voltou para "Negociando"`, usuarioId: u.id });
    }
    await registrarLog(u, { acao: "venda.cancelada", entidade: "venda", entidadeId: vendaId, descricao: `Cancelou a venda ${numeroDoc("V", vendaId)}: ${motivo.trim()}` }, tx);
  });
}
