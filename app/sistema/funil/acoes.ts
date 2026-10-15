"use server";
import { revalidatePath } from "next/cache";
import { autorizar } from "@/lib/auth/dal";
import { executar } from "@/lib/acao";
import { ETAPAS, type Etapa } from "@/lib/dominio";
import { obterNegocio } from "@/lib/consultas/funil";
import { listarVeiculosVendaveis } from "@/lib/consultas/estoque";
import { and, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { escolherVeiculo, pagamentoDasObservacoes, pagamentoDoTexto } from "@/lib/venda-sugerida";
import {
  atualizarNegocio,
  criarNegocio,
  fecharNegocioComVenda,
  gerarDiagnosticoPerda,
  marcarPerdido,
  moverEtapa,
} from "@/lib/servicos/negocios";

const revalidar = () => {
  revalidatePath("/sistema/funil");
  revalidatePath("/sistema");
};

export async function acaoCriarNegocio(dados: Record<string, unknown>) {
  return executar(async () => {
    const u = await autorizar("funil.editar");
    const id = await criarNegocio(u, dados);
    revalidar();
    return { id };
  }, "Negócio criado");
}

export async function acaoAtualizarNegocio(id: number, dados: Record<string, unknown>) {
  return executar(async () => {
    const u = await autorizar("funil.editar");
    await atualizarNegocio(u, id, dados);
    revalidar();
    return null;
  }, "Negócio atualizado");
}

export async function acaoMoverNegocio(id: number, etapa: string) {
  return executar(async () => {
    const u = await autorizar("funil.editar");
    if (!ETAPAS.some((e) => e.id === etapa)) throw new Error("etapa inválida");
    const r = await moverEtapa(u, id, etapa as Etapa);
    revalidar();
    return r;
  });
}

export async function acaoMarcarPerdido(dados: Record<string, unknown>) {
  return executar(async () => {
    const u = await autorizar("funil.editar");
    const id = await marcarPerdido(u, dados);
    revalidar();
    return { id };
  }, "Negócio encerrado como venda perdida");
}

export async function acaoGerarDiagnostico(negocioId: number) {
  return executar(async () => {
    const u = await autorizar("funil.editar");
    const d = await gerarDiagnosticoPerda(u, negocioId);
    revalidar();
    return d;
  }, "Diagnóstico gerado");
}

export async function acaoFecharVenda(dados: Record<string, unknown>) {
  return executar(async () => {
    const u = await autorizar("vendas.editar");
    const vendaId = await fecharNegocioComVenda(u, dados);
    revalidar();
    revalidatePath("/sistema/vendas");
    revalidatePath("/sistema/estoque");
    return { vendaId };
  }, "Venda registrada");
}

export async function acaoDetalheNegocio(id: number) {
  await autorizar("funil.ver");
  return obterNegocio(id);
}

export async function acaoVeiculosVendaveis() {
  const u = await autorizar("funil.ver");
  /* o admin vê também os veículos de teste ("[TESTE]"), para montar um negócio de teste da IA */
  return listarVeiculosVendaveis({ incluirTeste: u.papel === "admin" });
}

/** Venda já preenchida com o que o cliente disse no WhatsApp (dono, 15/10/2026): moto do estoque do modelo e cor que
 *  ele pediu, o preço dela, a forma de pagamento que ele falou e o que ainda falta no cadastro para o documento. */
export async function acaoSugestaoVenda(negocioId: number) {
  const u = await autorizar("funil.ver");
  const [neg] = await db.select().from(schema.negocios).where(eq(schema.negocios.id, negocioId)).limit(1);
  if (!neg) return null;
  const [[cv], [cli], vendaveis] = await Promise.all([
    db.select({ id: schema.conversas.id, triagem: schema.conversas.triagemIa }).from(schema.conversas).where(eq(schema.conversas.negocioId, negocioId)).limit(1),
    db.select().from(schema.clientes).where(eq(schema.clientes.id, neg.clienteId)).limit(1),
    db
      .select({ id: schema.veiculos.id, modelo: schema.veiculos.modelo, versao: schema.veiculos.versao, cor: schema.veiculos.cor, status: schema.veiculos.status, valorAnunciado: schema.veiculos.valorAnunciado })
      .from(schema.veiculos)
      .where(and(inArray(schema.veiculos.status, ["disponivel", "reservado"]), u.papel === "admin" ? undefined : eq(schema.veiculos.teste, false))),
  ]);
  const [mem] = cv ? await db.select({ fatos: schema.iaMemorias.fatos }).from(schema.iaMemorias).where(eq(schema.iaMemorias.conversaId, cv.id)).limit(1) : [];
  const fatos = (mem?.fatos ?? {}) as { interesse?: string | null; pagamento?: string | null };
  const triagem = (cv?.triagem ?? {}) as { veiculo?: string | null; interesse?: string | null };
  const interesse = [neg.veiculoInteresse, fatos.interesse, triagem.veiculo, triagem.interesse].filter(Boolean).join(" · ") || null;
  const veiculo = neg.veiculoId ? (vendaveis.find((v) => v.id === neg.veiculoId) ?? null) : escolherVeiculo(vendaveis, interesse);
  const ditoPagamento = pagamentoDasObservacoes(neg.observacoes) ?? fatos.pagamento ?? null;
  const pagamento = pagamentoDoTexto(ditoPagamento);
  const faltaCliente = [!cli?.cpf && "CPF", !(cli?.endereco && cli?.cidade) && "endereço"].filter((x): x is string => !!x);
  return {
    veiculoId: veiculo?.id ?? null,
    valorAnunciado: veiculo?.valorAnunciado ?? null,
    valorVendido: neg.valorProposta ?? veiculo?.valorAnunciado ?? null,
    pagamento,
    interesse,
    ditoPagamento,
    faltaCliente,
  };
}
export type SugestaoVenda = NonNullable<Awaited<ReturnType<typeof acaoSugestaoVenda>>>;
