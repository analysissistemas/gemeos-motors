"use server";
import { and, eq, ne, or, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, schema } from "@/lib/db";
import { autorizar } from "@/lib/auth/dal";
import { executar, ErroRegra } from "@/lib/acao";
import { registrarLog } from "@/lib/logs";
import { esquemaCliente, esquemaInteracao } from "@/lib/validacao";
import { CANAIS_INTERACAO } from "@/lib/dominio";

const ROTULOS: Record<string, string> = {
  nome: "nome", cpf: "CPF", telefone: "telefone", whatsapp: "WhatsApp", email: "e-mail", nascimento: "aniversário",
  cep: "CEP", endereco: "endereço", numero: "número", complemento: "complemento", bairro: "bairro", cidade: "cidade",
  estado: "estado", origem: "origem", responsavelId: "responsável", observacoes: "observações",
};

/* mesmo número em outro cadastro = cliente duplicado. O WhatsApp localiza o
   cliente pelo telefone, então dois cadastros com o mesmo número quebrariam isso. */
async function conferirTelefoneDuplicado(tels: (string | null)[], ignorarId?: number) {
  const numeros = tels.filter(Boolean) as string[];
  if (!numeros.length) return;
  const variantes = numeros.flatMap((n) => [n, n.startsWith("55") ? n.slice(2) : `55${n}`]);
  const lista = sql.join(variantes.map((v) => sql`${v}`), sql`, `);
  const [dup] = await db
    .select({ id: schema.clientes.id, nome: schema.clientes.nome })
    .from(schema.clientes)
    .where(
      and(
        or(sql`${schema.clientes.whatsapp} in (${lista})`, sql`${schema.clientes.telefone} in (${lista})`),
        ignorarId ? ne(schema.clientes.id, ignorarId) : undefined,
      ),
    )
    .limit(1);
  if (dup) throw new ErroRegra(`Este telefone já está no cadastro de ${dup.nome} (cliente nº ${dup.id}). Abra o cadastro existente em vez de criar outro.`);
}

export async function salvarCliente(entrada: { id?: number } & Record<string, unknown>) {
  return executar(async () => {
    const u = await autorizar("clientes.editar");
    const dados = esquemaCliente.parse(entrada);
    await conferirTelefoneDuplicado([dados.whatsapp, dados.telefone], entrada.id);
    if (dados.cpf) {
      const [dupCpf] = await db
        .select({ id: schema.clientes.id, nome: schema.clientes.nome })
        .from(schema.clientes)
        .where(and(eq(schema.clientes.cpf, dados.cpf), entrada.id ? ne(schema.clientes.id, Number(entrada.id)) : undefined))
        .limit(1);
      if (dupCpf) throw new ErroRegra(`Este CPF já está no cadastro de ${dupCpf.nome} (cliente nº ${dupCpf.id}).`);
    }

    if (entrada.id) {
      const id = Number(entrada.id);
      const [antes] = await db.select().from(schema.clientes).where(eq(schema.clientes.id, id)).limit(1);
      if (!antes) throw new ErroRegra("Cliente não encontrado.");
      const mudou = Object.keys(dados).filter((k) => (antes as Record<string, unknown>)[k] !== (dados as Record<string, unknown>)[k]);
      await db.transaction(async (tx) => {
        await tx.update(schema.clientes).set({ ...dados, atualizadoEm: new Date() }).where(eq(schema.clientes.id, id));
        if (mudou.length)
          await registrarLog(
            u,
            {
              acao: "cliente.editado",
              entidade: "cliente",
              entidadeId: id,
              descricao: `Editou o cliente ${dados.nome}: ${mudou.map((k) => ROTULOS[k] ?? k).join(", ")}`,
              dados: Object.fromEntries(mudou.map((k) => [k, { de: (antes as Record<string, unknown>)[k], para: (dados as Record<string, unknown>)[k] }])),
            },
            tx,
          );
      });
      revalidatePath(`/sistema/clientes/${id}`);
      revalidatePath("/sistema/clientes");
      return { id };
    }

    const id = await db.transaction(async (tx) => {
      const [novo] = await tx
        .insert(schema.clientes)
        .values({ ...dados, responsavelId: dados.responsavelId ?? u.id, criadoPor: u.id })
        .returning({ id: schema.clientes.id });
      await registrarLog(u, { acao: "cliente.criado", entidade: "cliente", entidadeId: novo.id, descricao: `Cadastrou o cliente ${dados.nome}` }, tx);
      return novo.id;
    });
    revalidatePath("/sistema/clientes");
    return { id };
  }, entrada.id ? "Cadastro atualizado" : "Cliente cadastrado");
}

export async function registrarInteracao(entrada: Record<string, unknown>) {
  return executar(async () => {
    const u = await autorizar("clientes.editar");
    const d = esquemaInteracao.parse(entrada);
    await db.transaction(async (tx) => {
      await tx.insert(schema.interacoes).values({ ...d, usuarioId: u.id });
      if (d.negocioId) {
        await tx.update(schema.negocios).set({ ultimaInteracaoEm: new Date() }).where(eq(schema.negocios.id, d.negocioId));
        await tx.insert(schema.negocioEventos).values({
          negocioId: d.negocioId,
          tipo: "interacao",
          descricao: `${CANAIS_INTERACAO[d.canal]}: ${d.resumo}`,
          usuarioId: u.id,
        });
      }
      await registrarLog(u, { acao: "interacao.registrada", entidade: "cliente", entidadeId: d.clienteId, descricao: `Registrou interação (${CANAIS_INTERACAO[d.canal]})` }, tx);
    });
    revalidatePath(`/sistema/clientes/${d.clienteId}`);
    revalidatePath("/sistema/funil");
    return null;
  }, "Interação registrada");
}

/** Busca rápida para seletores (funil, OS, venda). */
export async function buscarClientes(termo: string) {
  const u = await autorizar("clientes.ver");
  void u;
  const t = termo.trim();
  if (t.length < 2) return [];
  const dig = t.replace(/\D/g, "");
  return db
    .select({
      id: schema.clientes.id,
      nome: schema.clientes.nome,
      whatsapp: schema.clientes.whatsapp,
      telefone: schema.clientes.telefone,
      cpf: schema.clientes.cpf,
    })
    .from(schema.clientes)
    .where(
      or(
        sql`${schema.clientes.nome} ilike ${"%" + t + "%"}`,
        dig.length >= 3 ? sql`${schema.clientes.whatsapp} like ${"%" + dig + "%"}` : undefined,
        dig.length >= 3 ? sql`${schema.clientes.telefone} like ${"%" + dig + "%"}` : undefined,
        dig.length >= 3 ? sql`${schema.clientes.cpf} like ${dig + "%"}` : undefined,
      ),
    )
    .orderBy(schema.clientes.nome)
    .limit(8);
}
