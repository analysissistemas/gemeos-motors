import "server-only";
import { and, desc, eq, gt, inArray, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { analisarMidia } from "@/lib/ia/cliente";
import { lerBytes } from "@/lib/mensageria/midia";
import { agendarAquecimento } from "./aquecimento";
import { nomeDoPerfil, primeiroNome, type FatosLead } from "./util";

/* O vendedor respondeu e devolveu a conversa para a IA (Milton, 19/10/2026: "se eu tô no atendimento humano e respondo o
   cliente, pós minha resposta eu jogo pra IA, a IA vai responder o cliente ou vai aguardar mensagem para continuar ou até
   mesmo fazer follow-up?"). A última mensagem é do vendedor: a IA não fala nada agora e espera o cliente. Para continuar de
   onde ele parou:
   1. o áudio do vendedor é transcrito (a IA "ouve" o que foi combinado e não contradiz);
   2. o follow-up de aquecimento (1 h, 3 h e 23 h) passa a contar da mensagem do vendedor, como contaria da resposta da IA. */
const M = schema.mensagens;

export async function depoisDeDevolverParaIa(conversaId: number) {
  const desde = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const audios = await db
    .select({ id: M.id, midiaUrl: M.midiaUrl, midiaMime: M.midiaMime })
    .from(M)
    .where(and(eq(M.conversaId, conversaId), eq(M.direcao, "outgoing"), eq(M.autor, "usuario"), eq(M.tipo, "audio"), gt(M.criadoEm, desde), sql`(${M.metadados}->>'transcricao') is null`))
    .orderBy(desc(M.id))
    .limit(3);
  let transcritos = 0;
  for (const a of audios) {
    try {
      const arq = a.midiaUrl ? await lerBytes(a.midiaUrl) : null;
      if (!arq) continue;
      const texto = await analisarMidia("audio", arq.bytes, a.midiaMime ?? arq.mime);
      if (!texto) continue;
      await db.update(M).set({ metadados: sql`coalesce(${M.metadados}, '{}'::jsonb) || ${JSON.stringify({ transcricao: texto })}::jsonb`, alteradaEm: new Date() }).where(eq(M.id, a.id));
      transcritos++;
    } catch (e) {
      console.error("[devolver] transcrição do áudio do vendedor", e);
    }
  }

  const [ultima] = await db
    .select({ id: M.id, direcao: M.direcao, autor: M.autor, em: M.criadoEm })
    .from(M)
    .where(and(eq(M.conversaId, conversaId), inArray(M.direcao, ["incoming", "outgoing"])))
    .orderBy(desc(M.id))
    .limit(1);
  if (!ultima || ultima.direcao !== "outgoing" || ultima.autor !== "usuario") return { transcritos, followUps: 0 };
  const [cv] = await db
    .select({ clienteId: schema.conversas.clienteId, negocioId: schema.conversas.negocioId, contatoNome: schema.conversas.contatoNome, modo: schema.conversas.modo, fatos: schema.iaMemorias.fatos })
    .from(schema.conversas)
    .leftJoin(schema.iaMemorias, eq(schema.iaMemorias.conversaId, schema.conversas.id))
    .where(eq(schema.conversas.id, conversaId))
    .limit(1);
  if (!cv || cv.modo !== "ia") return { transcritos, followUps: 0 };
  const fatos = (cv.fatos ?? {}) as FatosLead;
  const r = await agendarAquecimento({
    conversaId,
    clienteId: cv.clienteId,
    negocioId: cv.negocioId,
    usuarioId: null,
    qualifica: true,
    nome: primeiroNome(fatos.nome) ?? primeiroNome(nomeDoPerfil(cv.contatoNome)),
    modelo: null,
    desde: new Date(ultima.em),
  });
  return { transcritos, followUps: r?.agendados ?? 0 };
}

/** Mensagem do vendedor depois desta do cliente: a IA não responde por cima (a resposta dele já foi). */
export async function vendedorRespondeuDepois(conversaId: number, mensagemId: number) {
  const [m] = await db
    .select({ id: M.id })
    .from(M)
    .where(and(eq(M.conversaId, conversaId), eq(M.direcao, "outgoing"), eq(M.autor, "usuario"), gt(M.id, mensagemId)))
    .limit(1);
  return !!m;
}
