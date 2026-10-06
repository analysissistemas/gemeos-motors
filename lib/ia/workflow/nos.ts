import "server-only";
import { and, desc, eq, gt, inArray, lt, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/lib/db";
import { analisarMidia, gerarObjeto, MODELO_IA } from "@/lib/ia/cliente";
import { consultarEstoque } from "@/lib/ia/estoque";
import { consultarCatalogo } from "@/lib/ia/catalogo";
import { lerControle } from "@/lib/ia/controle";
import { enviarLocalizacaoDaIa, enviarMidiaDaIa, enviarRespostaDaIa } from "@/lib/ia/envio";
import { dataHoraDaVisita, LOCAL_LOJA, quandoPorExtenso, RX_PEDIU_HORARIO_VISITA, RX_QUER_VISITAR } from "@/lib/ia/agenda";
import { criarTestDrive } from "@/lib/servicos/test-drive";
import { ErroRegra } from "@/lib/acao";
import { validarResposta } from "@/lib/ia/validador";
import { catalogoParaIa, fontesAutorizadas, lerHorario, montarPromptSistema, reais } from "@/lib/ia/prompt";
import { formatarTelefone } from "@/lib/formato";
import { autonomiaMinima, comGasolinaDaRegiao, fraseEconomia, kmPorSemana, lerParametrosEconomia } from "@/lib/ia/economia";
import { gasolinaPara } from "@/lib/ia/gasolina";
import { agoraNaLoja, corrigirCumprimento, lojaAberta, saudacaoDoHorario, textoHorario, type HorarioLoja } from "@/lib/ia/horario";
import { fatosDoEstoque, INSTRUCOES_INTERPRETAR, INSTRUCOES_REDIGIR, montarEntrada } from "@/lib/ia/modelo-openai";
import { executarFluxo } from "@/lib/ia/fluxo";
import {
  consultaDeEstoque,
  deteccaoDeInjecao,
  interpretar,
  limiteDaMensagem,
  redigirComEstoque,
  afirmaDisponibilidade,
  afirmacoesSemFonte,
  TEXTO_TRANSFERENCIA,
  travaDeFatos,
  produtosNaoConfirmados,
  ofereceSemEstoque,
  validadorDeResposta,
  type Ctx as CtxPipeline,
  type Deps,
  type SaidaModelo,
} from "@/lib/ia/pipeline";
import { registrarInteresse } from "@/lib/servicos/interesses";
import { detectarMomento, instrucaoDeFechamento, listaDeDados, MOMENTOS_SEM_TRANSFERIR, notaDeEntrega, parabens, PERGUNTAS_ENTREGA_OU_RETIRADA, PERGUNTA_PARCELAS, PERGUNTA_TEM_MODELO, PERGUNTAS_FALTA, PERGUNTAS_KM, PERGUNTAS_VISITA, simulacaoPedida, textoSimulacao, RX_JA_PERGUNTOU_FALTA, RX_PARABENS, RX_PEDE_PESSOA, RX_PERGUNTA_USO_KM, pediuDadosDeRetirada, tirarPropostaAntiga, ultimaFalaDaLoja, textoDadosRecebidos, tirarAdiamento, type Momento } from "@/lib/ia/fechamento";
import { instrucaoDeIntencao, intencaoDoTexto, PERGUNTAS_INTENCAO, RX_DETALHE_PROBLEMA, RX_IRRITADO, RX_NAO_PODE_VIR, RX_RECADO, textoPosVenda, textoRecado, tirarOfertaDeProduto, type Intencao } from "@/lib/ia/intencao";
import { instrucaoDeMidia, planejarApresentacao, planejarOpcoes, planejarPedido, tirarPromessaDeMidia, ultimaCitada, type ModeloComMidia, type PlanoMidia } from "@/lib/ia/midia-tipos";
import { artigo } from "@/lib/ia/estoque-tipos";
import { avancarEtapaPelaIa, criarNegocio } from "@/lib/servicos/negocios";
import { camposFaltando, enderecoDe, lerDadosDoCliente } from "@/lib/ia/dados-cliente";
import { registrarLog } from "@/lib/logs";
import { variantesTelefone } from "@/lib/mensageria/servico";
import { ROTULO_TEMPERATURA, temTroca, temperaturaDaIntencao, temperaturaDoLead, triagemDosFatos } from "@/lib/ia/qualificacao";
import { mensagemSistema } from "@/lib/mensageria/anotacoes";
import { lerBytes } from "@/lib/mensageria/midia";
import type { ConfigWorkflow } from "./grafo";
import type { ImplNo } from "./motor";
import { corNoTexto, formatarHistorico, nomeDoPerfil, RX_PERGUNTA_NOME, saudacaoComNome, variar, mesclarFatos, primeiroNome, quebrarEmBlocos, soCumprimento, tempoDigitando, textoDaMensagem, tirarCumprimentoRepetido, tirarEmojiDoInicio, type FatosLead } from "./util";
import { obterProvedor } from "@/lib/mensageria/provedores";
import { organizarTexto } from "@/lib/ia/organizar";
import { ETAPAS_ABERTAS, TIPOS_ELETRICOS } from "@/lib/dominio";

/* fora do horário ninguém assume agora: a IA avisa sem prometer atendimento imediato */
/* resposta barrada no meio da conversa, com a loja fechada: honesta, sem se apresentar de novo */
const TEXTO_CONFIRMAR = "Quero te responder isso certinho, então vou confirmar com a equipe e te retorno assim que a loja abrir 🙏 Enquanto isso, posso te ajudar com mais alguma coisa sobre as motos?";
/* Variações das frases prontas (pedido do dono, 27/09/2026: "não deixar tanto na cara que é IA, variando as mensagens") */
const semPontoFinal = (s: string) => s.trim().replace(/[.\s]+$/u, "");
/* Fase 2 do treinamento do Milton (P2, P3 e P4, 04/10/2026): ele se apresenta junto com o cumprimento, abre
   com "Como posso te ajudar?" e não pergunta o nome (o nome completo só vem na lista de dados do fechamento). */
const APRESENTACAO = ["Me chamo Milton, sou da Gêmeos Motors e vou te ajudar por aqui!", "Aqui é o Milton, da Gêmeos Motors, e vou te ajudar por aqui!", "Me chamo Milton, da Gêmeos Motors, e vou te ajudar por aqui!"];
const TUDO_CERTO = ["Tudo certo por aqui 😊 Como posso te ajudar?", "Tudo ótimo por aqui! Em que posso te ajudar? 🙂", "Por aqui tudo bem 😊 Me conta, o que você precisa?"];
const PRAZER: ((nome: string) => string)[] = [(n) => `Prazer, ${n}!`, (n) => `Prazer em te conhecer, ${n}!`, (n) => `Que bom falar com você, ${n}!`, (n) => `Muito prazer, ${n}!`];
const VARIANTES_FORA_HORARIO = [
  "Nossa equipe de vendas volta assim que a loja abrir, mas eu já te ajudo por aqui 😊 Pode me perguntar o que quiser sobre as motos.",
  "A loja está fechada agora, mas o atendimento continua por aqui 😊 Me conta o que você procura que eu te ajudo, e um vendedor te chama quando a loja abrir.",
  "Já anotei tudo! Um vendedor te responde assim que a loja abrir, e enquanto isso eu sigo te ajudando por aqui 🛵",
];
const VARIANTES_CONFIRMAR = [
  "Quero te passar essa informação certinha, então vou confirmar com a equipe e te retorno assim que a loja abrir 🙏 Enquanto isso, posso te ajudar com mais alguma coisa sobre as motos?",
  "Essa eu prefiro confirmar com a equipe para não te passar nada errado 🙏 Te retorno assim que a loja abrir. Quer saber mais alguma coisa enquanto isso?",
  "Vou checar esse detalhe com a equipe e te respondo certinho quando a loja abrir 🙏 Posso te ajudar em mais alguma coisa agora?",
];
const TEXTO_FORA_HORARIO = "Aqui é o Milton, assistente virtual da Gêmeos Motors 😊 Um vendedor te responde assim que a loja abrir, e enquanto isso eu te ajudo por aqui: pode me perguntar o que quiser sobre as motos.";
/* ============================================================
   OS NÓS DO WORKFLOW (o que cada caixinha da tela faz de verdade)
   Cada função recebe o contexto, faz uma coisa e devolve o ramo, a entrada e a
   saída que aparecem no log da execução. Resposta ao cliente só sai pelo nó
   "enviar", que usa enviarRespostaDaIa (permissão + validador + registro).
   ============================================================ */

type Conversa = typeof schema.conversas.$inferSelect;
type Mensagem = typeof schema.mensagens.$inferSelect;

export type CtxWorkflow = {
  conversaId: number;
  mensagemId: number | null;
  gatilho: string;
  simulado: boolean;
  config: ConfigWorkflow;
  conversa: Conversa | null;
  mensagem: Mensagem | null;
  /** texto desta mensagem (ou transcrição/descrição da mídia) */
  textoEntrada: string;
  /** mensagens do cliente juntas pelo buffer */
  textoBuffer: string;
  primeiraDoBuffer: number | null;
  memoria: { historico: string; fatos: FatosLead; resumo: string | null; limpaEm: Date | null };
  pipe: CtxPipeline | null;
  aprendido: { fatos: FatosLead; resumo: string | null };
  /** cumprimento de abertura (1º bloco), separado da resposta */
  saudacao: string | null;
  motivoTransferencia: string | null;
  blocos: string[];
  /** índice do bloco que cita a mensagem do cliente (-1 = nenhum) */
  citar: number;
  indice: number;
  enviados: number;
  /** foto e vídeo da moto que vão depois do texto (pedido do cliente ou 1ª vez que a moto aparece) */
  midia: PlanoMidia | null;
  /** momento da compra (interesse, decidido, objeção, entrega/retirada, dados): conduz até o fechamento */
  momento: Momento | null;
  /** a moto de que a conversa trata (a última que o cliente citou) */
  modeloDaConversa: string | null;
  /** o que o cliente quer: compra, assistência ou ainda não disse */
  intencao: Intencao | null;
  /** a conversa passou (ou vai passar, ao abrir a loja) para a equipe: o card vai para Aguardando equipe */
  aguardaEquipe: boolean;
  /** visita/test drive que a IA acabou de marcar (o card vai para Visita / test drive) */
  visitaAgendada: Date | null;
  /** manda o pino do mapa da loja depois do texto */
  mandarLocal: boolean;
  /** última mensagem da loja (IA ou vendedor), para saber a que pergunta o cliente está respondendo */
  ultimaDaLoja: string;
  /** assunto que não é compra nem assistência (recado, pedido de uma pessoa): a resposta é do sistema e vai para a equipe */
  recado?: boolean;
};

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

/* humanizado (pedido do dono, 27/09/2026): antes de cada bloco a IA "digita". No WhatsApp de verdade
   vai o sinal da Meta (três pontinhos + mensagem lida); na tela da equipe aparece o balão. Conversa
   simulada nunca fala com a Meta. */
async function mostrarDigitando(c: CtxWorkflow, ms: number) {
  await db.update(schema.conversas).set({ iaDigitandoAte: new Date(Date.now() + ms + 1500) }).where(eq(schema.conversas.id, c.conversaId));
  const simulada = c.simulado || !!c.conversa?.demo;
  if (!simulada && c.mensagem?.externoId && c.mensagem.direcao === "incoming") await (await obterProvedor({ demo: false })).digitando(c.mensagem.externoId);
}
const transcricaoDe = (m: Pick<Mensagem, "metadados">) => ((m.metadados ?? {}) as { transcricao?: string }).transcricao ?? null;

async function carregarConversa(id: number) {
  const [c] = await db.select().from(schema.conversas).where(eq(schema.conversas.id, id)).limit(1);
  if (!c) throw new Error(`Conversa ${id} não existe mais`);
  return c;
}

async function lerMemoria(conversaId: number) {
  const [m] = await db.select().from(schema.iaMemorias).where(eq(schema.iaMemorias.conversaId, conversaId)).limit(1);
  return m ?? null;
}

async function gravarMemoria(conversaId: number, v: Partial<typeof schema.iaMemorias.$inferInsert>) {
  await db
    .insert(schema.iaMemorias)
    .values({ conversaId, ...v })
    .onConflictDoUpdate({ target: schema.iaMemorias.conversaId, set: { ...v, atualizadoEm: new Date() } });
}

export async function apagarMemoria(conversaId: number) {
  await gravarMemoria(conversaId, { fatos: {}, resumo: null, limpaEm: new Date() });
}

async function enviar(c: CtxWorkflow, texto: string, citar = false, gravarFalha = true) {
  const respostaA = citar && c.mensagem ? { id: c.mensagem.id, externoId: c.mensagem.externoId } : undefined;
  /* a conta de economia do uso deste cliente (feita pelo sistema) também é fonte para a trava de valores */
  const kmSemana = kmDoCliente(c);
  const fontesExtras = kmSemana ? [(await catalogoParaIa({ incluirTeste: !!c.conversa?.demo, kmSemana, gasolina: await gasolinaDoCliente(c) })).texto] : [];
  return enviarRespostaDaIa(db, { conversaId: c.conversaId, telefone: c.conversa!.contatoTelefone, texto, origem: c.simulado ? "workflow (teste)" : "workflow", simulado: c.simulado || !!c.conversa?.demo, respostaA, gravarFalha, fontesExtras });
}

/* ---------------- agente: o gerador que o pipeline usa, com memória e fatos ---------------- */
const esquemaAgente = z.object({
  mensagem: z.string().nullable(),
  consultaEstoque: z.object({ termo: z.string() }).nullable(),
  transferir: z.boolean(),
  motivoTransferencia: z.string().nullable(),
  fatos: z.object({
    nome: z.string().nullable(),
    interesse: z.string().nullable(),
    uso: z.string().nullable(),
    pagamento: z.string().nullable(),
    troca: z.string().nullable(),
    cidade: z.string().nullable(),
    observacoes: z.string().nullable(),
  }),
  resumo: z.string(),
  saudacao: z.string().nullable(),
});

const INSTRUCOES_MEMORIA = `# MEMÓRIA
Abaixo estão os FATOS já sabidos deste cliente e o HISTÓRICO recente da conversa. Use para não perguntar de novo o que o cliente já disse e para manter o fio da conversa.
Devolva também:
- fatos: o que você sabe do cliente AGORA (nome, interesse, uso, pagamento, troca, cidade, observacoes). Só o que o cliente disse; o que não se sabe fica null.
- resumo: 1 a 3 frases sobre o atendimento até aqui (interesse e situação), para o vendedor.
- motivoTransferencia: quando transferir for true, o motivo em uma frase; senão null.
- saudacao: SÓ quando for o começo da conversa (histórico vazio) ou a última mensagem foi há mais de 6 horas: um cumprimento caloroso e humano, no estilo do tom de voz, usando o cumprimento certo do horário (variando a frase), sem pergunta de nome. A apresentação do Milton o sistema põe junto. Ele vai como a primeira mensagem, sozinho; a resposta ao que o cliente perguntou continua em "mensagem". Nas outras vezes, null.`;

/* Quais trechos da resposta a trava barraria (para a reescrita acertar e a equipe entender o aviso). */
function trechosBarrados(ctx: CtxPipeline): string[] {
  const t = ctx.texto ?? "";
  const doCatalogo = new Set((ctx.deps.nomesDoCatalogo ?? []).map((n) => n.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()));
  const nomes = produtosNaoConfirmados(t, ctx.deps.nomesDeProdutos, ctx.estoque).filter((n) => !doCatalogo.has(n));
  const disp = afirmaDisponibilidade(t) ? [(t.match(/(?<![\p{L}\p{N}])(?:temos|tenho|tem\s+sim|h[aá]\s+sim|em\s+estoque|pronta\s+entrega|dispon[ií]ve(?:l|is))(?![\p{L}\p{N}])/iu) ?? [""])[0]] : [];
  return [...nomes, ...disp, ...ofereceSemEstoque(t, ctx.deps), ...afirmacoesSemFonte(t, ctx.deps.fontesAutorizadas)].filter(Boolean).slice(0, 5);
}

/* Qualificação automática do lead (pedido do dono, 27/09/2026: converter venda). Com o que a IA
   aprendeu: cadastra o cliente (quando já sabe o nome), abre o negócio no funil, preenche o que estiver
   vazio e marca a temperatura (quente/morno/frio) na triagem da conversa. Só anota no chat quando algo
   importante muda. Nunca apaga o que a equipe preencheu. */
async function qualificarLead(c: CtxWorkflow, fatos: FatosLead, resumo: string | null) {
  const cv = await carregarConversa(c.conversaId);
  const feito: string[] = [];
  let clienteId = cv.clienteId;
  /* fase 2: o nome não é perguntado. Sem o nome dito pelo cliente, vale o do perfil do WhatsApp; quem quer
     comprar e não tem nome no perfil entra pelo telefone (o funil precisa do cadastro). O nome completo chega
     na lista de dados do fechamento e troca o provisório. */
  const nome = fatos.nome?.trim() || (c.intencao ? nomeDoPerfil(cv.contatoNome) : null) || (c.intencao === "compra" ? formatarTelefone(cv.contatoTelefone) : null);
  if (!clienteId && nome) {
    const tels = variantesTelefone(cv.contatoTelefone);
    const [achado] = await db
      .select({ id: schema.clientes.id })
      .from(schema.clientes)
      .where(sql`${schema.clientes.whatsapp} in (${sql.join(tels.map((v) => sql`${v}`), sql`, `)}) or ${schema.clientes.telefone} in (${sql.join(tels.map((v) => sql`${v}`), sql`, `)})`)
      .orderBy(schema.clientes.id)
      .limit(1);
    if (achado) clienteId = achado.id;
    else {
      const [novo] = await db
        .insert(schema.clientes)
        .values({ nome: nome.slice(0, 120), whatsapp: cv.contatoTelefone, origem: "whatsapp", cidade: fatos.cidade?.trim().slice(0, 80) || null, demo: cv.demo })
        .returning({ id: schema.clientes.id });
      clienteId = novo.id;
      await registrarLog(null, { acao: "cliente.criado", entidade: "cliente", entidadeId: novo.id, descricao: `A IA cadastrou o cliente ${nome} pelo WhatsApp` });
      feito.push(`cadastrou o cliente ${nome}`);
    }
    await db.update(schema.conversas).set({ clienteId, atualizadoEm: new Date() }).where(eq(schema.conversas.id, cv.id));
  }

  let negocioId = cv.negocioId;
  if (clienteId) {
    if (!negocioId) {
      const [aberto] = await db
        .select({ id: schema.negocios.id })
        .from(schema.negocios)
        .where(and(eq(schema.negocios.clienteId, clienteId), sql`${schema.negocios.etapa} in (${sql.join(ETAPAS_ABERTAS.map((e) => sql`${e}`), sql`, `)})`))
        .orderBy(desc(schema.negocios.criadoEm))
        .limit(1);
      negocioId = aberto?.id ?? null;
    }
    const troca = temTroca(fatos.troca);
    /* pós-venda não é venda: não abre negócio no funil (Diretrizes, 04/10/2026) */
    if (!negocioId && c.intencao === "compra") {
      negocioId = await criarNegocio(
        null,
        { clienteId, veiculoInteresse: fatos.interesse?.trim() || null, origem: "whatsapp", temTroca: !!troca, trocaDescricao: troca ? fatos.troca : null, responsavelId: null },
        { demo: cv.demo, triagemIa: resumo },
      );
      if (negocioId) feito.push("abriu o negócio no funil");
    } else {
      /* só completa o que está vazio: o que a equipe preencheu fica */
      const [n] = await db.select({ veiculoInteresse: schema.negocios.veiculoInteresse, trocaDescricao: schema.negocios.trocaDescricao }).from(schema.negocios).where(eq(schema.negocios.id, negocioId)).limit(1);
      const patch: Partial<typeof schema.negocios.$inferInsert> = {};
      if (n && !n.veiculoInteresse && fatos.interesse?.trim()) patch.veiculoInteresse = fatos.interesse.trim().slice(0, 160);
      if (n && !n.trocaDescricao && troca) Object.assign(patch, { temTroca: true, trocaDescricao: fatos.troca!.trim().slice(0, 300) });
      if (Object.keys(patch).length) await db.update(schema.negocios).set(patch).where(eq(schema.negocios.id, negocioId));
    }
    if (negocioId && negocioId !== cv.negocioId) await db.update(schema.conversas).set({ negocioId }).where(eq(schema.conversas.id, cv.id));
  }

  /* temperatura na triagem da conversa (a tela já mostra a "intenção de compra") */
  /* reclamação de pós-venda que vai para uma pessoa não é "lead quente" (teste de 04/10/2026) */
  const pediuProposta = c.intencao === "compra" && (c.pipe?.motivo === "modelo_pediu_transferencia" || ["decidido", "escolheu_entrega", "escolheu_retirada", "mandou_dados", "dados_parciais"].includes(c.momento ?? ""));
  const antes = temperaturaDaIntencao(cv.triagemIa?.intencaoCompra);
  const triagem = triagemDosFatos(fatos, resumo, cv.triagemIa ?? null, { pediuProposta });
  const temperatura = temperaturaDoLead(fatos, { pediuProposta });
  await db
    .update(schema.conversas)
    .set({ triagemIa: triagem, triagemEm: new Date(), atualizadoEm: new Date(), ...(temperatura === "quente" ? { prioridade: "alta" } : {}) })
    .where(eq(schema.conversas.id, cv.id));
  const virouQuente = temperatura === "quente" && antes !== "quente";
  if (virouQuente) feito.push("marcou o lead como quente");
  if (feito.length) await mensagemSistema(db, cv.id, `A IA ${feito.join(", ")}${virouQuente ? "" : ` (lead ${ROTULO_TEMPERATURA[temperatura].toLowerCase()})`}.`, { triagem: true });
  return { clienteId, negocioId, temperatura, feito };
}

/* Funil conectado à IA (pedido do dono, 03/10/2026): o card anda sozinho com a conversa, só para frente e
   só nas colunas da IA (avancarEtapaPelaIa confere). Interesse num modelo → Interessado; dados enviados
   para fechar → Aguardando equipe. Quem decide comprar tem o negócio ligado a uma unidade do estoque
   (sem reservar: quem separa é a equipe). */
async function conectarFunil(c: CtxWorkflow, negocioId: number | null) {
  if (!negocioId) return null;
  const feito: string[] = [];
  const modelo = c.modeloDaConversa;
  if (c.momento === "mandou_dados" || c.aguardaEquipe) {
    const motivo = c.momento === "mandou_dados" ? `o cliente mandou os dados para fechar${modelo ? ` a ${modelo}` : ""}` : (c.motivoTransferencia ?? "a conversa passou para a equipe");
    const r = await avancarEtapaPelaIa(negocioId, "equipe", motivo.slice(0, 200));
    if (r.mudou) feito.push("Aguardando equipe");
  } else if (c.visitaAgendada) {
    const r = await avancarEtapaPelaIa(negocioId, "visita", `${modelo ? `test drive da ${modelo}` : "visita à loja"} marcado para ${quandoPorExtenso(c.visitaAgendada)}`);
    if (r.mudou) feito.push("Visita / test drive");
  } else if (c.intencao === "compra" && modelo) {
    const r = await avancarEtapaPelaIa(negocioId, "interessado", `interesse na ${modelo}`);
    if (r.mudou) feito.push("Interessado");
  }
  if (modelo) {
    const [n] = await db.select({ veiculoInteresse: schema.negocios.veiculoInteresse }).from(schema.negocios).where(eq(schema.negocios.id, negocioId)).limit(1);
    if (n && !n.veiculoInteresse) await db.update(schema.negocios).set({ veiculoInteresse: modelo }).where(eq(schema.negocios.id, negocioId));
  }
  const decidiu = ["decidido", "escolheu_entrega", "escolheu_retirada", "dados_parciais", "mandou_dados"].includes(c.momento ?? "");
  if (decidiu && modelo && !c.conversa?.demo) {
    const ligada = await ligarMotoDoEstoque(negocioId, modelo);
    if (ligada) feito.push(`ligado à ${ligada}`);
  }
  return feito.length ? feito : null;
}

/* Tarefa de simulação para o vendedor (P5/P19): modelo, preço de tabela, parcelas e bandeira. A IA nunca
   calcula parcela; quem manda os valores é o vendedor, na mesma conversa. */
async function criarTarefaSimulacao(c: CtxWorkflow, sim: { parcelas: number | null; bandeira: string | null }, modelo: string | null) {
  const cv = await carregarConversa(c.conversaId);
  let preco: string | null = null;
  if (modelo) {
    const [m] = await db.select({ preco: schema.modelos.precoTabela }).from(schema.modelos).where(sql`lower(${schema.modelos.nome}) = ${modelo.toLowerCase()}`).limit(1);
    if (m?.preco) preco = reais(Number(m.preco));
  }
  const pedido = [sim.parcelas ? `${sim.parcelas}x` : "parcelas a confirmar", sim.bandeira ? `no ${sim.bandeira}` : "bandeira a confirmar", modelo, preco].filter(Boolean).join(" · ");
  const nome = primeiroNome(c.aprendido.fatos.nome || c.memoria.fatos.nome) ?? cv.contatoNome ?? "cliente";
  await db.insert(schema.followUps).values({
    conversaId: c.conversaId,
    clienteId: cv.clienteId,
    negocioId: cv.negocioId,
    usuarioId: cv.responsavelId,
    agendadoPara: new Date(),
    notas: `Fazer a simulação no cartão para ${nome}: ${pedido}. Mandar os valores na conversa (a IA não calcula parcela).`,
    tipo: "simulacao",
    motivo: `Simulação no cartão: ${pedido}`,
    origem: "ia",
    modeloId: null,
    contexto: { detectadoPor: "ia", parcelas: sim.parcelas, bandeira: sim.bandeira, modelo },
  });
  await mensagemSistema(db, c.conversaId, `SIMULAÇÃO PARA O VENDEDOR: ${pedido}. Mande os valores ao cliente nesta conversa.`, { triagem: true });
}

/** "segunda a sábado, das 8h às 18h" a partir do horário da loja (tela da IA). */
function horarioCurto(h: HorarioLoja) {
  return textoHorario(h)
    .split("\n")
    .map((l) => /^(.+?): das (.+?) às (.+?) \(/.exec(l))
    .filter((m): m is RegExpExecArray => !!m)
    .map((m) => `${m[1].toLowerCase()}, das ${m[2]} às ${m[3]}`)
    .join(" e ");
}

/* Visita / test drive marcado pela IA (pedido do dono, 03/10/2026). Usa o mesmo serviço da equipe (conflito
   de horário, histórico, conversa). Nunca diz que marcou sem ter marcado: falta dia ou hora, horário fora
   do funcionamento ou ocupado, ele pergunta de novo. */
async function agendarVisitaPelaIa(c: CtxWorkflow, p: { modelo: string | null; nome: string | null; horario: HorarioLoja }): Promise<{ texto: string; quando: Date | null; erro?: string }> {
  const dh = dataHoraDaVisita(c.textoBuffer);
  const funciona = horarioCurto(p.horario);
  if (!dh.temDia) return { texto: `Perfeito! Qual dia fica melhor pra você vir? Funcionamos ${funciona} 😊`, quando: null };
  if (!dh.temHora || !dh.quando) return { texto: `Show! E que horas fica melhor pra você? Funcionamos ${funciona} 😊`, quando: null };
  const quando = dh.quando;
  if (quando.getTime() < Date.now() + 15 * 60_000) return { texto: "Esse horário já passou 😅 Qual outro dia e horário fica bom pra você?", quando: null };
  /* a loja precisa estar aberta na hora marcada e meia hora depois */
  if (!lojaAberta(p.horario, quando) || !lojaAberta(p.horario, new Date(quando.getTime() + 30 * 60_000)))
    return { texto: `Nesse horário a loja está fechada 😕 Funcionamos ${funciona}. Qual outro horário fica bom pra você?`, quando: null };
  let modeloId: number | null = null;
  if (p.modelo) {
    const [m] = await db.select({ id: schema.modelos.id }).from(schema.modelos).where(sql`lower(${schema.modelos.nome}) = ${p.modelo.toLowerCase()}`).limit(1);
    modeloId = m?.id ?? null;
  }
  try {
    await criarTestDrive(null, {
      conversaId: c.conversaId,
      modeloId,
      veiculoDescricao: modeloId ? undefined : p.modelo ?? "Visita à loja",
      agendadoPara: quando,
      observacoes: "Marcado pela IA no WhatsApp.",
    });
  } catch (e) {
    if (e instanceof ErroRegra) return { texto: "Esse horário já está reservado 😕 Pode ser um pouco antes ou depois?", quando: null, erro: e.message };
    throw e;
  }
  const quem = p.nome ? `, ${p.nome}` : "";
  const moto = p.modelo ? ` ${artigo(p.modelo).toUpperCase()} *${p.modelo}* vai estar te esperando pro test drive 🛵` : "";
  return { texto: `Agendado ✅ Te esperamos ${quandoPorExtenso(quando)}${quem}, aqui na loja: ${LOCAL_LOJA.endereco}.${moto}`, quando };
}

/* Dados do pedido no CRM (pedido do dono, 03/10/2026: "o objetivo da IA é pegar essas informações e
   guardar no CRM, com o resumo, para daí em diante a equipe assumir"). O que o cliente mandou vai para o
   cadastro dele; o resumo do pedido (sem CPF nem data de nascimento) vai para o negócio e para a conversa;
   o que faltou fica escrito para a equipe conferir. Entrega fora de Goiana: a IA não sabe se atende nem a
   taxa, então cria a tarefa para a equipe confirmar. Nada aqui manda mensagem ao cliente. */
async function salvarDadosDoPedido(c: CtxWorkflow, clienteId: number | null, negocioId: number | null) {
  if (!clienteId || (c.momento !== "mandou_dados" && c.momento !== "dados_parciais")) return null;
  const d = lerDadosDoCliente(c.textoBuffer);
  const modo = pediuDadosDeRetirada(c.ultimaDaLoja) ? ("retirada" as const) : ("entrega" as const);
  const fatos = { ...c.memoria.fatos, ...c.aprendido.fatos };
  const cidade = d.cidade ?? fatos.cidade ?? null;
  const [cli] = await db.select().from(schema.clientes).where(eq(schema.clientes.id, clienteId)).limit(1);
  if (!cli) return null;
  const avisos: string[] = [];
  const patch: Partial<typeof schema.clientes.$inferInsert> = {};
  /* nome provisório (o telefone, quando o perfil não tinha nome) também é trocado */
  if (d.nomeCompleto && (d.nomeCompleto.length > cli.nome.length || /\d/.test(cli.nome))) patch.nome = d.nomeCompleto;
  if (d.cpf && !cli.cpf) {
    const [outro] = await db.select({ id: schema.clientes.id }).from(schema.clientes).where(and(eq(schema.clientes.cpf, d.cpf), ne(schema.clientes.id, clienteId))).limit(1);
    if (outro) avisos.push("o CPF informado já está no cadastro de outro cliente: conferir");
    else patch.cpf = d.cpf;
  } else if (d.cpf && cli.cpf && cli.cpf !== d.cpf) avisos.push("o CPF informado é diferente do que já está no cadastro: conferir");
  if (d.telefone && !cli.telefone) patch.telefone = d.telefone;
  if (d.nascimento && !cli.nascimento) patch.nascimento = d.nascimento;
  /* endereço de entrega: o que o cliente acabou de mandar vale */
  if (modo === "entrega") {
    if (d.cep) patch.cep = d.cep;
    if (d.rua) patch.endereco = d.rua;
    if (d.numero) patch.numero = d.numero;
    if (d.bairro) patch.bairro = d.bairro;
    if (cidade) patch.cidade = cidade;
  }
  if (Object.keys(patch).length) await db.update(schema.clientes).set({ ...patch, atualizadoEm: new Date() }).where(eq(schema.clientes.id, clienteId));

  const faltam = camposFaltando(d, modo, { cidade, pagamento: fatos.pagamento });
  const linhas = [
    `Pedido pelo WhatsApp (IA): ${c.modeloDaConversa ?? "moto"}`,
    modo === "entrega"
      ? `Entrega: ${enderecoDe(d, cidade) || "endereço a confirmar"}${d.referencia ? ` (referência: ${d.referencia})` : ""}${d.horario ? ` · receber até: ${d.horario}` : ""}`
      : `Retirada na loja: ${d.horario ?? "dia e horário a confirmar"}`,
    `Pagamento: ${d.pagamento ?? fatos.pagamento ?? "a confirmar"}`,
    d.telefone ? "Outro telefone de contato no cadastro" : null,
    patch.cpf || patch.nascimento ? "CPF e data de nascimento salvos no cadastro" : null,
    faltam.length ? `Faltou: ${faltam.join(", ")}` : null,
    ...avisos.map((a) => `Atenção: ${a}`),
  ].filter((x): x is string => !!x);
  const resumoIa = c.aprendido.resumo ?? c.memoria.resumo;
  if (negocioId) {
    const [n] = await db.select({ observacoes: schema.negocios.observacoes }).from(schema.negocios).where(eq(schema.negocios.id, negocioId)).limit(1);
    const quando = new Date().toLocaleString("pt-BR", { timeZone: "America/Recife", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
    const bloco = `${quando} · ${linhas.join("\n")}`;
    await db
      .update(schema.negocios)
      .set({ observacoes: [n?.observacoes, bloco].filter(Boolean).join("\n\n").slice(-4000), ...(resumoIa ? { triagemIa: resumoIa } : {}), atualizadoEm: new Date() })
      .where(eq(schema.negocios.id, negocioId));
  }
  await mensagemSistema(db, c.conversaId, `Dados do pedido salvos no cadastro${patch.nome ? ` de ${patch.nome}` : ""}.\n${linhas.join("\n")}${resumoIa ? `\nResumo da IA: ${resumoIa}` : ""}`, { triagem: true });

  /* entrega fora de Goiana: a equipe confirma se atende e a taxa (a IA não inventa) */
  const tarefa = modo === "entrega" && cidade ? await tarefaEntregaFora(c, clienteId, negocioId, cidade, linhas.join(" · ")) : null;
  return { modo, salvos: Object.keys(patch), faltam, avisos, tarefa };
}

/** "moro em Itambé", "entrega em Itambé" → "Itambé" (o que o cliente escreveu, com a primeira letra maiúscula). */
function cidadeDoTexto(texto: string) {
  const m = /\b(?:moro em|moro no|moro na|sou de|entrega(?:r)? (?:em|no|na|pra|para)|receber em|aqui em)\s+([\p{L}][\p{L}' -]{1,40}?)(?=[,.!?\n]|$)/iu.exec(texto);
  return m ? m[1].trim().replace(/^\p{L}/u, (l) => l.toUpperCase()) : null;
}

/** Follow-up para a equipe confirmar entrega fora de Goiana (cidade, taxa e prazo). Um por conversa. */
async function tarefaEntregaFora(c: CtxWorkflow, clienteId: number | null, negocioId: number | null, cidade: string, detalhe: string) {
  if (/goiana/i.test(cidade.normalize("NFD").replace(/\p{M}/gu, ""))) return null;
  const [ja] = await db
    .select({ id: schema.followUps.id })
    .from(schema.followUps)
    .where(and(eq(schema.followUps.conversaId, c.conversaId), eq(schema.followUps.status, "pendente"), eq(schema.followUps.tipo, "entrega")))
    .limit(1);
  if (ja) return null;
  const cv = await carregarConversa(c.conversaId);
  await db.insert(schema.followUps).values({
    conversaId: c.conversaId,
    clienteId: clienteId ?? cv.clienteId,
    negocioId: negocioId ?? cv.negocioId,
    usuarioId: cv.responsavelId,
    agendadoPara: new Date(),
    notas: `Confirmar se a loja entrega em ${cidade}, a taxa e o prazo, e avisar o cliente. ${detalhe}`.slice(0, 1000),
    tipo: "entrega",
    motivo: `Entrega em ${cidade}: confirmar atendimento e taxa`,
    origem: "ia",
    contexto: { detectadoPor: "ia", cidade, modelo: c.modeloDaConversa },
  });
  await mensagemSistema(db, c.conversaId, `FOLLOW-UP PENDENTE: confirmar se a loja entrega em ${cidade} e a taxa.`);
  return `entrega em ${cidade}`;
}

/* Pedido de 05/10/2026: "quando a pessoa mandar um Oi e não responder mais nada, programa um follow-up 10 min
   depois, 1 h depois e 23 h depois — só que ele não dispara a mensagem". Quando o cliente só cumprimentou (não
   disse o que quer) e a IA respondeu, nascem 3 follow-ups para a EQUIPE chamar o cliente; nada sai sozinho para o
   WhatsApp. Se o cliente voltar a falar, os que ainda não venceram são cancelados (e, se ainda só cumprimentou,
   os 3 recomeçam a contar dali). 23 h fica dentro da janela de 24 h do WhatsApp para a equipe responder. */
export const LEMBRETES_SEM_RESPOSTA = [
  { minutos: 10, rotulo: "10 min" },
  { minutos: 60, rotulo: "1 h" },
  { minutos: 23 * 60, rotulo: "23 h" },
] as const;
async function lembretesSemResposta(c: CtxWorkflow, clienteId: number | null, negocioId: number | null) {
  const F = schema.followUps;
  const agora = new Date();
  /* os lembretes antigos desta conversa que ainda não venceram saem: o cliente falou de novo */
  await db
    .update(F)
    .set({ status: "cancelado", concluidoEm: agora })
    .where(and(eq(F.conversaId, c.conversaId), eq(F.status, "pendente"), sql`${F.contexto}->>'semResposta' = 'true'`, gt(F.agendadoPara, agora)));
  const soCumprimentou = !c.intencao && !c.recado && !c.pipe?.humano && !!c.pipe?.texto;
  if (!soCumprimentou) return null;
  const cv = await carregarConversa(c.conversaId);
  const nome = primeiroNome(c.memoria.fatos.nome || c.aprendido.fatos.nome) ?? primeiroNome(nomeDoPerfil(cv.contatoNome));
  await db.insert(F).values(
    LEMBRETES_SEM_RESPOSTA.map((l, i) => ({
      conversaId: c.conversaId,
      clienteId: clienteId ?? cv.clienteId,
      negocioId: negocioId ?? cv.negocioId,
      usuarioId: cv.responsavelId,
      agendadoPara: new Date(agora.getTime() + l.minutos * 60_000),
      notas: `${nome ?? "O cliente"} só cumprimentou e não respondeu mais. ${i + 1}º lembrete (${l.rotulo}): chame de novo na conversa${i === 2 ? " (último: depois de 24 h o WhatsApp só aceita mensagem modelo)" : ""}.`,
      tipo: "retorno_cliente",
      motivo: `Sem resposta depois do cumprimento (${l.rotulo})`,
      origem: "ia",
      contexto: { semResposta: true, etapa: i + 1, detectadoPor: "ia" },
    })),
  );
  return { lembretes: LEMBRETES_SEM_RESPOSTA.length };
}

/** Liga o negócio a uma unidade disponível do modelo que ainda não está em outra negociação aberta. */
async function ligarMotoDoEstoque(negocioId: number, modeloNome: string) {
  const [neg] = await db.select({ veiculoId: schema.negocios.veiculoId, valorAnunciado: schema.negocios.valorAnunciado }).from(schema.negocios).where(eq(schema.negocios.id, negocioId)).limit(1);
  if (!neg || neg.veiculoId) return null;
  const v = schema.veiculos;
  const [mod] = await db.select({ id: schema.modelos.id }).from(schema.modelos).where(sql`lower(${schema.modelos.nome}) = ${modeloNome.toLowerCase()}`).limit(1);
  const doModelo = mod ? sql`(${v.modeloId} = ${mod.id} or (${v.modeloId} is null and lower(trim(${v.modelo})) = ${modeloNome.toLowerCase()}))` : sql`lower(trim(${v.modelo})) = ${modeloNome.toLowerCase()}`;
  const unidades = await db
    .select({ id: v.id, cor: v.cor, valor: v.valorAnunciado })
    .from(v)
    .where(and(eq(v.status, "disponivel"), eq(v.teste, false), doModelo, sql`not exists (select 1 from negocios n where n.veiculo_id = ${v.id} and n.id <> ${negocioId} and n.etapa in (${sql.join(ETAPAS_ABERTAS.map((e) => sql`${e}`), sql`, `)}))`))
    .orderBy(v.id)
    .limit(1);
  const livre = unidades[0];
  if (!livre) return null;
  const descricao = `${modeloNome}${livre.cor ? ` ${livre.cor}` : ""}`;
  await db.transaction(async (tx) => {
    await tx.update(schema.negocios).set({ veiculoId: livre.id, valorAnunciado: neg.valorAnunciado ?? livre.valor, atualizadoEm: new Date() }).where(eq(schema.negocios.id, negocioId));
    await tx.insert(schema.negocioEventos).values({ negocioId, tipo: "veiculo", descricao: `A IA ligou o negócio à unidade ${descricao} do estoque (sem reservar)`, usuarioId: null, dados: { veiculoId: livre.id, ia: true } });
  });
  return descricao;
}

/* Roda a trava de fatos e o validador sobre a resposta; se barrariam, devolve a instrução de correção. */
async function motivoDoBloqueio(ctx: CtxPipeline): Promise<string | null> {
  const trava = await travaDeFatos.rodar(ctx);
  if (trava.encerrar) {
    const trechos = trechosBarrados(ctx);
    const quais = trechos.length ? ` Trechos barrados: ${trechos.map((x) => `"${x}"`).join(", ")}.` : "";
    return (trava.detalhe === "sem_fonte_autorizada"
      ? "Você citou horário ou endereço que não está na base de conhecimento. Reescreva sem citar horário nem endereço."
      : 'Você ofereceu moto que NÃO tem unidade no estoque, afirmou estoque ("temos", "disponível", "pronta entrega") sem unidade, ou citou marca ou modelo que não está no CATÁLOGO DA LOJA. Reescreva: ofereça só as motos marcadas EM ESTOQUE, com as cores delas; moto sem unidade só se o cliente perguntou por ela, dizendo que no momento não tem e oferecendo anotar o interesse. Continue ajudando o cliente e faça UMA pergunta para avançar a venda.') + quais;
  }
  const v = validarResposta(ctx.texto, { promptSistema: ctx.deps.promptSistema, fontesAutorizadas: ctx.deps.fontesAutorizadas });
  if (!v.aprovada) return `O validador reprovou a resposta: ${v.violacoes.map((x) => `${x.rotulo} (${x.detalhe})`).join("; ")}. Reescreva corrigindo isso, curta e organizada.`;
  return null;
}

function criarGerador(p: { promptSistema: string; memoria: CtxWorkflow["memoria"]; agora: string }) {
  const chamadas: { etapa: string; saida: unknown; ms: number }[] = [];
  let ultimo: z.infer<typeof esquemaAgente> | null = null;
  let ultimoErro: string | null = null;
  let correcao: string | null = null;
  const blocoMemoria = `${p.agora}

${INSTRUCOES_MEMORIA}\n\n## FATOS\n${JSON.stringify(p.memoria.fatos)}\n\n## RESUMO ANTERIOR\n${p.memoria.resumo ?? "(nenhum)"}\n\n## HISTÓRICO (mais antigo primeiro)\n${p.memoria.historico || "(primeira conversa)"}`;
  const gerar: Deps["gerar"] = async ({ mensagemCliente, estoque }) => {
    const t0 = Date.now();
    const etapa = estoque ? "redigir_com_estoque" : "interpretar";
    let r: z.infer<typeof esquemaAgente>;
    try {
      r = await gerarObjeto({
        schema: esquemaAgente,
        maxTokens: 900,
        sistema: `${p.promptSistema}\n\n${etapa === "interpretar" ? INSTRUCOES_INTERPRETAR : INSTRUCOES_REDIGIR}\n\n${blocoMemoria}${correcao ? `\n\n# CORREÇÃO OBRIGATÓRIA (sua resposta anterior foi barrada)\n${correcao}` : ""}`,
        prompt: estoque ? `${montarEntrada(mensagemCliente)}\n\n# DADOS DO ESTOQUE\n${fatosDoEstoque(estoque)}` : montarEntrada(mensagemCliente),
      });
    } catch (e) {
      ultimoErro = e instanceof Error ? e.message : String(e);
      throw e;
    }
    ultimo = r;
    chamadas.push({ etapa, saida: r, ms: Date.now() - t0 });
    return { mensagem: r.mensagem, consultaEstoque: r.consultaEstoque, transferir: r.transferir } satisfies SaidaModelo;
  };
  const saudacao = () => (chamadas.map((c) => (c.saida as { saudacao?: string | null }).saudacao).find((x) => !!x?.trim()) ?? null) as string | null;
  return { gerar, chamadas, saudacao, erro: () => ultimoErro, ultimo: () => ultimo as z.infer<typeof esquemaAgente> | null, corrigir: (texto: string) => void (correcao = texto) };
}

const PERGUNTA_ECONOMIA = /gasolin|econom|vale a pena|compensa|gast[oa]r?\b|gasto/iu;

/** Nomes das motos e acessórios do catálogo (para saber se o cliente já falou de produto). */
async function nomesDoCatalogo() {
  const linhas = await db.select({ nome: schema.modelos.nome }).from(schema.modelos).where(eq(schema.modelos.ativo, true));
  return linhas.map((l) => l.nome);
}

/** O que o cliente quer, pelo que ELE escreveu (esta mensagem, as anteriores e o interesse já anotado). */
async function intencaoDoCliente(c: CtxWorkflow): Promise<Intencao | null> {
  return intencaoDoTexto([c.memoria.fatos.interesse ?? "", textoDoCliente(c)].join("\n"), await nomesDoCatalogo());
}

/* Pedido do dono (02/10/2026): na abordagem, primeiro ENTENDER o que o cliente quer. Quem só cumprimentou
   ou disse o nome pode querer garantia, assistência ou peça: nada de moto, preço, estoque ou foto ainda.
   Sai a frase que oferece produto e as perguntas saem; fica UMA, aberta: "Como posso te ajudar?" (fase 2:
   o nome não é mais a pergunta). */
async function entenderPrimeiro(resposta: string[], intencao: Intencao | null, c?: CtxWorkflow): Promise<string[]> {
  if (intencao || c?.recado) return resposta;
  const nomes = await nomesDoCatalogo();
  let r = resposta.map((b) => tirarOfertaDeProduto(b, nomes)).filter((b) => /\p{L}/u.test(b));
  r = r
    .map((b) => (b.match(/[^.!?\n]+[.!?]*\s*(?:\p{Extended_Pictographic}\uFE0F?\s*)*/gu) ?? [b]).filter((f) => !/\?/.test(f)).join("").trim())
    .filter((b) => /\p{L}/u.test(b));
  /* a resposta já convida o cliente a contar ("Me conta o que você precisa."): não repete a pergunta (teste de 04/10/2026) */
  if (r.some((b) => /me\s+conta\s+o\s+que\s+(?:você|vc)\s+precisa|me\s+diz\s+o\s+que\s+(?:você|vc)\s+precisa/iu.test(b))) return r;
  return [...r, variar(PERGUNTAS_INTENCAO)];
}


const FRASES_RX = /(?:[^.!?\n]|[.!?](?=\d))+[.!?]*\s*(?:\p{Extended_Pictographic}\uFE0F?\s*)*/gu;
/** Tira as perguntas dos blocos (a pergunta certa do momento entra no fim). */
function semPerguntas(resposta: string[]) {
  return resposta
    .map((b) => (/\n/.test(b) ? b : (b.match(FRASES_RX) ?? [b]).filter((f) => !/\?/.test(f)).join("").trim()))
    .filter((b) => /\p{L}/u.test(b) && !/\?\s*(?:\p{Extended_Pictographic}\uFE0F?\s*)*$/u.test(b));
}

/* Pedido do dono (03/10/2026): o Milton conduz até o fechamento. A IA já recebe a instrução do momento;
   aqui o sistema garante a pergunta certa no fim, mesmo que ela esqueça. Uma pergunta por resposta. */
function conduzirFechamento(c: CtxWorkflow, resposta: string[]): string[] {
  const fatos = { ...c.memoria.fatos, ...c.aprendido.fatos };
  switch (c.momento) {
    case "interesse": {
      /* já perguntou "o que falta?" na última mensagem: não repete */
      if (RX_JA_PERGUNTOU_FALTA.test(c.ultimaDaLoja)) return resposta;
      const ultima = resposta[resposta.length - 1] ?? "";
      if (RX_JA_PERGUNTOU_FALTA.test(ultima)) return resposta;
      /* pergunta de uso/km, ou nenhuma: vira a de fechamento */
      if (!/\?/.test(resposta.join(" ")) || RX_PERGUNTA_USO_KM.test(ultima)) return [...semPerguntas(resposta), variar(PERGUNTAS_FALTA)];
      return resposta;
    }
    case "decidido": {
      const corpo = semPerguntas(resposta);
      const comParabens = corpo.some((b) => RX_PARABENS.test(b)) ? corpo : [variar(parabens(c.modeloDaConversa)), ...corpo.filter((b) => !/R\$|autonomia|km/iu.test(b))];
      return [...comParabens, variar(PERGUNTAS_ENTREGA_OU_RETIRADA)];
    }
    case "objecao_preco": {
      /* sem saber quanto ele roda, não dá para fazer a conta: pergunta os km */
      if (kmDoCliente(c) || resposta.some((b) => /km/iu.test(b) && /\?/.test(b))) return resposta;
      return [...semPerguntas(resposta), variar(PERGUNTAS_KM)];
    }
    case "informou_km":
      /* a conta certa já entrou (garantirEconomia); a conversa volta para o fechamento */
      return [...semPerguntas(resposta), variar(PERGUNTAS_FALTA)];
    case "quer_visitar":
      return [...semPerguntas(resposta), variar(PERGUNTAS_VISITA)];
    case "sem_modelo":
      return [...semPerguntas(resposta), PERGUNTA_TEM_MODELO];
    case "quer_parcelar":
      return [...semPerguntas(resposta), PERGUNTA_PARCELAS];
    case "escolheu_entrega": {
      const nota = notaDeEntrega(fatos.cidade);
      return [listaDeDados("entrega", { cidade: fatos.cidade, pagamento: fatos.pagamento }), ...(nota ? [nota] : [])];
    }
    case "escolheu_retirada":
      return [listaDeDados("retirada", {})];
    default:
      return resposta;
  }
}

async function garantirEconomia(c: CtxWorkflow, resposta: string[]): Promise<string[]> {
  const kmSemana = kmDoCliente(c);
  /* conta pronta quando o cliente fala de gasto/economia ou acha caro (objeção de preço) */
  if (!kmSemana || !resposta.length || !(PERGUNTA_ECONOMIA.test(c.textoBuffer) || c.momento === "objecao_preco" || c.momento === "informou_km")) return resposta;
  /* a conta é sempre a do sistema (a IA já trocou "por mês" por "por semana"): as frases de valores dela
     saem e entra a frase pronta, com a moto, a semana e o mês. A moto escolhida olha a resposta original. */
  const respostaOriginal = resposta;
  const ehConta = (f: string) => /R\$/u.test(f) && /luz|gasolin|econom|carga|m[êe]s|semana|gast/iu.test(f);
  resposta = resposta
    .map((b) => (/\n/.test(b) ? b : (b.match(/[^.!?]+[.!?]*\s*(?:\p{Extended_Pictographic}️?\s*)*/gu) ?? [b]).filter((f) => !ehConta(f)).join("").trim()))
    .filter((b) => /\p{L}/u.test(b));
  const m = schema.modelos;
  const v = schema.veiculos;
  const [modelos, unidades, base] = await Promise.all([
    db.select({ id: m.id, nome: m.nome, preco: m.precoTabela, ficha: m.ficha }).from(m).where(and(eq(m.ativo, true), eq(m.mostrarNoSite, true), inArray(m.tipo, [...TIPOS_ELETRICOS]))),
    db.select({ modeloId: v.modeloId, modelo: v.modelo }).from(v).where(and(eq(v.status, "disponivel"), inArray(v.tipo, [...TIPOS_ELETRICOS]), c.conversa?.demo ? undefined : eq(v.teste, false))),
    db.select({ conteudo: schema.iaConhecimento.conteudo }).from(schema.iaConhecimento).where(eq(schema.iaConhecimento.ativo, true)),
  ]);
  const pBase = lerParametrosEconomia(base.map((b) => b.conteudo));
  if (!pBase) return respostaOriginal;
  const p = comGasolinaDaRegiao(pBase, await gasolinaDoCliente(c));
  const lista = modelos
    .map((x) => ({ ...x, autonomia: autonomiaMinima((x.ficha as Record<string, string> | null)?.autonomia), temEstoque: unidades.some((u) => u.modeloId === x.id || (!u.modeloId && u.modelo.trim().toLowerCase() === x.nome.trim().toLowerCase())) }))
    .filter((x): x is typeof x & { autonomia: number } => !!x.autonomia);
  const texto = respostaOriginal.join(" ").toLowerCase();
  const doCliente = [...(c.memoria.historico ?? "").split(/\n\s*\n/).filter((l) => l.startsWith("Lead:")), c.textoBuffer].join("\n").toLowerCase();
  const citado = (t: string) => lista.filter((x) => corNoTexto(x.nome, t) || t.includes(x.nome.toLowerCase())).sort((a, b) => t.indexOf(a.nome.toLowerCase()) - t.indexOf(b.nome.toLowerCase()))[0];
  /* a moto da conta: a que a resposta cita, a que o cliente citou, ou a mais barata COM unidade no estoque
     que aguenta o dia dele (moto sem unidade o sistema não oferece: regra do dono, 02/10/2026) */
  const porDia = kmSemana / 7;
  const escolhida =
    citado(texto) ??
    citado(doCliente) ??
    lista.filter((x) => x.temEstoque && x.autonomia >= porDia).sort((a, b) => Number(a.preco ?? 1e9) - Number(b.preco ?? 1e9))[0];
  if (!escolhida) return respostaOriginal;
  const frase = fraseEconomia(escolhida.nome, escolhida.autonomia, kmSemana, p);
  if (!resposta.length) return [frase];
  let r = [...resposta];
  const ultimo = r[r.length - 1];
  const clienteEscolheu = !!citado(doCliente);
  /* pergunta de cor antes da escolha da moto vira convite para conhecer a moto da conta */
  if (!clienteEscolheu && /\bcor(?:es)?\b[^?]*\?/iu.test(ultimo)) r[r.length - 1] = `Quer conhecer melhor ${artigo(escolhida.nome)} *${escolhida.nome}*? 😊`;
  if (/\?/u.test(r[r.length - 1])) r = [...r.slice(0, -1), frase, r[r.length - 1]];
  else r.push(frase);
  return r;
}

/** Quanto este cliente roda por semana, pelo que ELE escreveu na conversa (a última menção vale). */
function textoDoCliente(c: CtxWorkflow) {
  return [...(c.memoria.historico ?? "").split(/\n\s*\n/).filter((l) => l.startsWith("Lead:")), c.textoBuffer].join("\n");
}
function kmDoCliente(c: CtxWorkflow) {
  return kmPorSemana(textoDoCliente(c));
}
/** Preço da gasolina (ANP) para a região do cliente: a cidade que ele citou ou que a IA anotou; senão a média do estado da loja. */
function gasolinaDoCliente(c: CtxWorkflow) {
  const cidade = c.aprendido?.fatos?.cidade || c.memoria.fatos.cidade;
  return gasolinaPara({ cidade, textoDoCliente: textoDoCliente(c) }).catch(() => null);
}

/** Motos com unidade disponível e a mídia de cada uma: a foto do WhatsApp do modelo ou, sem ela, a foto
 *  de cada cor do estoque (sem foto da cor, a principal do modelo) e o vídeo do catálogo. Conversa simulada enxerga os veículos de teste. */
async function motosComMidia(c: CtxWorkflow): Promise<ModeloComMidia[]> {
  const m = schema.modelos;
  const v = schema.veiculos;
  const k = schema.modeloCores;
  const [modelos, unidades, cores] = await Promise.all([
    db.select({ id: m.id, nome: m.nome, fotoUrl: m.fotoUrl, fotoWhatsappUrl: m.fotoWhatsappUrl, videoUrl: m.videoUrl }).from(m).where(and(eq(m.ativo, true), inArray(m.tipo, [...TIPOS_ELETRICOS]))),
    db.select({ modeloId: v.modeloId, modelo: v.modelo, cor: v.cor }).from(v).where(and(eq(v.status, "disponivel"), inArray(v.tipo, [...TIPOS_ELETRICOS]), c.conversa?.demo ? undefined : eq(v.teste, false))),
    db.select({ modeloId: k.modeloId, nome: k.nome, fotoUrl: k.fotoUrl }).from(k),
  ]);
  return modelos.flatMap((x) => {
    const minhas = unidades.filter((u) => u.modeloId === x.id || (!u.modeloId && u.modelo.trim().toLowerCase() === x.nome.trim().toLowerCase()));
    if (!minhas.length) return [];
    const coresEstoque = Array.from(new Set(minhas.map((u) => u.cor?.trim()).filter((cor): cor is string => !!cor)));
    /* foto só do WhatsApp (o panfleto da moto): vai ela, no lugar das fotos das cores */
    if (x.fotoWhatsappUrl) return [{ id: x.id, nome: x.nome, fotos: [{ url: x.fotoWhatsappUrl, cor: null }], videoUrl: x.videoUrl }];
    const fotos: { url: string; cor: string | null }[] = coresEstoque.flatMap((cor) => {
      const f = cores.find((y) => y.modeloId === x.id && y.fotoUrl && y.nome.trim().toLowerCase() === cor.toLowerCase());
      return f?.fotoUrl ? [{ url: f.fotoUrl, cor }] : [];
    });
    if (!fotos.length && x.fotoUrl) fotos.push({ url: x.fotoUrl, cor: coresEstoque.length === 1 ? coresEstoque[0] : null });
    return [{ id: x.id, nome: x.nome, fotos, videoUrl: x.videoUrl }];
  });
}

/** Endereços de foto/vídeo que a IA já mandou nesta conversa (para não repetir sem o cliente pedir). */
/* Só conta o que foi mandado nas últimas 24 h: cliente que volta outro dia e se interessa de novo recebe a foto e o
   vídeo outra vez (conversa real de 05/10/2026: a TANK tinha ido dias antes e a IA não mandou). */
async function midiasJaEnviadas(conversaId: number) {
  const desde = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const linhas = await db
    .select({ url: schema.mensagens.midiaUrl })
    .from(schema.mensagens)
    .where(and(eq(schema.mensagens.conversaId, conversaId), eq(schema.mensagens.autor, "ia"), sql`${schema.mensagens.midiaUrl} is not null`, gt(schema.mensagens.criadoEm, desde)));
  return linhas.map((l) => l.url).filter((u): u is string => !!u);
}

/** Nomes das motos sem unidade que o cliente não citou (se citou uma, todos os nomes dela ficam liberados). */
function semEstoqueNaoCitadas(catalogo: { comEstoque: string[]; semEstoque: string[][] }, doCliente: string) {
  return catalogo.semEstoque.filter((apelidos) => !ofereceSemEstoque(doCliente, { modelosSemEstoque: apelidos, modelosComEstoque: catalogo.comEstoque }).length).flat();
}

async function montarDeps(c: CtxWorkflow, gerar: Deps["gerar"]): Promise<Deps> {
  const incluirTeste = !!c.conversa?.demo;
  const [controle, promptSistema, modelos, veiculos, conhecimento, catalogo] = await Promise.all([
    lerControle(),
    montarPromptSistema(),
    db.select({ nome: schema.modelos.nome, marca: schema.modelos.marca }).from(schema.modelos),
    db.select({ marca: schema.veiculos.marca, modelo: schema.veiculos.modelo }).from(schema.veiculos).where(incluirTeste ? undefined : eq(schema.veiculos.teste, false)).limit(1000),
    fontesAutorizadas(),
    catalogoParaIa({ incluirTeste, kmSemana: kmDoCliente(c), gasolina: await gasolinaDoCliente(c) }),
  ]);
  return {
    controle,
    promptSistema,
    nomesDeProdutos: Array.from(new Set([...modelos.flatMap((m) => [m.nome, m.marca]), ...veiculos.flatMap((v) => [v.marca, v.modelo])].filter((x): x is string => !!x))),
    /* só motos elétricas e acessórios do catálogo podem ser citados; "tem" só com unidade no estoque */
    nomesDoCatalogo: catalogo.nomes,
    modelosComEstoque: catalogo.comEstoque,
    /* moto sem unidade não pode aparecer na resposta, a não ser que o CLIENTE tenha perguntado por ela */
    modelosSemEstoque: semEstoqueNaoCitadas(catalogo, [c.memoria.fatos.interesse ?? "", textoDoCliente(c)].join("\n")),
    /* + a conta de economia do uso deste cliente (semana e mês), que a IA pode citar */
    fontesAutorizadas: [...conhecimento, ...(catalogo.texto ? [catalogo.texto] : [])],
    gerar,
    consultarEstoque: (q) => consultarEstoque(q, { incluirTeste }),
    consultarCatalogo: (t) => consultarCatalogo(t, { incluirTeste }),
    registrarInteresse: async (r) => {
      if (r.modelo?.id) await registrarInteresse({ conversaId: c.conversaId, telefone: c.conversa!.contatoTelefone, modeloId: r.modelo.id, origem: "ia" });
    },
    enviar: async () => ({ ok: false, erro: "o envio é do nó Envia mensagem" }),
  };
}

const pipeInicial = (mensagemCliente: string, deps: Deps): CtxPipeline => ({ mensagemCliente, deps, saida: null, estoque: null, texto: null, humano: false, motivo: null, violacoes: [], chamouModelo: false, chamouEstoque: false });

/* ---------------- os nós ---------------- */
export const NOS_ATENDIMENTO: Record<string, ImplNo<CtxWorkflow>> = {
  gatilho: (c) => ({ entrada: { conversa: c.conversaId, mensagem: c.mensagemId, origem: c.gatilho }, saida: { simulado: c.simulado } }),

  variaveis: async (c) => {
    if (!c.mensagemId) throw new Error("Execução sem mensagem de entrada");
    const [m] = await db.select().from(schema.mensagens).where(eq(schema.mensagens.id, c.mensagemId)).limit(1);
    if (!m) throw new Error(`Mensagem ${c.mensagemId} não encontrada`);
    const conversa = await carregarConversa(c.conversaId);
    return {
      ctx: { mensagem: m, conversa, textoEntrada: textoDaMensagem({ tipo: m.tipo, conteudo: m.conteudo, transcricao: transcricaoDe(m) }) },
      saida: { telefone: conversa.contatoTelefone, nome: conversa.contatoNome, tipo: m.tipo, mensagem: m.conteudo, midia: m.midiaUrl, direcao: m.direcao, recebidaEm: m.criadoEm },
    };
  },

  lead: async (c) => {
    const cv = c.conversa!;
    const [cliente] = cv.clienteId ? await db.select({ id: schema.clientes.id, nome: schema.clientes.nome }).from(schema.clientes).where(eq(schema.clientes.id, cv.clienteId)).limit(1) : [];
    return { saida: { conversa: cv.id, status: cv.status, modo: cv.modo === "humano" ? "HUMANO" : "I.A", cliente: cliente ?? "sem cadastro", negocio: cv.negocioId, demonstracao: cv.demo } };
  },

  palavra_chave: (c) => {
    const texto = (c.mensagem?.conteudo ?? "").trim().toLowerCase();
    const limpar = texto === c.config.palavraLimpar.toLowerCase();
    return { ramo: limpar ? "limpar" : "seguir", entrada: { mensagem: c.mensagem?.conteudo ?? null, palavraLimpar: c.config.palavraLimpar }, saida: { palavraChave: limpar ? c.config.palavraLimpar : null } };
  },

  apagar_memoria: async (c) => {
    const antes = await lerMemoria(c.conversaId);
    await apagarMemoria(c.conversaId);
    await mensagemSistema(db, c.conversaId, "Memória da IA apagada: a conversa recomeça do zero para a IA.");
    return { saida: { fatosApagados: antes?.fatos ?? {}, resumoApagado: antes?.resumo ?? null, memoriaDesde: new Date() } };
  },

  aviso_memoria: async (c) => {
    if (!c.config.avisoMemoriaApagada) return { fim: "sucesso", detalhe: "Memória apagada (aviso desligado)" };
    const r = await enviar(c, "Memória apagada!");
    return { fim: "sucesso", detalhe: r.enviada ? "Memória apagada e avisada" : `Memória apagada; aviso não enviado: ${r.explicacao}`, saida: r };
  },

  verifica_modo: async (c) => {
    const controle = await lerControle();
    if (!controle.ligada) return { fim: "parou", detalhe: "A IA está desligada (aba Controle)", saida: { iaLigada: false } };
    /* regra do dono (27/09/2026): fora do horário a IA SEMPRE responde, mesmo em conversa com humano */
    const aberta = lojaAberta(await lerHorario());
    const humano = c.conversa!.modo === "humano" && aberta;
    return { ramo: humano ? "humano" : "ia", saida: { status: humano ? "HUMANO" : "I.A", responsavel: c.conversa!.responsavelId, lojaAberta: aberta, ...(!aberta && c.conversa!.modo === "humano" ? { foraDoHorario: "IA responde até a loja abrir" } : {}) } };
  },

  ia_off: () => ({ fim: "parou", detalhe: "Atendimento HUMANO: a IA não responde. A mensagem fica na memória.", saida: { respondeu: false } }),

  tipo_msg: (c) => {
    const t = c.mensagem!.tipo;
    const ramo = ["audio", "imagem", "documento", "video"].includes(t) ? t : "texto";
    return { ramo, saida: { tipo: t } };
  },

  midia_audio: (c) => analisarNo(c, "audio", c.config.transcreverAudio),
  midia_imagem: (c) => analisarNo(c, "imagem", c.config.analisarImagem),
  midia_documento: (c) => analisarNo(c, "documento", c.config.analisarDocumento),
  midia_video: (c) => ({ saida: { texto: c.textoEntrada, observacao: "vídeo não é analisado pelo modelo" } }),

  buffer_guarda: (c) => ({ entrada: { mensagem: c.mensagemId }, saida: { naFila: c.textoEntrada } }),

  buffer_espera: async (c) => {
    await esperar(c.config.bufferSegundos * 1000);
    return { saida: { esperou: `${c.config.bufferSegundos} s` } };
  },

  buffer_compara: async (c) => {
    const [nova] = await db
      .select({ id: schema.mensagens.id })
      .from(schema.mensagens)
      .where(and(eq(schema.mensagens.conversaId, c.conversaId), eq(schema.mensagens.direcao, "incoming"), gt(schema.mensagens.id, c.mensagemId!)))
      .orderBy(desc(schema.mensagens.id))
      .limit(1);
    return nova
      ? { ramo: "sim", ctx: { motivoTransferencia: `mensagem #${nova.id}` }, saida: { chegouNova: true, maisNova: nova.id } }
      : { ramo: "nao", saida: { chegouNova: false } };
  },

  buffer_outra: (c) => ({ fim: "parou", detalhe: `Chegou mensagem nova durante a espera (${c.motivoTransferencia}): a execução dela responde tudo junto` }),

  buffer_junta: async (c) => {
    const mem = await lerMemoria(c.conversaId);
    const [ultimaResposta] = await db
      .select({ id: schema.mensagens.id })
      .from(schema.mensagens)
      .where(and(eq(schema.mensagens.conversaId, c.conversaId), eq(schema.mensagens.direcao, "outgoing")))
      .orderBy(desc(schema.mensagens.id))
      .limit(1);
    const filtros = [eq(schema.mensagens.conversaId, c.conversaId), eq(schema.mensagens.direcao, "incoming"), sql`${schema.mensagens.id} <= ${c.mensagemId}`];
    if (ultimaResposta) filtros.push(gt(schema.mensagens.id, ultimaResposta.id));
    if (mem?.limpaEm) filtros.push(gt(schema.mensagens.criadoEm, mem.limpaEm));
    const msgs = (await db.select().from(schema.mensagens).where(and(...filtros)).orderBy(desc(schema.mensagens.id)).limit(20)).reverse();
    const textos = msgs
      .filter((m) => m.conteudo?.trim().toLowerCase() !== c.config.palavraLimpar.toLowerCase())
      .map((m) => (m.id === c.mensagemId ? c.textoEntrada : textoDaMensagem({ tipo: m.tipo, conteudo: m.conteudo, transcricao: transcricaoDe(m) })))
      .filter((t) => t.trim());
    const textoBuffer = textos.join("\n\n") || c.textoEntrada;
    return { ctx: { textoBuffer, primeiraDoBuffer: msgs[0]?.id ?? c.mensagemId }, saida: { mensagens: textos.length, texto: textoBuffer } };
  },

  reconfere_modo: async (c) => {
    const conversa = await carregarConversa(c.conversaId);
    const humano = conversa.modo === "humano" && lojaAberta(await lerHorario());
    return { ramo: humano ? "humano" : "ia", ctx: { conversa }, saida: { status: humano ? "HUMANO" : "I.A" } };
  },

  memoria_carrega: async (c) => {
    const mem = await lerMemoria(c.conversaId);
    const filtros = [eq(schema.mensagens.conversaId, c.conversaId), ne(schema.mensagens.autor, "sistema"), lt(schema.mensagens.id, c.primeiraDoBuffer ?? c.mensagemId!)];
    if (mem?.limpaEm) filtros.push(gt(schema.mensagens.criadoEm, mem.limpaEm));
    const msgs = (await db.select().from(schema.mensagens).where(and(...filtros)).orderBy(desc(schema.mensagens.id)).limit(c.config.janelaMemoria)).reverse();
    const historico = formatarHistorico(msgs.map((m) => ({ autor: m.autor, tipo: m.tipo, conteudo: m.conteudo, transcricao: transcricaoDe(m), criadoEm: m.criadoEm })));
    const memoria = { historico, fatos: (mem?.fatos ?? {}) as FatosLead, resumo: mem?.resumo ?? null, limpaEm: mem?.limpaEm ?? null };
    return { ctx: { memoria }, saida: { mensagensNoHistorico: msgs.length, fatos: memoria.fatos, resumo: memoria.resumo, memoriaDesde: memoria.limpaEm, historico } };
  },

  travas_entrada: async (c) => {
    const pipe = pipeInicial(c.textoBuffer, await montarDeps(c, async () => ({ mensagem: null, consultaEstoque: null, transferir: false })));
    const r = await executarFluxo([limiteDaMensagem, deteccaoDeInjecao], pipe);
    if (r.fim) return { ramo: "bloqueada", ctx: { pipe: { ...r.ctx, texto: null }, motivoTransferencia: r.ctx.motivo === "mensagem_longa" ? "Mensagem longa demais" : "Suspeita de tentativa de manipular a IA" }, saida: { bloqueada: r.ctx.motivo } };
    return { saida: { tamanho: c.textoBuffer.length, aprovada: true } };
  },

  agente: async (c) => {
    const promptSistema = [await montarPromptSistema(), (await catalogoParaIa({ incluirTeste: !!c.conversa?.demo, kmSemana: kmDoCliente(c), gasolina: await gasolinaDoCliente(c) })).texto].filter(Boolean).join("\n\n");
    /* o cliente pediu foto/vídeo? A IA sabe antes de escrever o que vai (ou não) junto */
    const leadAntes = (c.memoria.historico ?? "").split(/\n\s*\n/).filter((l) => l.startsWith("Lead:")).join("\n");
    const midia = planejarPedido({ modelos: await motosComMidia(c), textoCliente: c.textoBuffer, historicoCliente: leadAntes, interesse: c.memoria.fatos.interesse ?? null });
    /* o que o cliente quer (compra, assistência ou ainda não disse): sem saber, nada de produto */
    const intencao = await intencaoDoCliente(c);
    /* momento da compra: a que pergunta ele responde, se tem interesse, se decidiu, se tem objeção */
    const nomesCat = (await nomesDoCatalogo()).map((nome) => ({ nome }));
    const modeloDaConversa = ultimaCitada(nomesCat, [c.memoria.fatos.interesse ?? "", leadAntes, c.textoBuffer].join("\n"))?.nome ?? null;
    const ultimaDaLoja = ultimaFalaDaLoja(c.memoria.historico);
    const falaDeVisita = RX_QUER_VISITAR.test(c.textoBuffer) || RX_PEDIU_HORARIO_VISITA.test(ultimaDaLoja);
    const momento = intencao === "compra" || falaDeVisita ? detectarMomento({ textoCliente: c.textoBuffer, ultimaDaLoja, conheceModelo: !!modeloDaConversa }) : null;
    const horario = await lerHorario();
    const agora = agoraNaLoja();
    const aberta = lojaAberta(horario);
    const g = criarGerador({
      promptSistema,
      memoria: c.memoria,
      agora: `# AGORA
Hoje é ${agora.extenso} (horário de Recife). A loja está ${aberta ? "ABERTA" : "FECHADA"} agora. Cumprimento certo agora: "${saudacaoDoHorario()[0].toUpperCase()}${saudacaoDoHorario().slice(1)}" (ex.: "${saudacaoDoHorario()[0].toUpperCase()}${saudacaoDoHorario().slice(1)}! Tudo certinho?").${aberta ? "" : " Loja fechada NÃO muda a venda: continue conduzindo até o fechamento (o que falta, entrega ou retirada, dados), como se a loja estivesse aberta. Nunca adie (nada de \"conversamos amanhã\") e não comece a resposta dizendo que a loja está fechada. Só se o cliente quiser vir à loja ou falar com um vendedor, diga com naturalidade que a equipe responde assim que a loja abrir."}

${instrucaoDeIntencao(intencao)}

${instrucaoDeFechamento(momento, modeloDaConversa)}

${intencao === "compra" ? instrucaoDeMidia(midia) : instrucaoDeMidia(null)}`,
    });
    const deps = await montarDeps(c, g.gerar);
    let r = await executarFluxo([interpretar, consultaDeEstoque, redigirComEstoque], pipeInicial(c.textoBuffer, deps));
    /* pedido do dono (27/09/2026): a IA precisa sempre responder. Se a trava ou o validador barrarem,
       ela reescreve uma vez com o motivo nas instruções; só se barrar de novo sai o texto padrão. */
    const correcao = r.ctx.texto && !r.ctx.humano ? await motivoDoBloqueio(r.ctx) : null;
    let reescreveu = false;
    if (correcao) {
      g.corrigir(correcao);
      const r2 = await executarFluxo([interpretar, consultaDeEstoque, redigirComEstoque], pipeInicial(c.textoBuffer, deps));
      if (r2.ctx.texto && !r2.ctx.humano) {
        r = r2;
        reescreveu = true;
      }
    }
    const ultimo = g.ultimo();
    const ferramentas = ["modelo", "prompt", ...(r.ctx.chamouEstoque ? ["tool_estoque"] : []), ...(r.ctx.textoCatalogo ? ["tool_catalogo"] : [])];
    const saida = {
      modelo: MODELO_IA,
      resposta: r.ctx.texto,
      transferir: r.ctx.humano,
      motivo: r.ctx.motivo,
      estoque: r.ctx.estoque ? { estado: r.ctx.estoque.estado, veiculos: r.ctx.estoque.itens.length } : null,
      saudacao: g.saudacao(),
      lojaAberta: aberta,
      fatos: ultimo?.fatos ?? null,
      resumo: ultimo?.resumo ?? null,
      chamadas: g.chamadas,
      ferramentas,
      trilha: r.trilha,
      ...(correcao ? { reescrita: { motivo: correcao, aproveitada: reescreveu } } : {}),
    };
    const aprendido = { fatos: ultimo?.fatos ?? {}, resumo: ultimo?.resumo ?? null };
    /* a IA falhou: quebra o nó para o motor tentar de novo (3x, esperas crescentes); esgotou, vai pelo caminho "erro" (vendedor) */
    if (r.fim === "bloqueada" || r.fim === "erro_etapa") throw new Error(g.erro() ?? r.trilha.at(-1)?.detalhe ?? "A IA não respondeu");
    const midiaPedida = midia ? { modelo: midia.modelo?.nome ?? null, pedido: midia.pedido, vai: midia.itens.map((i) => i.tipo) } : null;
    /* o cliente mandou os dados para fechar (com CPF): agradece e passa ao vendedor, que confere e confirma
       (P12/P18). O texto é fixo: não repete dado pessoal nem diz que a compra está concluída. */
    /* simulação do cartão (P5/P19): com parcelas e bandeira, o vendedor recebe a tarefa e o Milton segue
       atendendo. Faltou um dos dois e a loja ainda não perguntou só por ele: pergunta. */
    /* pós-venda (Diretrizes, 04/10/2026): não pode vir à loja ou está muito irritado → não insistir, passar
       para uma pessoa com o relato. A IA já foi instruída; aqui o sistema garante, se ela esquecer. */
    /* O teste de 04/10 mostrou a IA pedindo a transferência sozinha e o cliente recebendo "vou confirmar com a
       equipe... quer saber mais alguma coisa?": no pós-venda o texto é do sistema, com empatia e sem insistir. */
    const naoPodeVir = RX_NAO_PODE_VIR.test(c.textoBuffer);
    const irritado = RX_IRRITADO.test(c.textoBuffer);
    if (intencao === "assistencia" && r.ctx.texto && (r.ctx.humano || naoPodeVir || irritado)) {
      const doCliente = textoDoCliente(c);
      const relato = doCliente.replace(/^Lead:\s*/gm, "").replace(/\s+/g, " ").trim().slice(-300);
      const texto = textoPosVenda({
        nome: primeiroNome(ultimo?.fatos?.nome || c.memoria.fatos.nome) ?? primeiroNome(nomeDoPerfil(c.conversa?.contatoNome)),
        lojaAberta: aberta,
        jaEncaminhou: /respons[áa]veis da assist[êe]ncia/i.test(c.memoria.historico ?? ""),
        naoPodeVir: naoPodeVir || RX_NAO_PODE_VIR.test(doCliente),
        irritado: irritado || RX_IRRITADO.test(doCliente),
        semDetalhe: !RX_DETALHE_PROBLEMA.test(doCliente),
      });
      const pipe = { ...r.ctx, texto, textoCatalogo: texto, humano: true, motivo: "modelo_pediu_transferencia" as const };
      return { ctx: { pipe, aprendido, saudacao: g.saudacao(), midia: null, momento: null, intencao, modeloDaConversa, ultimaDaLoja, motivoTransferencia: `Pós-venda. O cliente escreveu: "${relato}"` }, entrada: { texto: c.textoBuffer }, saida: { ...saida, resposta: texto, transferir: true, posVenda: "passa para uma pessoa (pós-venda)" } };
    }
    /* Recado / outro assunto (teste real de 05/10/2026, Dinho): não é compra nem assistência e o cliente pede uma
       pessoa, manda recado, a própria IA pediu a transferência, ou a loja já perguntou "como posso te ajudar?" e ele
       seguiu falando de outra coisa. Texto do sistema: passa o recado, sem vender e sem repetir a pergunta. */
    const jaPerguntouAjuda = /como posso te ajudar|em que posso te ajudar|o que você precisa/iu.test(ultimaDaLoja);
    const falouAlgo = c.textoBuffer.replace(/[^\p{L}]+/gu, " ").trim().split(" ").length >= 4;
    const perguntaRobo = /rob[ôo]|(?<![\p{L}])bot(?![\p{L}])|[ée]\s+humano|pessoa de verdade|intelig[êe]ncia artificial/iu.test(c.textoBuffer);
    if (!intencao && !perguntaRobo && r.ctx.texto && (r.ctx.humano || RX_RECADO.test(c.textoBuffer) || RX_PEDE_PESSOA.test(c.textoBuffer) || (jaPerguntouAjuda && falouAlgo))) {
      const relato = textoDoCliente(c).replace(/^Lead:\s*/gm, "").replace(/\s+/g, " ").trim().slice(-300);
      const texto = textoRecado({
        nome: primeiroNome(ultimo?.fatos?.nome || c.memoria.fatos.nome) ?? primeiroNome(nomeDoPerfil(c.conversa?.contatoNome)),
        lojaAberta: aberta,
        jaEncaminhou: /passar o seu recado|juntei isso ao seu recado/iu.test(c.memoria.historico ?? ""),
      });
      const pipe = { ...r.ctx, texto, textoCatalogo: texto, humano: true, motivo: "modelo_pediu_transferencia" as const };
      return { ctx: { pipe, aprendido, saudacao: g.saudacao(), midia: null, momento: null, intencao, modeloDaConversa, ultimaDaLoja, recado: true, motivoTransferencia: `Recado / outro assunto. O cliente escreveu: "${relato}"` }, entrada: { texto: c.textoBuffer }, saida: { ...saida, resposta: texto, transferir: true, recado: true } };
    }
    if (momento === "pediu_simulacao") {
      const recentes = leadAntes.split("\n").slice(-2).join("\n");
      const agora = simulacaoPedida(c.textoBuffer);
      const antes = simulacaoPedida(recentes);
      const sim = { parcelas: agora.parcelas ?? antes.parcelas, bandeira: agora.bandeira ?? antes.bandeira };
      const jaPerguntouOQueFalta = /E qual é a bandeira|E em quantas vezes/i.test(ultimaDaLoja);
      let texto: string;
      let tarefa = false;
      if ((!sim.parcelas || !sim.bandeira) && !jaPerguntouOQueFalta) texto = !sim.parcelas ? "E em quantas vezes você gostaria de dividir? 😊" : "E qual é a bandeira do cartão? 😊";
      else {
        await criarTarefaSimulacao(c, sim, modeloDaConversa);
        tarefa = true;
        texto = textoSimulacao({ ...sim, modelo: modeloDaConversa });
      }
      const pipe = { ...r.ctx, texto, textoCatalogo: texto, humano: false, motivo: null };
      return { ctx: { pipe, aprendido, saudacao: g.saudacao(), midia: null, momento, intencao, modeloDaConversa, ultimaDaLoja, motivoTransferencia: null }, entrada: { texto: c.textoBuffer }, saida: { ...saida, momento, simulacao: { ...sim, tarefa } } };
    }
    /* o cliente disse quando vem à loja: o sistema marca na agenda de test drive (mesma regra de conflito
       da equipe), confere o horário da loja e confirma com o endereço; depois vai o pino do mapa */
    if (momento === "informou_visita") {
      const v = await agendarVisitaPelaIa(c, { modelo: modeloDaConversa, nome: primeiroNome(ultimo?.fatos?.nome || c.memoria.fatos.nome), horario });
      /* texto do sistema, com endereço oficial: isento da trava de fatos como o texto do catálogo */
      const pipe = { ...r.ctx, texto: v.texto, textoCatalogo: v.texto, humano: false, motivo: null };
      return { ctx: { pipe, aprendido, saudacao: g.saudacao(), midia: null, momento, intencao, modeloDaConversa, ultimaDaLoja, visitaAgendada: v.quando, mandarLocal: !!v.quando, motivoTransferencia: null }, entrada: { texto: c.textoBuffer }, saida: { ...saida, momento, visita: v } };
    }
    if (momento === "mandou_dados") {
      const modo = pediuDadosDeRetirada(ultimaDaLoja) ? ("retirada" as const) : ("entrega" as const);
      const nome = primeiroNome(ultimo?.fatos?.nome || c.memoria.fatos.nome);
      const pipe = { ...r.ctx, texto: textoDadosRecebidos({ nome, modelo: modeloDaConversa, modo, lojaAberta: aberta }), humano: true, motivo: "modelo_pediu_transferencia" as const };
      const motivo = `Fechamento: o cliente mandou os dados para ${modo === "retirada" ? "retirar na loja" : "entrega"}${modeloDaConversa ? ` da ${modeloDaConversa}` : ""}. Conferir os dados e combinar com ele ${modo === "retirada" ? "a separação e o horário da retirada" : "o melhor horário da entrega"}.`;
      return { ctx: { pipe, aprendido, saudacao: g.saudacao(), midia: null, momento, intencao, modeloDaConversa, ultimaDaLoja, motivoTransferencia: motivo }, entrada: { texto: c.textoBuffer }, saida: { ...saida, momento, resposta: pipe.texto, transferir: true } };
    }
    /* no meio do fechamento a IA não passa ao vendedor por conta própria (o teste de 03/10 mostrou ela passando
       logo depois do "entrega"): o sistema passa quando os dados chegam. Cliente que pede uma pessoa, passa. */
    let pipe = r.ctx;
    const segurou = !!momento && MOMENTOS_SEM_TRANSFERIR.includes(momento) && pipe.humano && pipe.motivo === "modelo_pediu_transferencia" && !!pipe.texto && pipe.texto !== TEXTO_TRANSFERENCIA && !RX_PEDE_PESSOA.test(c.textoBuffer);
    if (segurou) pipe = { ...pipe, humano: false, motivo: null };
    return { ctx: { pipe, aprendido, saudacao: g.saudacao(), midia, momento, intencao, modeloDaConversa, ultimaDaLoja, motivoTransferencia: segurou ? null : ultimo?.motivoTransferencia ?? (pipe.humano ? "Estoque não confirmado: um vendedor confirma" : null) }, entrada: { texto: c.textoBuffer }, saida: { ...saida, midiaPedida, momento, modeloDaConversa, ...(segurou ? { transferenciaSegurada: "fechamento em andamento: o sistema passa ao vendedor quando os dados chegarem" } : {}) } };
  },

  trava_fatos: async (c) => {
    const pipe = c.pipe!;
    const r = await travaDeFatos.rodar(pipe);
    if (r.encerrar) {
      const trechos = trechosBarrados(pipe);
      return { ramo: "bloqueada", ctx: { pipe: { ...pipe, ...r.ctx, texto: null }, motivoTransferencia: `A resposta citava dado que o sistema não confirmou${trechos.length ? ` (${trechos.join(", ")})` : ""}` }, entrada: { texto: pipe.texto }, saida: { bloqueada: r.detalhe, trechos } };
    }
    return { entrada: { texto: pipe.texto }, saida: { aprovada: true } };
  },

  validador: async (c) => {
    const pipe = c.pipe!;
    /* a saudação passa pelas mesmas regras; reprovada, só ela cai (a resposta segue) */
    let saudacao = c.saudacao;
    let saudacaoReprovada: unknown = null;
    if (saudacao) {
      const v = validarResposta(saudacao, { promptSistema: pipe.deps.promptSistema, fontesAutorizadas: pipe.deps.fontesAutorizadas });
      const fatos = afirmaDisponibilidade(saudacao) || afirmacoesSemFonte(saudacao, pipe.deps.fontesAutorizadas).length > 0;
      if (!v.aprovada || fatos) {
        saudacaoReprovada = fatos ? "afirmava fato sem fonte" : v.violacoes;
        saudacao = null;
      }
    }
    if (!pipe.texto) return { ctx: { saudacao }, saida: { semTexto: true, saudacao, saudacaoReprovada } };
    const r = await validadorDeResposta.rodar(pipe);
    if (r.encerrar) return { ramo: "reprovada", ctx: { saudacao, pipe: { ...pipe, ...r.ctx, texto: null }, motivoTransferencia: `A resposta foi reprovada pelo validador${r.ctx?.violacoes ? ` (${String(JSON.stringify(r.ctx.violacoes)).slice(0, 300)})` : ""}` }, entrada: { texto: pipe.texto, saudacao: c.saudacao }, saida: { violacoes: r.ctx?.violacoes, saudacao, saudacaoReprovada } };
    return { ctx: { saudacao }, entrada: { texto: pipe.texto, saudacao: c.saudacao }, saida: { aprovada: true, saudacao, saudacaoReprovada } };
  },

  decide_transferir: (c) => {
    const sim = !!c.pipe?.humano;
    return { ramo: sim ? "sim" : "nao", saida: { transferir: sim, motivo: sim ? c.motivoTransferencia : null } };
  },

  transferir: async (c) => {
    const controle = await lerControle();
    const pipe = c.pipe!;
    const pedidoDaIa = pipe.motivo === "modelo_pediu_transferencia";
    const resumo = c.aprendido.resumo ?? c.memoria.resumo ?? c.textoBuffer.slice(0, 200);
    /* regra do dono (27/09/2026): fora do horário NUNCA passa para humano. A IA continua atendendo,
       a conversa fica em prioridade alta e a equipe vê o aviso para assumir quando a loja abrir. */
    if (!lojaAberta(await lerHorario())) {
      await db.update(schema.conversas).set({ prioridade: "alta", atualizadoEm: new Date() }).where(eq(schema.conversas.id, c.conversaId));
      await mensagemSistema(db, c.conversaId, `Fora do horário: a IA continua atendendo. Quando a loja abrir, ${c.intencao === "assistencia" ? "a equipe da assistência" : c.recado ? "alguém da equipe" : "um vendedor"} deve assumir. Motivo: ${semPontoFinal(c.motivoTransferencia ?? "não informado")}. Resumo: ${resumo}`, { triagem: true });
      /* fora do horário ninguém vai continuar agora: nada de "já estou te encaminhando" */
      const emAndamento = !!c.memoria.historico?.includes("Agente IA:") || !!c.memoria.historico?.includes("Vendedor:");
      const texto = pipe.texto && pipe.texto !== TEXTO_TRANSFERENCIA ? pipe.texto : emAndamento ? TEXTO_CONFIRMAR : TEXTO_FORA_HORARIO;
      return { ctx: { pipe: { ...pipe, texto, humano: false }, aguardaEquipe: true }, saida: { transferida: false, motivo: "fora do horário: a IA segue e a equipe assume ao abrir", avisoAoCliente: texto } };
    }
    /* trava de segurança sempre passa para humano; pedido da IA só com a permissão marcada */
    if (pedidoDaIa && !controle.permissoes.transferirHumano) {
      await mensagemSistema(db, c.conversaId, `A IA sugere passar para um vendedor: ${c.motivoTransferencia ?? "sinal de fechamento"}. (Permissão "Transferir para um vendedor" desligada.)`);
      return { ctx: { aguardaEquipe: true }, saida: { transferida: false, motivo: "permissão de transferência desligada; ficou só o aviso" } };
    }
    const cv = c.conversa!;
    let negocioId = cv.negocioId;
    await db.transaction(async (tx) => {
      await tx.update(schema.conversas).set({ modo: "humano", prioridade: "alta", atualizadoEm: new Date() }).where(eq(schema.conversas.id, c.conversaId));
      await mensagemSistema(tx, c.conversaId, `Transferido para atendimento humano pela IA. Motivo: ${semPontoFinal(c.motivoTransferencia ?? "não informado")}. Resumo: ${resumo}`, { triagem: true });
      /* pós-venda não abre negócio de venda no funil */
      if (cv.clienteId && !negocioId && c.intencao === "compra") {
        const f = { ...c.memoria.fatos, ...c.aprendido.fatos };
        negocioId = await criarNegocio(null, { clienteId: cv.clienteId, veiculoInteresse: f.interesse ?? null, origem: "whatsapp", temTroca: !!f.troca, trocaDescricao: f.troca ?? null, responsavelId: null }, { demo: cv.demo, triagemIa: resumo }, tx);
        if (negocioId) await tx.update(schema.conversas).set({ negocioId }).where(eq(schema.conversas.id, c.conversaId));
      }
    });
    const texto = pipe.texto ?? (pedidoDaIa ? TEXTO_TRANSFERENCIA : null);
    return { ctx: { pipe: { ...pipe, texto }, aguardaEquipe: true }, saida: { transferida: true, status: "HUMANO", motivo: c.motivoTransferencia, resumo, negocio: negocioId, avisoAoCliente: texto } };
  },

  memoria_salva: async (c) => {
    const fatos = mesclarFatos(c.memoria.fatos, c.aprendido.fatos);
    const resumo = c.aprendido.resumo ?? c.memoria.resumo;
    await gravarMemoria(c.conversaId, { fatos, resumo });
    /* qualificação automática: nunca pode impedir a resposta ao cliente */
    let qualificacao: unknown = null;
    let funil: unknown = null;
    let pedido: unknown = null;
    try {
      const q = await qualificarLead(c, fatos, resumo);
      qualificacao = q;
      /* funil conectado: o card anda com a conversa (nunca pode impedir a resposta ao cliente) */
      funil = await conectarFunil(c, q.negocioId).catch((e) => ({ erro: e instanceof Error ? e.message : String(e) }));
      /* entrega fora de Goiana: a equipe começa a confirmar já na escolha (Diretrizes, 04/10/2026) */
      if (c.momento === "escolheu_entrega") {
        const cidade = c.aprendido.fatos.cidade || c.memoria.fatos.cidade || cidadeDoTexto(c.textoBuffer);
        if (cidade) await tarefaEntregaFora(c, q.clienteId, q.negocioId, cidade, `Cliente quer receber${c.modeloDaConversa ? ` a ${c.modeloDaConversa}` : ""} em ${cidade}.`).catch(() => null);
      }
      /* dados do pedido no cadastro, com o resumo para a equipe */
      pedido = await salvarDadosDoPedido(c, q.clienteId, q.negocioId).catch((e) => ({ erro: e instanceof Error ? e.message : String(e) }));
      /* só cumprimentou e sumiu: lembretes para a equipe chamar de novo (10 min, 1 h, 23 h) */
      await lembretesSemResposta(c, q.clienteId, q.negocioId).catch(() => null);
    } catch (e) {
      qualificacao = { erro: e instanceof Error ? e.message : String(e) };
    }
    return { saida: { fatos, resumo, qualificacao, funil, pedido } };
  },

  blocos: async (c) => {
    /* regra do dono (27/09/2026): cumprimentar e se apresentar SÓ no começo da conversa. Se a loja
       (IA ou vendedor) já falou nas últimas 6 h, nada de saudação nem apresentação de novo. */
    const [ultimaDaLoja] = await db
      .select({ em: schema.mensagens.criadoEm })
      .from(schema.mensagens)
      .where(and(eq(schema.mensagens.conversaId, c.conversaId), eq(schema.mensagens.direcao, "outgoing")))
      .orderBy(desc(schema.mensagens.id))
      .limit(1);
    const jaConversou = !!ultimaDaLoja && Date.now() - new Date(ultimaDaLoja.em).getTime() < 6 * 60 * 60 * 1000;
    /* primeiro contato: sempre com cumprimento (só o cumprimento; a pergunta vai na resposta) */
    const cumprimento = c.saudacao ? soCumprimento(c.saudacao) : "";
    const padrao = saudacaoDoHorario();
    const arrumar = (s: string) => { const x = s.trim(); return x ? `${x[0].toUpperCase()}${x.slice(1)}${/[.!?]$|\p{Extended_Pictographic}\uFE0F?$/u.test(x) ? "" : "!"}` : x; };
    const intencao = await intencaoDoCliente(c);
    /* cliente irritado no pós-venda: só o "Bom dia!", sem "Tudo bem por aí?" (teste de 04/10/2026) */
    const reclamando = intencao === "assistencia" && RX_IRRITADO.test(textoDoCliente(c));
    const saudacao = jaConversou
      ? null
      : reclamando
        ? `${padrao[0].toUpperCase()}${padrao.slice(1)}!`
        : arrumar(cumprimento) || `${padrao[0].toUpperCase()}${padrao.slice(1)}! ${variar(["Tudo certinho?", "Tudo bem?", "Tudo bem por aí?", "Como vai?"])}`;
    /* o cumprimento sai sempre certo para o horário de Recife, mesmo que a IA erre */
    const textoBase = c.pipe?.texto === TEXTO_FORA_HORARIO ? variar(VARIANTES_FORA_HORARIO) : c.pipe?.texto === TEXTO_CONFIRMAR ? variar(VARIANTES_CONFIRMAR) : (c.pipe?.texto ?? "");
    let resposta = quebrarEmBlocos(organizarTexto(textoBase), c.config.maxBlocos).map((b) => corrigirCumprimento(b));
    /* saudação já foi (agora, solta, ou antes na conversa): cumprimento/apresentação no começo da resposta sai */
    const perguntouSeERobo = /rob[ôo]|(?<![\p{L}])bot(?![\p{L}])|intelig[êe]ncia artificial|(?<![\p{L}])ia(?![\p{L}])|humano|pessoa de verdade/iu.test(c.textoBuffer);
    if ((saudacao || jaConversou) && resposta.length) resposta = [tirarCumprimentoRepetido(resposta[0], perguntouSeERobo), ...resposta.slice(1)].filter(Boolean);
    resposta = resposta.map(tirarEmojiDoInicio).filter(Boolean);
    /* fase 2 (P2): o nome não é perguntado; o nome completo só entra na lista de dados do fechamento.
       Pergunta de nome que a IA escrever sai (a informação da resposta fica). */
    resposta = resposta
      .map((b) => (/\n/.test(b) ? b : (b.match(FRASES_RX) ?? [b]).filter((f) => !(/\?/.test(f) && RX_PERGUNTA_NOME.test(f) && !/completo/iu.test(f))).join("").trim()))
      .filter((b) => /\p{L}/u.test(b));
    /* o cliente acabou de dizer o nome: a resposta o chama pelo nome ("Prazer, Carla!") — pedido do dono */
    const nomeNovo = !c.memoria.fatos.nome ? primeiroNome(c.aprendido.fatos.nome) : null;
    if (nomeNovo && resposta.length && !new RegExp(`(?<![\\p{L}])${nomeNovo}(?![\\p{L}])`, "iu").test(resposta.join(" "))) {
      /* a IA já disse "Prazer em falar com você": essa frase sai, fica só o "Prazer, Sandra!" */
      const [primeiro0, ...resto] = resposta;
      /* e o "Boa tarde 😊" solto que vinha depois dela (só o cumprimento; o resto da frase fica) */
      const primeiro =
        primeiro0
          .replace(/^prazer[^.!?\n]*[.!?]+\s*(?:\p{Extended_Pictographic}️?\s*)*/iu, "")
          .replace(/^(?:bom\s+dia+|boa\s+tarde+|boa\s+noite+)[!.,]*\s*(?:\p{Extended_Pictographic}️?\s*)*/iu, "")
          .trim() || primeiro0;
      const prazer = variar(PRAZER)(nomeNovo);
      resposta = [/\n/.test(primeiro) ? prazer : `${prazer} ${primeiro[0].toUpperCase()}${primeiro.slice(1)}`, ...(/\n/.test(primeiro) ? [primeiro] : []), ...resto];
    }
    /* o cliente só cumprimentou (a IA não tinha o que responder): a apresentação vai no cumprimento e aqui a pergunta */
    if (saudacao && !resposta.length) resposta = [variar(PERGUNTAS_INTENCAO)];
    /* a loja já falou hoje e a IA só cumprimentou de novo ("Olá! Tudo bem?"): o cumprimento repetido saiu e
       não sobrou nada. O cliente NUNCA fica sem resposta (pedido do dono, 27/09/2026). */
    const textoPronto = !!c.pipe?.texto && [TEXTO_FORA_HORARIO, TEXTO_CONFIRMAR, TEXTO_TRANSFERENCIA].includes(c.pipe.texto);
    if (!saudacao && !resposta.length && textoPronto) resposta = [variar(VARIANTES_CONFIRMAR)];
    if (!saudacao && !resposta.length && c.pipe?.texto && !textoPronto) resposta = [variar(TUDO_CERTO)];
    /* o cliente disse quanto roda e perguntou se compensa, mas a resposta veio sem conta: o sistema põe a
       economia pronta (moto, semana e mês). E nada de perguntar cor antes de ele escolher a moto. */
    resposta = await garantirEconomia(c, resposta);
    /* o cliente só se apresentou (disse o nome, sem dizer o que procura): antes da pergunta, o que a loja vende */
    resposta = await entenderPrimeiro(resposta, intencao, c);
    /* condução até o fechamento (pedido do dono, 03/10/2026): a proposta automática saiu (P20); no lugar,
       "o que falta?", objeção vira economia ou pergunta aberta, decidido ganha parabéns e "retirar ou entrega?" */
    /* a proposta automática saiu (P20); se a IA ainda escrever uma (prompt antigo), ela sai da resposta */
    resposta = tirarPropostaAntiga(resposta);
    /* venda não se adia (05/10/2026: "a IA, mesmo com a loja fechada, tem que ir até o sim") */
    if (intencao === "compra") resposta = tirarAdiamento(resposta);
    if (intencao === "compra") resposta = conduzirFechamento(c, resposta);
    /* "o valor é X, podendo dividir em até 21x" (pedido do usuário, 04/10/2026): sem o preço na resposta, entra o do catálogo */
    if (c.momento === "quer_parcelar" && c.modeloDaConversa && !resposta.some((b) => /R\$/.test(b))) {
      const [m] = await db.select({ preco: schema.modelos.precoTabela }).from(schema.modelos).where(sql`lower(${schema.modelos.nome}) = ${c.modeloDaConversa.toLowerCase()}`).limit(1);
      if (m?.preco) resposta = [`${artigo(c.modeloDaConversa).toUpperCase()} *${c.modeloDaConversa}* sai por *${reais(Number(m.preco))}*.`, ...resposta];
    }
    /* UMA pergunta por resposta: bloco que é só mais uma pergunta, depois de outra, sai */
    let perguntou = false;
    resposta = resposta.filter((b) => {
      const soPergunta = /\?\s*(?:\p{Extended_Pictographic}️?\s*)*$/u.test(b) && !/[.!]\s/u.test(b) && !/\n/u.test(b);
      if (soPergunta && perguntou) return false;
      if (/\?/u.test(b)) perguntou = true;
      return true;
    });
    /* foto e vídeo da moto (pedido do dono, 02/10/2026): o que o cliente pediu ou, na 1ª vez que a moto
       aparece na conversa, a foto da cor e o vídeo. Resposta-padrão (confirmar, fora do horário) não leva. */
    const respostaDaIa = !!c.pipe?.texto && ![TEXTO_FORA_HORARIO, TEXTO_CONFIRMAR, TEXTO_TRANSFERENCIA].includes(c.pipe.texto);
    /* o cliente pediu (mesmo sem arquivo para mandar): vale o que a IA já sabia ao escrever */
    let midia: PlanoMidia | null = intencao === "compra" ? c.midia : null;
    if (!midia && intencao === "compra" && respostaDaIa && resposta.length) {
      try {
        const modelos = await motosComMidia(c);
        const jaEnviadas = await midiasJaEnviadas(c.conversaId);
        /* pesquisando: 2 ou 3 opções, uma foto de cada (Diretrizes do Milton, 04/10/2026) */
        midia =
          c.momento === "pesquisando"
            ? planejarOpcoes({ modelos, resposta: resposta.join("\n"), jaEnviadas })
            : /* a resposta apresentou 2 ou 3 opções ("vocês têm patinete?"): uma foto de cada (teste de 05/10/2026) */
              (planejarApresentacao({ modelos, textoCliente: c.textoBuffer, resposta: resposta.join("\n"), jaEnviadas }) ??
              planejarOpcoes({ modelos, resposta: resposta.join("\n"), jaEnviadas }));
      } catch {
        midia = null;
      }
    }
    /* nada vai junto: frase que promete foto/vídeo ("segue a foto") sai */
    if (!midia?.itens.length) resposta = resposta.map(tirarPromessaDeMidia).filter((b) => /\p{L}/u.test(b));
    /* abertura do Milton (P2 a P4): "Boa tarde, Carla! Tudo certinho? 😊 Me chamo Milton, sou da Gêmeos Motors…". O nome
       é o que o cliente disse ou o do perfil do WhatsApp; se a resposta já fala do Milton (perguntou se é robô), não repete */
    let abertura = saudacao;
    if (abertura) {
      const nome = primeiroNome(c.memoria.fatos.nome || c.aprendido.fatos.nome) ?? primeiroNome(nomeDoPerfil(c.conversa?.contatoNome));
      if (!nomeNovo) abertura = saudacaoComNome(abertura, nome);
      if (!/milton/iu.test(resposta.join(" "))) abertura = `${abertura} ${reclamando ? "Aqui é o Milton, da Gêmeos Motors." : variar(APRESENTACAO)}`;
    }
    const blocos = [...(abertura ? [corrigirCumprimento(abertura.trim())] : []), ...resposta];
    /* como no WhatsApp da loja: a saudação vai solta e a resposta cita a mensagem do cliente */
    const citar = c.config.citarMensagem && resposta.length ? (saudacao ? 1 : 0) : -1;
    const vaiMidia = midia?.itens.length ? midia : null;
    const midiaSaida = vaiMidia ? vaiMidia.itens.map((i) => `${i.tipo}: ${i.legenda}`) : null;
    return blocos.length ? { ctx: { blocos, indice: 0, citar, midia: vaiMidia }, saida: { blocos, citaMensagemDoCliente: citar >= 0 ? citar + 1 : null, midia: midiaSaida } } : { ramo: "vazio", ctx: { midia: null }, saida: { blocos: [] } };
  },

  loop: (c) => (c.indice < c.blocos.length ? { ramo: "proximo", saida: { bloco: c.indice + 1, de: c.blocos.length } } : { ramo: "fim", saida: { enviados: c.enviados } }),

  intervalo: async (c) => {
    const ms = tempoDigitando(c.blocos[c.indice]);
    await mostrarDigitando(c, ms);
    await esperar(ms);
    return { saida: { digitando: `${(ms / 1000).toFixed(1)} s`, bloco: c.indice + 1 } };
  },

  enviar: async (c, info) => {
    const texto = c.blocos[c.indice];
    const r = await enviar(c, texto, c.indice === c.citar, info.ultima);
    await db.update(schema.conversas).set({ iaDigitandoAte: null }).where(eq(schema.conversas.id, c.conversaId));
    if (!r.enviada && r.motivo === "falha_envio") throw new Error(`O WhatsApp recusou o envio: ${r.explicacao}`);
    if (!r.enviada) {
      await mensagemSistema(db, c.conversaId, `Resposta da IA não enviada: ${r.explicacao}. Um consultor precisa assumir.`);
      return { fim: "parou", detalhe: `Não enviada: ${r.explicacao}`, entrada: { texto }, saida: r };
    }
    /* depois do último bloco de texto: a foto e o vídeo da moto. Falha aqui não repete o texto
       (o nó não é refeito): vira um aviso para a equipe mandar à mão. */
    const midias: { tipo: string; enviada: boolean; erro: string | null }[] = [];
    if (c.indice === c.blocos.length - 1 && c.midia?.itens.length) {
      for (const item of c.midia.itens) {
        try {
          await mostrarDigitando(c, 1500);
          await esperar(1500);
          const m = await enviarMidiaDaIa({ conversaId: c.conversaId, telefone: c.conversa!.contatoTelefone, tipo: item.tipo, url: item.url, legenda: item.legenda, origem: c.simulado ? "workflow (teste)" : "workflow", simulado: c.simulado || !!c.conversa?.demo });
          midias.push({ tipo: item.tipo, enviada: m.enviada, erro: m.explicacao });
        } catch (e) {
          midias.push({ tipo: item.tipo, enviada: false, erro: e instanceof Error ? e.message : String(e) });
        }
      }
      await db.update(schema.conversas).set({ iaDigitandoAte: null }).where(eq(schema.conversas.id, c.conversaId));
      const falhas = midias.filter((x) => !x.enviada);
      if (falhas.length) await mensagemSistema(db, c.conversaId, `A IA não conseguiu mandar ${falhas.map((x) => (x.tipo === "foto" ? "a foto" : "o vídeo")).join(" e ")} da ${c.midia.modelo?.nome ?? "moto"} (${falhas[0].erro ?? "erro"}). Mande à mão, se o cliente ainda quiser.`);
    }
    /* visita marcada: depois do texto, o pino do mapa da loja */
    let local: { enviada: boolean; erro: string | null } | null = null;
    if (c.indice === c.blocos.length - 1 && c.mandarLocal) {
      try {
        const l = await enviarLocalizacaoDaIa({ conversaId: c.conversaId, telefone: c.conversa!.contatoTelefone, local: LOCAL_LOJA, origem: c.simulado ? "workflow (teste)" : "workflow", simulado: c.simulado || !!c.conversa?.demo });
        local = { enviada: l.enviada, erro: l.explicacao };
      } catch (e) {
        local = { enviada: false, erro: e instanceof Error ? e.message : String(e) };
      }
      if (!local.enviada) await mensagemSistema(db, c.conversaId, `A IA não conseguiu mandar a localização da loja (${local.erro ?? "erro"}). Mande à mão, se precisar.`);
    }
    return { ctx: { indice: c.indice + 1, enviados: c.enviados + 1 }, entrada: { texto }, saida: { enviada: true, citou: c.indice === c.citar, simulado: c.simulado, ...(midias.length ? { midias } : {}), ...(local ? { localizacao: local } : {}) } };
  },

  final: (c) => ({ fim: "sucesso", detalhe: c.enviados ? `${c.enviados} mensagem(ns) enviada(s)` : "Nada a enviar", saida: { enviados: c.enviados, transferida: !!c.pipe?.humano } }),
};

/* Áudio, imagem e documento: analisa uma vez e guarda na própria mensagem (metadados.transcricao),
   para o buffer e a memória lerem depois. Falha na análise não derruba o atendimento. */
async function analisarNo(c: CtxWorkflow, tipo: "audio" | "imagem" | "documento", ligado: boolean) {
  const m = c.mensagem!;
  const ja = transcricaoDe(m);
  if (ja) return { saida: { texto: ja, reaproveitada: true } };
  if (!ligado) return { saida: { texto: c.textoEntrada, observacao: "análise desligada nos ajustes do nó" } };
  if (!m.midiaUrl) return { saida: { texto: c.textoEntrada, observacao: "mensagem sem arquivo" } };
  const arq = await lerBytes(m.midiaUrl);
  if (!arq) return { saida: { texto: c.textoEntrada, observacao: "arquivo da mídia não encontrado" } };
  try {
    const analise = await analisarMidia(tipo, arq.bytes, m.midiaMime ?? arq.mime);
    const texto = m.conteudo ? `${analise}\n(legenda: ${m.conteudo})` : analise;
    await db.update(schema.mensagens).set({ metadados: sql`coalesce(${schema.mensagens.metadados}, '{}'::jsonb) || ${JSON.stringify({ transcricao: texto })}::jsonb` }).where(eq(schema.mensagens.id, m.id));
    const rotulo = { audio: "áudio", imagem: "imagem", documento: "documento" }[tipo];
    return { ctx: { textoEntrada: `[${rotulo}] ${texto}` }, entrada: { arquivo: m.midiaNome ?? m.midiaUrl, mime: m.midiaMime, bytes: arq.bytes.length }, saida: { texto } };
  } catch (e) {
    throw new Error(`Análise da mídia falhou: ${e instanceof Error ? e.message : String(e)}`);
  }
}


/* Esgotou as tentativas: o que muda no contexto antes de seguir pelo caminho "erro" do desenho. */
export async function aoEsgotarTentativas(no: string, erro: string, c: CtxWorkflow): Promise<Partial<CtxWorkflow>> {
  if (no === "agente") {
    const pipe = { ...(c.pipe ?? ({} as CtxPipeline)), texto: null, humano: true, motivo: "erro_modelo" as const };
    return { pipe, motivoTransferencia: `A IA falhou 4 vezes seguidas (${erro})` };
  }
  if (no === "enviar") {
    await mensagemSistema(db, c.conversaId, `Resposta da IA não enviada depois de 4 tentativas: ${erro}. Um consultor precisa assumir.`);
    return { indice: c.blocos.length };
  }
  /* mídia: segue com a mensagem sem análise (ex.: "[áudio]") */
  return {};
}
