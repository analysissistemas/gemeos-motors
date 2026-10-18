import "server-only";
import { and, asc, eq, gt, inArray, lte, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/lib/db";
import { receberMensagem } from "@/lib/mensageria/servico";
import { rodarWorkflowAtendimento, workflowAtivo } from "./workflow/executar";
import { gerarObjeto } from "./cliente";
import { textoDaMensagem } from "./workflow/util";
import { anonimizar } from "./analista-regras";
import { acaoDeCodigo, ehTextoDoSistema } from "./texto-do-sistema";
import type { EvidenciaChamado, PropostaChamado } from "./chamados-regras";

/* ============================================================
   SONIX TREINA A CORREÇÃO NO SIMULADOR (dono, 18/10/2026: "quando eu clicar em aprovar ele já consiga treinar no
   simulador aquele mesmo cenário que aconteceu de erro da IA"; "fazer as melhorias no próprio sistema e depois
   trazer um relatório garantindo por que foi resolvido").

   Depois que o dono aprova um chamado que muda a IA (regra ou resposta da base), a Sonix:
   1. remonta o cenário da prova: as mensagens do cliente até a resposta ruim, na mesma ordem e nos mesmos turnos;
   2. roda essa conversa de novo no Simulador (conversa de demonstração: nada sai para o WhatsApp), com a IA já
      corrigida, pelo mesmo caminho do atendimento de verdade;
   3. compara a resposta antiga com a nova e diz se resolveu e por quê, citando o trecho;
   4. não resolveu: propõe um ajuste num chamado novo, para o dono aprovar (nada muda sem aprovação).
   O relatório fica no chamado (resultado.treino) e aparece em Melhorias → Histórico.
   ============================================================ */

const C = schema.chamadosMelhoria;
const M = schema.mensagens;
const MAX_CENARIOS = 2;
const MAX_TURNOS = 4;

export type CenarioTreino = { conversaTesteId: number | null; cliente: string; antes: string; depois: string; resolvido: boolean | null; porque: string; doSistema?: boolean };
export type TreinoSonix =
  | { status: "rodando"; inicio: string }
  | { status: "pronto"; em: string; resolvido: boolean | null; cenarios: CenarioTreino[]; ajusteChamadoId: number | null }
  | { status: "erro"; em: string; motivo: string };

/* o mesmo texto que a IA leu (áudio com a transcrição, foto com a legenda) */
const texto = (m: { tipo: string; conteudo: string | null; metadados?: unknown }) =>
  textoDaMensagem({ tipo: m.tipo, conteudo: m.conteudo, transcricao: ((m.metadados ?? {}) as { transcricao?: string }).transcricao ?? null }).trim();

async function gravarTreino(id: number, treino: TreinoSonix) {
  await db
    .update(C)
    .set({ resultado: sql`coalesce(${C.resultado}, '{}'::jsonb) || ${JSON.stringify({ treino })}::jsonb`, atualizadoEm: new Date() })
    .where(eq(C.id, id));
}

/** O cenário da prova: os turnos do cliente (mensagens seguidas, sem resposta no meio) até a resposta ruim, e a resposta ruim. */
async function cenarioDaProva(ev: EvidenciaChamado): Promise<{ turnos: string[][]; antes: string } | null> {
  if (!ev.mensagemId) return null;
  const [prova] = await db.select({ id: M.id, direcao: M.direcao }).from(M).where(eq(M.id, ev.mensagemId)).limit(1);
  if (!prova) return null;
  const doCliente = await db
    .select({ id: M.id })
    .from(M)
    .where(and(eq(M.conversaId, ev.conversaId), eq(M.direcao, "incoming"), prova.direcao === "incoming" ? lte(M.id, prova.id) : sql`${M.id} < ${prova.id}`))
    .orderBy(sql`${M.id} desc`)
    .limit(1);
  const ultimaDoCliente = doCliente[0]?.id;
  if (!ultimaDoCliente) return null;
  const historico = await db
    .select({ id: M.id, direcao: M.direcao, tipo: M.tipo, conteudo: M.conteudo, metadados: M.metadados })
    .from(M)
    .where(and(eq(M.conversaId, ev.conversaId), lte(M.id, ultimaDoCliente), inArray(M.direcao, ["incoming", "outgoing"])))
    .orderBy(asc(M.id));
  const turnos: string[][] = [];
  let atual: string[] = [];
  for (const m of historico) {
    if (m.direcao === "incoming") {
      const t = texto(m);
      if (t) atual.push(t);
    } else if (atual.length) {
      turnos.push(atual);
      atual = [];
    }
  }
  if (atual.length) turnos.push(atual);
  /* a resposta ruim: o que a IA mandou depois da última mensagem do cliente, até ele falar de novo */
  const depois = await db
    .select({ direcao: M.direcao, autor: M.autor, tipo: M.tipo, conteudo: M.conteudo })
    .from(M)
    .where(and(eq(M.conversaId, ev.conversaId), gt(M.id, ultimaDoCliente), ne(M.direcao, "system")))
    .orderBy(asc(M.id))
    .limit(8);
  const antes: string[] = [];
  for (const m of depois) {
    if (m.direcao === "incoming") break;
    if (m.autor === "ia") antes.push(texto(m));
  }
  return { turnos: turnos.slice(-MAX_TURNOS), antes: antes.join("\n") || ev.trecho };
}

/** Roda o cenário numa conversa nova do Simulador e devolve o que a IA respondeu ao último turno. */
async function rodarNoSimulador(turnos: string[][], chamadoId: number) {
  const telefone = `5581000${String(Date.now()).slice(-5)}`;
  let conversaId: number | null = null;
  let ultima: number | null = null;
  for (const turno of turnos) {
    for (const t of turno) {
      const r = await receberMensagem({ canal: "whatsapp", provedor: "mock", telefone, nomeContato: `Sonix · treino #${chamadoId}`, tipo: "texto", conteudo: t, externoId: `mock-in-${crypto.randomUUID()}`, demo: true });
      conversaId = r.conversaId ?? conversaId;
      ultima = r.mensagemId ?? ultima;
    }
    if (conversaId && ultima) await rodarWorkflowAtendimento({ conversaId, mensagemId: ultima, gatilho: "teste", simulado: true });
  }
  if (!conversaId || !ultima) return { conversaId, depois: "", doSistema: false };
  const respostas = await db
    .select({ tipo: M.tipo, conteudo: M.conteudo, metadados: M.metadados })
    .from(M)
    .where(and(eq(M.conversaId, conversaId), gt(M.id, ultima), eq(M.direcao, "outgoing")))
    .orderBy(asc(M.id));
  return { conversaId, depois: respostas.map(texto).join("\n"), doSistema: respostas.some((x) => ehTextoDoSistema(x.conteudo, x.metadados)) };
}

const esquemaVeredito = z.object({
  resolvido: z.boolean(),
  porque: z.string().describe("1 ou 2 frases simples para o dono, citando entre aspas o trecho da resposta nova que prova"),
});
const SISTEMA_VEREDITO = `Você é a Sonix, a IA interna da Gêmeos Motors que audita o atendimento do Miltinho (a IA que atende os clientes no WhatsApp).
O dono aprovou uma correção. Você rodou de novo, no Simulador, a MESMA conversa em que o erro aconteceu. Compare a resposta ANTIGA (com o erro) e a resposta NOVA (depois da correção).
- resolvido = true só se a resposta nova não tem mais o problema descrito E não criou outro problema óbvio (inventar preço ou dado, recusar a venda, passar para o vendedor sem motivo, despejar o estoque).
- Se a resposta nova está vazia, resolvido = false.
- porque: português simples, para um dono de loja que não é técnico.`;

const esquemaAjuste = z.object({ regra: z.string().describe("A regra corrigida, em uma ou duas frases") });

/** Treina um chamado aprovado: roda os cenários das provas, dá o veredito e, se não resolveu, propõe um ajuste. */
export async function treinarChamado(id: number): Promise<TreinoSonix> {
  const [c] = await db.select().from(C).where(eq(C.id, id)).limit(1);
  if (!c) throw new Error("Chamado não encontrado");
  try {
    if (!(await workflowAtivo())) {
      const t: TreinoSonix = { status: "erro", em: new Date().toISOString(), motivo: "O workflow da IA está desligado: não dá para rodar a conversa no Simulador." };
      await gravarTreino(id, t);
      return t;
    }
    const provas = (c.evidencias as EvidenciaChamado[]).filter((e) => e.mensagemId);
    const cenarios: CenarioTreino[] = [];
    for (const ev of provas) {
      if (cenarios.length >= MAX_CENARIOS) break;
      const cen = await cenarioDaProva(ev);
      if (!cen || !cen.turnos.length) continue;
      const r = await rodarNoSimulador(cen.turnos, id);
      const cliente = cen.turnos.at(-1)!.join(" / ");
      let veredito: { resolvido: boolean | null; porque: string };
      try {
        veredito = await gerarObjeto({
          schema: esquemaVeredito,
          sistema: SISTEMA_VEREDITO,
          prompt: `PROBLEMA: ${c.problema}\nCORREÇÃO APROVADA: ${JSON.stringify(c.proposta)}\n\nO cliente escreveu: "${anonimizar(cliente).slice(0, 600)}"\n\nRESPOSTA ANTIGA:\n${anonimizar(cen.antes).slice(0, 1500)}\n\nRESPOSTA NOVA:\n${anonimizar(r.depois).slice(0, 1500) || "(vazia)"}`,
          maxTokens: 400,
        });
      } catch {
        veredito = { resolvido: null, porque: "A conversa rodou de novo, mas a IA não respondeu para a Sonix conferir agora. Veja a resposta nova abaixo." };
      }
      cenarios.push({ conversaTesteId: r.conversaId, cliente: anonimizar(cliente).slice(0, 400), antes: cen.antes.slice(0, 1500), depois: r.depois.slice(0, 1500), ...veredito, doSistema: r.doSistema });
    }
    if (!cenarios.length) {
      const t: TreinoSonix = { status: "erro", em: new Date().toISOString(), motivo: "As provas deste chamado não apontam para uma mensagem da conversa: não deu para remontar o cenário." };
      await gravarTreino(id, t);
      return t;
    }
    const resolvido = cenarios.some((x) => x.resolvido === null) ? null : cenarios.every((x) => x.resolvido);
    /* não resolveu: a Sonix propõe um ajuste num chamado novo (o dono decide) */
    let ajusteChamadoId: number | null = null;
    const falhouNoSistema = cenarios.find((x) => x.resolvido === false && x.doSistema);
    if (resolvido === false && falhouNoSistema) {
      /* a resposta errada é texto pronto do sistema: outra regra não resolveria; vai para o plano de ação (código) */
      const [novo] = await db
        .insert(C)
        .values({
          tipo: "plano_acao",
          area: "sistema",
          titulo: `Mudar no código: ${c.titulo}`.slice(0, 120),
          problema: `A Sonix testou o chamado #${id} no Simulador e o erro continuou num texto pronto do sistema: ${falhouNoSistema.porque}`,
          proposta: { acao: acaoDeCodigo({ problema: c.problema, trecho: falhouNoSistema.depois }) },
          evidencias: c.evidencias,
          clientes: c.clientes,
        })
        .returning({ id: C.id });
      ajusteChamadoId = novo?.id ?? null;
    } else if (resolvido === false && c.tipo === "regra_ia") {
      try {
        const falhou = cenarios.find((x) => x.resolvido === false)!;
        const a = await gerarObjeto({
          schema: esquemaAjuste,
          sistema: `${SISTEMA_VEREDITO}\nAgora escreva a regra corrigida, mais clara e direta, que faça o Miltinho acertar este caso. Diga o que fazer no lugar. Não invente dado da loja; se faltar, use [PREENCHER: o dado].`,
          prompt: `PROBLEMA: ${c.problema}\nREGRA QUE NÃO RESOLVEU: ${(c.proposta as PropostaChamado).regra ?? ""}\nO cliente escreveu: "${falhou.cliente}"\nRESPOSTA NOVA (ainda errada):\n${anonimizar(falhou.depois).slice(0, 1200)}\nPOR QUE AINDA ESTÁ ERRADA: ${falhou.porque}`,
          maxTokens: 300,
        });
        const [novo] = await db
          .insert(C)
          .values({
            tipo: "regra_ia",
            area: "ia",
            titulo: `Ajuste do chamado #${id}: ${c.titulo}`.slice(0, 120),
            problema: `A Sonix testou o chamado #${id} no Simulador e o erro continuou: ${falhou.porque}`,
            proposta: { regra: a.regra.trim() },
            evidencias: c.evidencias,
            clientes: c.clientes,
          })
          .returning({ id: C.id });
        ajusteChamadoId = novo?.id ?? null;
      } catch {
        ajusteChamadoId = null;
      }
    }
    const t: TreinoSonix = { status: "pronto", em: new Date().toISOString(), resolvido, cenarios, ajusteChamadoId };
    await gravarTreino(id, t);
    return t;
  } catch (e) {
    const t: TreinoSonix = { status: "erro", em: new Date().toISOString(), motivo: e instanceof Error ? e.message.slice(0, 300) : "falha ao treinar" };
    await gravarTreino(id, t);
    return t;
  }
}

/** Marca que o treino começou (a tela mostra "testando…") e roda em segundo plano. */
export async function comecarTreino(id: number, depois: (fn: () => Promise<unknown>) => void) {
  await gravarTreino(id, { status: "rodando", inicio: new Date().toISOString() });
  depois(() => treinarChamado(id).catch((e) => console.error("[sonix] treino", e)));
}
