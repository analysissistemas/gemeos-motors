import "server-only";
import { and, desc, eq, inArray, isNull, lt, ne, or, sql } from "drizzle-orm";
import { db, schema, type Tx } from "@/lib/db";
import { ErroRegra } from "@/lib/acao";
import { registrarLog } from "@/lib/logs";
import { STATUS_CONVERSA, type StatusConversa } from "@/lib/dominio";
import { dataHora, formatarTelefone, soDigitos } from "@/lib/formato";
import { triarConversa } from "@/lib/ia/diagnosticos";
import { IaIndisponivel } from "@/lib/ia/cliente";
import { criarNegocio } from "@/lib/servicos/negocios";
import { obterProvedor } from "./provedores";
import { persistirMidia } from "./midia";
import { mensagemSistema } from "./anotacoes";
export { mensagemSistema, anotarNegocioNaConversa } from "./anotacoes";
import type { MensagemEntrante, Midia, TipoMensagem } from "./tipos";

type Quem = { id: number; nome: string };

/* ============================================================
   MESSAGING SERVICE
   Toda regra de conversa mora aqui, igual para o simulado e para o
   WhatsApp real: identificar cliente pelo telefone, abrir ou reabrir
   conversa, contar não lidas, triagem da IA, assumir, transferir,
   notas, follow-up e o elo com o negócio do funil.
   ============================================================ */

/** Variações de um número brasileiro: com/sem 55 e com/sem o nono dígito. */
export function variantesTelefone(tel: string) {
  let d = soDigitos(tel);
  if (d.length >= 12 && d.startsWith("55")) d = d.slice(2);
  const out = new Set<string>([d]);
  if (d.length === 11 && d[2] === "9") out.add(d.slice(0, 2) + d.slice(3));
  if (d.length === 10) out.add(d.slice(0, 2) + "9" + d.slice(2));
  for (const x of Array.from(out)) out.add("55" + x);
  return Array.from(out);
}

export function normalizarTelefone(tel: string) {
  const d = soDigitos(tel);
  return d.startsWith("55") && d.length >= 12 ? d : `55${d}`;
}

async function acharClientePorTelefone(tx: Tx | typeof db, telefone: string) {
  const vs = variantesTelefone(telefone);
  const lista = sql.join(vs.map((v) => sql`${v}`), sql`, `);
  const [c] = await tx
    .select({ id: schema.clientes.id, nome: schema.clientes.nome })
    .from(schema.clientes)
    .where(or(sql`${schema.clientes.whatsapp} in (${lista})`, sql`${schema.clientes.telefone} in (${lista})`))
    .orderBy(schema.clientes.id)
    .limit(1);
  return c ?? null;
}

async function negocioAbertoDoCliente(tx: Tx | typeof db, clienteId: number) {
  const [n] = await tx
    .select({ id: schema.negocios.id })
    .from(schema.negocios)
    .where(and(eq(schema.negocios.clienteId, clienteId), inArray(schema.negocios.etapa, ["whatsapp", "proposta", "negociando"])))
    .orderBy(desc(schema.negocios.criadoEm))
    .limit(1);
  return n?.id ?? null;
}

const resumoMensagem = (tipo: TipoMensagem, conteudo?: string | null, midia?: Midia | null) =>
  tipo === "texto" ? (conteudo ?? "").slice(0, 160)
  : tipo === "imagem" ? `Foto${conteudo ? `: ${conteudo.slice(0, 120)}` : ""}`
  : tipo === "documento" ? `Documento: ${midia?.nome ?? "arquivo"}`
  : tipo === "audio" ? "Áudio"
  : tipo === "video" ? "Vídeo"
  : tipo === "localizacao" ? "Localização"
  : tipo === "contato" ? "Contato"
  : (conteudo ?? "").slice(0, 160);

/* ---------------- entrada (cliente → sistema) ---------------- */
export async function receberMensagem(m: MensagemEntrante) {
  const telefone = normalizarTelefone(m.telefone);
  const resultado = await db.transaction(async (tx) => {
    if (m.externoId) {
      const [dup] = await tx.select({ id: schema.mensagens.id }).from(schema.mensagens).where(eq(schema.mensagens.externoId, m.externoId)).limit(1);
      if (dup) return { conversaId: null, duplicada: true, nova: false };
    }
    let [conversa] = await tx
      .select()
      .from(schema.conversas)
      .where(and(eq(schema.conversas.canal, m.canal), sql`${schema.conversas.contatoTelefone} in (${sql.join(variantesTelefone(telefone).map((v) => sql`${v}`), sql`, `)})`))
      .limit(1);
    let nova = false;
    if (!conversa) {
      const cliente = await acharClientePorTelefone(tx, telefone);
      const negocioId = cliente ? await negocioAbertoDoCliente(tx, cliente.id) : null;
      [conversa] = await tx
        .insert(schema.conversas)
        .values({ canal: m.canal, provedor: m.provedor, contatoTelefone: telefone, contatoNome: m.nomeContato ?? null, clienteId: cliente?.id ?? null, negocioId, demo: !!m.demo })
        .returning();
      nova = true;
      await mensagemSistema(tx, conversa.id, cliente ? `Contato identificado: cliente ${cliente.nome}` : "Número sem cadastro. Cadastre o cliente para ligar a conversa ao CRM.");
      await registrarLog(null, { acao: "conversa.criada", entidade: "conversa", entidadeId: conversa.id, descricao: `Nova conversa no WhatsApp com ${m.nomeContato ?? formatarTelefone(telefone)}`, origem: "webhook" }, tx);
    }
    const resumo = resumoMensagem(m.tipo, m.conteudo, m.midia);
    await tx.insert(schema.mensagens).values({
      conversaId: conversa.id,
      direcao: "incoming",
      autor: "cliente",
      tipo: m.tipo,
      conteudo: m.conteudo ?? null,
      midiaUrl: m.midia?.url ?? null,
      midiaNome: m.midia?.nome ?? null,
      midiaMime: m.midia?.mime ?? null,
      midiaTamanho: m.midia?.tamanho ?? null,
      status: "received",
      externoId: m.externoId ?? null,
      metadados: m.metadados,
    });
    const reabrir = conversa.status === "resolvida" || conversa.status === "encerrada";
    await tx
      .update(schema.conversas)
      .set({
        ultimaMensagemEm: new Date(),
        ultimaMensagemTexto: resumo,
        ultimaMensagemDirecao: "incoming",
        naoLidas: sql`${schema.conversas.naoLidas} + 1`,
        contatoNome: conversa.contatoNome ?? m.nomeContato ?? null,
        status: reabrir ? "nova" : conversa.status === "aguardando_cliente" ? "em_atendimento" : conversa.status,
        ...(reabrir && { modo: "ia", responsavelId: null }),
        atualizadoEm: new Date(),
      })
      .where(eq(schema.conversas.id, conversa.id));
    if (reabrir) await mensagemSistema(tx, conversa.id, "Conversa reaberta: o cliente mandou mensagem de novo");
    if (conversa.negocioId) await tx.update(schema.negocios).set({ ultimaInteracaoEm: new Date() }).where(eq(schema.negocios.id, conversa.negocioId));
    return { conversaId: conversa.id, duplicada: false, nova, modo: reabrir ? "ia" : conversa.modo };
  });
  return resultado;
}

/* ---------------- triagem automática ---------------- */
export async function triagemAutomaticaLigada() {
  const [c] = await db.select({ valor: schema.configuracoes.valor }).from(schema.configuracoes).where(eq(schema.configuracoes.chave, "ia.triagem_automatica")).limit(1);
  return c?.valor !== false;
}

export async function executarTriagem(conversaId: number) {
  const [conversa] = await db.select().from(schema.conversas).where(eq(schema.conversas.id, conversaId)).limit(1);
  if (!conversa || conversa.modo !== "ia") return { ok: false as const, motivo: "Conversa já está com atendimento humano." };
  const catalogo = (await db.select({ nome: schema.modelos.nome }).from(schema.modelos)).map((x) => x.nome);
  let t;
  try {
    t = await triarConversa(conversaId, catalogo);
  } catch (e) {
    const motivo = e instanceof IaIndisponivel ? e.message : "A IA não respondeu.";
    const [ultima] = await db.select({ conteudo: schema.mensagens.conteudo }).from(schema.mensagens).where(and(eq(schema.mensagens.conversaId, conversaId), eq(schema.mensagens.tipo, "sistema"))).orderBy(desc(schema.mensagens.id)).limit(1);
    const aviso = `Triagem automática indisponível: ${motivo} Um consultor precisa assumir.`;
    if (ultima?.conteudo !== aviso) await mensagemSistema(db, conversaId, aviso);
    return { ok: false as const, motivo };
  }
  const { proximaMensagem, ...triagem } = t;
  await db.transaction(async (tx) => {
    await tx.update(schema.conversas).set({ triagemIa: triagem, triagemEm: new Date(), atualizadoEm: new Date(), ...(triagem.prontoParaHumano && { prioridade: triagem.intencaoCompra === "alta" ? "alta" : "normal" }) }).where(eq(schema.conversas.id, conversaId));
    if (proximaMensagem) {
      const env = await (await obterProvedor()).enviar({ telefone: conversa.contatoTelefone, tipo: "texto", conteudo: proximaMensagem });
      await tx.insert(schema.mensagens).values({ conversaId, direcao: "outgoing", autor: "ia", tipo: "texto", conteudo: proximaMensagem, status: env.status, externoId: env.externoId, metadados: env.erro ? { erro: env.erro } : undefined });
      await tx.update(schema.conversas).set({ ultimaMensagemEm: new Date(), ultimaMensagemTexto: proximaMensagem.slice(0, 160), ultimaMensagemDirecao: "outgoing" }).where(eq(schema.conversas.id, conversaId));
    }
    if (triagem.prontoParaHumano) {
      await mensagemSistema(tx, conversaId, `Triagem da IA concluída: ${triagem.resumo} — aguardando consultor.`, { triagem: true });
      if (conversa.clienteId && !conversa.negocioId) {
        const existente = await negocioAbertoDoCliente(tx, conversa.clienteId);
        const negocioId =
          existente ??
          (await criarNegocio(
            null,
            { clienteId: conversa.clienteId, veiculoInteresse: triagem.veiculo ?? triagem.interesse, origem: "whatsapp", temTroca: !!triagem.temTroca, trocaDescricao: triagem.trocaDescricao, responsavelId: null },
            { demo: conversa.demo, triagemIa: triagem.resumo },
            tx,
          ));
        if (negocioId) {
          await tx.update(schema.conversas).set({ negocioId }).where(eq(schema.conversas.id, conversaId));
          await tx.update(schema.negocios).set({ triagemIa: triagem.resumo }).where(eq(schema.negocios.id, negocioId));
        }
      }
    }
  });
  return { ok: true as const, triagem };
}

/* ---------------- saída (sistema → cliente) ---------------- */
export async function enviarMensagem(u: Quem, conversaId: number, e: { tipo: TipoMensagem; conteudo?: string | null; midia?: Midia | null; respostaA?: number | null; metadados?: Record<string, unknown> }) {
  const texto = e.conteudo?.trim() ?? null;
  if (e.tipo === "texto" && !texto) throw new ErroRegra("Escreva a mensagem.");
  if (texto && texto.length > 4096) throw new ErroRegra("Mensagem longa demais (máximo 4.096 caracteres).");
  const [c] = await db.select().from(schema.conversas).where(eq(schema.conversas.id, conversaId)).limit(1);
  if (!c) throw new ErroRegra("Conversa não encontrada.");
  const prov = await obterProvedor();
  const midia = await persistirMidia(e.midia);
  let respostaExterno: string | null = null;
  if (e.respostaA) {
    const [orig] = await db.select({ externoId: schema.mensagens.externoId }).from(schema.mensagens).where(eq(schema.mensagens.id, e.respostaA)).limit(1);
    respostaExterno = orig?.externoId ?? null;
  }
  const env = await prov.enviar({ telefone: c.contatoTelefone, tipo: e.tipo, conteudo: texto, midia, respostaAExternoId: respostaExterno });
  return db.transaction(async (tx) => {
    if (c.modo === "ia") await assumirNaTransacao(tx, u, c, true);
    const [msg] = await tx
      .insert(schema.mensagens)
      .values({
        conversaId,
        direcao: "outgoing",
        autor: "usuario",
        usuarioId: u.id,
        tipo: e.tipo,
        conteudo: texto,
        midiaUrl: midia?.url ?? null,
        midiaNome: midia?.nome ?? null,
        midiaMime: midia?.mime ?? null,
        midiaTamanho: midia?.tamanho ?? null,
        status: env.status,
        externoId: env.externoId,
        respostaA: e.respostaA ?? null,
        metadados: { ...(e.metadados ?? {}), ...(env.erro ? { erro: env.erro } : {}) },
      })
      .returning({ id: schema.mensagens.id });
    await tx
      .update(schema.conversas)
      .set({
        ultimaMensagemEm: new Date(),
        ultimaMensagemTexto: resumoMensagem(e.tipo, texto, midia),
        ultimaMensagemDirecao: "outgoing",
        naoLidas: 0,
        status: c.status === "follow_up" ? "follow_up" : "aguardando_cliente",
        responsavelId: c.responsavelId ?? u.id,
        atualizadoEm: new Date(),
      })
      .where(eq(schema.conversas.id, conversaId));
    await tx.update(schema.mensagens).set({ lidaEm: new Date() }).where(and(eq(schema.mensagens.conversaId, conversaId), eq(schema.mensagens.direcao, "incoming"), isNull(schema.mensagens.lidaEm)));
    if (c.negocioId) await tx.update(schema.negocios).set({ ultimaInteracaoEm: new Date() }).where(eq(schema.negocios.id, c.negocioId));
    await registrarLog(u, { acao: "mensagem.enviada", entidade: "conversa", entidadeId: conversaId, descricao: `Enviou ${e.tipo === "texto" ? "mensagem" : e.tipo} para ${c.contatoNome ?? formatarTelefone(c.contatoTelefone)}`, dados: { mensagemId: msg.id, status: env.status } }, tx);
    if (env.status === "failed") throw new ErroRegra(`A mensagem não foi enviada: ${env.erro ?? "falha no provedor"}`);
    return msg.id;
  });
}

/** Andamento simulado das mensagens enviadas: entregue em ~2 s, lida em ~8 s. */
export async function simularAndamento(conversaId?: number) {
  if (!(await obterProvedor()).simulado) return;
  const filtro = conversaId ? eq(schema.mensagens.conversaId, conversaId) : undefined;
  await db
    .update(schema.mensagens)
    .set({ status: "delivered" })
    .where(and(filtro, eq(schema.mensagens.direcao, "outgoing"), eq(schema.mensagens.status, "sent"), sql`${schema.mensagens.externoId} like 'mock-%'`, lt(schema.mensagens.criadoEm, sql`now() - interval '2 seconds'`)));
  await db
    .update(schema.mensagens)
    .set({ status: "read" })
    .where(and(filtro, eq(schema.mensagens.direcao, "outgoing"), eq(schema.mensagens.status, "delivered"), sql`${schema.mensagens.externoId} like 'mock-%'`, lt(schema.mensagens.criadoEm, sql`now() - interval '8 seconds'`)));
}

/** Status vindo do provedor real (webhook): entregue, lida, falhou. */
export async function aplicarStatus(externoId: string, status: "delivered" | "read" | "failed", erro?: string) {
  const ordem = { sent: 1, delivered: 2, read: 3, failed: 9 } as Record<string, number>;
  const [m] = await db.select({ id: schema.mensagens.id, status: schema.mensagens.status }).from(schema.mensagens).where(eq(schema.mensagens.externoId, externoId)).limit(1);
  if (!m || (ordem[m.status] ?? 0) >= ordem[status]) return;
  await db.update(schema.mensagens).set({ status, ...(erro && { metadados: { erro } }) }).where(eq(schema.mensagens.id, m.id));
}

export async function marcarLida(conversaId: number) {
  await db.transaction(async (tx) => {
    await tx.update(schema.mensagens).set({ lidaEm: new Date() }).where(and(eq(schema.mensagens.conversaId, conversaId), eq(schema.mensagens.direcao, "incoming"), isNull(schema.mensagens.lidaEm)));
    await tx.update(schema.conversas).set({ naoLidas: 0 }).where(and(eq(schema.conversas.id, conversaId), ne(schema.conversas.naoLidas, 0)));
  });
}

/* ---------------- atribuição ---------------- */
async function assumirNaTransacao(tx: Tx, u: Quem, c: typeof schema.conversas.$inferSelect, automatico = false) {
  const primeiraVez = !c.atendimentoHumanoPor;
  await tx
    .update(schema.conversas)
    .set({ modo: "humano", responsavelId: u.id, status: c.status === "nova" ? "em_atendimento" : c.status, ...(primeiraVez && { atendimentoHumanoPor: u.id, atendimentoHumanoEm: new Date() }), atualizadoEm: new Date() })
    .where(eq(schema.conversas.id, c.id));
  await mensagemSistema(tx, c.id, `Atendimento humano iniciado por ${u.nome}`, { assumiu: u.id, automatico });
  if (c.negocioId) {
    await tx.update(schema.negocios).set({ atendimentoHumanoId: u.id, responsavelId: sql`coalesce(${schema.negocios.responsavelId}, ${u.id})` }).where(eq(schema.negocios.id, c.negocioId));
    await tx.insert(schema.negocioEventos).values({ negocioId: c.negocioId, tipo: "atendimento", descricao: `Atendimento transferido para ${u.nome}`, usuarioId: u.id });
  }
  await registrarLog(u, { acao: "conversa.assumida", entidade: "conversa", entidadeId: c.id, descricao: `Assumiu o atendimento de ${c.contatoNome ?? formatarTelefone(c.contatoTelefone)}` }, tx);
}

export async function assumirConversa(u: Quem, conversaId: number) {
  return db.transaction(async (tx) => {
    const [c] = await tx.select().from(schema.conversas).where(eq(schema.conversas.id, conversaId)).limit(1);
    if (!c) throw new ErroRegra("Conversa não encontrada.");
    if (c.modo === "humano" && c.responsavelId === u.id) return;
    await assumirNaTransacao(tx, u, c);
  });
}

export async function atribuirConversa(u: Quem, conversaId: number, responsavelId: number | null) {
  return db.transaction(async (tx) => {
    const [c] = await tx.select().from(schema.conversas).where(eq(schema.conversas.id, conversaId)).limit(1);
    if (!c) throw new ErroRegra("Conversa não encontrada.");
    let nome = "ninguém";
    if (responsavelId) {
      const [p] = await tx.select({ nome: schema.usuarios.nome, ativo: schema.usuarios.ativo }).from(schema.usuarios).where(eq(schema.usuarios.id, responsavelId)).limit(1);
      if (!p?.ativo) throw new ErroRegra("Usuário inválido.");
      nome = p.nome;
    }
    await tx.update(schema.conversas).set({ responsavelId, ...(responsavelId && { modo: "humano" }), atualizadoEm: new Date() }).where(eq(schema.conversas.id, conversaId));
    const texto = responsavelId ? (c.responsavelId ? `Atendimento transferido para ${nome}` : `Conversa atribuída a ${nome}`) : "Responsável removido da conversa";
    await mensagemSistema(tx, conversaId, `${texto} (por ${u.nome})`);
    if (c.negocioId && responsavelId) await tx.update(schema.negocios).set({ responsavelId }).where(eq(schema.negocios.id, c.negocioId));
    await registrarLog(u, { acao: "conversa.responsavel", entidade: "conversa", entidadeId: conversaId, descricao: `${texto} — ${c.contatoNome ?? formatarTelefone(c.contatoTelefone)}`, dados: { de: c.responsavelId, para: responsavelId } }, tx);
  });
}

export async function mudarStatusConversa(u: Quem, conversaId: number, status: StatusConversa) {
  if (!(status in STATUS_CONVERSA)) throw new ErroRegra("Status inválido.");
  return db.transaction(async (tx) => {
    const [c] = await tx.select().from(schema.conversas).where(eq(schema.conversas.id, conversaId)).limit(1);
    if (!c) throw new ErroRegra("Conversa não encontrada.");
    if (c.status === status) return;
    await tx.update(schema.conversas).set({ status, atualizadoEm: new Date() }).where(eq(schema.conversas.id, conversaId));
    await mensagemSistema(tx, conversaId, `Status: ${STATUS_CONVERSA[status]} (por ${u.nome})`);
    await registrarLog(u, { acao: "conversa.status", entidade: "conversa", entidadeId: conversaId, descricao: `Mudou a conversa com ${c.contatoNome ?? formatarTelefone(c.contatoTelefone)} para "${STATUS_CONVERSA[status]}"` }, tx);
  });
}

export async function adicionarNota(u: Quem, conversaId: number, conteudo: string) {
  const texto = conteudo.trim();
  if (texto.length < 2) throw new ErroRegra("Escreva a nota.");
  if (texto.length > 3000) throw new ErroRegra("Nota longa demais.");
  return db.transaction(async (tx) => {
    const [c] = await tx.select({ contatoNome: schema.conversas.contatoNome, telefone: schema.conversas.contatoTelefone }).from(schema.conversas).where(eq(schema.conversas.id, conversaId)).limit(1);
    if (!c) throw new ErroRegra("Conversa não encontrada.");
    const [n] = await tx.insert(schema.conversaNotas).values({ conversaId, usuarioId: u.id, conteudo: texto }).returning({ id: schema.conversaNotas.id });
    await registrarLog(u, { acao: "conversa.nota", entidade: "conversa", entidadeId: conversaId, descricao: `Adicionou nota interna na conversa com ${c.contatoNome ?? formatarTelefone(c.telefone)}` }, tx);
    return n.id;
  });
}

/* ---------------- follow-up ---------------- */
export async function agendarFollowUp(u: Quem, conversaId: number, quando: Date, notas: string | null, responsavelId?: number | null) {
  if (Number.isNaN(quando.getTime())) throw new ErroRegra("Data inválida.");
  if (quando.getTime() < Date.now() - 60_000) throw new ErroRegra("Escolha uma data no futuro.");
  return db.transaction(async (tx) => {
    const [c] = await tx.select().from(schema.conversas).where(eq(schema.conversas.id, conversaId)).limit(1);
    if (!c) throw new ErroRegra("Conversa não encontrada.");
    await tx.update(schema.followUps).set({ status: "cancelado" }).where(and(eq(schema.followUps.conversaId, conversaId), eq(schema.followUps.status, "pendente")));
    const [f] = await tx
      .insert(schema.followUps)
      .values({ conversaId, clienteId: c.clienteId, negocioId: c.negocioId, usuarioId: responsavelId ?? c.responsavelId ?? u.id, agendadoPara: quando, notas: notas?.trim() || null, criadoPor: u.id })
      .returning({ id: schema.followUps.id });
    await tx.update(schema.conversas).set({ status: "follow_up", atualizadoEm: new Date() }).where(eq(schema.conversas.id, conversaId));
    await mensagemSistema(tx, conversaId, `Follow-up agendado para ${dataHora(quando)}${notas?.trim() ? `: ${notas.trim()}` : ""}`);
    if (c.negocioId) await tx.insert(schema.negocioEventos).values({ negocioId: c.negocioId, tipo: "followup", descricao: `Follow-up agendado para ${dataHora(quando)}`, usuarioId: u.id });
    await registrarLog(u, { acao: "followup.criado", entidade: "conversa", entidadeId: conversaId, descricao: `Agendou follow-up com ${c.contatoNome ?? formatarTelefone(c.contatoTelefone)} para ${dataHora(quando)}` }, tx);
    return f.id;
  });
}

export async function encerrarFollowUp(u: Quem, followUpId: number, como: "concluido" | "cancelado") {
  return db.transaction(async (tx) => {
    const [f] = await tx.select().from(schema.followUps).where(eq(schema.followUps.id, followUpId)).limit(1);
    if (!f) throw new ErroRegra("Follow-up não encontrado.");
    if (f.status !== "pendente") throw new ErroRegra("Este follow-up já foi encerrado.");
    await tx.update(schema.followUps).set({ status: como, concluidoEm: new Date(), concluidoPor: u.id }).where(eq(schema.followUps.id, followUpId));
    if (f.conversaId) {
      await mensagemSistema(tx, f.conversaId, `Follow-up de ${dataHora(f.agendadoPara)} ${como === "concluido" ? "concluído" : "cancelado"} por ${u.nome}`);
      await tx.update(schema.conversas).set({ status: "em_atendimento", atualizadoEm: new Date() }).where(and(eq(schema.conversas.id, f.conversaId), eq(schema.conversas.status, "follow_up")));
    }
    await registrarLog(u, { acao: como === "concluido" ? "followup.concluido" : "followup.cancelado", entidade: "followup", entidadeId: followUpId, descricao: `${como === "concluido" ? "Concluiu" : "Cancelou"} o follow-up de ${dataHora(f.agendadoPara)}` }, tx);
  });
}

/* ---------------- ligação com o CRM ---------------- */
export async function vincularCliente(u: Quem, conversaId: number, clienteId: number) {
  return db.transaction(async (tx) => {
    const [c] = await tx.select().from(schema.conversas).where(eq(schema.conversas.id, conversaId)).limit(1);
    const [cli] = await tx.select({ nome: schema.clientes.nome }).from(schema.clientes).where(eq(schema.clientes.id, clienteId)).limit(1);
    if (!c || !cli) throw new ErroRegra("Conversa ou cliente não encontrado.");
    const negocioId = c.negocioId ?? (await negocioAbertoDoCliente(tx, clienteId));
    await tx.update(schema.conversas).set({ clienteId, negocioId, contatoNome: c.contatoNome ?? cli.nome, atualizadoEm: new Date() }).where(eq(schema.conversas.id, conversaId));
    await mensagemSistema(tx, conversaId, `Conversa ligada ao cliente ${cli.nome} (por ${u.nome})`);
    await registrarLog(u, { acao: "conversa.cliente", entidade: "conversa", entidadeId: conversaId, descricao: `Ligou a conversa ao cliente ${cli.nome}` }, tx);
  });
}

export async function criarNegocioDaConversa(u: Quem, conversaId: number, dados: Record<string, unknown>) {
  const [c] = await db.select().from(schema.conversas).where(eq(schema.conversas.id, conversaId)).limit(1);
  if (!c) throw new ErroRegra("Conversa não encontrada.");
  if (!c.clienteId) throw new ErroRegra("Cadastre ou ligue o cliente antes de criar o negócio.");
  if (c.negocioId) throw new ErroRegra("Esta conversa já tem um negócio.");
  return db.transaction(async (tx) => {
    const id = await criarNegocio(
      u,
      { origem: "whatsapp", ...dados, clienteId: c.clienteId, responsavelId: dados.responsavelId ?? c.responsavelId ?? u.id },
      { demo: c.demo, triagemIa: c.triagemIa?.resumo ?? null },
      tx,
    );
    await tx.update(schema.conversas).set({ negocioId: id, atualizadoEm: new Date() }).where(eq(schema.conversas.id, conversaId));
    await mensagemSistema(tx, conversaId, `Negócio criado no funil em "Chegou no WhatsApp" (por ${u.nome})`);
    return id;
  });
}

/** Conversa com um cliente já cadastrado (botão "Conversa" na ficha). */
export async function abrirConversaDoCliente(u: Quem, clienteId: number) {
  const [cli] = await db.select().from(schema.clientes).where(eq(schema.clientes.id, clienteId)).limit(1);
  if (!cli) throw new ErroRegra("Cliente não encontrado.");
  const tel = cli.whatsapp ?? cli.telefone;
  if (!tel) throw new ErroRegra("Cliente sem WhatsApp no cadastro.");
  const telefone = normalizarTelefone(tel);
  const [existente] = await db
    .select({ id: schema.conversas.id })
    .from(schema.conversas)
    .where(and(eq(schema.conversas.canal, "whatsapp"), sql`${schema.conversas.contatoTelefone} in (${sql.join(variantesTelefone(telefone).map((v) => sql`${v}`), sql`, `)})`))
    .limit(1);
  if (existente) return existente.id;
  return db.transaction(async (tx) => {
    const negocioId = await negocioAbertoDoCliente(tx, clienteId);
    const [c] = await tx
      .insert(schema.conversas)
      .values({ canal: "whatsapp", provedor: (await obterProvedor()).id, contatoTelefone: telefone, contatoNome: cli.nome, clienteId, negocioId, responsavelId: u.id, modo: "humano", status: "em_atendimento", atendimentoHumanoPor: u.id, atendimentoHumanoEm: new Date(), demo: cli.demo })
      .returning({ id: schema.conversas.id });
    await mensagemSistema(tx, c.id, `Conversa iniciada pela loja (por ${u.nome})`);
    await registrarLog(u, { acao: "conversa.criada", entidade: "conversa", entidadeId: c.id, descricao: `Iniciou conversa com ${cli.nome}` }, tx);
    return c.id;
  });
}
