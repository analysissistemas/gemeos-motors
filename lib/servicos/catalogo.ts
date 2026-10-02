import "server-only";
import { and, asc, desc, eq, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/lib/db";
import { ErroRegra } from "@/lib/acao";
import { registrarLog } from "@/lib/logs";
import { CAMPOS_FICHA, DISPONIBILIDADES, TIPOS_CATALOGO, valorFichaVazio } from "@/lib/dominio";
import { brl } from "@/lib/formato";
import { apagarFotoCatalogo } from "@/lib/fotos";

/* ============================================================
   CATÁLOGO DO SITE — modelos e acessórios que a vitrine mostra
   A equipe cria e edita aqui, com ou sem estoque, e escolhe o que aparece
   no site, a disponibilidade e o que é lançamento (com reserva). Toda
   mudança fica no histórico.
   ============================================================ */

type Quem = { id: number; nome: string };
const m = schema.modelos;

const chaves = <T extends Record<string, string>>(o: T) => Object.keys(o) as [keyof T & string, ...(keyof T & string)[]];
const textoOpcional = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Use no máximo ${max} caracteres`)
    .optional()
    .nullable()
    .transform((v) => (v ? v : null));

/* ficha: os 7 campos da vitrine; vazio (ou o antigo "—") não é guardado, para o site esconder o chip */
const esquemaFicha = z
  .record(z.string(), z.unknown())
  .optional()
  .nullable()
  .transform((f, ctx) => {
    const saida: Record<string, string> = {};
    for (const { chave, rotulo } of CAMPOS_FICHA) {
      const v = f?.[chave];
      if (valorFichaVazio(v)) continue;
      const t = String(v).trim().replace(/\s+/g, " ");
      if (t.length > 60) ctx.addIssue({ code: "custom", message: `${rotulo}: use no máximo 60 caracteres`, path: [chave] });
      saida[chave] = t;
    }
    return Object.keys(saida).length ? saida : null;
  });

export const esquemaModelo = z
  .object({
    nome: z
      .string({ error: "Informe o nome" })
      .transform((s) => s.trim().replace(/\s+/g, " "))
      .pipe(z.string().min(2, "Informe o nome").max(60, "Nome muito longo (até 60 letras)")),
    tipo: z.enum(chaves(TIPOS_CATALOGO), { message: "Escolha o tipo" }),
    marca: textoOpcional(60),
    /* null e "" ANTES da coerção: senão preço vazio vira R$ 0 (ver CLAUDE.md) */
    precoTabela: z
      .union([z.null(), z.literal(""), z.coerce.number().positive("Preço precisa ser maior que zero").max(99_999_999, "Valor muito alto")])
      .optional()
      .transform((v) => (typeof v === "number" ? Math.round(v * 100) / 100 : null)),
    ficha: esquemaFicha,
    descricao: textoOpcional(500),
    mostrarNoSite: z.boolean().default(true),
    disponibilidade: z.enum(chaves(DISPONIBILIDADES), { message: "Escolha a disponibilidade" }).default("consultar"),
    lancamento: z.boolean().default(false),
    lancamentoTexto: textoOpcional(60),
  })
  .transform((d) => ({
    ...d,
    /* acessório não tem ficha técnica; frase de lançamento só existe em lançamento */
    ficha: d.tipo === "acessorio" ? null : d.ficha,
    lancamentoTexto: d.lancamento ? d.lancamentoTexto : null,
    eletrico: d.tipo === "moto_eletrica",
  }));
export type DadosModelo = z.infer<typeof esquemaModelo>;

export async function modeloPorId(id: number) {
  const [x] = await db.select().from(m).where(eq(m.id, id)).limit(1);
  if (!x) throw new ErroRegra("Modelo não encontrado. Atualize a página.");
  return x;
}

async function conferirNomeLivre(nome: string, id?: number) {
  const [outro] = await db
    .select({ id: m.id })
    .from(m)
    .where(and(sql`lower(${m.nome}) = lower(${nome})`, id ? ne(m.id, id) : undefined))
    .limit(1);
  if (outro) throw new ErroRegra("Já existe um item do catálogo com esse nome.", { nome: "Já cadastrado" });
}

/* o jsonb do Postgres devolve as chaves em outra ordem: compara ordenando */
const normal = (v: unknown): unknown =>
  v && typeof v === "object" && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b))) : (v ?? null);
const iguais = (a: unknown, b: unknown) => JSON.stringify(normal(a)) === JSON.stringify(normal(b));

export async function salvarModelo(u: Quem, id: number | null, entrada: unknown) {
  const d = esquemaModelo.parse(entrada);
  await conferirNomeLivre(d.nome, id ?? undefined);

  if (id) {
    const antes = await modeloPorId(id);
    const campos = (Object.keys(d) as (keyof DadosModelo)[]).filter((k) => !iguais(antes[k], d[k]));
    if (!campos.length) return id;
    await db.transaction(async (tx) => {
      await tx.update(m).set(d).where(eq(m.id, id));
      const partes: string[] = [];
      if (campos.includes("precoTabela")) partes.push(`preço de ${antes.precoTabela ? brl(antes.precoTabela) : "Consultar preço"} para ${d.precoTabela ? brl(d.precoTabela) : "Consultar preço"}`);
      if (campos.includes("mostrarNoSite")) partes.push(d.mostrarNoSite ? "voltou a mostrar no site" : "tirou do site");
      if (campos.includes("lancamento")) partes.push(d.lancamento ? "marcou como lançamento" : "tirou de lançamento");
      if (campos.includes("disponibilidade")) partes.push(`disponibilidade "${DISPONIBILIDADES[d.disponibilidade]}"`);
      if (campos.includes("ficha")) partes.push("ficha técnica");
      await registrarLog(
        u,
        {
          acao: campos.includes("precoTabela") ? "modelo.preco_alterado" : "modelo.editado",
          entidade: "modelo",
          entidadeId: id,
          descricao: `Editou ${antes.nome === d.nome ? antes.nome : `${antes.nome} (agora ${d.nome})`} no catálogo${partes.length ? `: ${partes.join(", ")}` : ""}`,
          dados: { campos, ...(campos.includes("ficha") && { fichaAntes: antes.ficha, fichaDepois: d.ficha }) },
        },
        tx,
      );
    });
    return id;
  }

  return db.transaction(async (tx) => {
    /* entra no fim da lista; a equipe sobe ou desce depois */
    const [{ proxima }] = await tx.select({ proxima: sql<number>`coalesce(max(${m.ordem}), -1)::int + 1` }).from(m);
    const [novo] = await tx
      .insert(m)
      .values({ ...d, ordem: proxima })
      .returning({ id: m.id });
    await registrarLog(
      u,
      {
        acao: "modelo.criado",
        entidade: "modelo",
        entidadeId: novo.id,
        descricao: `Criou ${d.nome} no catálogo (${TIPOS_CATALOGO[d.tipo]}${d.precoTabela ? `, ${brl(d.precoTabela)}` : ", Consultar preço"}${d.mostrarNoSite ? "" : ", fora do site"}${d.lancamento ? ", lançamento" : ""})`,
      },
      tx,
    );
    return novo.id;
  });
}

/** Troca, põe ou tira a foto principal. A foto antiga só é apagada depois de gravar a nova. */
export async function trocarFotoModelo(u: Quem, id: number, fotoUrl: string | null) {
  let antes;
  try {
    antes = await modeloPorId(id);
  } catch (e) {
    await apagarFotoCatalogo(fotoUrl);
    throw e;
  }
  await db.transaction(async (tx) => {
    await tx.update(m).set({ fotoUrl }).where(eq(m.id, id));
    await registrarLog(
      u,
      {
        acao: fotoUrl ? "modelo.foto_alterada" : "modelo.foto_removida",
        entidade: "modelo",
        entidadeId: id,
        descricao: `${fotoUrl ? (antes.fotoUrl ? "Trocou" : "Colocou") : "Removeu"} a foto principal do ${antes.nome}`,
      },
      tx,
    );
  });
  if (antes.fotoUrl !== fotoUrl) await apagarFotoCatalogo(antes.fotoUrl);
  return { fotoUrl };
}

/** Sobe ou desce uma posição na ordem do site. */
export async function moverModelo(u: Quem, id: number, direcao: "cima" | "baixo") {
  const alvo = await modeloPorId(id);
  await db.transaction(async (tx) => {
    /* renumera 0..n na ordem da tela e troca com o vizinho: funciona mesmo com ordem repetida */
    const lista = await tx.select({ id: m.id }).from(m).orderBy(desc(m.ativo), asc(m.ordem), asc(m.nome));
    const i = lista.findIndex((x) => x.id === id);
    const j = direcao === "cima" ? i - 1 : i + 1;
    if (i < 0 || j < 0 || j >= lista.length) return;
    [lista[i], lista[j]] = [lista[j], lista[i]];
    for (const [ordem, x] of lista.entries()) await tx.update(m).set({ ordem }).where(eq(m.id, x.id));
    await registrarLog(u, { acao: "modelo.reordenado", entidade: "modelo", entidadeId: id, descricao: `Mudou a ordem do catálogo (${alvo.nome} ${direcao === "cima" ? "subiu" : "desceu"})`, dados: { ordem: lista.map((x) => x.id) } }, tx);
  });
}

/** Mostra ou esconde no site, sem mexer em mais nada. */
export async function alternarSite(u: Quem, id: number, mostrar: boolean) {
  const antes = await modeloPorId(id);
  if (antes.mostrarNoSite === mostrar) return;
  await db.transaction(async (tx) => {
    await tx.update(m).set({ mostrarNoSite: mostrar }).where(eq(m.id, id));
    await registrarLog(u, { acao: mostrar ? "modelo.site_mostrado" : "modelo.site_escondido", entidade: "modelo", entidadeId: id, descricao: `${mostrar ? "Voltou a mostrar" : "Tirou"} ${antes.nome} ${mostrar ? "no" : "do"} site` }, tx);
  });
}

/** Desativar tira do site e das listas de escolha (estoque, test drive), mas guarda o histórico. */
export async function alternarAtivo(u: Quem, id: number, ativo: boolean) {
  const antes = await modeloPorId(id);
  if (antes.ativo === ativo) return;
  await db.transaction(async (tx) => {
    await tx.update(m).set({ ativo }).where(eq(m.id, id));
    await registrarLog(u, { acao: ativo ? "modelo.reativado" : "modelo.desativado", entidade: "modelo", entidadeId: id, descricao: `${ativo ? "Reativou" : "Desativou"} ${antes.nome} no catálogo` }, tx);
  });
}

/** O que impede apagar: veículo, reserva, test drive ou promoção ligados ao modelo. */
export async function ligacoesDoModelo(id: number) {
  const [r] = await db.execute<{ veiculos: number; reservas: number; testDrives: number; promocoes: number }>(sql`
    select
      (select count(*)::int from veiculos where modelo_id = ${id}) as "veiculos",
      (select count(*)::int from reservas_lancamento where modelo_id = ${id}) as "reservas",
      (select count(*)::int from test_drives where modelo_id = ${id}) as "testDrives",
      (select count(*)::int from promocoes where modelo_id = ${id}) as "promocoes"`).then((x) => x.rows);
  return r;
}

export async function excluirModelo(u: Quem, id: number) {
  const antes = await modeloPorId(id);
  const l = await ligacoesDoModelo(id);
  const motivos = [
    l.veiculos && `${l.veiculos} veículo(s) no estoque`,
    l.reservas && `${l.reservas} reserva(s)`,
    l.testDrives && `${l.testDrives} test drive(s)`,
    l.promocoes && `${l.promocoes} promoção(ões)`,
  ].filter(Boolean);
  if (motivos.length) throw new ErroRegra(`${antes.nome} tem ${motivos.join(", ")} ligados a ele e não pode ser apagado. Use "Tirar do site" ou "Desativar".`);
  const cores = await db.select({ fotoUrl: schema.modeloCores.fotoUrl }).from(schema.modeloCores).where(eq(schema.modeloCores.modeloId, id));
  await db.transaction(async (tx) => {
    await tx.delete(m).where(eq(m.id, id));
    await registrarLog(u, { acao: "modelo.excluido", entidade: "modelo", entidadeId: id, descricao: `Apagou ${antes.nome} do catálogo`, dados: { tipo: antes.tipo, precoTabela: antes.precoTabela, cores: cores.length } }, tx);
  });
  /* depois do banco: se apagar arquivo falhar, só sobra arquivo */
  for (const f of [antes.fotoUrl, ...cores.map((c) => c.fotoUrl)]) await apagarFotoCatalogo(f);
}

/** Foto só do WhatsApp (a IA manda no lugar da foto da cor). Não aparece no site. */
export async function trocarFotoWhatsappModelo(u: Quem, id: number, url: string | null) {
  let antes;
  try {
    antes = await modeloPorId(id);
  } catch (e) {
    await apagarFotoCatalogo(url);
    throw e;
  }
  const [atual] = await db.select({ fotoWhatsappUrl: m.fotoWhatsappUrl }).from(m).where(eq(m.id, id)).limit(1);
  await db.transaction(async (tx) => {
    await tx.update(m).set({ fotoWhatsappUrl: url }).where(eq(m.id, id));
    await registrarLog(
      u,
      {
        acao: url ? "modelo.foto_whatsapp_alterada" : "modelo.foto_whatsapp_removida",
        entidade: "modelo",
        entidadeId: id,
        descricao: `${url ? (atual?.fotoWhatsappUrl ? "Trocou" : "Colocou") : "Removeu"} a foto do WhatsApp do ${antes.nome}`,
      },
      tx,
    );
  });
  if (atual?.fotoWhatsappUrl && atual.fotoWhatsappUrl !== url) await apagarFotoCatalogo(atual.fotoWhatsappUrl);
  return { fotoWhatsappUrl: url };
}
