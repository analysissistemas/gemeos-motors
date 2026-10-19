import "server-only";
import { and, desc, eq, gt, isNull, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { mensagemSistema } from "@/lib/mensageria/anotacoes";
import { MODELO_AVISO_CHEGADA, textoChegou } from "@/lib/ia/fila-espera";

/* Interesse em modelo sem estoque (fila de espera). Quando uma unidade do modelo fica disponível:
   - quem ACEITOU ser avisado (consentiuEm, dono 18/10/2026: "quando eu cadastrar essa moto no estoque a IA lembra essa
     pessoa") recebe a mensagem da IA sozinho: texto dentro das 24 h do WhatsApp, o modelo aprovado da Meta fora delas;
   - quem só perguntou vira follow-up PENDENTE PARA A EQUIPE, com pedido de aprovação (como antes).
   Moto de TESTE só avisa conversa do Simulador; moto real só avisa cliente de verdade. */

type Origem = "ia" | "equipe";

/** Registra (uma vez por conversa e modelo) que o cliente quer um modelo sem estoque. `consentiu`: aceitou ser avisado. */
export async function registrarInteresse(d: { conversaId: number; telefone: string; modeloId: number; origem: Origem; clienteId?: number | null; consentiu?: boolean }) {
  const [c] = await db.select({ clienteId: schema.conversas.clienteId }).from(schema.conversas).where(eq(schema.conversas.id, d.conversaId)).limit(1);
  if (!c) return { criado: false as const };
  const r = await db
    .insert(schema.interessesModelo)
    .values({ conversaId: d.conversaId, telefone: d.telefone, modeloId: d.modeloId, origem: d.origem, clienteId: d.clienteId ?? c.clienteId, consentiuEm: d.consentiu ? new Date() : null })
    .onConflictDoNothing()
    .returning({ id: schema.interessesModelo.id });
  if (!r.length && d.consentiu) await consentirAviso(d.conversaId, d.modeloId);
  return { criado: r.length > 0 };
}

/** O cliente disse "sim, me avisa": os interesses abertos da conversa (ou só deste modelo) entram no aviso automático. */
export async function consentirAviso(conversaId: number, modeloId?: number) {
  const I = schema.interessesModelo;
  const r = await db
    .update(I)
    .set({ consentiuEm: new Date() })
    .where(and(eq(I.conversaId, conversaId), isNull(I.avisadoEm), isNull(I.consentiuEm), modeloId ? eq(I.modeloId, modeloId) : undefined))
    .returning({ id: I.id, modeloId: I.modeloId });
  return r;
}

/** Chamar quando um veículo do modelo passa a "disponivel". Idempotente: cada interesse é avisado uma vez. */
export async function dispararFollowUpsDeEstoque(modeloId: number | null | undefined, opcoes: { teste?: boolean } = {}): Promise<{ criados: number; avisados: number }> {
  if (!modeloId) return { criados: 0, avisados: 0 };
  const teste = !!opcoes.teste;
  const [{ n }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.veiculos)
    .where(and(eq(schema.veiculos.modeloId, modeloId), eq(schema.veiculos.status, "disponivel"), eq(schema.veiculos.teste, teste)));
  if (!n) return { criados: 0, avisados: 0 };

  const paraAvisar: { interesseId: number; conversaId: number; telefone: string; nome: string | null; demo: boolean }[] = [];
  const [modelo] = await db.select({ nome: schema.modelos.nome }).from(schema.modelos).where(eq(schema.modelos.id, modeloId)).limit(1);
  const criados = await db.transaction(async (tx) => {
    const abertos = await tx
      .select({ i: schema.interessesModelo, demo: schema.conversas.demo })
      .from(schema.interessesModelo)
      .innerJoin(schema.conversas, eq(schema.conversas.id, schema.interessesModelo.conversaId))
      .where(and(eq(schema.interessesModelo.modeloId, modeloId), isNull(schema.interessesModelo.avisadoEm), eq(schema.conversas.demo, teste)))
      .for("update", { of: schema.interessesModelo, skipLocked: true });
    let total = 0;
    for (const { i } of abertos) {
      const [c] = await tx.select().from(schema.conversas).where(eq(schema.conversas.id, i.conversaId)).limit(1);
      if (!c) continue;
      const consentiu = !!i.consentiuEm;
      const motivo = `${modelo?.nome ?? "O modelo"} que o cliente pediu voltou ao estoque`;
      const [cli] = i.clienteId ?? c.clienteId ? await tx.select({ nome: schema.clientes.nome }).from(schema.clientes).where(eq(schema.clientes.id, (i.clienteId ?? c.clienteId)!)).limit(1) : [];
      const [f] = await tx
        .insert(schema.followUps)
        .values({
          conversaId: c.id,
          clienteId: i.clienteId ?? c.clienteId,
          negocioId: c.negocioId,
          usuarioId: c.responsavelId,
          agendadoPara: new Date(),
          notas: consentiu
            ? `${motivo}. O cliente pediu para ser avisado e a IA manda o aviso sozinha: acompanhe a resposta dele.`
            : `Avisar o cliente: ${motivo}. Confira o consentimento antes de enviar qualquer mensagem.`,
          tipo: "estoque",
          motivo,
          origem: "estoque",
          modeloId,
          exigeAprovacao: !consentiu,
          contexto: { interesseId: i.id, origemInteresse: i.origem, interessadoDesde: i.criadoEm, avisoAutomatico: consentiu },
        })
        .returning({ id: schema.followUps.id });
      await tx.update(schema.interessesModelo).set({ avisadoEm: new Date(), followUpId: f.id }).where(eq(schema.interessesModelo.id, i.id));
      await mensagemSistema(tx, c.id, consentiu ? `Fila de espera: ${motivo}. A IA vai avisar o cliente agora.` : `Follow-up de estoque criado: ${motivo}.`);
      if (consentiu) paraAvisar.push({ interesseId: i.id, conversaId: c.id, telefone: c.contatoTelefone, nome: primeiro(cli?.nome ?? c.contatoNome), demo: c.demo });
      total++;
    }
    /* chegou: a reposição cadastrada sai (o site volta para "Pronta entrega") */
    if (!teste) await tx.update(schema.modelos).set({ reposicaoEm: null, reposicaoQtd: null }).where(eq(schema.modelos.id, modeloId));
    return total;
  });

  let avisados = 0;
  for (const p of paraAvisar) if (await avisarCliente(p, modelo?.nome ?? "moto").catch(() => false)) avisados++;
  return { criados, avisados };
}

const primeiro = (nome: string | null | undefined) => {
  const n = (nome ?? "").trim().split(/\s+/)[0];
  return n && /^\p{L}{2,}$/u.test(n) ? n[0].toUpperCase() + n.slice(1).toLowerCase() : null;
};

/** Manda o aviso de chegada: texto livre dentro das 24 h (ou no Simulador); fora delas, o modelo aprovado da Meta. */
async function avisarCliente(p: { interesseId: number; conversaId: number; telefone: string; nome: string | null; demo: boolean }, modelo: string) {
  const M = schema.mensagens;
  const [ultima] = await db
    .select({ em: M.criadoEm })
    .from(M)
    .where(and(eq(M.conversaId, p.conversaId), eq(M.direcao, "incoming"), gt(M.criadoEm, new Date(Date.now() - 23.5 * 3_600_000))))
    .orderBy(desc(M.id))
    .limit(1);
  const texto = textoChegou({ nome: p.nome, modelo });
  let ok = false;
  let como = "";
  if (p.demo || ultima) {
    const { enviarRespostaDaIa } = await import("@/lib/ia/envio");
    const r = await enviarRespostaDaIa(db, { conversaId: p.conversaId, telefone: p.telefone, texto, origem: "fila de espera", simulado: p.demo, fontesExtras: [texto], textoDoSistema: true });
    ok = r.enviada;
    como = ok ? "mensagem da IA" : `não saiu (${r.explicacao ?? "recusada"})`;
  } else {
    const { obterProvedor } = await import("@/lib/mensageria/provedores");
    const prov = await obterProvedor();
    const r = await prov.enviar({
      telefone: p.telefone,
      tipo: "texto",
      conteudo: null,
      modelo: { nome: MODELO_AVISO_CHEGADA.nome, idioma: MODELO_AVISO_CHEGADA.idioma, componentes: [{ type: "body", parameters: [p.nome ?? "tudo bem", modelo].map((text) => ({ type: "text", text })) }] },
    });
    ok = r.status !== "failed";
    como = ok ? "modelo aviso_chegada da Meta (passou das 24 h)" : `não saiu: ${r.erro ?? "a Meta recusou"} (o modelo aviso_chegada precisa estar aprovado)`;
    if (ok) {
      const corpo = MODELO_AVISO_CHEGADA.definicao.components[0].text.replace("{{1}}", p.nome ?? "tudo bem").replace("{{2}}", modelo);
      await db.insert(M).values({ conversaId: p.conversaId, direcao: "outgoing", autor: "ia", tipo: "texto", conteudo: corpo, status: "sent", externoId: r.externoId ?? null, metadados: { modelo: MODELO_AVISO_CHEGADA.nome, textoDoSistema: true } });
    }
  }
  if (ok) await db.update(schema.interessesModelo).set({ mensagemEm: new Date() }).where(eq(schema.interessesModelo.id, p.interesseId));
  await mensagemSistema(db, p.conversaId, ok ? `Fila de espera: o cliente foi avisado que a ${modelo} chegou (${como}).` : `Fila de espera: o aviso da ${modelo} ${como}. Avise o cliente por aqui.`);
  return ok;
}

/** Garante o modelo aviso_chegada na Meta (para avisar quem pediu há mais de 24 h). Já existe: devolve a situação. */
export async function garantirModeloAvisoChegada() {
  const { graph } = await import("@/lib/avisos/whatsapp-equipe");
  const j = (await graph(`/message_templates?name=${MODELO_AVISO_CHEGADA.nome}&fields=name,status,language`)) as { data?: { name: string; status: string; language: string }[] };
  const t = (j.data ?? []).find((x) => x.name === MODELO_AVISO_CHEGADA.nome && x.language === MODELO_AVISO_CHEGADA.idioma);
  if (t) return { status: t.status };
  const r = (await graph("/message_templates", { method: "POST", body: JSON.stringify(MODELO_AVISO_CHEGADA.definicao) })) as { status?: string };
  return { status: r.status ?? "PENDING" };
}
