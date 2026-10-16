import "server-only";
import { and, asc, desc, eq, gte, lt, sql } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/lib/db";
import { ETAPAS } from "@/lib/dominio";
import { gerarObjetoComUso, IaIndisponivel, MODELO_IA } from "./cliente";
import { iaLigada } from "./controle";
import {
  AREAS_SUGESTAO,
  ASSUNTOS,
  calcularMetricas,
  conferirProvas,
  diasParaAnalisar,
  LISTAS_COM_PROVA,
  precisaAnalisar,
  RESULTADOS,
  TEMPERATURAS,
  TIPOS_OBJECAO,
  transcreverParaAnalise,
  type FichaConversa,
  type MensagemAnalise,
} from "./analista-regras";

/* ============================================================
   ANALISTA — lê as conversas do dia e preenche uma ficha de cada uma
   (o que o cliente queria, objeções, concorrência, perguntas sem resposta,
   erros e acertos da IA e da equipe, nota e sugestões).
   Roda sozinho pelo relógio do servidor (instrumentation.ts →
   /api/interno/analista): o dia de hoje a partir das 18:30 (o resumo do
   dono sai às 19h) e o dia anterior de novo de madrugada.
   Nunca muda nada no sistema: só escreve a ficha.
   ============================================================ */

const CHAVE_CONFIG = "analista";
/** conversas analisadas por minuto (a OpenAI recusa muitas chamadas juntas) */
const LOTE = 3;
const MAX_MSGS_DIA = 300;
const MSGS_CONTEXTO = 20;

export async function analistaLigado() {
  const [l] = await db.select({ valor: schema.configuracoes.valor }).from(schema.configuracoes).where(eq(schema.configuracoes.chave, CHAVE_CONFIG)).limit(1);
  return (l?.valor as { ligado?: boolean } | undefined)?.ligado !== false;
}

const chaves = <T extends Record<string, string>>(o: T) => Object.keys(o) as [keyof T & string, ...(keyof T & string)[]];
const prova = { mensagemId: z.number().nullable() };

const esquemaFicha = z.object({
  resumo: z.string(),
  assunto: z.enum(chaves(ASSUNTOS)),
  modeloInteresse: z.string().nullable(),
  formaPagamento: z.string().nullable(),
  usoDeclarado: z.string().nullable(),
  cidade: z.string().nullable(),
  temperatura: z.enum(chaves(TEMPERATURAS)),
  resultado: z.enum(chaves(RESULTADOS)),
  objecoes: z.array(z.object({ tipo: z.enum(chaves(TIPOS_OBJECAO)), descricao: z.string(), ...prova })),
  concorrentes: z.array(z.object({ quem: z.string(), oQueDisse: z.string(), ...prova })),
  perguntasSemResposta: z.array(z.object({ pergunta: z.string(), ...prova })),
  errosIa: z.array(z.object({ descricao: z.string(), ...prova })),
  errosEquipe: z.array(z.object({ descricao: z.string(), ...prova })),
  acertos: z.array(z.object({ descricao: z.string(), ...prova })),
  ondeTravou: z.string().nullable(),
  nota: z.number().nullable(),
  notaMotivo: z.string(),
  sugestoes: z.array(z.object({ area: z.enum(chaves(AREAS_SUGESTAO)), sugestao: z.string(), ...prova })),
  lacunas: z.array(z.string()),
});

const SISTEMA = `Você é o Analista comercial interno da Gêmeos Motors, loja de motos elétricas em Goiana (PE), que entrega em toda a região. A loja atende no WhatsApp com uma IA (chamada Milton) e com a equipe de vendas.
Sua tarefa: ler o atendimento de UM dia de uma conversa e preencher a ficha, para o dono melhorar as vendas, a IA, a equipe, o estoque e o sistema.

Regras obrigatórias:
- Use SOMENTE o que está escrito na conversa e nos dados recebidos. Não invente fatos, valores, falas ou intenções. Sem dado, use null ou lista vazia e diga o que faltou em "lacunas".
- Cada item de objecoes, concorrentes, perguntasSemResposta, errosIa, errosEquipe, acertos e sugestoes PRECISA ter em "mensagemId" o número (#) da mensagem que prova o que você escreveu. Item sem prova será descartado.
- Analise o que aconteceu no DIA indicado. As mensagens marcadas como CONTEXTO são só para entender o que veio antes.
- Português do Brasil, frases curtas e diretas, sem emojis. Você recomenda; quem decide é o dono.
- Dados pessoais aparecem como [cpf], [telefone], [endereço]: isso é normal, não é erro.

Como preencher:
- assunto: "nao_cliente" para operadora, banco, fornecedor, agência ou robô oferecendo serviço. Nesse caso: nota null, resultado "nao_e_venda" e listas vazias.
- resultado: "comprou" só se a conversa ou o negócio mostrar a venda fechada; "perdeu" se o cliente desistiu ou o negócio foi perdido; "nao_e_venda" para assistência, garantia e não-cliente.
- objecoes: só o que o CLIENTE disse que trava a compra ("tá caro", "a parcela ficou alta", "é longe", "vou ver com minha esposa", "vou pensar").
- concorrentes: outra loja, site, marketplace ou preço de fora que o cliente citou.
- perguntasSemResposta: pergunta do cliente que ninguém respondeu, ou que a IA disse que não sabia, ou respondeu de forma vaga.
- errosIa: respondeu errado, ofereceu antes de entender o que o cliente queria, mandou a tabela de parcelas inteira, fez mais de uma pergunta na mesma mensagem, repetiu o que já tinha dito, insistiu depois de uma recusa, deixou de passar para a equipe quando devia.
- errosEquipe: demorou a responder (use os NÚMEROS DO ATENDIMENTO), não assumiu a conversa que a IA passou, prometeu retorno e não voltou, não pediu o fechamento.
- CONFIRA O QUE FICOU REGISTRADO. As mensagens SISTEMA mostram o que o sistema gravou (test drive agendado, etapa do funil, follow-up). Compare data, dia da semana, horário, modelo e valor com o que o CLIENTE pediu. Se não batem (ex.: cliente disse "quarta à tarde" e o sistema agendou sexta), é erro grave da IA: registre em errosIa citando a mensagem SISTEMA, e NUNCA conte como acerto.
- Só aponte um erro se ele estiver nas mensagens. Ex.: "fez duas perguntas na mesma mensagem" só vale se as duas perguntas estão no MESMO número (#).
- acertos: o que funcionou e vale repetir. Só conte como acerto o que deu certo de verdade até o fim.
- nota: de 0 a 10 para o atendimento da loja (IA e equipe juntas) NESTE dia, pensando em: entendeu o que o cliente queria, respondeu o que ele perguntou, respondeu rápido, conduziu ao próximo passo da compra sem insistir demais. "notaMotivo" em uma frase.
- sugestoes: no máximo 3, concretas e que nasçam desta conversa (ex.: "incluir na base da IA a resposta sobre habilitação"). Área: ia, estoque, preco_pagamento, equipe, sistema ou marketing.
- ondeTravou: em que ponto a compra parou e por quê, citando o número (#) da mensagem; null se não travou.`;

const diaEmData = (dia: string) => new Date(`${dia}T00:00:00-03:00`); // Recife não tem horário de verão
const diaSeguinte = (dia: string) => new Date(+diaEmData(dia) + 24 * 3600_000);

export type ResultadoAnalise = { ok: true; ficha: FichaConversa; descartados: number } | { ok: false; motivo: string };

/** Analisa uma conversa num dia da loja e grava (ou refaz) a ficha. */
export async function analisarConversa(conversaId: number, dia: string): Promise<ResultadoAnalise> {
  const [conversa] = await db
    .select({ id: schema.conversas.id, nome: schema.conversas.contatoNome, modo: schema.conversas.modo, negocioId: schema.conversas.negocioId })
    .from(schema.conversas)
    .where(eq(schema.conversas.id, conversaId))
    .limit(1);
  if (!conversa) return { ok: false, motivo: "conversa não encontrada" };

  const m = schema.mensagens;
  const colunas = { id: m.id, autor: m.autor, tipo: m.tipo, conteudo: m.conteudo, criadoEm: m.criadoEm };
  const [doDia, antes, negocio] = await Promise.all([
    db
      .select(colunas)
      .from(m)
      .where(and(eq(m.conversaId, conversaId), gte(m.criadoEm, diaEmData(dia)), lt(m.criadoEm, diaSeguinte(dia))))
      .orderBy(desc(m.id))
      .limit(MAX_MSGS_DIA)
      .then((xs) => xs.reverse()),
    db
      .select(colunas)
      .from(m)
      .where(and(eq(m.conversaId, conversaId), lt(m.criadoEm, diaEmData(dia))))
      .orderBy(desc(m.id))
      .limit(MSGS_CONTEXTO)
      .then((xs) => xs.reverse()),
    conversa.negocioId
      ? db
          .select({ etapa: schema.negocios.etapa, interesse: schema.negocios.veiculoInteresse, perdaMotivo: schema.negocios.perdaMotivo })
          .from(schema.negocios)
          .where(eq(schema.negocios.id, conversa.negocioId))
          .limit(1)
          .then((xs) => xs[0] ?? null)
      : null,
  ]);
  if (!doDia.length) return { ok: false, motivo: "sem mensagens neste dia" };

  const metricas = calcularMetricas(doDia as MensagemAnalise[]);
  const etapa = negocio ? (ETAPAS.find((e) => e.id === negocio.etapa)?.rotulo ?? negocio.etapa) : null;
  const prompt = `DIA ANALISADO: ${dia.split("-").reverse().join("/")}
Cliente (primeiro nome): ${(conversa.nome ?? "não informado").split(" ")[0]}
Quem atende agora: ${conversa.modo === "ia" ? "a IA" : "a equipe"}
Negócio no funil: ${negocio ? `etapa "${etapa}"${negocio.interesse ? `, interesse: ${negocio.interesse}` : ""}${negocio.perdaMotivo ? `, perdido por: ${negocio.perdaMotivo}` : ""}` : "nenhum"}

NÚMEROS DO ATENDIMENTO NO DIA (calculados pelo sistema, são exatos)
Mensagens: cliente ${metricas.msgsCliente}, IA ${metricas.msgsIa}, equipe ${metricas.msgsEquipe}
Primeira resposta: ${metricas.primeiraRespostaMin ?? "—"} min · maior espera do cliente: ${metricas.maiorEsperaMin ?? "—"} min · maior espera pela equipe: ${metricas.maiorEsperaEquipeMin ?? "—"} min
Terminou o dia com o cliente sem resposta: ${metricas.terminouSemResposta ? "sim" : "não"}

${antes.length ? `CONTEXTO (antes do dia, só para entender)\n${transcreverParaAnalise(antes as MensagemAnalise[])}\n\n` : ""}CONVERSA DO DIA
${transcreverParaAnalise(doDia as MensagemAnalise[])}`;

  const r = await gerarObjetoComUso({ schema: esquemaFicha, sistema: SISTEMA, prompt, maxTokens: 2500 });
  const ids = new Set([...doDia, ...antes].map((x) => x.id));
  const conferida = conferirProvas(r.objeto as FichaConversa, ids, [...LISTAS_COM_PROVA]);
  const ficha: FichaConversa = {
    ...conferida.ficha,
    nota: conferida.ficha.nota == null ? null : Math.max(0, Math.min(10, Math.round(conferida.ficha.nota))),
    sugestoes: conferida.ficha.sugestoes.slice(0, 3),
  };

  const valores = {
    ultimaMensagemId: doDia[doDia.length - 1].id,
    ficha,
    metricas,
    assunto: ficha.assunto,
    resultado: ficha.resultado,
    nota: ficha.nota,
    descartados: conferida.descartados,
    modelo: MODELO_IA,
    tokensEntrada: r.tokensEntrada,
    tokensSaida: r.tokensSaida,
    atualizadoEm: new Date(),
  };
  await db
    .insert(schema.analisesConversa)
    .values({ conversaId, dia, ...valores })
    .onConflictDoUpdate({ target: [schema.analisesConversa.conversaId, schema.analisesConversa.dia], set: valores });
  return { ok: true, ficha, descartados: conferida.descartados };
}

/** Conversas de clientes reais com mensagem do cliente no dia, e o que já foi analisado delas. */
async function pendentesDoDia(dia: string, refazerSeMudou: boolean) {
  const m = schema.mensagens;
  const a = schema.analisesConversa;
  const linhas = await db
    .select({ conversaId: m.conversaId, ultimaDoDia: sql<number>`max(${m.id})`.mapWith(Number), analisadaAte: a.ultimaMensagemId, fichaId: a.id })
    .from(m)
    .innerJoin(schema.conversas, and(eq(schema.conversas.id, m.conversaId), eq(schema.conversas.demo, false)))
    .leftJoin(a, and(eq(a.conversaId, m.conversaId), eq(a.dia, dia)))
    .where(and(gte(m.criadoEm, diaEmData(dia)), lt(m.criadoEm, diaSeguinte(dia))))
    .groupBy(m.conversaId, a.id, a.ultimaMensagemId)
    .having(sql`bool_or(${m.autor} = 'cliente')`)
    .orderBy(asc(m.conversaId));
  return linhas.filter((l) => precisaAnalisar({ jaTemFicha: l.fichaId != null, ultimaAnalisadaId: l.analisadaAte, ultimaDoDiaId: l.ultimaDoDia, refazerSeMudou })).map((l) => l.conversaId);
}

/* Conversa que falhou 3 vezes no mesmo dia não volta a ser tentada até o servidor reiniciar
   (evita gastar chamada todo minuto com a mesma conversa quebrada). */
const falhas = new Map<string, number>();

/** Um passo do relógio: analisa até LOTE conversas pendentes. */
export async function rodarAnalista(agora = new Date()) {
  if (!(await analistaLigado()) || !(await iaLigada())) return { analisadas: 0, motivo: "desligado" };
  let analisadas = 0;
  for (const pedido of diasParaAnalisar(agora)) {
    const fila = (await pendentesDoDia(pedido.dia, pedido.refazerSeMudou)).filter((id) => (falhas.get(`${id}:${pedido.dia}`) ?? 0) < 3);
    for (const conversaId of fila) {
      if (analisadas >= LOTE) return { analisadas };
      try {
        await analisarConversa(conversaId, pedido.dia);
        analisadas++;
      } catch (e) {
        const chave = `${conversaId}:${pedido.dia}`;
        falhas.set(chave, (falhas.get(chave) ?? 0) + 1);
        console.error("[analista]", conversaId, pedido.dia, e instanceof Error ? e.message : e);
        /* sem crédito, sem chave ou limite da OpenAI: para o passo, tenta no próximo minuto */
        if (e instanceof IaIndisponivel) return { analisadas, motivo: e.message };
      }
    }
  }
  return { analisadas };
}

/** Fichas de uma conversa, da mais nova para a mais antiga (tela do atendimento). */
export async function fichasDaConversa(conversaId: number, limite = 7) {
  const a = schema.analisesConversa;
  return db
    .select({ dia: a.dia, ficha: a.ficha, metricas: a.metricas, descartados: a.descartados, atualizadoEm: a.atualizadoEm })
    .from(a)
    .where(eq(a.conversaId, conversaId))
    .orderBy(desc(a.dia))
    .limit(limite);
}
