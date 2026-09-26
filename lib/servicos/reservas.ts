import "server-only";
import { and, desc, eq, gt, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/lib/db";
import { ErroRegra } from "@/lib/acao";
import { registrarLog } from "@/lib/logs";
import { STATUS_RESERVA, type StatusReserva } from "@/lib/dominio";
import { soDigitos } from "@/lib/formato";
import { normalizarTelefone, variantesTelefone } from "@/lib/mensageria/servico";
import { criarNegocio } from "@/lib/servicos/negocios";

/* ============================================================
   RESERVAS DE LANÇAMENTO
   O cliente escolhe no site um modelo marcado como lançamento e deixa nome,
   WhatsApp e cor. O sistema acha (ou cria) o cliente pelo telefone, abre um
   negócio no funil com origem "reserva_lancamento" e guarda a reserva para a
   equipe acompanhar em Reservas. Depois o site abre o WhatsApp com a mensagem
   pronta. Nada aqui manda mensagem sozinho.
   ============================================================ */

type Quem = { id: number; nome: string };
const r = schema.reservasLancamento;

/** Limite do formulário público por IP (igual ao espírito do login). */
export const LIMITE_RESERVA = { porHora: 5, porDia: 20 };
const ABERTAS: StatusReserva[] = ["nova", "contatada", "confirmada"];

export const esquemaReservaPublica = z.object({
  modeloId: z.coerce.number({ error: "Escolha o modelo" }).int().positive("Escolha o modelo"),
  nome: z
    .string({ error: "Informe seu nome" })
    .transform((s) => s.trim().replace(/\s+/g, " "))
    .pipe(z.string().min(2, "Informe seu nome").max(80, "Nome muito longo")),
  whatsapp: z
    .string({ error: "Informe seu WhatsApp" })
    .transform((s) => soDigitos(s))
    .pipe(z.string().min(10, "Confira o WhatsApp com DDD.").max(13, "Confira o WhatsApp com DDD.")),
  cor: z
    .string()
    .trim()
    .max(40, "Cor inválida")
    .optional()
    .nullable()
    .transform((v) => v || null),
  /* armadilha para robô: campo escondido que gente de verdade não preenche */
  site: z.string().optional().nullable(),
});

export class LimiteReserva extends Error {}

/** Texto do WhatsApp da reserva. Sem emoji (chega como "?" em alguns celulares); negrito com *. */
function textoWhatsApp(modelo: string, cor: string | null, nome: string) {
  return `Olá! Acabei de reservar a *${modelo}*${cor ? ` na cor *${cor}*` : ""} pelo site da Gêmeos Motors. Meu nome é ${nome}. Pode me passar os próximos passos?`;
}
const MENSAGEM_OK = "Reserva registrada! A equipe da Gêmeos Motors vai falar com você pelo WhatsApp. Se quiser adiantar, toque no botão e mande a mensagem.";

/** Formulário público do site. Devolve a mensagem da tela e o texto do WhatsApp. */
export async function criarReservaPublica(entrada: unknown, ip: string | null) {
  const d = esquemaReservaPublica.parse(entrada);

  /* robô preencheu o campo escondido: responde como sucesso e não grava nada */
  if (d.site && d.site.trim()) return { mensagem: MENSAGEM_OK, whatsapp: "" };

  const [modelo] = await db
    .select({ id: schema.modelos.id, nome: schema.modelos.nome, preco: schema.modelos.precoTabela })
    .from(schema.modelos)
    .where(and(eq(schema.modelos.id, d.modeloId), eq(schema.modelos.ativo, true), eq(schema.modelos.mostrarNoSite, true), eq(schema.modelos.lancamento, true)))
    .limit(1);
  if (!modelo) throw new ErroRegra("Este modelo não está aberto para reserva.");

  const telefone = normalizarTelefone(d.whatsapp);
  if (telefone.length < 12 || telefone.length > 13) throw new ErroRegra("Confira o WhatsApp com DDD.");
  const variantes = variantesTelefone(telefone);
  const whatsapp = textoWhatsApp(modelo.nome, d.cor, d.nome);

  /* mesma pessoa, mesmo modelo, reserva ainda em aberto: não duplica */
  const [igual] = await db
    .select({ id: r.id })
    .from(r)
    .where(and(eq(r.modeloId, modelo.id), inArray(r.telefone, variantes), inArray(r.status, ABERTAS)))
    .limit(1);
  if (igual) return { mensagem: "Você já tem uma reserva deste modelo. A equipe vai falar com você pelo WhatsApp.", whatsapp };

  /* limite por IP (hora e dia), contado nas reservas gravadas */
  const [{ hora, dia }] = await db
    .select({
      hora: sql<number>`count(*) filter (where ${r.criadoEm} > now() - interval '1 hour')::int`,
      dia: sql<number>`count(*)::int`,
    })
    .from(r)
    .where(and(sql`${r.ip} is not distinct from ${ip}`, gt(r.criadoEm, sql`now() - interval '1 day'`)));
  if (hora >= LIMITE_RESERVA.porHora || dia >= LIMITE_RESERVA.porDia) throw new LimiteReserva("Muitas reservas seguidas deste aparelho. Tente mais tarde ou chame a gente no WhatsApp.");

  await db.transaction(async (tx) => {
    const lista = sql.join(variantes.map((v) => sql`${v}`), sql`, `);
    const [existente] = await tx
      .select({ id: schema.clientes.id })
      .from(schema.clientes)
      .where(sql`${schema.clientes.whatsapp} in (${lista}) or ${schema.clientes.telefone} in (${lista})`)
      .orderBy(schema.clientes.id)
      .limit(1);
    let clienteId = existente?.id;
    if (!clienteId) {
      const [novo] = await tx
        .insert(schema.clientes)
        .values({ nome: d.nome, whatsapp: telefone.slice(2), origem: "site" })
        .returning({ id: schema.clientes.id });
      clienteId = novo.id;
      await registrarLog(null, { acao: "cliente.criado", entidade: "cliente", entidadeId: clienteId, descricao: `Cadastro de ${d.nome} criado pela reserva de lançamento no site`, autor: "Site" }, tx);
    }
    const negocioId = await criarNegocio(
      null,
      {
        clienteId,
        veiculoInteresse: `${modelo.nome}${d.cor ? ` (${d.cor})` : ""} — reserva de lançamento`,
        origem: "reserva_lancamento",
        valorAnunciado: modelo.preco ?? undefined,
      },
      { evento: "Negócio criado pela reserva de lançamento no site" },
      tx,
    );
    const [nova] = await tx
      .insert(r)
      .values({ modeloId: modelo.id, clienteId, negocioId, nome: d.nome, telefone, cor: d.cor, ip })
      .returning({ id: r.id });
    await registrarLog(
      null,
      { acao: "reserva.criada", entidade: "reserva", entidadeId: nova.id, descricao: `${d.nome} reservou ${modelo.nome}${d.cor ? ` na cor ${d.cor}` : ""} pelo site`, autor: "Site" },
      tx,
    );
  });
  return { mensagem: MENSAGEM_OK, whatsapp };
}

/** Lista para a tela Reservas (mais novas primeiro). */
export async function listarReservas(filtro: { status?: StatusReserva[] } = {}) {
  return db
    .select({
      id: r.id,
      nome: r.nome,
      telefone: r.telefone,
      cor: r.cor,
      status: r.status,
      observacoes: r.observacoes,
      criadoEm: r.criadoEm,
      atualizadoEm: r.atualizadoEm,
      clienteId: r.clienteId,
      negocioId: r.negocioId,
      modelo: schema.modelos.nome,
    })
    .from(r)
    .leftJoin(schema.modelos, eq(schema.modelos.id, r.modeloId))
    .where(filtro.status?.length ? inArray(r.status, filtro.status) : undefined)
    .orderBy(desc(r.criadoEm))
    .limit(300);
}
export type ItemReserva = Awaited<ReturnType<typeof listarReservas>>[number];

export async function mudarStatusReserva(u: Quem, id: number, status: StatusReserva) {
  if (!(status in STATUS_RESERVA)) throw new ErroRegra("Status inválido.");
  const [antes] = await db.select({ status: r.status, nome: r.nome }).from(r).where(eq(r.id, id)).limit(1);
  if (!antes) throw new ErroRegra("Reserva não encontrada. Atualize a página.");
  if (antes.status === status) return;
  await db.transaction(async (tx) => {
    await tx.update(r).set({ status, atualizadoEm: new Date() }).where(eq(r.id, id));
    await registrarLog(
      u,
      { acao: "reserva.status", entidade: "reserva", entidadeId: id, descricao: `Reserva de ${antes.nome}: ${STATUS_RESERVA[antes.status as StatusReserva] ?? antes.status} → ${STATUS_RESERVA[status]}` },
      tx,
    );
  });
}

export async function anotarReserva(u: Quem, id: number, observacoes: string) {
  const texto = z.string().trim().max(1000, "Use no máximo 1000 caracteres").parse(observacoes);
  const [antes] = await db.select({ nome: r.nome }).from(r).where(eq(r.id, id)).limit(1);
  if (!antes) throw new ErroRegra("Reserva não encontrada. Atualize a página.");
  await db.transaction(async (tx) => {
    await tx.update(r).set({ observacoes: texto || null, atualizadoEm: new Date() }).where(eq(r.id, id));
    await registrarLog(u, { acao: "reserva.anotada", entidade: "reserva", entidadeId: id, descricao: `Anotou na reserva de ${antes.nome}` }, tx);
  });
}
