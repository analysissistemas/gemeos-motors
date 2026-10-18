import "server-only";
import { and, desc, eq, lt, sql } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/lib/db";
import { ErroRegra } from "@/lib/acao";
import { registrarLog } from "@/lib/logs";
import { gerarObjeto } from "./cliente";
import { anonimizar, diaDaLoja } from "./analista-regras";
import { acaoDeCodigo, ehTextoDoSistema } from "./texto-do-sistema";

/* ============================================================
   O VENDEDOR AVALIA A RESPOSTA DO MILTINHO (dono, 18/10/2026: "no chat de atendimento uma parte aonde o vendedor
   consiga reagir com Legal ou Não legal à conversa da IA; se for não legal ele tem que colocar uma descrição do
   porquê... para ela não responder mais assim").

   Aprendizado em conjunto: o Miltinho atende, o vendedor avalia e a Sonix (a IA interna que audita a qualidade do
   atendimento) transforma o "Não legal" num chamado de melhoria com a regra que corrige o erro. O dono aprova em
   Melhorias e a regra entra no prompt do Miltinho. Nada muda no atendimento sem a aprovação do dono.
   A avaliação fica na própria mensagem (metadados.avaliacaoIa), como as reações.
   ============================================================ */

export type NotaIa = "legal" | "nao_legal";
export type AvaliacaoIa = { nota: NotaIa; motivo: string | null; por: string; porId: number; em: string; chamadoId: number | null };
type Quem = { id: number; nome: string };

const esquemaRegra = z.object({
  titulo: z.string().describe("Título curto do problema, até 80 caracteres"),
  regra: z.string().describe("UMA regra para o Miltinho, em uma ou duas frases"),
});

const SISTEMA_SONIX = `Você é a Sonix, a IA interna da Gêmeos Motors (loja de motos elétricas em Goiana, PE) que audita a qualidade do atendimento do Miltinho, a IA que atende os clientes no WhatsApp.
Um vendedor marcou uma resposta do Miltinho como "Não legal" e explicou o porquê. Escreva UMA regra para o Miltinho não errar assim de novo.
- A regra diz o que fazer no lugar, não só o que evitar (ex.: "Quando o cliente chegar pelo botão do site, não passe para o vendedor: cumprimente, se apresente e pergunte o nome").
- Use o motivo do vendedor como verdade. Não invente preço, prazo, endereço nem dado da loja; se a regra precisar de um dado que você não tem, escreva [PREENCHER: o dado].
- Português do Brasil, frases curtas, sem emojis.`;

/** Avalia (ou troca a avaliação de) uma resposta do Miltinho. "Não legal" exige o motivo e abre um chamado da Sonix. */
export async function avaliarRespostaDaIa(u: Quem, mensagemId: number, nota: NotaIa, motivoBruto: string | null) {
  const motivo = motivoBruto?.replace(/\s+/g, " ").trim() || null;
  if (nota === "nao_legal" && (!motivo || motivo.length < 5)) throw new ErroRegra("Conte em poucas palavras por que a resposta não ficou legal.");
  const [m] = await db
    .select({ id: schema.mensagens.id, conversaId: schema.mensagens.conversaId, autor: schema.mensagens.autor, direcao: schema.mensagens.direcao, conteudo: schema.mensagens.conteudo, metadados: schema.mensagens.metadados, criadoEm: schema.mensagens.criadoEm, contato: schema.conversas.contatoNome })
    .from(schema.mensagens)
    .innerJoin(schema.conversas, eq(schema.conversas.id, schema.mensagens.conversaId))
    .where(eq(schema.mensagens.id, mensagemId))
    .limit(1);
  if (!m || m.direcao !== "outgoing" || m.autor !== "ia") throw new ErroRegra("Só dá para avaliar as respostas da IA.");

  let chamadoId: number | null = null;
  if (nota === "nao_legal") {
    /* o que o cliente tinha dito antes da resposta (contexto para a Sonix) */
    const [antes] = await db
      .select({ conteudo: schema.mensagens.conteudo })
      .from(schema.mensagens)
      .where(and(eq(schema.mensagens.conversaId, m.conversaId), eq(schema.mensagens.direcao, "incoming"), lt(schema.mensagens.id, m.id)))
      .orderBy(desc(schema.mensagens.id))
      .limit(1);
    const resposta = anonimizar(m.conteudo ?? "").slice(0, 600);
    const cliente = anonimizar(antes?.conteudo ?? "").slice(0, 400);
    let proposta: { titulo: string; regra: string };
    try {
      proposta = await gerarObjeto({
        schema: esquemaRegra,
        sistema: SISTEMA_SONIX,
        prompt: `O cliente escreveu: "${cliente || "(nada antes)"}"\nO Miltinho respondeu: "${resposta}"\nO vendedor ${u.nome} marcou "Não legal" porque: "${motivo}"`,
        maxTokens: 400,
      });
    } catch {
      /* sem IA agora: o chamado nasce com o motivo do vendedor, e o dono escreve a regra antes de aprovar */
      proposta = { titulo: motivo!.slice(0, 80), regra: `[PREENCHER: a regra] Evite responder como nesta mensagem: "${resposta.slice(0, 200)}". Motivo do vendedor: ${motivo}` };
    }
    /* a resposta era um texto pronto do sistema: regra no prompt não muda, é plano de ação para o código */
    const doSistema = ehTextoDoSistema(m.conteudo, m.metadados);
    const problema = `${u.nome} marcou "Não legal" numa resposta do Miltinho. Motivo: ${motivo}`;
    const [c] = await db
      .insert(schema.chamadosMelhoria)
      .values({
        tipo: doSistema ? "plano_acao" : "regra_ia",
        area: doSistema ? "sistema" : "ia",
        titulo: `${doSistema ? "Mudar no código" : "Avaliação do vendedor"}: ${proposta.titulo}`.slice(0, 120),
        problema,
        proposta: doSistema ? { acao: acaoDeCodigo({ problema, trecho: resposta }) } : { regra: proposta.regra.trim() },
        evidencias: [{ conversaId: m.conversaId, dia: diaDaLoja(new Date(m.criadoEm)), mensagemId: m.id, trecho: resposta.slice(0, 300), contato: m.contato }],
        clientes: 1,
      })
      .returning({ id: schema.chamadosMelhoria.id });
    chamadoId = c?.id ?? null;
  }

  const avaliacao: AvaliacaoIa = { nota, motivo: nota === "nao_legal" ? motivo : null, por: u.nome, porId: u.id, em: new Date().toISOString(), chamadoId };
  await db
    .update(schema.mensagens)
    .set({ metadados: sql`coalesce(${schema.mensagens.metadados}, '{}'::jsonb) || ${JSON.stringify({ avaliacaoIa: avaliacao })}::jsonb`, alteradaEm: new Date() })
    .where(eq(schema.mensagens.id, m.id));
  await registrarLog(u, {
    acao: "ia.avaliada",
    entidade: "conversa",
    entidadeId: m.conversaId,
    descricao: nota === "legal" ? "Marcou uma resposta da IA como Legal" : `Marcou uma resposta da IA como Não legal: ${motivo}`,
    dados: { mensagemId: m.id, chamadoId },
  });
  return avaliacao;
}
