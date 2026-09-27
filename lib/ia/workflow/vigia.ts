import "server-only";
import { and, asc, desc, eq, gt, lt, notInArray, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { mensagemSistema } from "@/lib/mensageria/anotacoes";
import { lerControle } from "@/lib/ia/controle";
import { enviarRespostaDaIa } from "@/lib/ia/envio";
import { lerHorario } from "@/lib/ia/prompt";
import { lojaAberta } from "@/lib/ia/horario";
import { lerConfigWorkflow } from "./config";
import { rodarWorkflowAtendimento } from "./executar";
import { decidirNovaTentativa, decidirVigia, MAX_TENTATIVAS } from "./vigia-regra";

/* ============================================================
   VIGIA DO ATENDENTE — roda a cada minuto (instrumentation.ts → /api/interno/vigia)
   Conversa com vendedor (modo HUMANO) em que o cliente está esperando:
   - loja aberta, espera ≥ avisoAtendenteMin: aviso no chat + prioridade alta (uma vez por espera);
   - loja aberta, espera ≥ iaAssumeMin: a IA assume (modo IA) e responde;
   - loja fechada: a IA responde (uma vez por mensagem), a conversa continua com o vendedor.
   Marcas nas mensagens de sistema (metadados) evitam repetir; nada de coluna nova.
   ============================================================ */
const M = schema.mensagens;
const C = schema.conversas;

async function temMarca(conversaId: number, marca: "esperaAviso" | "vigiaFechada", mensagemId: number) {
  const [x] = await db
    .select({ id: M.id })
    .from(M)
    .where(and(eq(M.conversaId, conversaId), eq(M.direcao, "system"), sql`${M.metadados}->>${marca} = 'true'`, sql`(${M.metadados}->>'mensagemId')::bigint = ${mensagemId}`))
    .limit(1);
  return !!x;
}

/* Resposta interrompida no meio (o servidor reiniciou numa implantação enquanto os blocos saíam):
   a execução ficou "rodando" para sempre e o cliente recebeu só o começo ("tenho duas opções:" sem a lista).
   Execução que começou ANTES deste servidor ligar e está parada há mais de 1 min morreu com o servidor
   antigo: marca como interrompida e manda os blocos que faltavam (a resposta já tinha passado pelas travas;
   o envio confere de novo). */
const E = schema.iaWorkflowExecucoes;
const LIGOU_EM = Date.now() - process.uptime() * 1000;

async function retomarInterrompidas(agora: Date) {
  const presas = await db
    .select({ id: E.id, conversaId: E.conversaId, passos: E.passos, noAtual: E.noAtual, iniciadoEm: E.iniciadoEm })
    .from(E)
    .where(and(eq(E.status, "rodando"), lt(E.iniciadoEm, new Date(LIGOU_EM)), gt(E.iniciadoEm, new Date(agora.getTime() - 6 * 3600_000))))
    .limit(20);
  let retomadas = 0;
  for (const x of presas) {
    const passos = (x.passos ?? []) as { no: string; saida?: unknown; inicio: string; ms: number }[];
    const ultimoMovimento = Math.max(new Date(x.iniciadoEm).getTime(), ...passos.map((p) => new Date(p.inicio).getTime() + (p.ms ?? 0)));
    if (agora.getTime() - ultimoMovimento < 60_000) continue;
    const blocos = ([...passos].reverse().find((p) => p.no === "blocos")?.saida as { blocos?: string[] } | undefined)?.blocos ?? [];
    const enviados = passos.filter((p) => p.no === "enviar" && (p.saida as { enviada?: boolean } | undefined)?.enviada).length;
    const faltam = blocos.slice(enviados);
    const [marcada] = await db
      .update(E)
      .set({
        status: "erro",
        noAtual: null,
        paradoEm: x.noAtual ?? "desconhecido",
        motivo: faltam.length ? `Interrompida (o servidor reiniciou); o vigia enviou ${faltam.length} bloco(s) que faltavam` : "Interrompida (o servidor reiniciou)",
        finalizadoEm: agora,
      })
      .where(and(eq(E.id, x.id), eq(E.status, "rodando")))
      .returning({ id: E.id });
    if (!marcada || !faltam.length || !x.conversaId || !enviados) continue;
    /* uma execução mais nova na mesma conversa já respondeu tudo junto: não repete */
    const [nova] = await db.select({ id: E.id }).from(E).where(and(eq(E.conversaId, x.conversaId), gt(E.id, x.id))).limit(1);
    if (nova) continue;
    const [cv] = await db.select({ telefone: C.contatoTelefone, demo: C.demo }).from(C).where(eq(C.id, x.conversaId)).limit(1);
    if (!cv) continue;
    for (const texto of faltam) {
      const r = await enviarRespostaDaIa(db, { conversaId: x.conversaId, telefone: cv.telefone, texto, origem: "workflow (retomada pelo vigia)", simulado: cv.demo });
      if (!r.enviada) break;
      await new Promise((ok) => setTimeout(ok, 1500));
    }
    retomadas++;
  }
  return retomadas;
}

export async function vigiarAtendimentos(agora = new Date()) {
  const retomadas = await retomarInterrompidas(agora).catch((e) => {
    console.error("[vigia] retomar interrompidas", e);
    return 0;
  });
  const [config, controle, horario] = await Promise.all([lerConfigWorkflow(), lerControle(), lerHorario()]);
  const aberta = lojaAberta(horario, agora);
  const iaPodeResponder = controle.ligada && config.ativo;
  const candidatas = await db
    .select({ id: C.id, demo: C.demo, modo: C.modo })
    .from(C)
    .where(and(eq(C.ultimaMensagemDirecao, "incoming"), notInArray(C.status, ["resolvida", "encerrada"])))
    .limit(200);

  const resultado = { vistas: candidatas.length, avisadas: 0, assumidas: 0, respondidasFechada: 0, novasTentativas: 0, retomadas, erros: 0 };
  for (const cv of candidatas) {
    try {
      const [ultimaSaida] = await db.select({ id: M.id }).from(M).where(and(eq(M.conversaId, cv.id), eq(M.direcao, "outgoing"))).orderBy(desc(M.id)).limit(1);
      const depois = and(eq(M.conversaId, cv.id), eq(M.direcao, "incoming"), ultimaSaida ? gt(M.id, ultimaSaida.id) : undefined);
      const [primeira] = await db.select({ id: M.id, em: M.criadoEm }).from(M).where(depois).orderBy(asc(M.id)).limit(1);
      const [ultima] = await db.select({ id: M.id, em: M.criadoEm }).from(M).where(depois).orderBy(desc(M.id)).limit(1);
      if (!primeira || !ultima) continue;
      const esperaMin = Math.floor((agora.getTime() - new Date(primeira.em).getTime()) / 60_000);
      const esperaUltimaMin = Math.floor((agora.getTime() - new Date(ultima.em).getTime()) / 60_000);

      /* a IA devia ter respondido e nada saiu (servidor reiniciou no meio, falha da OpenAI...): tenta de novo.
         Só mensagem recente (até 6 h), para não responder conversa antiga esquecida. */
      const iaDeveResponder = cv.modo !== "humano" || !aberta;
      if (iaDeveResponder && esperaUltimaMin <= 360) {
        const [t] = await db
          .select({ n: sql<number>`count(*)::int`, ultimaEm: sql<Date | null>`max(${M.criadoEm})` })
          .from(M)
          .where(
            and(
              eq(M.conversaId, cv.id),
              eq(M.direcao, "system"),
              sql`(${M.metadados}->>'mensagemId')::bigint = ${ultima.id}`,
              sql`(${M.metadados}->>'vigiaTentativa' = 'true' or ${M.metadados}->>'vigiaFechada' = 'true' or ${M.metadados}->>'vigiaAssumiu' = 'true')`,
            ),
          );
        const tentativas = t?.n ?? 0;
        const minDesdeTentativa = t?.ultimaEm ? Math.floor((agora.getTime() - new Date(t.ultimaEm).getTime()) / 60_000) : null;
        /* 1ª vez de conversa com vendedor e loja fechada: segue a regra de sempre (aviso "Loja fechada") */
        if (tentativas > 0 || cv.modo !== "humano") {
          if (decidirNovaTentativa({ iaPodeResponder, esperaMin: esperaUltimaMin, tentativas, minDesdeTentativa })) {
            await mensagemSistema(db, cv.id, `O cliente ficou sem resposta: a IA respondeu de novo (tentativa ${tentativas + 1} de ${MAX_TENTATIVAS}).`, { vigiaTentativa: true, mensagemId: ultima.id });
            void rodarWorkflowAtendimento({ conversaId: cv.id, mensagemId: ultima.id, gatilho: "whatsapp", simulado: cv.demo }).catch(() => {});
            resultado.novasTentativas++;
          }
          continue;
        }
      }
      if (cv.modo !== "humano") continue;

      const decisao = decidirVigia({
        esperaMin,
        lojaAberta: aberta,
        iaPodeResponder,
        avisoMin: config.avisoAtendenteMin,
        assumeMin: config.iaAssumeMin,
        jaAvisado: aberta ? await temMarca(cv.id, "esperaAviso", primeira.id) : true,
        jaRespondidaFechada: aberta ? true : await temMarca(cv.id, "vigiaFechada", ultima.id),
      });

      if (decisao === "avisar") {
        const resto = iaPodeResponder && config.iaAssumeMin > 0 ? ` Responda ou a IA assume em ${Math.max(1, config.iaAssumeMin - esperaMin)} min.` : " Responda assim que puder.";
        await mensagemSistema(db, cv.id, `Cliente esperando resposta há ${esperaMin} min.${resto}`, { esperaAviso: true, mensagemId: primeira.id });
        await db.update(C).set({ prioridade: "alta", atualizadoEm: new Date() }).where(eq(C.id, cv.id));
        resultado.avisadas++;
      } else if (decisao === "assumir") {
        await db.update(C).set({ modo: "ia", prioridade: "alta", atualizadoEm: new Date() }).where(eq(C.id, cv.id));
        await mensagemSistema(db, cv.id, `A IA assumiu: o cliente esperava há ${esperaMin} min sem resposta. O vendedor pode reassumir quando quiser.`, { vigiaAssumiu: true, mensagemId: ultima.id });
        /* não espera: o workflow tem buffer e "digitando"; ele mesmo registra erro na execução */
        void rodarWorkflowAtendimento({ conversaId: cv.id, mensagemId: ultima.id, gatilho: "whatsapp", simulado: cv.demo }).catch(() => {});
        resultado.assumidas++;
      } else if (decisao === "responder_fechada") {
        await mensagemSistema(db, cv.id, "Loja fechada e cliente sem resposta: a IA responde até a loja abrir. A conversa continua com o vendedor.", { vigiaFechada: true, mensagemId: ultima.id });
        await db.update(C).set({ atualizadoEm: new Date() }).where(eq(C.id, cv.id));
        void rodarWorkflowAtendimento({ conversaId: cv.id, mensagemId: ultima.id, gatilho: "whatsapp", simulado: cv.demo }).catch(() => {});
        resultado.respondidasFechada++;
      }
    } catch (e) {
      resultado.erros++;
      console.error("[vigia] conversa", cv.id, e);
    }
  }
  return resultado;
}
