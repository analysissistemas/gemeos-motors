import "server-only";
import { and, desc, eq, inArray, lte, sql } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/lib/db";
import { mensagemSistema } from "@/lib/mensageria/anotacoes";
import { gerarObjeto, transcrever } from "@/lib/ia/cliente";
import { lerControle } from "@/lib/ia/controle";
import { enviarRespostaDaIa } from "@/lib/ia/envio";
import { lerHorario } from "@/lib/ia/prompt";
import { lojaAberta } from "@/lib/ia/horario";
import { limparEmojis } from "@/lib/ia/validador";
import {
  comDesculpaDoHorario,
  decidirAquecimento,
  ETAPAS_AQUECIMENTO,
  instrucaoAquecimento,
  mensagemPadraoAquecimento,
  ROTULO_PULAR,
  textoDeAquecimentoAceito,
} from "@/lib/ia/aquecimento";
import { lerConfigWorkflow } from "./config";

/* ============================================================
   FOLLOW-UP DE AQUECIMENTO (07/10/2026) — regras e textos em lib/ia/aquecimento.ts
   1. Depois de cada resposta da IA, `agendarAquecimento` cancela as tentativas que ainda não saíram (o cliente
      falou) e agenda 3 novas em Follow-ups (10 min, 1 h, 23 h 53 min), visíveis e canceláveis pela equipe.
   2. O vigia (a cada minuto) chama `enviarAquecimentos`: na hora, confere de novo (respondeu? vendedor assumiu?
      janela de 24 h?), a IA escreve a mensagem pela conversa e ela sai pelo único caminho autorizado
      (enviarRespostaDaIa: chave geral, permissão de envio, validador). Texto da IA que não passa vira mensagem pronta.
   ============================================================ */
const F = schema.followUps;
const M = schema.mensagens;
const C = schema.conversas;
/** Tarefas em que a LOJA deve a resposta ao cliente: enquanto pendentes, nada de "ainda está por aí?". */
const TAREFAS_DA_LOJA = ["simulacao", "entrega", "revisar_ia"];

export async function agendarAquecimento(p: {
  conversaId: number;
  clienteId: number | null;
  negocioId: number | null;
  usuarioId: number | null;
  /** cliente que a IA está atendendo (não recado, assistência, equipe nem vendedor) */
  qualifica: boolean;
  nome: string | null;
  modelo: string | null;
}) {
  const agora = new Date();
  /* o cliente falou de novo: o que estava agendado e não saiu fica sem efeito */
  await db
    .update(F)
    .set({ status: "cancelado", concluidoEm: agora })
    .where(and(eq(F.conversaId, p.conversaId), eq(F.status, "pendente"), sql`(${F.contexto}->>'aquecimento' = 'true' or ${F.contexto}->>'semResposta' = 'true')`));
  if (!p.qualifica || !(await lerConfigWorkflow()).followUpAquecimento) return null;
  const [ultima] = await db
    .select({ id: M.id, em: M.criadoEm })
    .from(M)
    .where(and(eq(M.conversaId, p.conversaId), eq(M.direcao, "incoming")))
    .orderBy(desc(M.id))
    .limit(1);
  if (!ultima) return null;
  const base = new Date(ultima.em).getTime();
  await db.insert(F).values(
    ETAPAS_AQUECIMENTO.map((e) => ({
      conversaId: p.conversaId,
      clienteId: p.clienteId,
      negocioId: p.negocioId,
      usuarioId: p.usuarioId,
      agendadoPara: new Date(base + e.minutos * 60_000),
      notas: `Aquecimento ${e.etapa}/3 (${e.rotulo} sem resposta): a IA chama ${p.nome ?? "o cliente"} de novo${p.modelo ? ` sobre a ${p.modelo}` : ""}. Cancele se não quiser que saia.`,
      tipo: "aquecimento",
      motivo: `Cliente sem responder (${e.rotulo})`,
      origem: "ia",
      contexto: { aquecimento: true, etapa: e.etapa, mensagemId: ultima.id, nome: p.nome, modelo: p.modelo, detectadoPor: "ia" },
    })),
  );
  return { agendados: ETAPAS_AQUECIMENTO.length };
}

const SAIDA = z.object({ mensagem: z.string() });

async function escreverMensagem(conversaId: number, etapa: number, nome: string | null, modelo: string | null) {
  const msgs = (await db.select().from(M).where(and(eq(M.conversaId, conversaId), sql`${M.autor} <> 'sistema'`)).orderBy(desc(M.id)).limit(14)).reverse();
  try {
    const r = await gerarObjeto({ schema: SAIDA, sistema: instrucaoAquecimento({ etapa, nome, modelo }), prompt: `<conversa>\n${transcrever(msgs)}\n</conversa>`, maxTokens: 300 });
    const texto = limparEmojis(r.mensagem.trim().replace(/^["“]|["”]$/g, ""));
    if (textoDeAquecimentoAceito(texto)) return { texto, daIa: true };
  } catch {
    /* sem IA agora: vai a mensagem pronta */
  }
  return { texto: mensagemPadraoAquecimento({ etapa, nome, modelo }), daIa: false };
}

export async function enviarAquecimentos(agora = new Date()) {
  const r = { enviados: 0, pulados: 0, erros: 0 };
  const vencidos = await db
    .select({ id: F.id, conversaId: F.conversaId, contexto: F.contexto, notas: F.notas })
    .from(F)
    .where(and(eq(F.status, "pendente"), eq(F.tipo, "aquecimento"), lte(F.agendadoPara, agora)))
    .orderBy(F.agendadoPara)
    .limit(20);
  if (!vencidos.length) return r;
  const [controle, config, horario] = await Promise.all([lerControle(), lerConfigWorkflow(), lerHorario()]);
  const aberta = lojaAberta(horario, agora);
  for (const f of vencidos) {
    try {
      /* pega o follow-up para si (dois vigias ao mesmo tempo nunca mandam o mesmo) */
      const [meu] = await db.update(F).set({ status: "concluido", concluidoEm: agora }).where(and(eq(F.id, f.id), eq(F.status, "pendente"))).returning({ id: F.id });
      if (!meu || !f.conversaId) continue;
      const ctx = (f.contexto ?? {}) as { etapa?: number; mensagemId?: number; nome?: string | null; modelo?: string | null };
      const etapa = ctx.etapa ?? 1;
      const [cv] = await db.select({ telefone: C.contatoTelefone, demo: C.demo, modo: C.modo, status: C.status }).from(C).where(eq(C.id, f.conversaId)).limit(1);
      const [ultima] = await db.select({ id: M.id, em: M.criadoEm }).from(M).where(and(eq(M.conversaId, f.conversaId), eq(M.direcao, "incoming"))).orderBy(desc(M.id)).limit(1);
      const [pendente] = await db
        .select({ id: F.id })
        .from(F)
        .where(and(eq(F.conversaId, f.conversaId), eq(F.status, "pendente"), inArray(F.tipo, TAREFAS_DA_LOJA)))
        .limit(1);
      const motivo = !cv || !ultima
        ? "conversa_encerrada"
        : decidirAquecimento({
            iaPodeEnviar: controle.ligada && controle.permissoes.enviarMensagem && config.ativo && config.followUpAquecimento,
            modo: cv.modo,
            status: cv.status,
            clienteFalouDepois: !!ctx.mensagemId && ultima.id > ctx.mensagemId,
            minDesdeCliente: Math.floor((agora.getTime() - new Date(ultima.em).getTime()) / 60_000),
            lojaDeveResposta: !!pendente,
          });
      if (motivo) {
        await db.update(F).set({ status: "cancelado", notas: `${f.notas ?? ""} Não enviado: ${ROTULO_PULAR[motivo]}.`.slice(0, 1000) }).where(eq(F.id, f.id));
        r.pulados++;
        continue;
      }
      const { texto, daIa } = await escreverMensagem(f.conversaId, etapa, ctx.nome ?? null, ctx.modelo ?? null);
      const enviar = (t: string) => enviarRespostaDaIa(db, { conversaId: f.conversaId!, telefone: cv!.telefone, texto: comDesculpaDoHorario(t, ctx.nome ?? null, aberta), origem: `follow-up de aquecimento ${etapa}/3`, simulado: cv!.demo });
      let env = await enviar(texto);
      let final = texto;
      /* o validador barrou o texto da IA: vai a mensagem pronta */
      if (!env.enviada && env.motivo === "validador" && daIa) {
        final = mensagemPadraoAquecimento({ etapa, nome: ctx.nome ?? null, modelo: ctx.modelo ?? null });
        env = await enviar(final);
      }
      if (env.enviada) {
        await db.update(F).set({ notas: `Aquecimento ${etapa}/3 enviado pela IA: "${final}"`.slice(0, 1000) }).where(eq(F.id, f.id));
        await mensagemSistema(db, f.conversaId, `Follow-up de aquecimento ${etapa}/3 enviado pela IA (o cliente estava sem responder).${etapa === 3 ? " Foi a última tentativa automática." : ""}`, { aquecimento: true, etapa });
        r.enviados++;
      } else {
        /* vira tarefa comum para a equipe (o vigia não tenta de novo em loop) */
        await db.update(F).set({ status: "pendente", tipo: "retorno_cliente", concluidoEm: null, notas: `${f.notas ?? ""} Não saiu (${env.explicacao ?? env.motivo}): a equipe chama o cliente.`.slice(0, 1000) }).where(eq(F.id, f.id));
        r.erros++;
      }
    } catch (e) {
      r.erros++;
      console.error("[aquecimento]", f.id, e);
    }
  }
  return r;
}
