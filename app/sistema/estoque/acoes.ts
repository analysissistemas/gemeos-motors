"use server";
import { eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, schema } from "@/lib/db";
import { autorizar } from "@/lib/auth/dal";
import { executar, ErroRegra } from "@/lib/acao";
import { registrarLog } from "@/lib/logs";
import { esquemaVeiculo } from "@/lib/validacao";
import { ehEletrico, pode, STATUS_VEICULO } from "@/lib/dominio";
import { brl } from "@/lib/formato";
import { dispararFollowUpsDeEstoque } from "@/lib/servicos/interesses";

/* modelo voltou ao estoque: avisa a equipe dos interessados. Falha aqui nunca desfaz o cadastro. */
async function avisarInteressados(modeloId: number | null | undefined) {
  try {
    await dispararFollowUpsDeEstoque(modeloId);
  } catch (e) {
    console.error("[estoque] follow-up de estoque falhou", e);
  }
}

export async function salvarVeiculo(entrada: { id?: number } & Record<string, unknown>) {
  return executar(async () => {
    const u = await autorizar("estoque.editar");
    const d = esquemaVeiculo.parse(entrada);
    const podeCusto = pode(u.papel, "custo.ver");
    /* só administrador marca ou desmarca "veículo de teste" */
    const podeTeste = u.papel === "admin";
    if (!podeTeste) delete d.teste;
    /* elétrica não tem placa, Renavam nem ano-modelo: não guardar o que não existe */
    if (ehEletrico(d.tipo)) {
      d.placa = null;
      d.renavam = null;
    }
    if (d.status === "vendido") throw new ErroRegra("Veículo vira vendido pela finalização da venda, não pelo cadastro.");
    const nome = [d.marca, d.modelo, d.cor].filter(Boolean).join(" ") + (d.teste ? " (teste)" : "");

    if (entrada.id) {
      const id = Number(entrada.id);
      const [antes] = await db.select().from(schema.veiculos).where(eq(schema.veiculos.id, id)).limit(1);
      if (!antes) throw new ErroRegra("Veículo não encontrado.");
      if (antes.status === "vendido") throw new ErroRegra("Veículo vendido não pode ser editado. Cancele a venda antes, se for o caso.");
      const valores = { ...d, entradaEm: d.entradaEm ?? antes.entradaEm, custo: podeCusto ? d.custo : antes.custo, atualizadoEm: new Date() };
      const campos = Object.keys(d).filter((k) => k !== "custo" || podeCusto).filter((k) => (antes as Record<string, unknown>)[k] !== (valores as Record<string, unknown>)[k]);
      await db.transaction(async (tx) => {
        await tx.update(schema.veiculos).set(valores).where(eq(schema.veiculos.id, id));
        if (campos.length)
          await registrarLog(u, {
            acao: campos.includes("valorAnunciado") ? "veiculo.preco_alterado" : "veiculo.editado",
            entidade: "veiculo",
            entidadeId: id,
            descricao: campos.includes("valorAnunciado")
              ? `Alterou o preço de ${nome} de ${brl(antes.valorAnunciado)} para ${brl(d.valorAnunciado)}`
              : `Editou o veículo ${nome}`,
            dados: { campos },
          }, tx);
      });
      /* veículo de teste nunca avisa cliente de verdade */
      if (d.status === "disponivel" && !(d.teste ?? antes.teste)) await avisarInteressados(valores.modeloId ?? antes.modeloId);
      revalidatePath("/sistema/estoque");
      return { id };
    }

    const id = await db.transaction(async (tx) => {
      const [novo] = await tx
        .insert(schema.veiculos)
        .values({ ...d, teste: podeTeste ? !!d.teste : false, entradaEm: d.entradaEm ?? undefined, custo: podeCusto ? d.custo : null, criadoPor: u.id })
        .returning({ id: schema.veiculos.id });
      await registrarLog(u, { acao: "veiculo.criado", entidade: "veiculo", entidadeId: novo.id, descricao: `Deu entrada no veículo ${nome}${d.valorAnunciado ? ` (${brl(d.valorAnunciado)})` : ""}` }, tx);
      return novo.id;
    });
    if (d.status === "disponivel" && !d.teste) {
      const [novo] = await db.select({ modeloId: schema.veiculos.modeloId }).from(schema.veiculos).where(eq(schema.veiculos.id, id)).limit(1);
      await avisarInteressados(novo?.modeloId);
    }
    revalidatePath("/sistema/estoque");
    return { id };
  }, entrada.id ? "Veículo atualizado" : "Veículo cadastrado no estoque");
}

/* Entrada rápida (pedido do dono, 02/10/2026: cadastrar moto estava "ruim demais"): moto elétrica NOVA
   do catálogo, várias unidades de uma vez. Tipo, marca, nome e preço vêm do catálogo, então a unidade
   sempre fica ligada ao modelo (é por essa ligação que a IA e o site sabem o que tem). Cada unidade
   continua sendo um veículo próprio; chassi é opcional e pode ser completado depois, um por unidade. */
export async function darEntradaEmLote(entrada: {
  modeloId: number;
  cor: string;
  quantidade: number;
  chassis: string[];
  valorAnunciado: number | null;
  custo?: number | null;
  status: "disponivel" | "reservado";
  unidadeId?: number | null;
  origemEntrada?: string | null;
  entradaEm?: string | null;
  observacoes?: string | null;
  teste?: boolean;
}) {
  return executar(async () => {
    const u = await autorizar("estoque.editar");
    const podeCusto = pode(u.papel, "custo.ver");
    const podeTeste = u.papel === "admin";
    const quantidade = Math.trunc(Number(entrada.quantidade));
    if (!(quantidade >= 1 && quantidade <= 30)) throw new ErroRegra("Quantidade de 1 a 30 por vez.", { quantidade: "De 1 a 30" });
    if (entrada.status !== "disponivel" && entrada.status !== "reservado") throw new ErroRegra("Situação inválida.");
    const [m] = await db.select().from(schema.modelos).where(eq(schema.modelos.id, Number(entrada.modeloId))).limit(1);
    if (!m || !m.ativo || m.tipo === "acessorio") throw new ErroRegra("Escolha um modelo do catálogo.", { modeloId: "Escolha o modelo" });
    const cor = (entrada.cor ?? "").trim();
    if (!cor) throw new ErroRegra("Escolha a cor.", { cor: "Escolha a cor" });

    const chassis = (entrada.chassis ?? []).map((c) => c.toUpperCase().replace(/\s/g, "")).filter(Boolean);
    if (chassis.length > quantidade) throw new ErroRegra(`São ${chassis.length} chassis para ${quantidade} moto(s). Um chassi por moto.`, { chassis: "Mais chassis que motos" });
    const repetido = chassis.find((c, i) => chassis.indexOf(c) !== i);
    if (repetido) throw new ErroRegra(`O chassi ${repetido} está repetido na lista.`, { chassis: "Chassi repetido" });
    if (chassis.length) {
      const ja = await db.select({ chassi: schema.veiculos.chassi }).from(schema.veiculos).where(inArray(schema.veiculos.chassi, chassis)).limit(1);
      if (ja.length) throw new ErroRegra(`O chassi ${ja[0].chassi} já está cadastrado no estoque.`, { chassis: "Chassi já cadastrado" });
    }

    /* cada unidade passa pela mesma validação do cadastro de um veículo */
    const unidades = Array.from({ length: quantidade }, (_, i) =>
      esquemaVeiculo.parse({
        modeloId: m.id,
        tipo: m.tipo,
        marca: m.marca,
        modelo: m.nome,
        cor,
        chassi: chassis[i] ?? null,
        condicao: "zero_km",
        valorAnunciado: entrada.valorAnunciado ?? m.precoTabela,
        custo: podeCusto ? (entrada.custo ?? null) : null,
        status: entrada.status,
        unidadeId: entrada.unidadeId ?? null,
        origemEntrada: entrada.origemEntrada || "fornecedor",
        entradaEm: entrada.entradaEm || null,
        observacoes: entrada.observacoes || null,
      }),
    );
    const teste = podeTeste && !!entrada.teste;
    const nome = [m.marca, m.nome, cor].filter(Boolean).join(" ") + (teste ? " (teste)" : "");

    await db.transaction(async (tx) => {
      for (const [i, d] of unidades.entries()) {
        const [novo] = await tx
          .insert(schema.veiculos)
          .values({ ...d, placa: null, renavam: null, teste, entradaEm: d.entradaEm ?? undefined, criadoPor: u.id })
          .returning({ id: schema.veiculos.id });
        await registrarLog(
          u,
          {
            acao: "veiculo.criado",
            entidade: "veiculo",
            entidadeId: novo.id,
            descricao: `Deu entrada no veículo ${nome}${d.valorAnunciado ? ` (${brl(d.valorAnunciado)})` : ""}${quantidade > 1 ? ` · ${i + 1} de ${quantidade}` : ""}`,
          },
          tx,
        );
      }
    });
    if (entrada.status === "disponivel" && !teste) await avisarInteressados(m.id);
    revalidatePath("/sistema/estoque");
    return { quantidade };
  }, entrada.quantidade > 1 ? `${entrada.quantidade} motos cadastradas no estoque` : "Moto cadastrada no estoque");
}

export async function mudarStatusVeiculo(id: number, status: "disponivel" | "reservado" | "inativo") {
  return executar(async () => {
    const u = await autorizar("estoque.editar");
    if (!(status in STATUS_VEICULO) || status === ("vendido" as string)) throw new ErroRegra("Situação inválida.");
    const [v] = await db.select().from(schema.veiculos).where(eq(schema.veiculos.id, id)).limit(1);
    if (!v) throw new ErroRegra("Veículo não encontrado.");
    if (v.status === "vendido") throw new ErroRegra("Veículo vendido não muda de situação por aqui.");
    await db.transaction(async (tx) => {
      await tx.update(schema.veiculos).set({ status, atualizadoEm: new Date() }).where(eq(schema.veiculos.id, id));
      await registrarLog(u, { acao: "veiculo.status", entidade: "veiculo", entidadeId: id, descricao: `Mudou ${v.modelo} de "${STATUS_VEICULO[v.status as keyof typeof STATUS_VEICULO]}" para "${STATUS_VEICULO[status]}"` }, tx);
    });
    if (status === "disponivel" && !v.teste) await avisarInteressados(v.modeloId);
    revalidatePath("/sistema/estoque");
    return null;
  }, "Situação atualizada");
}
