import "server-only";
import { asc, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/lib/db";
import { MOTIVOS_PERDA, ORIGENS, STATUS_OS, TIPOS_OS } from "@/lib/dominio";
import { brl, dataHora, km } from "@/lib/formato";
import type { AssistenciaIa, DiagnosticoPerda, TriagemIa } from "@/lib/db/schema";
import { gerarObjeto, transcrever } from "./cliente";

const REGRAS = `Regras obrigatórias:
- Use SOMENTE os dados fornecidos abaixo. Não invente fatos, valores, datas, falas ou intenções.
- Quando um ponto não puder ser respondido com os dados, escreva exatamente "Não há dados suficientes" naquele campo e liste o que faltou em "lacunas".
- Escreva em português do Brasil, de forma direta e profissional, sem emojis.
- Você apoia a decisão humana; não dê ordens, faça recomendações.`;

/* ---------------- venda perdida ---------------- */
const esquemaDiagnostico = z.object({
  provavelMotivo: z.string(),
  objecoes: z.array(z.string()),
  momentoPerdaInteresse: z.string(),
  comportamentoCliente: z.string(),
  acaoQuePoderiaAjudar: z.string(),
  recomendacaoConsultor: z.string(),
  classificacao: z.enum(["preco", "financiamento", "troca", "concorrencia", "desistencia", "falta_estoque", "sem_resposta", "atendimento", "outro", "indefinida"]),
  confianca: z.enum(["baixa", "media", "alta"]),
  lacunas: z.array(z.string()),
});

export async function diagnosticarPerda(negocioId: number): Promise<DiagnosticoPerda> {
  const n = schema.negocios;
  const [neg] = await db
    .select({
      negocio: n,
      cliente: schema.clientes.nome,
      consultor: schema.usuarios.nome,
      veiculo: schema.veiculos,
    })
    .from(n)
    .innerJoin(schema.clientes, eq(schema.clientes.id, n.clienteId))
    .leftJoin(schema.usuarios, eq(schema.usuarios.id, n.responsavelId))
    .leftJoin(schema.veiculos, eq(schema.veiculos.id, n.veiculoId))
    .where(eq(n.id, negocioId))
    .limit(1);
  if (!neg) throw new Error("negócio não encontrado");
  const g = neg.negocio;

  const [eventos, interacoes, conversa] = await Promise.all([
    db.select().from(schema.negocioEventos).where(eq(schema.negocioEventos.negocioId, negocioId)).orderBy(asc(schema.negocioEventos.criadoEm)),
    db.select().from(schema.interacoes).where(eq(schema.interacoes.negocioId, negocioId)).orderBy(asc(schema.interacoes.criadoEm)),
    db.select().from(schema.conversas).where(eq(schema.conversas.negocioId, negocioId)).limit(1),
  ]);
  const mensagens = conversa[0]
    ? (await db.select().from(schema.mensagens).where(eq(schema.mensagens.conversaId, conversa[0].id)).orderBy(desc(schema.mensagens.id)).limit(80)).reverse()
    : [];
  const notas = conversa[0] ? await db.select().from(schema.conversaNotas).where(eq(schema.conversaNotas.conversaId, conversa[0].id)) : [];

  const veiculo = neg.veiculo
    ? [neg.veiculo.marca, neg.veiculo.modelo, neg.veiculo.versao, neg.veiculo.cor, neg.veiculo.anoModelo, neg.veiculo.km != null ? km(neg.veiculo.km) : null].filter(Boolean).join(" ")
    : g.veiculoInteresse ?? "não informado";

  const prompt = `NEGÓCIO PERDIDO
Cliente (primeiro nome): ${neg.cliente.split(" ")[0]}
Veículo de interesse: ${veiculo}
Origem do lead: ${g.origem ? ORIGENS[g.origem as keyof typeof ORIGENS] : "não informada"}
Valor anunciado: ${brl(g.valorAnunciado)} | Valor da proposta: ${brl(g.valorProposta)}
Troca: ${g.temTroca ? `sim — ${g.trocaDescricao ?? "sem descrição"}${g.trocaValor ? ` (${brl(g.trocaValor)})` : ""}` : "não"}
Consultor responsável: ${neg.consultor ?? "não definido"}
Criado em: ${dataHora(g.criadoEm)} | Perdido em: ${dataHora(g.perdidoEm)}
Resumo da triagem automática: ${g.triagemIa ?? "não houve"}

ENCERRAMENTO INFORMADO PELO CONSULTOR
Motivo escolhido: ${g.perdaMotivo ? MOTIVOS_PERDA[g.perdaMotivo as keyof typeof MOTIVOS_PERDA] : "não informado"}
Objeção principal: ${g.perdaObjecao ?? "não informada"}
Observações: ${g.perdaObservacoes ?? "não informadas"}

HISTÓRICO DO NEGÓCIO
${eventos.map((e) => `${dataHora(e.criadoEm)} — ${e.descricao}`).join("\n") || "sem eventos"}

INTERAÇÕES REGISTRADAS
${interacoes.map((i) => `${dataHora(i.criadoEm)} [${i.canal}] ${i.resumo}`).join("\n") || "nenhuma"}

NOTAS INTERNAS DA EQUIPE
${notas.map((x) => `${dataHora(x.criadoEm)} ${x.conteudo}`).join("\n") || "nenhuma"}

CONVERSA (últimas mensagens)
${mensagens.length ? transcrever(mensagens) : "não há conversa registrada"}`;

  return gerarObjeto({
    schema: esquemaDiagnostico,
    sistema: `Você é analista comercial de uma loja de motos elétricas e veículos (Gêmeos Motors, Pernambuco). Sua tarefa é diagnosticar por que uma venda foi perdida, a partir do registro do atendimento.
${REGRAS}
- "classificacao" deve ser uma das opções do esquema; use "indefinida" se os dados não permitirem classificar.
- "confianca" reflete quanto os dados sustentam o diagnóstico: poucos dados = baixa.
- "momentoPerdaInteresse": aponte a mensagem/evento em que o interesse caiu, citando data e hora, ou "Não há dados suficientes".`,
    prompt,
  });
}

/* ---------------- triagem do atendimento ---------------- */
const esquemaTriagem = z.object({
  resumo: z.string(),
  interesse: z.string().nullable(),
  veiculo: z.string().nullable(),
  temTroca: z.boolean().nullable(),
  trocaDescricao: z.string().nullable(),
  intencaoCompra: z.enum(["alta", "media", "baixa", "indefinida"]),
  dadosColetados: z.array(z.string()),
  faltaPerguntar: z.array(z.string()),
  prontoParaHumano: z.boolean(),
  proximaMensagem: z.string().nullable(),
});

export type ResultadoTriagem = TriagemIa & { proximaMensagem: string | null };

export async function triarConversa(conversaId: number, catalogo: string[]): Promise<ResultadoTriagem> {
  const msgs = (await db.select().from(schema.mensagens).where(eq(schema.mensagens.conversaId, conversaId)).orderBy(desc(schema.mensagens.id)).limit(40)).reverse();
  return gerarObjeto({
    schema: esquemaTriagem,
    maxTokens: 1200,
    sistema: `Você é o assistente virtual de primeira triagem da Gêmeos Motors (motos elétricas, compra/venda/repasse de motos a combustão e carros; loja física em Goiana/PE, com entrega em toda a região).
Objetivo: entender o que o cliente quer e passar para um consultor humano o quanto antes.
Colete, conversando de forma breve e cordial: veículo de interesse, se tem veículo para a troca (e qual), e se a intenção de compra é próxima.
${REGRAS}
- Nunca informe preço, prazo, taxa, disponibilidade ou condição de pagamento: isso é do consultor. Se o cliente perguntar, diga que o consultor vai confirmar.
- "prontoParaHumano" = true quando já se sabe o interesse principal, OU o cliente pediu para falar com uma pessoa, OU já houve 3 perguntas suas sem resposta útil, OU o assunto não é compra (assistência, reclamação).
- "proximaMensagem": uma única mensagem curta para enviar ao cliente agora. Se prontoParaHumano for true, avise que um consultor vai continuar o atendimento. Se a última mensagem da conversa já for sua e o cliente não respondeu, use null.
- Modelos elétricos do catálogo (use só para reconhecer o nome citado): ${catalogo.join(", ")}.`,
    prompt: `CONVERSA ATÉ AGORA\n${transcrever(msgs)}`,
  });
}

/* ---------------- assistência técnica ---------------- */
const esquemaOs = z.object({
  resumoProblema: z.string(),
  possiveisCausas: z.array(z.string()),
  verificacoesSugeridas: z.array(z.string()),
  resumoParaConsultor: z.string(),
  mensagemParaCliente: z.string(),
  lacunas: z.array(z.string()),
});

export async function assistirOs(osId: number): Promise<AssistenciaIa> {
  const [os] = await db.select().from(schema.ordensServico).where(eq(schema.ordensServico.id, osId)).limit(1);
  if (!os) throw new Error("OS não encontrada");
  const [itens, eventos] = await Promise.all([
    db.select().from(schema.osItens).where(eq(schema.osItens.osId, osId)),
    db.select().from(schema.osEventos).where(eq(schema.osEventos.osId, osId)).orderBy(asc(schema.osEventos.criadoEm)),
  ]);
  return gerarObjeto({
    schema: esquemaOs,
    sistema: `Você apoia a assistência técnica da Gêmeos Motors (motos elétricas, também motos a combustão e carros).
${REGRAS}
- "possiveisCausas" são HIPÓTESES para o técnico verificar, nunca diagnóstico final. Ordene da mais para a menos provável, considerando o tipo de veículo descrito. Se o relato for vago demais, diga "Não há dados suficientes".
- "verificacoesSugeridas": testes objetivos e seguros que o técnico pode fazer (ex.: medir tensão da bateria, conferir conector do carregador).
- "mensagemParaCliente": texto curto e cordial para WhatsApp, sem prometer prazo ou valor que não esteja nos dados.`,
    prompt: `ORDEM DE SERVIÇO
Tipo: ${TIPOS_OS[os.tipo as keyof typeof TIPOS_OS]}
Situação: ${STATUS_OS.find((s) => s.id === os.status)?.rotulo ?? os.status}
Veículo: ${os.veiculoDescricao}${os.km != null ? ` · ${km(os.km)}` : ""}
Problema relatado pelo cliente: ${os.problemaRelatado}
Diagnóstico técnico registrado: ${os.diagnosticoTecnico ?? "ainda não registrado"}
Solução aplicada: ${os.solucaoAplicada ?? "nenhuma ainda"}
Serviços realizados: ${os.servicosRealizados ?? "nenhum ainda"}
Observações: ${os.observacoes ?? "nenhuma"}
Previsão de entrega: ${os.previsaoEntrega ?? "não definida"}
Peças e serviços lançados: ${itens.map((i) => `${i.quantidade}x ${i.descricao}`).join("; ") || "nenhum"}
Histórico: ${eventos.map((e) => `${dataHora(e.criadoEm)} ${e.descricao}`).join(" | ") || "sem eventos"}`,
  });
}
