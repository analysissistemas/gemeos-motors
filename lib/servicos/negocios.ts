import "server-only";
import { and, eq, ne } from "drizzle-orm";
import { z } from "zod";
import { db, schema, type Tx } from "@/lib/db";
import { ErroRegra } from "@/lib/acao";
import { registrarLog } from "@/lib/logs";
import { ETAPAS_ABERTAS, ETAPAS_DA_IA, FORMAS_PAGAMENTO, iaPodeAvancar, MOTIVOS_PERDA, rotuloEtapa, type Etapa } from "@/lib/dominio";
import { brl } from "@/lib/formato";
import { esquemaNegocio, esquemaPagamento, esquemaPerda } from "@/lib/validacao";
import { diagnosticarPerda } from "@/lib/ia/diagnosticos";
import { IaIndisponivel, MODELO_IA } from "@/lib/ia/cliente";
import { anotarNegocioNaConversa } from "@/lib/mensageria/anotacoes";

type Quem = { id: number; nome: string };

/* ============================================================
   REGRAS DO FUNIL — usadas pelo quadro e pelo chat
   Mover para "fechada" e "perdida" NUNCA é só trocar de coluna:
   cada uma tem seu fluxo (valores e pagamentos / motivo e diagnóstico).
   ============================================================ */

async function nomeNegocio(tx: Tx | typeof db, id: number) {
  const [x] = await tx
    .select({ cliente: schema.clientes.nome })
    .from(schema.negocios)
    .innerJoin(schema.clientes, eq(schema.clientes.id, schema.negocios.clienteId))
    .where(eq(schema.negocios.id, id))
    .limit(1);
  return x?.cliente ?? `nº ${id}`;
}

export async function criarNegocio(u: Quem | null, entrada: unknown, extra?: { demo?: boolean; triagemIa?: string | null; evento?: string }, txExterna?: Tx) {
  const d = esquemaNegocio.parse(entrada);
  const executar = async (tx: Tx) => {
    const [cli] = await tx.select({ nome: schema.clientes.nome, origem: schema.clientes.origem }).from(schema.clientes).where(eq(schema.clientes.id, d.clienteId)).limit(1);
    if (!cli) throw new ErroRegra("Cliente não encontrado.");
    let valorAnunciado = d.valorAnunciado;
    if (d.veiculoId && valorAnunciado == null) {
      const [v] = await tx.select({ valor: schema.veiculos.valorAnunciado }).from(schema.veiculos).where(eq(schema.veiculos.id, d.veiculoId)).limit(1);
      valorAnunciado = v?.valor ?? null;
    }
    const [novo] = await tx
      .insert(schema.negocios)
      .values({
        ...d,
        valorAnunciado,
        origem: d.origem ?? cli.origem,
        responsavelId: d.responsavelId ?? u?.id ?? null,
        criadoPor: u?.id ?? null,
        demo: extra?.demo ?? false,
        triagemIa: extra?.triagemIa ?? null,
      })
      .returning({ id: schema.negocios.id });
    await tx.insert(schema.negocioEventos).values({ negocioId: novo.id, tipo: "criado", descricao: extra?.evento ?? (u ? "Negócio criado em \"Novo contato\"" : "Negócio criado pela triagem da IA"), usuarioId: u?.id ?? null });
    if (d.valorProposta)
      await tx.insert(schema.negocioEventos).values({ negocioId: novo.id, tipo: "proposta", descricao: `Proposta registrada: ${brl(d.valorProposta)}`, usuarioId: u?.id ?? null });
    await registrarLog(u, { acao: "negocio.criado", entidade: "negocio", entidadeId: novo.id, descricao: `Criou o negócio "${cli.nome}"` }, tx);
    return novo.id;
  };
  return txExterna ? executar(txExterna) : db.transaction(executar);
}

export async function atualizarNegocio(u: Quem, id: number, entrada: unknown) {
  const d = esquemaNegocio.parse(entrada);
  return db.transaction(async (tx) => {
    const [antes] = await tx.select().from(schema.negocios).where(eq(schema.negocios.id, id)).limit(1);
    if (!antes) throw new ErroRegra("Negócio não encontrado.");
    if (antes.clienteId !== d.clienteId) throw new ErroRegra("O cliente de um negócio não muda. Crie outro negócio para o outro cliente.");
    await tx.update(schema.negocios).set({ ...d, atualizadoEm: new Date() }).where(eq(schema.negocios.id, id));
    const nome = await nomeNegocio(tx, id);
    if ((antes.valorProposta ?? null) !== (d.valorProposta ?? null)) {
      const texto = antes.valorProposta == null ? `Proposta registrada: ${brl(d.valorProposta)}` : `Proposta alterada de ${brl(antes.valorProposta)} para ${brl(d.valorProposta)}`;
      await tx.insert(schema.negocioEventos).values({ negocioId: id, tipo: "proposta", descricao: texto, usuarioId: u.id, dados: { de: antes.valorProposta, para: d.valorProposta } });
      await registrarLog(u, { acao: "negocio.proposta_alterada", entidade: "negocio", entidadeId: id, descricao: `${texto} no negócio "${nome}"` }, tx);
    }
    if (antes.responsavelId !== d.responsavelId) {
      await tx.insert(schema.negocioEventos).values({ negocioId: id, tipo: "responsavel", descricao: "Responsável alterado", usuarioId: u.id, dados: { de: antes.responsavelId, para: d.responsavelId } });
      await registrarLog(u, { acao: "negocio.responsavel", entidade: "negocio", entidadeId: id, descricao: `Trocou o responsável do negócio "${nome}"` }, tx);
    }
    const outros = (["veiculoId", "veiculoInteresse", "valorAnunciado", "temTroca", "trocaDescricao", "trocaValor", "observacoes", "origem"] as const).filter(
      (k) => (antes[k] ?? null) !== (d[k] ?? null),
    );
    if (outros.length) {
      await tx.insert(schema.negocioEventos).values({ negocioId: id, tipo: "atualizado", descricao: `Dados atualizados (${outros.length} ${outros.length === 1 ? "campo" : "campos"})`, usuarioId: u.id, dados: { campos: outros } });
      await registrarLog(u, { acao: "negocio.editado", entidade: "negocio", entidadeId: id, descricao: `Editou o negócio "${nome}"`, dados: { campos: outros } }, tx);
    }
    return id;
  });
}

export async function moverEtapa(u: Quem, id: number, etapa: Etapa) {
  if (!ETAPAS_ABERTAS.includes(etapa)) {
    throw new ErroRegra(etapa === "fechada" ? "Para fechar a venda, informe os valores e o pagamento." : "Para marcar como perdida, informe o motivo.");
  }
  return db.transaction(async (tx) => {
    const [antes] = await tx.select().from(schema.negocios).where(eq(schema.negocios.id, id)).limit(1);
    if (!antes) throw new ErroRegra("Negócio não encontrado.");
    if (antes.etapa === etapa) return { mudou: false };
    if (antes.etapa === "fechada") {
      const [venda] = await tx.select({ id: schema.vendas.id }).from(schema.vendas).where(and(eq(schema.vendas.negocioId, id), ne(schema.vendas.status, "cancelada"))).limit(1);
      if (venda) throw new ErroRegra("Este negócio tem uma venda registrada. Cancele a venda antes de reabrir a negociação.");
    }
    const reabriu = antes.etapa === "perdida" || antes.etapa === "fechada";
    await tx
      .update(schema.negocios)
      .set({
        etapa,
        etapaDesde: new Date(),
        atualizadoEm: new Date(),
        ...(reabriu && { perdidoEm: null, fechadoEm: null }),
      })
      .where(eq(schema.negocios.id, id));
    const texto = `${reabriu ? "Reaberto" : "Movido"} de "${rotuloEtapa(antes.etapa)}" para "${rotuloEtapa(etapa)}"`;
    await tx.insert(schema.negocioEventos).values({ negocioId: id, tipo: "etapa", descricao: texto, usuarioId: u.id, dados: { de: antes.etapa, para: etapa } });
    const nome = await nomeNegocio(tx, id);
    await registrarLog(u, { acao: "negocio.movido", entidade: "negocio", entidadeId: id, descricao: `Moveu o negócio "${nome}" de "${rotuloEtapa(antes.etapa)}" para "${rotuloEtapa(etapa)}"`, dados: { de: antes.etapa, para: etapa } }, tx);
    await anotarNegocioNaConversa(tx, id, `Negócio: ${rotuloEtapa(antes.etapa)} → ${rotuloEtapa(etapa)} (por ${u.nome})`);
    return { mudou: true };
  });
}

/* A IA move o card sozinha (pedido do dono, 03/10/2026: "o card do cliente interessado que a IA consegue
   mover sozinha"). Só para frente e só entre as colunas dela (ETAPAS_DA_IA: Novo contato → Interessado →
   Visita / test drive → Aguardando equipe). Card que a equipe já levou adiante, ou fechado/perdido, ela não
   mexe. Fica no histórico do negócio, no log e na conversa, com o motivo. */
export async function avancarEtapaPelaIa(negocioId: number, destino: Etapa, motivo: string) {
  if (!ETAPAS_DA_IA.includes(destino)) return { mudou: false };
  return db.transaction(async (tx) => {
    const [antes] = await tx.select({ etapa: schema.negocios.etapa }).from(schema.negocios).where(eq(schema.negocios.id, negocioId)).limit(1);
    if (!antes || !iaPodeAvancar(antes.etapa, destino)) return { mudou: false };
    await tx.update(schema.negocios).set({ etapa: destino, etapaDesde: new Date(), atualizadoEm: new Date() }).where(eq(schema.negocios.id, negocioId));
    const texto = `Movido de "${rotuloEtapa(antes.etapa)}" para "${rotuloEtapa(destino)}" pela IA: ${motivo}`;
    await tx.insert(schema.negocioEventos).values({ negocioId, tipo: "etapa", descricao: texto, usuarioId: null, dados: { de: antes.etapa, para: destino, ia: true } });
    const nome = await nomeNegocio(tx, negocioId);
    await registrarLog(null, { acao: "negocio.movido", entidade: "negocio", entidadeId: negocioId, descricao: `A IA moveu o negócio "${nome}" de "${rotuloEtapa(antes.etapa)}" para "${rotuloEtapa(destino)}" (${motivo})` }, tx);
    await anotarNegocioNaConversa(tx, negocioId, `Negócio: ${rotuloEtapa(antes.etapa)} → ${rotuloEtapa(destino)} (pela IA: ${motivo})`);
    return { mudou: true };
  });
}

export async function marcarPerdido(u: Quem, entrada: unknown) {
  const d = esquemaPerda.parse(entrada);
  return db.transaction(async (tx) => {
    const [antes] = await tx.select().from(schema.negocios).where(eq(schema.negocios.id, d.negocioId)).limit(1);
    if (!antes) throw new ErroRegra("Negócio não encontrado.");
    if (antes.etapa === "fechada") throw new ErroRegra("Venda fechada não pode ser marcada como perdida. Cancele a venda antes.");
    await tx
      .update(schema.negocios)
      .set({
        etapa: "perdida",
        etapaDesde: new Date(),
        perdidoEm: new Date(),
        perdaMotivo: d.motivo,
        perdaObjecao: d.objecao,
        perdaObservacoes: d.observacoes,
        atendimentoHumanoId: d.atendimentoHumanoId ?? antes.atendimentoHumanoId ?? antes.responsavelId,
        diagnosticoIa: null,
        diagnosticoEm: null,
        atualizadoEm: new Date(),
      })
      .where(eq(schema.negocios.id, d.negocioId));
    const texto = `Venda perdida — motivo: ${MOTIVOS_PERDA[d.motivo]}`;
    await tx.insert(schema.negocioEventos).values({ negocioId: d.negocioId, tipo: "perdida", descricao: texto, usuarioId: u.id, dados: { de: antes.etapa, motivo: d.motivo, objecao: d.objecao } });
    const nome = await nomeNegocio(tx, d.negocioId);
    await registrarLog(u, { acao: "negocio.perdido", entidade: "negocio", entidadeId: d.negocioId, descricao: `Marcou o negócio "${nome}" como perdido (${MOTIVOS_PERDA[d.motivo]})` }, tx);
    await anotarNegocioNaConversa(tx, d.negocioId, `Negócio encerrado como venda perdida — ${MOTIVOS_PERDA[d.motivo]} (por ${u.nome})`);
    return d.negocioId;
  });
}

export async function gerarDiagnosticoPerda(u: Quem, negocioId: number) {
  const [neg] = await db.select({ etapa: schema.negocios.etapa }).from(schema.negocios).where(eq(schema.negocios.id, negocioId)).limit(1);
  if (!neg) throw new ErroRegra("Negócio não encontrado.");
  if (neg.etapa !== "perdida") throw new ErroRegra("O diagnóstico é feito para vendas perdidas.");
  let diag;
  try {
    diag = await diagnosticarPerda(negocioId);
  } catch (e) {
    if (e instanceof IaIndisponivel) throw new ErroRegra(e.message);
    throw e;
  }
  await db.transaction(async (tx) => {
    await tx.update(schema.negocios).set({ diagnosticoIa: diag, diagnosticoEm: new Date(), diagnosticoModelo: MODELO_IA }).where(eq(schema.negocios.id, negocioId));
    await tx.insert(schema.negocioEventos).values({ negocioId, tipo: "diagnostico", descricao: `Diagnóstico da IA gerado (confiança ${diag.confianca})`, usuarioId: u.id });
    const nome = await nomeNegocio(tx, negocioId);
    await registrarLog(u, { acao: "negocio.diagnostico_ia", entidade: "negocio", entidadeId: negocioId, descricao: `Gerou o diagnóstico da IA para a perda de "${nome}"` }, tx);
  });
  return diag;
}

export const esquemaFechamento = z.object({
  negocioId: z.coerce.number().int().positive(),
  veiculoId: z.coerce.number({ message: "Escolha o veículo vendido" }).int().positive("Escolha o veículo vendido"),
  valorAnunciado: z.coerce.number({ message: "Informe o valor anunciado" }).positive("Informe o valor anunciado"),
  valorVendido: z.coerce.number({ message: "Informe o valor vendido" }).positive("Informe o valor vendido"),
  pagamentos: z.array(esquemaPagamento).min(1, "Informe ao menos uma forma de pagamento"),
});

export function conferirPagamentos(valorVendido: number, pagamentos: { valor: number }[]) {
  const soma = Math.round(pagamentos.reduce((s, p) => s + p.valor, 0) * 100);
  const alvo = Math.round(valorVendido * 100);
  if (soma !== alvo) {
    const falta = (alvo - soma) / 100;
    throw new ErroRegra(
      falta > 0
        ? `Os pagamentos somam ${brl(soma / 100, 2)}; faltam ${brl(falta, 2)} para chegar ao valor vendido.`
        : `Os pagamentos somam ${brl(soma / 100, 2)}; passam ${brl(-falta, 2)} do valor vendido.`,
    );
  }
}

/** Fecha o negócio registrando a venda com valores e pagamentos. */
export async function fecharNegocioComVenda(u: Quem, entrada: unknown) {
  const d = esquemaFechamento.parse(entrada);
  conferirPagamentos(d.valorVendido, d.pagamentos);
  return db.transaction(async (tx) => {
    const [neg] = await tx.select().from(schema.negocios).where(eq(schema.negocios.id, d.negocioId)).limit(1);
    if (!neg) throw new ErroRegra("Negócio não encontrado.");
    const [ativa] = await tx.select({ id: schema.vendas.id }).from(schema.vendas).where(and(eq(schema.vendas.negocioId, d.negocioId), ne(schema.vendas.status, "cancelada"))).limit(1);
    if (ativa) throw new ErroRegra("Este negócio já tem uma venda registrada.");
    const [veic] = await tx.select().from(schema.veiculos).where(eq(schema.veiculos.id, d.veiculoId)).limit(1);
    if (!veic) throw new ErroRegra("Veículo não encontrado no estoque.");
    if (veic.status === "vendido") throw new ErroRegra("Este veículo já foi vendido.");

    const [venda] = await tx
      .insert(schema.vendas)
      .values({
        negocioId: d.negocioId,
        clienteId: neg.clienteId,
        veiculoId: d.veiculoId,
        vendedorId: neg.responsavelId ?? u.id,
        valorAnunciado: d.valorAnunciado,
        valorVendido: d.valorVendido,
        status: "rascunho",
        criadoPor: u.id,
      })
      .returning({ id: schema.vendas.id });
    await tx.insert(schema.vendaPagamentos).values(d.pagamentos.map((p) => ({ ...p, vendaId: venda.id })));
    await tx
      .update(schema.negocios)
      .set({ etapa: "fechada", etapaDesde: new Date(), fechadoEm: new Date(), veiculoId: d.veiculoId, valorAnunciado: d.valorAnunciado, atualizadoEm: new Date() })
      .where(eq(schema.negocios.id, d.negocioId));
    if (veic.status === "disponivel") await tx.update(schema.veiculos).set({ status: "reservado", atualizadoEm: new Date() }).where(eq(schema.veiculos.id, d.veiculoId));

    const formas = Array.from(new Set(d.pagamentos.map((p) => FORMAS_PAGAMENTO[p.forma]))).join(" + ");
    const texto = `Venda fechada por ${brl(d.valorVendido)} (anunciado ${brl(d.valorAnunciado)}) — ${formas}`;
    await tx.insert(schema.negocioEventos).values({ negocioId: d.negocioId, tipo: "venda", descricao: texto, usuarioId: u.id, dados: { vendaId: venda.id, de: neg.etapa } });
    const nome = await nomeNegocio(tx, d.negocioId);
    await registrarLog(u, { acao: "venda.criada", entidade: "venda", entidadeId: venda.id, descricao: `Fechou a venda do negócio "${nome}": ${brl(d.valorVendido)} (${formas})` }, tx);
    await registrarLog(u, { acao: "negocio.movido", entidade: "negocio", entidadeId: d.negocioId, descricao: `Moveu o negócio "${nome}" de "${rotuloEtapa(neg.etapa)}" para "Venda fechada"` }, tx);
    await anotarNegocioNaConversa(tx, d.negocioId, `Venda fechada por ${brl(d.valorVendido)} — aguardando documento e assinatura (por ${u.nome})`);
    return venda.id;
  });
}
