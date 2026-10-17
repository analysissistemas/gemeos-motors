import "server-only";
import { and, desc, eq, gt, inArray, lte, or, sql } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/lib/db";
import { mensagemSistema } from "@/lib/mensageria/anotacoes";
import { gerarObjeto, transcrever } from "@/lib/ia/cliente";
import { lerControle } from "@/lib/ia/controle";
import { enviarRespostaDaIa } from "@/lib/ia/envio";
import { carregarMotosACombustao, lerHorario } from "@/lib/ia/prompt";
import { lojaAberta } from "@/lib/ia/horario";
import { limparEmojis } from "@/lib/ia/validador";
import {
  aquecimentoFixo,
  clienteVaiRetornar,
  decidirAquecimento,
  instrucaoAquecimento,
  INTERVALO_MIN_AQUECIMENTO,
  LIMITE_JANELA_MIN,
  lojaFicouDeVer,
  planejarAquecimento,
  proximaAbertura,
  mensagemPadraoAquecimento,
  ROTULO_PULAR,
  textoDeAquecimentoAceito,
} from "@/lib/ia/aquecimento";
import { lerConfigWorkflow } from "./config";

/* ============================================================
   FOLLOW-UP DE AQUECIMENTO (07/10/2026) — regras e textos em lib/ia/aquecimento.ts
   1. Depois de cada resposta da IA, `agendarAquecimento` cancela as tentativas que ainda não saíram (o cliente
      falou) e agenda até 3 novas em Follow-ups (1 h, 3 h e 23 h, só com a loja aberta: planejarAquecimento), visíveis e
      canceláveis pela equipe. O cliente disse que ele volta a falar ("vou mostrar a ele"): só a de 23 h. Se a IA ficou de ver algo com a equipe, em vez disso vira tarefa "responder o cliente".
   2. O vigia (a cada minuto) chama `enviarAquecimentos`: na hora, confere de novo (respondeu? vendedor assumiu?
      janela de 24 h?), a IA escreve a mensagem pela conversa e ela sai pelo único caminho autorizado
      (enviarRespostaDaIa: chave geral, permissão de envio, validador). Texto da IA que não passa vira mensagem pronta.
   ============================================================ */
const F = schema.followUps;
const M = schema.mensagens;
const C = schema.conversas;
/** Tarefas em que a LOJA deve a resposta ao cliente: enquanto pendentes, nada de "ainda está por aí?". */
const TAREFAS_DA_LOJA = ["simulacao", "entrega", "revisar_ia"];
/** Tarefa pendente em que a loja deve a resposta (as acima, ou a pergunta que a IA não soube responder). */
const lojaDeve = (conversaId: number) => and(eq(F.conversaId, conversaId), eq(F.status, "pendente"), or(inArray(F.tipo, TAREFAS_DA_LOJA), sql`${F.contexto}->>'iaFicouDeVer' = 'true'`));

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
    .select({ id: M.id, em: M.criadoEm, conteudo: M.conteudo })
    .from(M)
    .where(and(eq(M.conversaId, p.conversaId), eq(M.direcao, "incoming")))
    .orderBy(desc(M.id))
    .limit(1);
  if (!ultima) return null;
  /* a loja ficou de ver algo (Heverton, 11/10/2026: "Quer que eu veja com eles?"): tarefa para a equipe, sem aquecimento */
  const resposta = await db.select({ conteudo: M.conteudo }).from(M).where(and(eq(M.conversaId, p.conversaId), eq(M.direcao, "outgoing"), gt(M.id, ultima.id)));
  if (lojaFicouDeVer(resposta.map((r) => r.conteudo ?? "").join("\n"))) {
    const [pendente] = await db.select({ id: F.id }).from(F).where(lojaDeve(p.conversaId)).limit(1);
    if (pendente) return { agendados: 0 };
    const pergunta = (ultima.conteudo ?? "").replace(/\s+/g, " ").trim().slice(0, 200);
    await db.insert(F).values({
      conversaId: p.conversaId,
      clienteId: p.clienteId,
      negocioId: p.negocioId,
      usuarioId: p.usuarioId,
      agendadoPara: new Date(),
      notas: `${p.nome ?? "O cliente"} perguntou: "${pergunta}". A IA não tinha a resposta e disse que a equipe confirma. Responda na conversa.`,
      tipo: "retorno_cliente",
      motivo: "Responder o que a IA não soube",
      origem: "ia",
      contexto: { detectadoPor: "ia", iaFicouDeVer: true, modelo: p.modelo },
    });
    await mensagemSistema(db, p.conversaId, `RESPONDER O CLIENTE: ele perguntou "${pergunta}" e a IA não tinha a resposta. O follow-up automático fica parado até a equipe responder.`, { triagem: true });
    return { agendados: 0 };
  }
  /* "vou mostrar a ele", "te aviso", "vou pensar": só a última tentativa ((81) 7301-7155, 11/10/2026) */
  const plano = planejarAquecimento(new Date(ultima.em), await lerHorario(), { soUltima: clienteVaiRetornar(ultima.conteudo ?? "") });
  if (!plano.length) return { agendados: 0 };
  await db.insert(F).values(
    plano.map((e) => ({
      conversaId: p.conversaId,
      clienteId: p.clienteId,
      negocioId: p.negocioId,
      usuarioId: p.usuarioId,
      agendadoPara: e.quando,
      notas: `Aquecimento ${e.etapa}/3 (${e.rotulo} sem resposta): a IA chama ${p.nome ?? "o cliente"} de novo${p.modelo ? ` sobre a ${p.modelo}` : ""}. Cancele se não quiser que saia.`,
      tipo: "aquecimento",
      motivo: `Cliente sem responder (${e.rotulo})`,
      origem: "ia",
      contexto: { aquecimento: true, etapa: e.etapa, mensagemId: ultima.id, nome: p.nome, modelo: p.modelo, detectadoPor: "ia" },
    })),
  );
  return { agendados: plano.length };
}

const SAIDA = z.object({ mensagem: z.string() });

async function escreverMensagem(conversaId: number, etapa: number, nome: string | null, modelo: string | null) {
  /* 1ª tentativa com moto: a pergunta do dono, como está (Milton, 12/10/2026) */
  if (aquecimentoFixo(etapa, modelo)) return { texto: mensagemPadraoAquecimento({ etapa, nome, modelo }), daIa: false };
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
  await carregarMotosACombustao().catch(() => null);
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
        .where(lojaDeve(f.conversaId))
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
      /* só com a loja aberta e com 50 min desde a tentativa anterior (Heverton, 12/10/2026); passou da janela, não sai */
      const [anterior] = await db
        .select({ em: F.concluidoEm })
        .from(F)
        .where(and(eq(F.conversaId, f.conversaId), eq(F.tipo, "aquecimento"), eq(F.status, "concluido"), sql`${F.id} <> ${f.id}`, sql`${F.notas} like 'Aquecimento % enviado pela IA%'`))
        .orderBy(desc(F.concluidoEm))
        .limit(1);
      const minimo = anterior?.em ? new Date(new Date(anterior.em).getTime() + INTERVALO_MIN_AQUECIMENTO * 60_000) : agora;
      if (!aberta || minimo > agora) {
        const quando = proximaAbertura(minimo > agora ? minimo : agora, horario);
        const limite = new Date(new Date(ultima!.em).getTime() + LIMITE_JANELA_MIN * 60_000);
        if (quando && quando <= limite) await db.update(F).set({ status: "pendente", concluidoEm: null, agendadoPara: quando }).where(eq(F.id, f.id));
        else {
          await db.update(F).set({ status: "cancelado", notas: `${f.notas ?? ""} Não enviado: a loja estava fechada e a próxima abertura passa da janela de 24 h do WhatsApp.`.slice(0, 1000) }).where(eq(F.id, f.id));
          r.pulados++;
        }
        continue;
      }
      const { texto, daIa } = await escreverMensagem(f.conversaId, etapa, ctx.nome ?? null, ctx.modelo ?? null);
      const enviar = (t: string) => enviarRespostaDaIa(db, { conversaId: f.conversaId!, telefone: cv!.telefone, texto: t, origem: `follow-up de aquecimento ${etapa}/3`, simulado: cv!.demo });
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

/* Lembrete da retirada na loja (dono, 15/10/2026: "fazer o follow-up no dia e na hora certa, lembrando"). Agendado
   quando o cliente manda os dados com o dia e a hora (nos.ts → agendarRetirada). Sai mesmo com a conversa em Humano: é
   o aviso combinado com o cliente, não uma resposta da IA, e a equipe pode cancelar em Follow-ups. Não saiu (IA
   desligada, validador, WhatsApp): vira tarefa para a equipe lembrar o cliente. */
export async function enviarLembretesRetirada(agora = new Date()) {
  const r = { enviados: 0, erros: 0 };
  const vencidos = await db
    .select({ id: F.id, conversaId: F.conversaId, contexto: F.contexto, notas: F.notas })
    .from(F)
    .where(and(eq(F.status, "pendente"), inArray(F.tipo, ["lembrete_retirada", "lembrete_visita"]), lte(F.agendadoPara, agora)))
    .limit(20);
  for (const f of vencidos) {
    const [meu] = await db.update(F).set({ status: "concluido", concluidoEm: agora }).where(and(eq(F.id, f.id), eq(F.status, "pendente"))).returning({ id: F.id });
    if (!meu || !f.conversaId) continue;
    try {
      const ctx = (f.contexto ?? {}) as { texto?: string; testDriveId?: number; quando?: string; doQue?: string };
      /* test drive cancelado, realizado ou remarcado depois de agendar o lembrete: não sai (o remarcado tem o dele) */
      if (ctx.testDriveId) {
        const [td] = await db.select({ status: schema.testDrives.status, agendadoPara: schema.testDrives.agendadoPara }).from(schema.testDrives).where(eq(schema.testDrives.id, ctx.testDriveId)).limit(1);
        if (!td || !["agendado", "confirmado"].includes(td.status) || (ctx.quando && new Date(td.agendadoPara).getTime() !== new Date(ctx.quando).getTime())) {
          await db.update(F).set({ status: "cancelado", notas: `${f.notas ?? ""} Não enviado: o test drive mudou ou foi cancelado.`.slice(0, 1000) }).where(eq(F.id, f.id));
          continue;
        }
      }
      const doQue = ctx.doQue ?? (ctx.testDriveId ? "do test drive" : "da retirada");
      const [cv] = await db.select({ telefone: C.contatoTelefone, demo: C.demo, status: C.status }).from(C).where(eq(C.id, f.conversaId)).limit(1);
      if (!cv || cv.status === "encerrada" || !ctx.texto) {
        await db.update(F).set({ status: "cancelado", notas: `${f.notas ?? ""} Não enviado: conversa encerrada.`.slice(0, 1000) }).where(eq(F.id, f.id));
        continue;
      }
      const env = await enviarRespostaDaIa(db, { conversaId: f.conversaId, telefone: cv.telefone, texto: ctx.texto, origem: `lembrete ${doQue}`, simulado: cv.demo });
      if (env.enviada) {
        await db.update(F).set({ notas: `Lembrete ${doQue} enviado pela IA: "${ctx.texto}"`.slice(0, 1000) }).where(eq(F.id, f.id));
        await mensagemSistema(db, f.conversaId, `Lembrete ${doQue} enviado ao cliente.`, { triagem: true });
        r.enviados++;
      } else {
        void import("@/lib/avisos/gatilhos").then((g) => g.avisarLembreteNaoSaiu(f.conversaId!, doQue)).catch(() => null);
        await db.update(F).set({ status: "pendente", tipo: "retorno_cliente", concluidoEm: null, notas: `O lembrete automático ${doQue} não saiu (${env.explicacao ?? env.motivo}). Lembre o cliente: "${ctx.texto}"`.slice(0, 1000) }).where(eq(F.id, f.id));
        r.erros++;
      }
    } catch (e) {
      r.erros++;
      console.error("[lembrete retirada]", f.id, e);
    }
  }
  return r;
}
