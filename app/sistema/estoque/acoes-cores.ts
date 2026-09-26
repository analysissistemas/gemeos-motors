"use server";
import { and, asc, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db, schema } from "@/lib/db";
import { autorizar } from "@/lib/auth/dal";
import { executar, ErroRegra } from "@/lib/acao";
import { registrarLog } from "@/lib/logs";
import { normalizarHex } from "@/lib/cores";
import { apagarFotoCatalogo, guardarFotoCatalogo } from "@/lib/fotos";

/* Cores de cada modelo do catálogo, com a foto da moto naquela cor. Quem edita o
   estoque edita as cores (a vitrine lê de /api/vitrine/cores). Toda mudança fica
   no histórico. */

const c = schema.modeloCores;

const esquemaCor = z.object({
  nome: z
    .string({ error: "Informe o nome da cor" })
    .transform((s) => s.trim().replace(/\s+/g, " "))
    .pipe(
      z
        .string()
        .min(1, "Informe o nome da cor")
        .max(40, "Nome muito longo (até 40 letras)")
        /* a vitrine põe o nome dentro do HTML do card: só letras, números e pontuação simples */
        .regex(/^[\p{L}\p{N} .,()/+-]+$/u, "Use só letras, números, espaço e . , ( ) / + -"),
    ),
  hex: z
    .string({ error: "Escolha o tom da cor" })
    .transform((s, ctx) => {
      const h = normalizarHex(s);
      if (!h) ctx.addIssue({ code: "custom", message: "Tom inválido: use o formato #6d1f33" });
      return h ?? "";
    }),
});

async function modeloDe(modeloId: number) {
  const [m] = await db.select({ id: schema.modelos.id, nome: schema.modelos.nome }).from(schema.modelos).where(eq(schema.modelos.id, modeloId)).limit(1);
  if (!m) throw new ErroRegra("Modelo não encontrado.");
  return m;
}

async function corDe(id: number) {
  const [cor] = await db
    .select({ id: c.id, modeloId: c.modeloId, nome: c.nome, hex: c.hex, fotoUrl: c.fotoUrl, ordem: c.ordem, ativo: c.ativo, modelo: schema.modelos.nome })
    .from(c)
    .innerJoin(schema.modelos, eq(schema.modelos.id, c.modeloId))
    .where(eq(c.id, id))
    .limit(1);
  if (!cor) throw new ErroRegra("Cor não encontrada. Atualize a página.");
  return cor;
}

function atualizarTelas() {
  revalidatePath("/sistema/estoque");
}

export async function adicionarCor(modeloId: number, entrada: { nome?: string; hex?: string }) {
  return executar(async () => {
    const u = await autorizar("estoque.editar");
    const d = esquemaCor.parse(entrada);
    const m = await modeloDe(Number(modeloId));
    const id = await db.transaction(async (tx) => {
      const [{ proxima }] = await tx.select({ proxima: sql<number>`coalesce(max(${c.ordem}), -1)::int + 1` }).from(c).where(eq(c.modeloId, m.id));
      const [nova] = await tx.insert(c).values({ modeloId: m.id, nome: d.nome, hex: d.hex, ordem: proxima }).returning({ id: c.id });
      await registrarLog(u, { acao: "modelo.cor_adicionada", entidade: "modelo", entidadeId: m.id, descricao: `Acrescentou a cor ${d.nome} no ${m.nome}`, dados: { corId: nova.id, hex: d.hex } }, tx);
      return nova.id;
    });
    atualizarTelas();
    return { id };
  }, "Cor acrescentada");
}

export async function editarCor(id: number, entrada: { nome?: string; hex?: string }) {
  return executar(async () => {
    const u = await autorizar("estoque.editar");
    const d = esquemaCor.parse(entrada);
    const antes = await corDe(Number(id));
    if (antes.nome === d.nome && antes.hex === d.hex) return null;
    await db.transaction(async (tx) => {
      await tx.update(c).set({ nome: d.nome, hex: d.hex }).where(eq(c.id, antes.id));
      await registrarLog(
        u,
        {
          acao: "modelo.cor_editada",
          entidade: "modelo",
          entidadeId: antes.modeloId,
          descricao: antes.nome === d.nome ? `Mudou o tom da cor ${d.nome} do ${antes.modelo}` : `Renomeou a cor ${antes.nome} do ${antes.modelo} para ${d.nome}`,
          dados: { corId: antes.id, de: { nome: antes.nome, hex: antes.hex }, para: d },
        },
        tx,
      );
    });
    atualizarTelas();
    return null;
  }, "Cor atualizada");
}

/** Esconde ou mostra a cor na vitrine, sem apagar a foto. */
export async function alternarCor(id: number, ativo: boolean) {
  return executar(async () => {
    const u = await autorizar("estoque.editar");
    const cor = await corDe(Number(id));
    await db.transaction(async (tx) => {
      await tx.update(c).set({ ativo: !!ativo }).where(eq(c.id, cor.id));
      await registrarLog(u, { acao: ativo ? "modelo.cor_mostrada" : "modelo.cor_escondida", entidade: "modelo", entidadeId: cor.modeloId, descricao: `${ativo ? "Voltou a mostrar" : "Escondeu"} a cor ${cor.nome} do ${cor.modelo} na vitrine`, dados: { corId: cor.id } }, tx);
    });
    atualizarTelas();
    return null;
  }, ativo ? "A cor voltou para a vitrine" : "Cor escondida da vitrine");
}

/** Sobe ou desce uma posição. A primeira cor é a que a vitrine mostra ao abrir. */
export async function moverCor(id: number, direcao: "cima" | "baixo") {
  return executar(async () => {
    const u = await autorizar("estoque.editar");
    const cor = await corDe(Number(id));
    await db.transaction(async (tx) => {
      /* renumera 0..n na ordem atual e troca com a vizinha: funciona mesmo se a ordem estiver repetida */
      const lista = await tx.select({ id: c.id }).from(c).where(eq(c.modeloId, cor.modeloId)).orderBy(asc(c.ordem), asc(c.id));
      const i = lista.findIndex((x) => x.id === cor.id);
      const j = direcao === "cima" ? i - 1 : i + 1;
      if (i < 0 || j < 0 || j >= lista.length) return;
      [lista[i], lista[j]] = [lista[j], lista[i]];
      for (const [ordem, x] of lista.entries()) await tx.update(c).set({ ordem }).where(and(eq(c.id, x.id), eq(c.modeloId, cor.modeloId)));
      await registrarLog(u, { acao: "modelo.cores_reordenadas", entidade: "modelo", entidadeId: cor.modeloId, descricao: `Mudou a ordem das cores do ${cor.modelo} (${cor.nome} ${direcao === "cima" ? "subiu" : "desceu"})`, dados: { ordem: lista.map((x) => x.id) } }, tx);
    });
    atualizarTelas();
    return null;
  });
}

export async function removerCor(id: number) {
  return executar(async () => {
    const u = await autorizar("estoque.editar");
    const cor = await corDe(Number(id));
    await db.transaction(async (tx) => {
      await tx.delete(c).where(eq(c.id, cor.id));
      await registrarLog(u, { acao: "modelo.cor_removida", entidade: "modelo", entidadeId: cor.modeloId, descricao: `Tirou a cor ${cor.nome} do ${cor.modelo}`, dados: { corId: cor.id, hex: cor.hex, tinhaFoto: !!cor.fotoUrl } }, tx);
    });
    await apagarFotoCatalogo(cor.fotoUrl);
    atualizarTelas();
    return null;
  }, "Cor removida");
}

async function trocarFotoCor(id: number, fotoUrl: string | null) {
  const u = await autorizar("estoque.editar");
  let cor;
  try {
    cor = await corDe(id);
  } catch (e) {
    await apagarFotoCatalogo(fotoUrl);
    throw e;
  }
  await db.transaction(async (tx) => {
    await tx.update(c).set({ fotoUrl }).where(eq(c.id, cor.id));
    await registrarLog(
      u,
      {
        acao: fotoUrl ? "modelo.cor_foto_alterada" : "modelo.cor_foto_removida",
        entidade: "modelo",
        entidadeId: cor.modeloId,
        descricao: `${fotoUrl ? (cor.fotoUrl ? "Trocou" : "Colocou") : "Removeu"} a foto do ${cor.modelo} na cor ${cor.nome}`,
        dados: { corId: cor.id },
      },
      tx,
    );
  });
  await apagarFotoCatalogo(cor.fotoUrl);
  atualizarTelas();
  return { fotoUrl };
}

export async function enviarFotoCor(id: number, dados: FormData) {
  return executar(async () => {
    await autorizar("estoque.editar");
    const cor = await corDe(Number(id));
    return trocarFotoCor(cor.id, await guardarFotoCatalogo(dados.get("foto"), cor.modeloId));
  }, "Foto da cor atualizada");
}

export async function removerFotoCor(id: number) {
  return executar(() => trocarFotoCor(Number(id), null), "Foto da cor removida");
}
