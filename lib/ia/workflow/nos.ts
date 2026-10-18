import "server-only";
import { and, desc, eq, gt, inArray, lt, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/lib/db";
import { analisarMidia, gerarObjeto, MODELO_IA } from "@/lib/ia/cliente";
import { consultarEstoque } from "@/lib/ia/estoque";
import { consultarCatalogo } from "@/lib/ia/catalogo";
import { lerControle } from "@/lib/ia/controle";
import { enviarLocalizacaoDaIa, enviarMidiaDaIa, enviarRespostaDaIa } from "@/lib/ia/envio";
import { agendarAquecimento } from "./aquecimento";
import { MOTIVO_NAO_CLIENTE, naoEhCliente, TEXTO_OFERTA_SERVICO, type NaoCliente } from "@/lib/ia/nao-cliente";
import { faixasDoEstoque, indicarMotos, instrucaoQualificacao, jaIndicou, lerDoCliente, lerNecessidade, limparParaQualificacao, pediuOpcoes, perguntasFeitas, proximoPasso, textoIndicacao, textoPergunta, type MotoParaIndicar } from "@/lib/ia/necessidade";
import { ehTextoDoSistema } from "@/lib/ia/texto-do-sistema";
import { jaPediuAvaliacao, motivoAvaliacao, pedidoDeAvaliacao, ROTULO_ITEM, textoPedidoAvaliacao, type PedidoAvaliacao } from "@/lib/ia/avaliacao";
import { clienteEncerrou, clienteRecusouOModelo, clienteVaiRetornar, conversaForaDaVenda } from "@/lib/ia/aquecimento";
import { dataHoraDaVisita, diaClaro, diaPorExtenso, LOCAL_LOJA, quandoPorExtenso, remarcarPara, RX_PEDIU_HORARIO_VISITA, RX_PERGUNTA_ENDERECO, RX_QUER_VISITAR } from "@/lib/ia/agenda";
import { criarTestDrive, reagendarTestDrive } from "@/lib/servicos/test-drive";
import { STATUS_ABERTOS } from "@/lib/test-drive";
import { ErroRegra } from "@/lib/acao";
import { validarResposta } from "@/lib/ia/validador";
import { catalogoParaIa, fontesAutorizadas, lerHorario, montarPromptSistema, reais } from "@/lib/ia/prompt";
import { formatarTelefone, hora } from "@/lib/formato";
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
import { decidirSimulacao } from "@/lib/ia/simulacao-fluxo";
import { lerTaxas } from "@/lib/ia/taxas-maquineta";
import { registrarInteresse } from "@/lib/servicos/interesses";
import { detectarMomento, instrucaoDeFechamento, jaDisseComoReceber, listaDeDados, MOMENTOS_SEM_TRANSFERIR, notaDeEntrega, parabens, PERGUNTAS_ENTREGA_OU_RETIRADA, PERGUNTA_PARCELAS, PERGUNTA_TEM_MODELO, PERGUNTAS_KM, PERGUNTAS_VISITA, RX_PARABENS, RX_PEDE_PESSOA, semPerguntaDeFechamento, soOQuePerguntou, pediuDadosDeRetirada, tirarPropostaAntiga, ultimaFalaDaLoja, textoDadosRecebidos, tirarAdiamento, jaPerguntouSoOQueFalta, textoRecusouSimulacao, objecoesDePrecoAntes, RX_ANUNCIO_PRECO, textoNegociacao, tirarFraseProibida, type Momento } from "@/lib/ia/fechamento";
import { instrucaoDeIntencao, instrucaoIntermediario, intencaoDoTexto, TEXTO_PEDE_RELATO, PERGUNTAS_INTENCAO, RX_DETALHE_PROBLEMA, RX_IRRITADO, RX_NAO_PODE_VIR, RX_RECADO, reclamouDoAtendimento, semAberturaDoSite, textoPosVenda, textoQueixa, textoRecado, tirarOfertaDeProduto, instrucaoDoSite, instrucaoDoSiteBase, instrucaoTriciclo, tirarTriciclo, tirarListaSemPedido, veioDoSite, type Intencao } from "@/lib/ia/intencao";
import { instrucaoDeMidia, planejarApresentacao, planejarPedido, tirarPromessaDeMidia, tirarPromessaDeOutras, ultimaCitada, type ModeloComMidia, type PlanoMidia } from "@/lib/ia/midia-tipos";
import { artigo } from "@/lib/ia/estoque-tipos";
import { instrucaoDeAudio, instrucaoDeFoto, listaDisponiveis, respostaParaMidia, TEXTO_DA_RESPOSTA, type ItemDisponivel } from "@/lib/ia/foto-cliente";
import { corrigirKmSemFonte } from "@/lib/ia/ficha-fatos";
import { avancarEtapaPelaIa, criarNegocio } from "@/lib/servicos/negocios";
import { camposFaltando, enderecoDe, lerDadosDoCliente } from "@/lib/ia/dados-cliente";
import { planoRetirada, quandoRetirar, textoEntregaMarcada, textoLembreteEntrega, textoLembreteRetirada, textoRetiradaMarcada, trechoDeQuando } from "@/lib/ia/retirada";
import { registrarLog } from "@/lib/logs";
import { variantesTelefone } from "@/lib/mensageria/servico";
import { ROTULO_TEMPERATURA, temTroca, temperaturaDaIntencao, temperaturaDoLead, triagemDosFatos } from "@/lib/ia/qualificacao";
import { mensagemSistema } from "@/lib/mensageria/anotacoes";
import { lerBytes } from "@/lib/mensageria/midia";
import type { ConfigWorkflow } from "./grafo";
import type { ImplNo } from "./motor";
import { corNoTexto, mensagensRepetidas, umaPerguntaSo, deveRepetirPerguntaDoNome, jaChamouPeloNome, respondeuSoONome, formatarHistorico, nomeDoPerfil, REPERGUNTAS_NOME, semRepeticao, RX_PERGUNTA_NOME, saudacaoComNome, variar, mesclarFatos, primeiroNome, quebrarEmBlocos, soCumprimento, tempoDigitando, textoDaMensagem, tirarCumprimentoRepetido, tirarEmojiDoInicio, type FatosLead } from "./util";
import { obterProvedor } from "@/lib/mensageria/provedores";
import { organizarTexto } from "@/lib/ia/organizar";
import { ETAPAS_ABERTAS, TIPOS_VENDA_IA } from "@/lib/dominio";

/* fora do horário ninguém assume agora: a IA avisa sem prometer atendimento imediato */
/* resposta barrada no meio da conversa, com a loja fechada: honesta, sem se apresentar de novo */
const TEXTO_CONFIRMAR = "Quero te responder isso certinho, então vou confirmar com a equipe e te retorno assim que a loja abrir 🙏 Enquanto isso, posso te ajudar com mais alguma coisa sobre as motos?";
/* Variações das frases prontas (pedido do dono, 27/09/2026: "não deixar tanto na cara que é IA, variando as mensagens") */
const semPontoFinal = (s: string) => s.trim().replace(/[.\s]+$/u, "");
/* Fase 2 do treinamento do Milton (P2, P3 e P4, 04/10/2026): ele se apresenta junto com o cumprimento, abre
   com "Como posso te ajudar?" e não pergunta o nome (o nome completo só vem na lista de dados do fechamento). */
const APRESENTACAO = ["Me chamo Milton, sou da Gêmeos Motors e vou te ajudar por aqui!", "Aqui é o Milton, da Gêmeos Motors, e vou te ajudar por aqui!", "Me chamo Milton, da Gêmeos Motors, e vou te ajudar por aqui!"];
const TUDO_CERTO = ["Tudo certo por aqui 😊 Como posso te ajudar?", "Tudo ótimo por aqui! Em que posso te ajudar? 🙂", "Por aqui tudo bem 😊 Me conta, o que você precisa?"];
const PERGUNTAS_NOME = ["Com quem eu falo? 😊", "Qual é o seu nome? 😊", "Como posso te chamar? 😊"];
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
  /** quem escreve não é cliente (oferta de serviço, robô) ou a conversa entrou em loop: a IA para e passa para a equipe */
  naoCliente?: NaoCliente;
  /** venda com troca ou compra do que o cliente tem: a IA pediu os dados e a conversa vai para um vendedor a qualquer hora */
  avaliacao?: PedidoAvaliacao;
  /** qualificação consultiva (dono, 18/10/2026): a pergunta que o sistema faz depois do comentário da IA, e o
   *  "temos a partir de R$ X" quando o cliente perguntou valor sem dizer o modelo */
  qualificacao?: { pergunta: string; abertura: string | null };
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
  /* e o texto montado pelo sistema nesta resposta (simulação de parcelas, agenda): cada bloco enviado é conferido sozinho, e os valores
     vêm da conta do sistema (teste real de 06/10/2026: o bloco com "R$ 689,04" era barrado) */
  const fontesExtras = [...(kmSemana ? [(await catalogoParaIa({ incluirTeste: !!c.conversa?.demo, kmSemana, gasolina: await gasolinaDoCliente(c) })).texto] : []), ...(c.pipe?.textoCatalogo ? [c.pipe.textoCatalogo] : []), ...(c.qualificacao ? [c.qualificacao.pergunta, c.qualificacao.abertura ?? ""] : [])];
  /* texto pronto do sistema (catálogo da foto, troca, indicação, fora do horário…) ou escrito pela IA: a Sonix usa para saber se a correção é regra ou código */
  const textoDoSistema =
    (!!c.pipe?.texto && c.pipe.texto === c.pipe.textoCatalogo) || [TEXTO_FORA_HORARIO, TEXTO_CONFIRMAR, TEXTO_TRANSFERENCIA].includes(c.pipe?.texto ?? "") || [...VARIANTES_FORA_HORARIO, ...VARIANTES_CONFIRMAR].includes(texto) || ehTextoDoSistema(texto);
  return enviarRespostaDaIa(db, { conversaId: c.conversaId, telefone: c.conversa!.contatoTelefone, texto, origem: c.simulado ? "workflow (teste)" : "workflow", simulado: c.simulado || !!c.conversa?.demo, respostaA, gravarFalha, fontesExtras, textoDoSistema });
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
async function precoDoModelo(modelo: string) {
  const [m] = await db.select({ preco: schema.modelos.precoTabela }).from(schema.modelos).where(sql`lower(${schema.modelos.nome}) = ${modelo.toLowerCase()}`).limit(1);
  return m?.preco ? Number(m.preco) : null;
}
/** Modelo do mesmo tipo (moto ou patinete), mais barato que `preco` e com unidade disponível: o mais caro entre eles
 *  (o mais parecido com o que o cliente queria). */
async function modeloMaisEmConta(c: CtxWorkflow, modelo: string, preco: number) {
  const m = schema.modelos;
  const v = schema.veiculos;
  const [atual] = await db.select({ tipo: m.tipo }).from(m).where(sql`lower(${m.nome}) = ${modelo.toLowerCase()}`).limit(1);
  if (!atual) return null;
  const [mais] = await db
    .select({ nome: m.nome, preco: m.precoTabela })
    .from(m)
    .where(and(eq(m.ativo, true), eq(m.tipo, atual.tipo), sql`${m.precoTabela} < ${preco}`, sql`exists (select 1 from ${v} where ${v.modeloId} = ${m.id} and ${v.status} = 'disponivel' ${c.conversa?.demo ? sql`` : sql`and not ${v.teste}`})`))
    .orderBy(desc(m.precoTabela))
    .limit(1);
  return mais?.preco ? { nome: mais.nome, preco: Number(mais.preco) } : null;
}
/* Motos com unidade disponível, com o que a indicação usa (ficha, descrição, preço da unidade ou de tabela). */
async function motosParaIndicar(c: CtxWorkflow): Promise<MotoParaIndicar[]> {
  const m = schema.modelos;
  const v = schema.veiculos;
  const [modelos, unidades] = await Promise.all([
    db.select({ id: m.id, nome: m.nome, tipo: m.tipo, preco: m.precoTabela, ficha: m.ficha, descricao: m.descricao }).from(m).where(and(eq(m.ativo, true), inArray(m.tipo, [...TIPOS_VENDA_IA]))),
    db.select({ modeloId: v.modeloId, modelo: v.modelo, valor: v.valorAnunciado }).from(v).where(and(eq(v.status, "disponivel"), inArray(v.tipo, [...TIPOS_VENDA_IA]), c.conversa?.demo ? undefined : eq(v.teste, false))),
  ]);
  return modelos
    .map((x) => {
      const minhas = unidades.filter((u) => u.modeloId === x.id || (!u.modeloId && u.modelo.trim().toLowerCase() === x.nome.trim().toLowerCase()));
      const valores = minhas.map((u) => (u.valor ? Number(u.valor) : null)).filter((n): n is number => !!n);
      const f = (x.ficha ?? {}) as Record<string, string>;
      const moto: MotoParaIndicar = { nome: x.nome, tipo: x.tipo, preco: valores.length ? Math.min(...valores) : x.preco ? Number(x.preco) : null, autonomia: f.autonomia ?? null, carga: f.peso ?? null, velocidade: f.velocidade ?? null, descricao: x.descricao ?? null };
      return minhas.length ? moto : null;
    })
    .filter((x): x is MotoParaIndicar => !!x);
}
/** As falas da loja (IA ou vendedor) no histórico, uma por bloco. */
const falasDaLoja = (historico: string | null | undefined) => (historico ?? "").split(/\n\s*\n/).map((b) => b.trim()).filter((b) => /^(Agente IA|Vendedor):/.test(b));
/* o cliente perguntou valor sem dizer o modelo ("vc tem moto a partir de quanto?", "valor das motos elétricas") */
const RX_PERGUNTOU_VALOR = /(?<![\p{L}])(?:valor(?:es)?|pre[çc]os?|quanto (?:custa|[ée]|sai|fica|t[áa])|a partir de quanto|mais barat\p{L}*|em conta)(?![\p{L}])/iu;
/* momentos em que ainda se está descobrindo o que o cliente precisa */
const MOMENTOS_DA_DESCOBERTA: (string | null)[] = [null, "pesquisando", "sem_modelo", "quer_parcelar", "objecao"];

/* Venda facilitada com troca / compra (dono, 17/10/2026): tarefa para o vendedor avaliar o que o cliente quer dar
   na troca (ou vender) e passar o valor. Uma por conversa enquanto estiver aberta. */
async function tarefaAvaliacao(c: CtxWorkflow, clienteId: number | null, negocioId: number | null) {
  const a = c.avaliacao!;
  const cv = await carregarConversa(c.conversaId);
  const F = schema.followUps;
  const [aberta] = await db.select({ id: F.id }).from(F).where(and(eq(F.conversaId, c.conversaId), eq(F.status, "pendente"), eq(F.tipo, "avaliacao"))).limit(1);
  if (aberta) return;
  const item = ROTULO_ITEM[a.item];
  await db.insert(F).values({
    conversaId: c.conversaId,
    clienteId,
    negocioId,
    usuarioId: cv.responsavelId,
    agendadoPara: new Date(),
    tipo: "avaliacao",
    motivo: a.tipo === "troca" ? `Avaliar ${item} na troca` : `Avaliar ${item} para compra`,
    notas: c.motivoTransferencia ?? null,
    origem: "ia",
    modeloId: null,
    contexto: { detectadoPor: "ia", avaliacao: a.tipo, item: a.item, modelo: c.modeloDaConversa ?? null },
  });
}
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
/* O cliente não aceitou a simulação (relatório do dono, 10/10/2026): o vendedor consulta a gerência antes de concluir. */
async function criarTarefaGerencia(c: CtxWorkflow, modelo: string | null, fala: string) {
  const cv = await carregarConversa(c.conversaId);
  const nome = primeiroNome(c.aprendido.fatos.nome || c.memoria.fatos.nome) ?? cv.contatoNome ?? "cliente";
  const relato = fala.replace(/\s+/g, " ").trim().slice(0, 200);
  await db.insert(schema.followUps).values({
    conversaId: c.conversaId,
    clienteId: cv.clienteId,
    negocioId: cv.negocioId,
    usuarioId: cv.responsavelId,
    agendadoPara: new Date(),
    notas: `${nome} não aceitou a simulação${modelo ? ` da ${modelo}` : ""}: "${relato}". A IA ofereceu o Pix, mais parcelas e um modelo mais em conta; se ele não aceitar, consultar a gerência e responder na conversa.`,
    tipo: "simulacao",
    motivo: "Consultar a gerência: cliente não aceitou a simulação",
    origem: "ia",
    modeloId: null,
    contexto: { detectadoPor: "ia", gerencia: true, modelo },
  });
  await mensagemSistema(db, c.conversaId, `CONSULTAR GERÊNCIA: o cliente não aceitou a simulação ("${relato}"). Veja com a gerência o que dá pra fazer e responda nesta conversa.`, { triagem: true });
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
/** A IA já marcou (ou remarcou) nas últimas falas da loja. */
const RX_AGENDADO = /\b(Agendado|Remarcado) ✅ Te esperamos/;
/** O que a própria IA escreveu ao perguntar ("Quarta, 21/10. E que horas…?", "Perfeito, às 14h! E qual dia…?"): só o
    dia e a hora ditos, sem o "das 8h às 18h" do horário da loja. É a memória do agendamento, escrita na conversa. */
function diaEHoraDaPergunta(historico: string | null | undefined) {
  const ultima = ultimasFalasDaLoja(historico, 1);
  if (!/(que horas|qual dia) fica melhor/i.test(ultima)) return "";
  const dia = /(domingo|segunda|terça|quarta|quinta|sexta|sábado), \d{2}\/\d{2}/i.exec(ultima)?.[0] ?? "";
  const hora = /^Agente IA: Perfeito, (às \d{1,2}h(?:\d{2})?)!/.exec(ultima)?.[1] ?? "";
  return [dia, hora].filter(Boolean).join(" ");
}
const horaCurta = (h: { hora: number; min: number }) => (h.min ? `${h.hora}h${String(h.min).padStart(2, "0")}` : `${h.hora}h`);
const maiuscula = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

/* Visita já marcada nesta conversa (agendada ou confirmada, ainda por vir): o cliente que manda outro dia ou hora
   remarca esta, não cria outra. */
async function visitaAbertaDaConversa(conversaId: number) {
  const t = schema.testDrives;
  const [v] = await db
    .select({ id: t.id, agendadoPara: t.agendadoPara })
    .from(t)
    .where(and(eq(t.conversaId, conversaId), inArray(t.status, STATUS_ABERTOS), gt(t.agendadoPara, new Date())))
    .orderBy(t.agendadoPara)
    .limit(1);
  return v ?? null;
}

/* Linear, sem margem para erro (dono, 15/10/2026, conversa do Elton): dia → hora → agendado. O dia dito fica escrito
   na pergunta da hora; hora sem dia nunca vira "amanhã" sozinha (a IA pergunta o dia); o cliente que corrige depois
   do agendado remarca o mesmo test drive. */
async function agendarVisitaPelaIa(c: CtxWorkflow, p: { modelo: string | null; nome: string | null; horario: HorarioLoja }): Promise<{ texto: string; quando: Date | null; erro?: string }> {
  const quem = p.nome ? `, ${p.nome}` : "";
  const funciona = horarioCurto(p.horario);
  /* a loja precisa estar aberta na hora marcada e meia hora depois */
  const lojaFunciona = (q: Date) => lojaAberta(p.horario, q) && lojaAberta(p.horario, new Date(q.getTime() + 30 * 60_000));

  /* já tem visita marcada: o que ele disse agora muda só o que ele disse (dia ou hora) */
  const marcada = await visitaAbertaDaConversa(c.conversaId);
  if (marcada) {
    const novo = remarcarPara(dataHoraDaVisita(c.textoBuffer), marcada.agendadoPara);
    if (!novo || novo.getTime() === marcada.agendadoPara.getTime())
      return { texto: `Está agendado ✅ Te esperamos ${quandoPorExtenso(marcada.agendadoPara)}${quem}, aqui na loja: ${LOCAL_LOJA.endereco}.`, quando: null };
    if (novo.getTime() < Date.now() + 15 * 60_000) return { texto: "Esse horário já passou. Qual outro dia e horário fica bom pra você? 😊", quando: null };
    if (!lojaFunciona(novo)) return { texto: `Nesse horário a loja está fechada. Funcionamos ${funciona}. Qual outro horário fica bom pra você? 😊`, quando: null };
    try {
      await reagendarTestDrive(null, marcada.id, novo);
    } catch (e) {
      if (e instanceof ErroRegra) return { texto: "Esse horário já está reservado. Pode ser um pouco antes ou depois? 🙏", quando: null, erro: e.message };
      throw e;
    }
    return { texto: `Remarcado ✅ Te esperamos ${quandoPorExtenso(novo)}${quem}, aqui na loja: ${LOCAL_LOJA.endereco}.`, quando: novo };
  }

  let dh = dataHoraDaVisita(c.textoBuffer);
  let textoDh = c.textoBuffer;
  /* o dia numa mensagem e a hora na outra ("quarta" → "Que horas fica melhor?" → "às 10h"): junta com as 2 últimas
     mensagens do cliente; a mensagem de agora vem primeiro e vale mais (dono, 14/10/2026). "às 10h" sozinho
     não é amanhã quando ele já disse o dia antes (Simulador de 14/10/2026: "quarta" virou quinta) */
  if (!dh.diaDito || !dh.temHora) {
    const recentes = (c.memoria.historico ?? "").split(/\n\s*\n/).filter((b) => b.startsWith("Lead:")).slice(-2).map((b) => b.replace(/^Lead:\s*/, "")).join("\n");
    /* a pergunta da IA traz o dia (e a hora) já entendidos e vem antes das mensagens velhas do cliente */
    const texto = [c.textoBuffer, diaEHoraDaPergunta(c.memoria.historico), recentes].filter(Boolean).join("\n");
    const junto = dataHoraDaVisita(texto);
    if (junto.temDia && junto.temHora && (junto.diaDito || !dh.temDia)) [dh, textoDh] = [junto, texto];
    else if (!dh.diaDito && junto.diaDito) [dh, textoDh] = [junto, texto];
  }
  /* sem dia, ou só a hora (que sozinha viraria "amanhã"): pergunta o dia, repetindo a hora que ele já disse */
  if (!dh.temDia || !diaClaro(dh, textoDh))
    return { texto: dh.hora ? `Perfeito, às ${horaCurta(dh.hora)}! E qual dia fica melhor pra você vir? Funcionamos ${funciona} 😊` : `Perfeito! Qual dia fica melhor pra você vir? Funcionamos ${funciona} 😊`, quando: null };
  /* dia sem hora: repete o dia com a data, que fica escrita para a próxima mensagem */
  if (!dh.temHora || !dh.quando) return { texto: `Show! ${dh.dia ? `${maiuscula(diaPorExtenso(dh.dia))}. ` : ""}E que horas fica melhor pra você? Funcionamos ${funciona} 😊`, quando: null };
  const quando = dh.quando;
  if (quando.getTime() < Date.now() + 15 * 60_000) return { texto: "Esse horário já passou. Qual outro dia e horário fica bom pra você? 😊", quando: null };
  if (!lojaFunciona(quando))
    return { texto: `Nesse horário a loja está fechada. Funcionamos ${funciona}. Qual outro horário fica bom pra você? 😊`, quando: null };
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
    if (e instanceof ErroRegra) return { texto: "Esse horário já está reservado. Pode ser um pouco antes ou depois? 🙏", quando: null, erro: e.message };
    throw e;
  }
  /* só promete a moto esperando se tem unidade Disponível (Simulador de 14/10/2026: X GÊMEOS sem estoque) */
  const moto = p.modelo && (await temUnidadeDisponivel(p.modelo, !!c.conversa?.demo)) ? ` ${artigo(p.modelo).toUpperCase()} *${p.modelo}* vai estar te esperando pro test drive 🛵` : "";
  /* o lembrete do dia sai sozinho (servicos/test-drive.ts): só promete quando ele vai sair (dono, 15/10/2026) */
  const lembrete = planoRetirada(quando, new Date(), new Date()).lembreteEm ? " No dia eu te mando um lembrete por aqui." : "";
  return { texto: `Agendado ✅ Te esperamos ${quandoPorExtenso(quando)}${quem}, aqui na loja: ${LOCAL_LOJA.endereco}.${moto}${lembrete}`, quando };
}

/* Dados do pedido no CRM (pedido do dono, 03/10/2026: "o objetivo da IA é pegar essas informações e
   guardar no CRM, com o resumo, para daí em diante a equipe assumir"). O que o cliente mandou vai para o
   cadastro dele; o resumo do pedido (sem CPF nem data de nascimento) vai para o negócio e para a conversa;
   o que faltou fica escrito para a equipe conferir. Entrega fora de Goiana: a IA não sabe se atende nem a
   taxa, então cria a tarefa para a equipe confirmar. Nada aqui manda mensagem ao cliente. */
/* Retirada ou entrega com dia e hora: tarefa da equipe 3 h antes (separar a moto / preparar a entrega) e o lembrete do
   cliente no dia (2 h antes, não antes das 8 h, dentro da janela de 24 h do WhatsApp). Entrega fora de Goiana: a equipe
   ainda confirma se atende, então só a tarefa (sem lembrete). Sem data que dê para marcar: tarefa agora para combinar. */
async function agendarCombinado(c: CtxWorkflow, p: { clienteId: number; negocioId: number | null; modo: "retirada" | "entrega"; horarioDito: string | undefined; nome: string | null; pagamento: string | null; cidade: string | null; endereco: string | null }) {
  const F = schema.followUps;
  const agora = new Date();
  const ret = quandoRetirar(trechoDeQuando(p.horarioDito, c.textoBuffer), await lerHorario(), agora);
  const cv = await carregarConversa(c.conversaId);
  const moto = c.modeloDaConversa ?? "moto";
  const quem = p.nome ?? "o cliente";
  const entrega = p.modo === "entrega";
  const foraDeGoiana = entrega && !!notaDeEntrega(p.cidade);
  const chaveData = entrega ? "entregaEm" : "retiradaEm";
  const doQue = entrega ? "da entrega" : "da retirada";
  /* mandou os dados de novo: vale o último dia e hora */
  await db
    .update(F)
    .set({ status: "cancelado", concluidoEm: agora })
    .where(and(eq(F.conversaId, c.conversaId), eq(F.status, "pendente"), sql`(${F.tipo} = 'lembrete_retirada' or (${F.tipo} in ('retirada', 'entrega') and (${F.contexto} ? 'retiradaEm' or ${F.contexto} ? 'entregaEm' or ${F.contexto}->>'combinar' = 'true')))`));
  const base = { conversaId: c.conversaId, clienteId: p.clienteId, negocioId: p.negocioId, usuarioId: cv.responsavelId, origem: "ia" as const };
  if (!ret.quando) {
    const porque = { sem_dia: "não disse o dia", sem_hora: "não disse a hora", passou: "o horário já passou", fechada: "a loja está fechada no horário que ele disse" }[ret.problema ?? "sem_dia"];
    const oQue = entrega ? `quer receber a ${moto}${p.endereco ? ` em ${p.endereco}` : ""}` : `vai retirar a ${moto} na loja`;
    await db.insert(F).values({ ...base, agendadoPara: agora, tipo: p.modo, motivo: entrega ? "Combinar a entrega" : "Combinar a retirada", notas: `${quem} ${oQue}, mas ${porque}${p.horarioDito ? ` ("${p.horarioDito}")` : ""}. Combine o dia e a hora com ele.`, contexto: { detectadoPor: "ia", modelo: moto, combinar: true } });
    return { quando: null, aviso: `Dia e hora ${doQue}: ${porque}. Ficou a tarefa para a equipe combinar.` };
  }
  const plano = planoRetirada(ret.quando, agora, agora);
  const lembreteEm = foraDeGoiana ? null : plano.lembreteEm;
  const lembrete = lembreteEm ? (entrega ? textoLembreteEntrega({ nome: p.nome, modelo: c.modeloDaConversa, quando: ret.quando }) : textoLembreteRetirada({ nome: p.nome, modelo: c.modeloDaConversa, quando: ret.quando })) : null;
  const avisoLembrete = lembreteEm ? ` A IA lembra o cliente às ${hora(lembreteEm)}.` : !foraDeGoiana && plano.foraDaJanela ? " Lembre o cliente no dia (passa das 24 h do WhatsApp, a IA não pode mandar)." : "";
  const pagou = p.pagamento ? ` Pagamento: ${p.pagamento}.` : "";
  await db.insert(F).values({
    ...base,
    agendadoPara: foraDeGoiana ? agora : plano.equipeEm,
    tipo: p.modo,
    motivo: entrega ? (foraDeGoiana ? "Confirmar a entrega fora de Goiana" : "Preparar a entrega") : "Separar a moto da retirada",
    notas: entrega
      ? `${foraDeGoiana ? "Confirmar se atende e a taxa, e entregar" : "Entregar"} a ${moto} para ${quem}: ${quandoPorExtenso(ret.quando)}${p.endereco ? ` em ${p.endereco}` : ""}.${pagou}${avisoLembrete}`
      : `Separar a ${moto} para ${quem}: vem retirar ${quandoPorExtenso(ret.quando)}.${pagou}${avisoLembrete}`,
    contexto: { detectadoPor: "ia", modelo: moto, [chaveData]: ret.quando.toISOString() },
  });
  if (lembreteEm && lembrete)
    await db.insert(F).values({ ...base, agendadoPara: lembreteEm, tipo: "lembrete_retirada", motivo: entrega ? "Lembrete da entrega" : "Lembrete da retirada", notas: `Lembrete automático ${doQue} para ${quem}. Cancele se não quiser que saia.`, contexto: { texto: lembrete, [chaveData]: ret.quando.toISOString(), doQue } });
  return {
    quando: ret.quando,
    aviso: foraDeGoiana ? "Entrega fora de Goiana: tarefa em Follow-ups para confirmar se atende." : `${entrega ? "Preparar a entrega" : "Separar a moto"}: tarefa em Follow-ups às ${hora(plano.equipeEm)}.${lembreteEm ? ` Lembrete ao cliente às ${hora(lembreteEm)}.` : ""}`,
  };
}

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
  /* na retirada também: a lista pede o endereço, que vai no documento da venda (dono, 15/10/2026: "antes da
     documentação eu não inseri o CPF do cliente e onde ele mora") */
  if (d.cep) patch.cep = d.cep;
  if (d.rua) patch.endereco = d.rua;
  if (d.numero) patch.numero = d.numero;
  if (d.bairro) patch.bairro = d.bairro;
  if (cidade) patch.cidade = cidade;
  if (Object.keys(patch).length) await db.update(schema.clientes).set({ ...patch, atualizadoEm: new Date() }).where(eq(schema.clientes.id, clienteId));

  const faltam = camposFaltando(d, modo, { cidade, pagamento: fatos.pagamento });
  const combinado = await agendarCombinado(c, { clienteId, negocioId, modo, horarioDito: d.horario, nome: primeiroNome(d.nomeCompleto ?? fatos.nome ?? null), pagamento: fatos.pagamento ?? d.pagamento ?? null, cidade, endereco: enderecoDe(d, cidade) || null }).catch(() => null);
  const linhas = [
    `Pedido pelo WhatsApp (IA): ${c.modeloDaConversa ?? "moto"}`,
    modo === "entrega"
      ? `Entrega: ${enderecoDe(d, cidade) || "endereço a confirmar"}${d.referencia ? ` (referência: ${d.referencia})` : ""}${combinado?.quando ? ` · ${quandoPorExtenso(combinado.quando)}` : d.horario ? ` · receber: ${d.horario} (dia e horário a confirmar)` : ""}`
      : `Retirada na loja: ${combinado?.quando ? quandoPorExtenso(combinado.quando) : d.horario ? `${d.horario} (dia e horário a confirmar com o cliente)` : "dia e horário a confirmar"} · endereço do cliente: ${enderecoDe(d, cidade) || "a confirmar"}`,
    combinado?.aviso ?? null,
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

/* Follow-up de aquecimento (07/10/2026, Damarys perguntou o preço, disse "Brgd" e sumiu; antes, 05/10/2026: "quando a
   pessoa mandar um Oi e não responder mais nada, 10 min, 1 h e 23 h depois"). Depois de cada resposta da IA, as
   tentativas antigas saem (o cliente falou) e nascem 3 novas que a IA ENVIA sozinha (lib/ia/workflow/aquecimento.ts),
   só para quem a IA está atendendo: recado, assistência, reclamação, conversa com a equipe e cliente que já mandou os
   dados do fechamento ficam com as pessoas. */
async function lembretesSemResposta(c: CtxWorkflow, clienteId: number | null, negocioId: number | null) {
  const cv = await carregarConversa(c.conversaId);
  const qualifica =
    !c.recado && !c.pipe?.humano && !c.aguardaEquipe && !c.motivoTransferencia && c.intencao !== "assistencia" && !["mandou_dados", "dados_parciais"].includes(c.momento ?? "") && cv.modo !== "humano" &&
    /* Mayna (11/10/2026): virou recado antes e o assunto não é compra agora; ou ela encerrou ("Já resolveu!") */
    !(conversaForaDaVenda(c.memoria.historico) && c.intencao !== "compra") &&
    !clienteEncerrou(c.textoBuffer);
  const nome = primeiroNome(c.memoria.fatos.nome || c.aprendido.fatos.nome) ?? primeiroNome(nomeDoPerfil(cv.contatoNome));
  /* moto sem unidade Disponível não entra no follow-up (Simulador, 14/10/2026: "o que está faltando para concluirmos a sua
     compra do Patinete 350W?" com o patinete em falta); vai a pergunta geral */
  const modelo = c.intencao === "compra" && !clienteRecusouOModelo(c.textoBuffer) && c.modeloDaConversa && (await temUnidadeDisponivel(c.modeloDaConversa, !!c.conversa?.demo)) ? c.modeloDaConversa : null;
  return agendarAquecimento({ conversaId: c.conversaId, clienteId: clienteId ?? cv.clienteId, negocioId: negocioId ?? cv.negocioId, usuarioId: cv.responsavelId, qualifica, nome, modelo });
}

/** O modelo tem unidade Disponível no estoque (veículo de teste só conta em conversa simulada)? */
async function temUnidadeDisponivel(nome: string, demo: boolean) {
  const v = schema.veiculos;
  const m = schema.modelos;
  const [modelo] = await db.select({ id: m.id }).from(m).where(sql`lower(${m.nome}) = ${nome.trim().toLowerCase()}`).limit(1);
  const [u] = await db
    .select({ id: v.id })
    .from(v)
    .where(and(eq(v.status, "disponivel"), demo ? undefined : eq(v.teste, false), modelo ? sql`(${v.modeloId} = ${modelo.id} or lower(${v.modelo}) = ${nome.trim().toLowerCase()})` : sql`lower(${v.modelo}) = ${nome.trim().toLowerCase()}`))
    .limit(1);
  return !!u;
}

/** Tarefa "Revisar atendimento da IA" em Follow-ups quando o cliente reclama (Arine, 06/10/2026). Uma pendente por conversa. */
async function tarefaRevisarIa(c: CtxWorkflow, queixa: string) {
  const F = schema.followUps;
  const [ja] = await db.select({ id: F.id }).from(F).where(and(eq(F.conversaId, c.conversaId), eq(F.status, "pendente"), eq(F.tipo, "revisar_ia"))).limit(1);
  if (ja) return null;
  const cv = await carregarConversa(c.conversaId);
  await db.insert(F).values({
    conversaId: c.conversaId,
    clienteId: cv.clienteId,
    negocioId: cv.negocioId,
    usuarioId: cv.responsavelId,
    agendadoPara: new Date(),
    notas: `O cliente reclamou do atendimento da IA: "${queixa.slice(0, 200)}". Assuma a conversa, mande o que ele pediu e veja o que a IA respondeu antes (para corrigir).`.slice(0, 1000),
    tipo: "revisar_ia",
    motivo: "Revisar atendimento da IA",
    origem: "ia",
    contexto: { detectadoPor: "ia", queixa: queixa.slice(0, 300) },
  });
  return true;
}

/** Modelos que o catálogo descreve como triciclo / três rodas (hoje o MM3) e que têm unidade disponível. */
async function triciclosComEstoque(c: CtxWorkflow) {
  const m = schema.modelos;
  const v = schema.veiculos;
  const linhas = await db
    .select({ nome: m.nome })
    .from(m)
    .where(and(eq(m.ativo, true), sql`(${m.descricao} ilike '%triciclo%' or ${m.descricao} ilike '%três rodas%' or ${m.descricao} ilike '%tres rodas%')`, sql`exists (select 1 from ${v} where ${v.modeloId} = ${m.id} and ${v.status} = 'disponivel' ${c.conversa?.demo ? sql`` : sql`and not ${v.teste}`})`));
  return linhas.map((l) => l.nome);
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
/** Modelos elétricos com unidade Disponível (fora as de teste, menos na conversa simulada): cores, preço e autonomia. */
async function itensDisponiveis(c: CtxWorkflow): Promise<ItemDisponivel[]> {
  const m = schema.modelos;
  const v = schema.veiculos;
  const [modelos, unidades] = await Promise.all([
    db.select({ id: m.id, nome: m.nome, tipo: m.tipo, preco: m.precoTabela, ficha: m.ficha }).from(m).where(and(eq(m.ativo, true), inArray(m.tipo, [...TIPOS_VENDA_IA]))),
    db.select({ modeloId: v.modeloId, modelo: v.modelo, cor: v.cor, valor: v.valorAnunciado }).from(v).where(and(eq(v.status, "disponivel"), inArray(v.tipo, [...TIPOS_VENDA_IA]), c.conversa?.demo ? undefined : eq(v.teste, false))),
  ]);
  return modelos
    .map((x) => {
      const minhas = unidades.filter((u) => u.modeloId === x.id || (!u.modeloId && u.modelo.trim().toLowerCase() === x.nome.trim().toLowerCase()));
      const valores = minhas.map((u) => (u.valor ? Number(u.valor) : null)).filter((n): n is number => !!n);
      return {
        nome: x.nome,
        tipo: x.tipo,
        unidades: minhas.length,
        cores: Array.from(new Set(minhas.map((u) => u.cor?.trim()).filter((cor): cor is string => !!cor))),
        preco: valores.length ? Math.min(...valores) : x.preco ? Number(x.preco) : null,
        autonomia: (x.ficha as Record<string, string> | null)?.autonomia ?? null,
        destaque: null,
      };
    })
    .filter((x) => x.unidades > 0)
    .sort((a, b) => (a.tipo === b.tipo ? (a.preco ?? 0) - (b.preco ?? 0) : a.tipo === "patinete" ? 1 : -1));
}
async function nomesDoCatalogo() {
  const linhas = await db.select({ nome: schema.modelos.nome }).from(schema.modelos).where(eq(schema.modelos.ativo, true));
  return linhas.map((l) => l.nome);
}

/** O que o cliente quer, pelo que ELE escreveu (esta mensagem, as anteriores e o interesse já anotado). */
async function intencaoDoCliente(c: CtxWorkflow): Promise<Intencao | null> {
  const texto = textoDoCliente(c);
  const nomes = await nomesDoCatalogo();
  /* o que ele pede AGORA manda: reclamou antes, mas agora fala de comprar ("tem algo parecido com esse?", "quero ver esse
     triciclo") → compra (Pablo Júnior, 12/10/2026: a conversa ficou presa em assistência e a IA repetiu 4 vezes o pedido
     de relato) */
  if (intencaoDoTexto(semAberturaDoSite(c.textoBuffer), nomes) === "compra") return "compra";
  const intencao = intencaoDoTexto([c.memoria.fatos.interesse ?? "", semAberturaDoSite(texto)].join("\n"), nomes);
  /* veio pelo botão do site e ainda não disse o quê: é quem quer comprar (o "consultor" é o Milton) */
  return intencao ?? (veioDoSite(texto) ? "compra" : null);
}

/* Pedido do dono (02/10/2026): na abordagem, primeiro ENTENDER o que o cliente quer. Quem só cumprimentou
   ou disse o nome pode querer garantia, assistência ou peça: nada de moto, preço, estoque ou foto ainda.
   Sai a frase que oferece produto e as perguntas saem; fica UMA, aberta: "Como posso te ajudar?" (fase 2:
   o nome não é mais a pergunta). */
async function entenderPrimeiro(resposta: string[], intencao: Intencao | null, c?: CtxWorkflow): Promise<string[]> {
  /* assistência e a IA ofereceu moto mesmo assim (teste de 12/10/2026, caso Mayna: "Só mostra LC" virou "não temos o
     modelo LC... posso apresentar a T1, M6 ou AG08?"): a oferta sai e a IA pede o relato para a assistência */
  if (intencao === "assistencia" && !c?.recado) {
    const nomes = await nomesDoCatalogo();
    const ofereceu = resposta.some((b) => tirarOfertaDeProduto(b, nomes) !== b.trim());
    /* o pedido de relato vai UMA vez (Pablo Júnior, 12/10/2026: saiu 4 vezes seguidas); já foi, fica a resposta da IA */
    const jaPediu = (c?.memoria.historico ?? "").includes(TEXTO_PEDE_RELATO.slice(0, 50));
    /* a resposta dela inteira sai: o que sobrava ainda era venda ("Posso anotar seu interesse para avisar quando chegar.") */
    return ofereceu && !jaPediu ? [TEXTO_PEDE_RELATO] : resposta;
  }
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
    case "interesse":
      /* Milton (12/10/2026): passa o orçamento e a foto e espera. "O que está faltando para concluirmos?" é o
         1º follow-up, 1 h depois, se o cliente não responder (lib/ia/aquecimento.ts); uso e km também não agora */
      return semPerguntaDeFechamento(soOQuePerguntou(resposta, c.textoBuffer));
    case "decidido": {
      const corpo = semPerguntas(resposta);
      const comParabens = corpo.some((b) => RX_PARABENS.test(b)) ? corpo : [variar(parabens(c.modeloDaConversa)), ...corpo.filter((b) => !/R\$|autonomia|km/iu.test(b))];
      /* já disse como quer receber ("vou buscar na loja"): direto a lista de dados, sem perguntar de novo */
      const jaDisse = jaDisseComoReceber(c.textoBuffer);
      if (jaDisse === "retirada") return [...comParabens, listaDeDados("retirada", {})];
      if (jaDisse === "entrega") {
        const nota = notaDeEntrega(fatos.cidade);
        return [...comParabens, listaDeDados("entrega", { cidade: fatos.cidade, pagamento: fatos.pagamento }), ...(nota ? [nota] : [])];
      }
      return [...comParabens, variar(PERGUNTAS_ENTREGA_OU_RETIRADA)];
    }
    case "objecao_preco": {
      /* sem saber quanto ele roda, não dá para fazer a conta: pergunta os km */
      if (kmDoCliente(c) || resposta.some((b) => /km/iu.test(b) && /\?/.test(b))) return resposta;
      return [...semPerguntas(resposta), variar(PERGUNTAS_KM)];
    }
    case "informou_km":
      /* a conta certa já entrou (garantirEconomia); a pergunta de fechamento fica para o follow-up (Milton, 12/10/2026) */
      return semPerguntaDeFechamento(resposta);
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
    db.select({ id: m.id, nome: m.nome, preco: m.precoTabela, ficha: m.ficha }).from(m).where(and(eq(m.ativo, true), eq(m.mostrarNoSite, true), inArray(m.tipo, [...TIPOS_VENDA_IA]))),
    db.select({ modeloId: v.modeloId, modelo: v.modelo }).from(v).where(and(eq(v.status, "disponivel"), inArray(v.tipo, [...TIPOS_VENDA_IA]), c.conversa?.demo ? undefined : eq(v.teste, false))),
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
    db.select({ id: m.id, nome: m.nome, fotoUrl: m.fotoUrl, fotoWhatsappUrl: m.fotoWhatsappUrl, videoUrl: m.videoUrl }).from(m).where(and(eq(m.ativo, true), inArray(m.tipo, [...TIPOS_VENDA_IA]))),
    db.select({ modeloId: v.modeloId, modelo: v.modelo, cor: v.cor }).from(v).where(and(eq(v.status, "disponivel"), inArray(v.tipo, [...TIPOS_VENDA_IA]), c.conversa?.demo ? undefined : eq(v.teste, false))),
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

/** A loja (IA ou vendedor) já perguntou o nome do cliente nesta conversa. */
function jaPerguntouONome(historico: string | null | undefined) {
  return (historico ?? "").split(/\n/).some((l) => /^(Agente IA|Vendedor):/.test(l) && RX_PERGUNTA_NOME.test(l));
}

/** As últimas falas da loja (IA ou vendedor), de trás para frente, sem parar no cliente: de que motos se falou por último. */
function ultimasFalasDaLoja(historico: string | null | undefined, n: number) {
  const blocos = (historico ?? "").split(/\n\s*\n/).map((b) => b.trim()).filter((b) => /^(Agente IA|Vendedor):/.test(b));
  return blocos.slice(-n).join("\n");
}

/** Endereços de foto/vídeo que a IA já mandou nesta conversa (para não repetir sem o cliente pedir). */
/* Só conta o que foi mandado nas últimas 24 h: cliente que volta outro dia e se interessa de novo recebe a foto e o
   vídeo outra vez (conversa real de 05/10/2026: a TANK tinha ido dias antes e a IA não mandou). */
async function midiasJaEnviadas(conversaId: number, horas = 24) {
  const desde = new Date(Date.now() - horas * 60 * 60 * 1000);
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
    /* regra do dono (15/10/2026, substitui a de 27/09): em HUMANO a IA fica travada, a qualquer hora, até o vendedor
       voltar a chave para IA ("se ele não mudar, a IA fica travada"). Leandro: a IA assumiu sozinha depois de 15 min. */
    const aberta = lojaAberta(await lerHorario());
    const humano = c.conversa!.modo === "humano";
    return { ramo: humano ? "humano" : "ia", saida: { status: humano ? "HUMANO" : "I.A", responsavel: c.conversa!.responsavelId, lojaAberta: aberta } };
  },

  ia_off: async (c) => {
    /* áudio em atendimento HUMANO também é transcrito (dono, 18/10/2026: "a IA não está analisando o áudio"; o do Valmir,
       em Humano, ficou sem texto): o vendedor lê no chat, e a IA e a Sonix têm o conteúdo quando voltarem */
    let transcrito = false;
    if (c.mensagem?.tipo === "audio" && c.config.transcreverAudio && !transcricaoDe(c.mensagem)) transcrito = !!(await analisarNo(c, "audio", true).catch(() => null));
    return { fim: "parou", detalhe: `Atendimento HUMANO: a IA não responde. A mensagem fica na memória.${transcrito ? " O áudio foi transcrito para a equipe." : ""}`, saida: { respondeu: false, transcrito } };
  },

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
    /* a resposta anterior ainda está saindo ("digitando"): espera ela terminar (até 90 s) para não responder por cima e
       repetir a mesma pergunta (Damarys, 07/10/2026: "Como posso te ajudar?" duas vezes seguidas) */
    const E = schema.iaWorkflowExecucoes;
    for (let i = 0; i < 45; i++) {
      const [anterior] = await db
        .select({ id: E.id })
        .from(E)
        .where(and(eq(E.conversaId, c.conversaId), eq(E.status, "rodando"), lt(E.mensagemId, c.mensagemId!), gt(E.iniciadoEm, sql`now() - interval '5 minutes'`)))
        .limit(1);
      if (!anterior) break;
      await esperar(2000);
    }
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
    /* mensagem repetida que a IA acabou de responder (teste de 12/10/2026: "Valor dos patinetes elétricos?" entrou duas
       vezes e saíram duas respostas quase iguais; cliente que reenvia achando que não foi): não responde de novo */
    /* a mensagem desta execução pode ter chegado antes da resposta anterior sair (aí não está em msgs) */
    const novas = msgs.length ? msgs : c.mensagem ? [c.mensagem] : [];
    if (ultimaResposta && novas.length && novas.every((m) => m.tipo === "texto")) {
      const respondidas = await db
        .select({ conteudo: schema.mensagens.conteudo })
        .from(schema.mensagens)
        .where(and(eq(schema.mensagens.conversaId, c.conversaId), eq(schema.mensagens.direcao, "incoming"), lt(schema.mensagens.id, ultimaResposta.id), ne(schema.mensagens.id, c.mensagemId!), gt(schema.mensagens.criadoEm, sql`now() - interval '5 minutes'`)));
      if (mensagensRepetidas(novas.map((m) => m.conteudo ?? ""), respondidas.map((r) => r.conteudo ?? "")))
        return { fim: "parou", detalhe: "Mensagem repetida: a IA já respondeu esse mesmo texto há menos de 5 min", saida: { repetida: true, texto: textoBuffer } };
    }
    return { ctx: { textoBuffer, primeiraDoBuffer: msgs[0]?.id ?? c.mensagemId }, saida: { mensagens: textos.length, texto: textoBuffer } };
  },

  reconfere_modo: async (c) => {
    const conversa = await carregarConversa(c.conversaId);
    const humano = conversa.modo === "humano";
    return { ramo: humano ? "humano" : "ia", ctx: { conversa }, saida: { status: humano ? "HUMANO" : "I.A" } };
  },

  memoria_carrega: async (c) => {
    const mem = await lerMemoria(c.conversaId);
    /* tudo antes das mensagens desta vez e o que a loja mandou depois delas (a resposta anterior que terminou de sair
       enquanto o cliente escrevia): a IA vê o que acabou de perguntar e não repete */
    const filtros = [eq(schema.mensagens.conversaId, c.conversaId), ne(schema.mensagens.autor, "sistema"), sql`(${schema.mensagens.id} < ${c.primeiraDoBuffer ?? c.mensagemId!} or ${schema.mensagens.direcao} = 'outgoing')`];
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
    /* não é cliente (TIM oferecendo plano, robô de menu, loop): a IA não vende para quem vende para a loja (dono,
       15/10/2026). Oferta recebe uma resposta só; robô e loop, nenhuma. Sempre para a equipe, mesmo de noite. */
    const [anteriores, [{ n: daIa }]] = await Promise.all([
      db
        .select({ conteudo: schema.mensagens.conteudo })
        .from(schema.mensagens)
        .where(and(eq(schema.mensagens.conversaId, c.conversaId), eq(schema.mensagens.direcao, "incoming"), lt(schema.mensagens.id, c.primeiraDoBuffer ?? c.mensagemId!), gt(schema.mensagens.criadoEm, sql`now() - interval '3 hours'`))),
      db
        .select({ n: sql<number>`count(*)::int` })
        .from(schema.mensagens)
        .where(and(eq(schema.mensagens.conversaId, c.conversaId), eq(schema.mensagens.autor, "ia"), gt(schema.mensagens.criadoEm, sql`now() - interval '1 hour'`))),
    ]);
    const naoCliente = naoEhCliente({ texto: c.textoBuffer, anterioresDoCliente: anteriores.map((m) => m.conteudo ?? ""), mensagensDaIaUltimaHora: daIa });
    if (naoCliente) {
      const texto = naoCliente === "oferta" ? TEXTO_OFERTA_SERVICO : null;
      return {
        ramo: "bloqueada",
        ctx: { pipe: { ...r.ctx, texto, textoCatalogo: texto, humano: true, motivo: "nao_e_cliente" as const }, naoCliente, motivoTransferencia: MOTIVO_NAO_CLIENTE[naoCliente] },
        saida: { bloqueada: "nao_e_cliente", naoCliente, mensagensDaIaUltimaHora: daIa, resposta: texto },
      };
    }
    return { saida: { tamanho: c.textoBuffer.length, aprovada: true } };
  },

  agente: async (c) => {
    const promptSistema = [await montarPromptSistema(), (await catalogoParaIa({ incluirTeste: !!c.conversa?.demo, kmSemana: kmDoCliente(c), gasolina: await gasolinaDoCliente(c) })).texto].filter(Boolean).join("\n\n");
    /* o cliente pediu foto/vídeo? A IA sabe antes de escrever o que vai (ou não) junto */
    const leadAntes = (c.memoria.historico ?? "").split(/\n\s*\n/).filter((l) => l.startsWith("Lead:")).join("\n");
    const midia = planejarPedido({ modelos: await motosComMidia(c), textoCliente: c.textoBuffer, historicoCliente: leadAntes, interesse: c.memoria.fatos.interesse ?? null, ultimasDaLoja: ultimasFalasDaLoja(c.memoria.historico, 3) });
    /* o que o cliente quer (compra, assistência ou ainda não disse): sem saber, nada de produto */
    const intencao = await intencaoDoCliente(c);
    /* momento da compra: a que pergunta ele responde, se tem interesse, se decidiu, se tem objeção */
    const nomesCat = (await nomesDoCatalogo()).map((nome) => ({ nome }));
    const modeloDaConversa = ultimaCitada(nomesCat, [c.memoria.fatos.interesse ?? "", leadAntes, c.textoBuffer].join("\n"))?.nome ?? null;
    const ultimaDaLoja = ultimaFalaDaLoja(c.memoria.historico);
    /* acabou de agendar: outro dia ou hora agora é remarcação (Elton, 15/10/2026) */
    /* tem visita marcada na agenda (não só nas últimas mensagens: os follow-ups empurram o "Agendado" para trás) */
    const jaAgendou = RX_AGENDADO.test(ultimasFalasDaLoja(c.memoria.historico, 3)) || !!(await visitaAbertaDaConversa(c.conversaId));
    const falaDeVisita = RX_QUER_VISITAR.test(c.textoBuffer) || RX_PEDIU_HORARIO_VISITA.test(ultimaDaLoja) || jaAgendou || (RX_PERGUNTA_ENDERECO.test(c.textoBuffer) && intencao !== "assistencia");
    const momento = intencao === "compra" || falaDeVisita ? detectarMomento({ textoCliente: c.textoBuffer, ultimaDaLoja, conheceModelo: !!modeloDaConversa, objecoesAntes: objecoesDePrecoAntes(leadAntes), jaAgendou }) : null;
    const horario = await lerHorario();
    const agora = agoraNaLoja();
    const aberta = lojaAberta(horario);
    /* QUALIFICAÇÃO CONSULTIVA (dono, 18/10/2026: "primeiro a recepção calorosa, depois a qualificação... para aí sim a
       curadoria do estoque personalizada"; "ela será o diferencial da IA"). Quem quer comprar e ainda não escolheu a moto
       responde, uma por vez, o que falta (uso, km por dia, garupa/carga, faixa de valor); com o suficiente, o sistema
       indica no máximo 2 motos do estoque com o porquê. Nada de lista do estoque antes disso. */
    const necessidade = lerDoCliente(semAberturaDoSite(c.textoBuffer), lerNecessidade(c.memoria.fatos.necessidade), ultimaDaLoja);
    const emDescoberta =
      intencao === "compra" && !modeloDaConversa && !jaIndicou(c.memoria.historico ?? "") && MOMENTOS_DA_DESCOBERTA.includes(momento) && !pedidoDeAvaliacao(semAberturaDoSite(c.textoBuffer), leadAntes);
    const motosQualif = emDescoberta ? await motosParaIndicar(c) : [];
    const passo = emDescoberta
      ? proximoPasso(necessidade, perguntasFeitas(falasDaLoja(c.memoria.historico)), {
          falouDeValor: RX_PERGUNTOU_VALOR.test([leadAntes, c.textoBuffer].join("\n")),
          pediuOpcoesAntes: pediuOpcoes(leadAntes),
          pedeOpcoesAgora: pediuOpcoes(semAberturaDoSite(c.textoBuffer)),
        })
      : null;
    let qualificacao: CtxWorkflow["qualificacao"];
    if (passo?.acao === "perguntar") {
      const doTipo = motosQualif.filter((x) => (necessidade.tipo === "patinete" ? x.tipo === "patinete" : x.tipo === "moto_eletrica") && x.preco);
      const precos = doTipo.map((x) => x.preco!);
      /* perguntou valor ou as opções: "temos a partir de" (a mais em conta, do estoque) antes da pergunta, como o vendedor faz */
      const quis = RX_PERGUNTOU_VALOR.test(semAberturaDoSite(c.textoBuffer)) || pediuOpcoes(semAberturaDoSite(c.textoBuffer));
      const abertura = quis && precos.length ? `Temos ${necessidade.tipo === "patinete" ? "patinete elétrico" : "moto elétrica"} a partir de *${reais(Math.min(...precos))}*, com pronta entrega 😊` : null;
      qualificacao = { pergunta: textoPergunta(passo.chave, { n: necessidade, precos: faixasDoEstoque(precos) ? precos : motosQualif.map((x) => x.preco ?? 0) }), abertura };
    }
    const g = criarGerador({
      promptSistema,
      memoria: c.memoria,
      agora: `# AGORA
Hoje é ${agora.extenso} (horário de Recife). A loja está ${aberta ? "ABERTA" : "FECHADA"} agora. Cumprimento certo agora: "${saudacaoDoHorario()[0].toUpperCase()}${saudacaoDoHorario().slice(1)}" (ex.: "${saudacaoDoHorario()[0].toUpperCase()}${saudacaoDoHorario().slice(1)}! Tudo certinho?").${aberta ? "" : " Loja fechada NÃO muda a venda: continue conduzindo até o fechamento (o que falta, entrega ou retirada, dados), como se a loja estivesse aberta. Nunca adie (nada de \"conversamos amanhã\") e não comece a resposta dizendo que a loja está fechada. Só se o cliente quiser vir à loja ou falar com um vendedor, diga com naturalidade que a equipe responde assim que a loja abrir."}

${qualificacao ? instrucaoDoSiteBase(textoDoCliente(c)) + instrucaoQualificacao(necessidade) : instrucaoDoSite(textoDoCliente(c))}${instrucaoDeFoto(c.textoBuffer)}${instrucaoDeAudio(c.textoBuffer)}${instrucaoIntermediario(textoDoCliente(c))}${instrucaoTriciclo(c.textoBuffer, await triciclosComEstoque(c))}${instrucaoDeIntencao(intencao)}

${respondeuSoONome(c.textoBuffer, ultimaDaLoja) ? "# O CLIENTE SÓ DISSE O NOME\nEle acabou de responder só o nome. Responda CURTO: cumprimente pelo nome e retome a conversa com UMA pergunta sobre o que vocês estavam falando. NÃO repita preço, ficha, cores, disponibilidade nem nada que a loja já mandou.\n\n" : ""}${emDescoberta ? "" : instrucaoDeFechamento(momento, modeloDaConversa)}

${intencao === "compra" && !emDescoberta ? instrucaoDeMidia(midia) : instrucaoDeMidia(null)}`,
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
    const aprendido = { fatos: { ...(ultimo?.fatos ?? {}), necessidade: JSON.stringify(necessidade) }, resumo: ultimo?.resumo ?? null };
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
    /* o cliente reclamou do atendimento da IA ("não veio foto", "acho que é atendente virtual... depois passo aí"):
       desculpas e uma pessoa da equipe (Arine, 06/10/2026). Fica marcado para a equipe revisar a conversa. */
    /* foto ou áudio do cliente, de qualquer jeito que venha (só, com legenda, foto e depois "tem essa?"): a IA não tenta
       reconhecer nem sugere moto (dono, 09 e 10/10/2026: oferecia moto nada a ver, e às vezes a foto é de modelo que a
       loja nem trabalha). Texto do sistema com o catálogo; escreveu o nome de um modelo, a IA atende sobre ele. */
    /* venda facilitada com troca ou compra do que o cliente tem (dono, 17/10/2026: "a IA está dizendo que não pega moto
       como entrada... pede pra pessoa enviar os dados para avaliação e transfere já para um humano"). Texto do sistema
       com os dados daquele item (moto, carro, celular, outro), nunca valor; vai para um vendedor na hora. */
    const avaliacao = jaPediuAvaliacao(c.memoria.historico ?? "") ? null : pedidoDeAvaliacao(semAberturaDoSite(c.textoBuffer), leadAntes);
    if (avaliacao) {
      const texto = textoPedidoAvaliacao({ ...avaliacao, nome: primeiroNome(ultimo?.fatos?.nome || c.memoria.fatos.nome), lojaAberta: aberta });
      const relato = semAberturaDoSite(c.textoBuffer).replace(/\s+/g, " ").trim().slice(0, 300);
      const motivo = motivoAvaliacao({ ...avaliacao, modeloDeInteresse: modeloDaConversa, relato });
      const pipe = { ...r.ctx, texto, textoCatalogo: texto, humano: true, motivo: "modelo_pediu_transferencia" as const };
      return { ctx: { pipe, aprendido, saudacao: g.saudacao(), midia: null, momento: null, intencao: avaliacao.tipo === "troca" ? ("compra" as const) : null, modeloDaConversa, ultimaDaLoja, avaliacao, motivoTransferencia: motivo }, entrada: { texto: c.textoBuffer }, saida: { ...saida, resposta: texto, transferir: true, avaliacao } };
    }
    /* qualificação completa: o sistema indica as motos (no máximo 2, com o porquê de cada uma). Sem moto que sirva, a IA segue */
    if (passo?.acao === "indicar" && r.ctx.texto) {
      const texto = textoIndicacao({ nome: primeiroNome(ultimo?.fatos?.nome || c.memoria.fatos.nome), n: necessidade, indicadas: indicarMotos(necessidade, motosQualif) });
      if (texto) {
        const pipe = { ...r.ctx, texto, textoCatalogo: texto, humano: false, motivo: null };
        return { ctx: { pipe, aprendido, saudacao: g.saudacao(), midia: null, momento: null, intencao, modeloDaConversa: null, ultimaDaLoja, motivoTransferencia: null }, entrada: { texto: c.textoBuffer }, saida: { ...saida, resposta: texto, qualificacao: { indicou: true, necessidade } } };
      }
    }
    const paraMidia = respostaParaMidia({ textoBuffer: c.textoBuffer, ultimaDaLoja, modelos: nomesCat.map((m) => m.nome), foraDaVenda: intencao === "assistencia" || reclamouDoAtendimento(c.textoBuffer) || RX_RECADO.test(semAberturaDoSite(c.textoBuffer)) || RX_PEDE_PESSOA.test(semAberturaDoSite(c.textoBuffer)) });
    if (r.ctx.texto && paraMidia) {
      /* catálogo + a lista do que tem disponível, montada pelo estoque (usuário, 12/10/2026) */
      const lista = paraMidia === "catalogo_foto" || paraMidia === "catalogo_audio" ? listaDisponiveis(await itensDisponiveis(c), c.textoBuffer) : null;
      const texto = lista ? `${TEXTO_DA_RESPOSTA[paraMidia]}

${lista}` : TEXTO_DA_RESPOSTA[paraMidia];
      const pipe = { ...r.ctx, texto, textoCatalogo: texto, humano: false, motivo: null };
      return { ctx: { pipe, aprendido, saudacao: g.saudacao(), midia: null, momento: null, intencao, modeloDaConversa: null, ultimaDaLoja, motivoTransferencia: null }, entrada: { texto: c.textoBuffer }, saida: { ...saida, resposta: texto, catalogo: paraMidia } };
    }
    if (intencao !== "assistencia" && r.ctx.texto && reclamouDoAtendimento(c.textoBuffer)) {
      const texto = textoQueixa({ nome: primeiroNome(ultimo?.fatos?.nome || c.memoria.fatos.nome), lojaAberta: aberta });
      const pipe = { ...r.ctx, texto, textoCatalogo: texto, humano: true, motivo: "modelo_pediu_transferencia" as const };
      await mensagemSistema(db, c.conversaId, `REVISAR ATENDIMENTO DA IA: o cliente reclamou ("${c.textoBuffer.slice(0, 160)}"). Veja o que a IA mandou antes.`, { revisarIa: true });
      /* fila de revisão: tarefa em Follow-ups para a equipe olhar no mesmo dia o que a IA fez (uma por conversa aberta) */
      await tarefaRevisarIa(c, c.textoBuffer).catch(() => null);
      return { ctx: { pipe, aprendido, saudacao: g.saudacao(), midia: null, momento, intencao, modeloDaConversa, ultimaDaLoja, motivoTransferencia: `O cliente reclamou do atendimento da IA: "${c.textoBuffer.slice(0, 200)}". Assumir e mandar o que ele pediu.` }, entrada: { texto: c.textoBuffer }, saida: { ...saida, resposta: texto, transferir: true, queixa: true } };
    }
    const naoPodeVir = RX_NAO_PODE_VIR.test(c.textoBuffer);
    const irritado = RX_IRRITADO.test(c.textoBuffer);
    if (intencao === "assistencia" && r.ctx.texto && (r.ctx.humano || naoPodeVir || irritado)) {
      const doCliente = textoDoCliente(c);
      const relato = doCliente.replace(/^Lead:\s*/gm, "").replace(/\s+/g, " ").trim().slice(-300);
      const texto = textoPosVenda({
        nome: primeiroNome(ultimo?.fatos?.nome || c.memoria.fatos.nome),
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
    const pedePessoa = RX_RECADO.test(semAberturaDoSite(c.textoBuffer)) || RX_PEDE_PESSOA.test(semAberturaDoSite(c.textoBuffer));
    /* "compra" só por ter vindo do botão do site não segura quem pede o dono (Anderson, 15/10/2026: "Gostaria de falar
       com o proprietário" recebeu a lista do estoque) */
    const soPeloSite = intencao === "compra" && !intencaoDoTexto(semAberturaDoSite(textoDoCliente(c)), nomesCat.map((m) => m.nome));
    if ((!intencao || (soPeloSite && pedePessoa)) && !perguntaRobo && r.ctx.texto && (r.ctx.humano || pedePessoa || (jaPerguntouAjuda && falouAlgo))) {
      const relato = textoDoCliente(c).replace(/^Lead:\s*/gm, "").replace(/\s+/g, " ").trim().slice(-300);
      const texto = textoRecado({
        nome: primeiroNome(ultimo?.fatos?.nome || c.memoria.fatos.nome),
        lojaAberta: aberta,
        jaEncaminhou: /passar o seu recado|juntei isso ao seu recado/iu.test(c.memoria.historico ?? ""),
      });
      const pipe = { ...r.ctx, texto, textoCatalogo: texto, humano: true, motivo: "modelo_pediu_transferencia" as const };
      return { ctx: { pipe, aprendido, saudacao: g.saudacao(), midia: null, momento: null, intencao, modeloDaConversa, ultimaDaLoja, recado: true, motivoTransferencia: `Recado / outro assunto. O cliente escreveu: "${relato}"` }, entrada: { texto: c.textoBuffer }, saida: { ...saida, resposta: texto, transferir: true, recado: true } };
    }
    if (momento === "pediu_simulacao") {
      const recentes = leadAntes.split("\n").slice(-2).join("\n");
      /* simulação 100% do sistema (relatório "Taxas da maquineta", 10/10/2026): decidirSimulacao escolhe UMA ação com
         o texto pronto (calcula, pergunta o que falta ou passa ao vendedor); aqui só se executa. Taxas: Configurações. */
      const d = decidirSimulacao({
        textoCliente: c.textoBuffer,
        recentesCliente: recentes,
        ultimaDaLoja,
        modelo: modeloDaConversa,
        preco: modeloDaConversa ? await precoDoModelo(modeloDaConversa) : null,
        nome: primeiroNome(ultimo?.fatos?.nome || c.memoria.fatos.nome),
        taxas: await lerTaxas(),
        jaPerguntou: (o) => jaPerguntouSoOQueFalta(ultimaDaLoja, o),
      });
      if (d.acao === "enviar") await mensagemSistema(db, c.conversaId, `Simulação enviada pela IA (calculada pelo sistema): ${d.registro}.`, { triagem: true });
      if (d.acao === "vendedor") await criarTarefaSimulacao(c, d.pedido, modeloDaConversa);
      const pipe = { ...r.ctx, texto: d.texto, textoCatalogo: d.texto, humano: false, motivo: null };
      return { ctx: { pipe, aprendido, saudacao: g.saudacao(), midia: null, momento, intencao, modeloDaConversa, ultimaDaLoja, motivoTransferencia: null }, entrada: { texto: c.textoBuffer }, saida: { ...saida, momento, simulacao: { acao: d.acao, ...(d.acao === "enviar" ? { registro: d.registro } : {}), ...(d.acao === "vendedor" ? { pedido: d.pedido } : {}) } } };
    }
    /* não aceitou a simulação: o vendedor consulta a gerência antes de concluir (relatório do dono, 10/10/2026) */
    if (momento === "recusou_simulacao") {
      const preco = modeloDaConversa ? await precoDoModelo(modeloDaConversa) : null;
      /* persuasão (usuário, 12/10/2026): Pix, mais parcelas e um modelo mais em conta; a equipe fica sabendo pela tarefa */
      const simuladas = Array.from(ultimaDaLoja.matchAll(/(\d{1,2})x de R\$/g)).map((m) => Number(m[1]));
      const texto = textoRecusouSimulacao({
        nome: primeiroNome(ultimo?.fatos?.nome || c.memoria.fatos.nome),
        modelo: modeloDaConversa,
        aVista: preco,
        maiorParcela: simuladas.length ? Math.max(...simuladas) : null,
        maisEmConta: modeloDaConversa && preco ? await modeloMaisEmConta(c, modeloDaConversa, preco) : null,
      });
      await criarTarefaGerencia(c, modeloDaConversa, c.textoBuffer);
      const pipe = { ...r.ctx, texto, textoCatalogo: texto, humano: false, motivo: null };
      return { ctx: { pipe, aprendido, saudacao: g.saudacao(), midia: null, momento, intencao, modeloDaConversa, ultimaDaLoja, motivoTransferencia: null }, entrada: { texto: c.textoBuffer }, saida: { ...saida, momento, gerencia: true } };
    }
    /* insistiu no desconto depois da persuasão, ou falou do preço de um anúncio: o vendedor assume (dono, 13/10/2026:
       "passar para o vendedor, mas primeiro tentar persuadir o cliente com os ganhos") */
    if (momento === "negociar") {
      const anuncio = RX_ANUNCIO_PRECO.test(c.textoBuffer.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase());
      const relato = textoDoCliente(c).replace(/^Lead:\s*/gm, "").replace(/\s+/g, " ").trim().slice(-300);
      const texto = textoNegociacao({ nome: primeiroNome(ultimo?.fatos?.nome || c.memoria.fatos.nome), anuncio, lojaAberta: aberta });
      const pipe = { ...r.ctx, texto, textoCatalogo: texto, humano: true, motivo: "modelo_pediu_transferencia" as const };
      const motivo = anuncio
        ? `Preço de anúncio: o cliente viu um preço num anúncio${modeloDaConversa ? ` da ${modeloDaConversa}` : ""} e quer saber se vale. Conferir o anúncio e responder. O cliente escreveu: "${relato}"`
        : `Negociação: o cliente insistiu no desconto${modeloDaConversa ? ` da ${modeloDaConversa}` : ""} depois de a IA mostrar a economia. Ver o que dá pra fazer e responder. O cliente escreveu: "${relato}"`;
      return { ctx: { pipe, aprendido, saudacao: g.saudacao(), midia: null, momento, intencao, modeloDaConversa, ultimaDaLoja, motivoTransferencia: motivo }, entrada: { texto: c.textoBuffer }, saida: { ...saida, momento, resposta: texto, transferir: true } };
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
      /* retirada com dia e hora ("amanhã às 10h"): confirma a data certa e promete o lembrete só se ele vai sair (dono, 15/10/2026) */
      const dados = lerDadosDoCliente(c.textoBuffer);
      const ret = quandoRetirar(trechoDeQuando(dados.horario, c.textoBuffer), horario);
      const foraDeGoiana = modo === "entrega" && !!notaDeEntrega(dados.cidade ?? ultimo?.fatos?.cidade ?? c.memoria.fatos.cidade ?? null);
      const lembrete = !!ret.quando && !foraDeGoiana && !!planoRetirada(ret.quando, new Date(), new Date()).lembreteEm;
      const marcada = ret.quando
        ? modo === "retirada"
          ? textoRetiradaMarcada({ nome, modelo: modeloDaConversa, quandoExtenso: quandoPorExtenso(ret.quando), lembrete })
          : textoEntregaMarcada({ nome, modelo: modeloDaConversa, quandoExtenso: quandoPorExtenso(ret.quando), lembrete, foraDeGoiana })
        : null;
      const texto = marcada ?? textoDadosRecebidos({ nome, modelo: modeloDaConversa, modo, lojaAberta: aberta });
      const pipe = { ...r.ctx, texto, textoCatalogo: marcada ?? r.ctx.textoCatalogo, humano: true, motivo: "modelo_pediu_transferencia" as const };
      const motivo = `Fechamento: o cliente mandou os dados para ${modo === "retirada" ? "retirar na loja" : "entrega"}${modeloDaConversa ? ` da ${modeloDaConversa}` : ""}. Conferir os dados e combinar com ele ${modo === "retirada" ? "a separação e o horário da retirada" : "o melhor horário da entrega"}.`;
      return { ctx: { pipe, aprendido, saudacao: g.saudacao(), midia: null, momento, intencao, modeloDaConversa, ultimaDaLoja, motivoTransferencia: motivo }, entrada: { texto: c.textoBuffer }, saida: { ...saida, momento, resposta: pipe.texto, transferir: true } };
    }
    /* no meio do fechamento a IA não passa ao vendedor por conta própria (o teste de 03/10 mostrou ela passando
       logo depois do "entrega"): o sistema passa quando os dados chegam. Cliente que pede uma pessoa, passa. */
    let pipe = r.ctx;
    const segurou = !!momento && MOMENTOS_SEM_TRANSFERIR.includes(momento) && pipe.humano && pipe.motivo === "modelo_pediu_transferencia" && !!pipe.texto && pipe.texto !== TEXTO_TRANSFERENCIA && !RX_PEDE_PESSOA.test(semAberturaDoSite(c.textoBuffer));
    if (segurou) pipe = { ...pipe, humano: false, motivo: null };
    /* na qualificação a IA não passa ao vendedor por conta própria (teste de 18/10/2026: o botão do site "quero falar com um
       consultor" virou transferência); cliente que pede uma pessoa com todas as letras, passa */
    if (qualificacao && pipe.humano && pipe.motivo === "modelo_pediu_transferencia" && !RX_PEDE_PESSOA.test(semAberturaDoSite(c.textoBuffer))) pipe = { ...pipe, humano: false, motivo: null };
    if (qualificacao && !pipe.humano) return { ctx: { pipe, aprendido, saudacao: g.saudacao(), midia: null, momento: null, intencao, modeloDaConversa, ultimaDaLoja, qualificacao, motivoTransferencia: null }, entrada: { texto: c.textoBuffer }, saida: { ...saida, qualificacao: { pergunta: qualificacao.pergunta, abertura: qualificacao.abertura, necessidade } } };
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
    /* resposta trocada pelo texto do sistema (recado, negociação...): o resumo novo da IA fala do rascunho dela, que não
       saiu (Simulador, 15/10/2026: "Listou as motos elétricas disponíveis" num recado para o dono); fica o anterior */
    const textoDoSistema = !!pipe.texto && pipe.texto === pipe.textoCatalogo;
    const resumo = (textoDoSistema ? null : c.aprendido.resumo) ?? c.memoria.resumo ?? c.textoBuffer.slice(0, 200);
    /* não é cliente: para a IA a qualquer hora (de noite seguir respondendo é justamente o loop), sem prioridade alta */
    if (c.naoCliente) {
      await db.update(schema.conversas).set({ modo: "humano", atualizadoEm: new Date() }).where(eq(schema.conversas.id, c.conversaId));
      /* sem follow-up da IA para quem não é cliente (dono, 15/10/2026): o que já estava agendado sai da fila */
      await db
        .update(schema.followUps)
        .set({ status: "cancelado", notas: sql`coalesce(${schema.followUps.notas}, '') || ' Não enviado: não é cliente.'` })
        .where(and(eq(schema.followUps.conversaId, c.conversaId), eq(schema.followUps.status, "pendente"), eq(schema.followUps.tipo, "aquecimento")));
      await mensagemSistema(db, c.conversaId, `IA parada nesta conversa. ${MOTIVO_NAO_CLIENTE[c.naoCliente]}. Se for um cliente de verdade, volte a chave para IA. Última mensagem: "${c.textoBuffer.slice(0, 160)}"`, { triagem: true });
      return { ctx: { pipe }, saida: { transferida: true, status: "HUMANO", motivo: c.motivoTransferencia, naoCliente: c.naoCliente, avisoAoCliente: pipe.texto } };
    }
    /* avaliação de troca/compra: vai para um vendedor a qualquer hora (dono, 17/10/2026: "transfere já para um humano");
       de noite a IA não segue negociando o que só o vendedor avalia. O cliente já sabe que a resposta vem quando abrir. */
    if (c.avaliacao) {
      await db.update(schema.conversas).set({ modo: "humano", prioridade: "alta", atualizadoEm: new Date() }).where(eq(schema.conversas.id, c.conversaId));
      await mensagemSistema(db, c.conversaId, `Transferido para atendimento humano pela IA. Motivo: ${semPontoFinal(c.motivoTransferencia ?? "avaliar o que o cliente quer dar na troca")}`, { triagem: true });
      return { ctx: { pipe, aguardaEquipe: true }, saida: { transferida: true, status: "HUMANO", motivo: c.motivoTransferencia, avaliacao: c.avaliacao, avisoAoCliente: pipe.texto } };
    }
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
    /* operadora/robô não vira lead no funil nem recebe follow-up da IA */
    if (c.naoCliente) return { saida: { fatos, resumo, naoCliente: c.naoCliente } };
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
      /* parou de responder: a IA chama de novo em 1 h, 3 h e 23 h (follow-up de aquecimento) */
      await lembretesSemResposta(c, q.clienteId, q.negocioId).catch(() => null);
      /* troca/compra: a tarefa do vendedor avaliar, já com o cliente e o negócio */
      if (c.avaliacao) await tarefaAvaliacao(c, q.clienteId, q.negocioId).catch(() => null);
    } catch (e) {
      qualificacao = { erro: e instanceof Error ? e.message : String(e) };
    }
    return { saida: { fatos, resumo, qualificacao, funil, pedido } };
  },

  blocos: async (c) => {
    /* não é cliente: só o texto do sistema (oferta) ou nada (robô/loop), sem cumprimento, apresentação nem pergunta
       (Simulador, 15/10/2026: a TIM recebeu "Me chamo Milton... vou te ajudar por aqui!") */
    if (c.naoCliente) {
      const blocos = c.pipe?.texto ? [c.pipe.texto] : [];
      return blocos.length ? { ctx: { blocos, indice: 0, citar: -1, midia: null }, saida: { blocos, naoCliente: c.naoCliente } } : { ramo: "vazio", ctx: { midia: null }, saida: { blocos: [], naoCliente: c.naoCliente } };
    }
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
    const perguntouSeERobo = /rob[ôo]|atendente\s+virtual|atendimento\s+(?:virtual|autom[áa]tico)|autom[áa]tic[oa]|virtual|(?<![\p{L}])bot(?![\p{L}])|intelig[êe]ncia artificial|(?<![\p{L}])ia(?![\p{L}])|humano|pessoa de verdade/iu.test(c.textoBuffer);
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
    const soCumprimentou = !!saudacao && !resposta.length;
    if (soCumprimentou) resposta = [variar(PERGUNTAS_INTENCAO)];
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
    /* nada de "sem desconto" nem de inventar sobre preço de anúncio (Andressa e Danilo, 08 e 10/10/2026) */
    resposta = tirarFraseProibida(resposta);
    resposta = tirarTriciclo(resposta, await triciclosComEstoque(c));
    /* a lista do estoque só quando o cliente pede (dono, 15/10/2026: "bom dia" recebeu tudo que tinha em estoque) */
    if (!(c.pipe?.texto && c.pipe.texto === c.pipe.textoCatalogo)) resposta = tirarListaSemPedido(resposta, c.textoBuffer, await nomesDoCatalogo());
    /* o modelo às vezes escreve "\n" como texto: vira quebra de linha de verdade (conversa real de 06/10/2026) */
    resposta = resposta.map((b) => b.replace(/\\n/g, "\n").trim()).filter((b) => /\p{L}/u.test(b));
    /* conversa enxuta: no máximo 3 mensagens de texto por resposta (o resto se junta à última) */
    if (resposta.length > 3) resposta = [...resposta.slice(0, 2), resposta.slice(2).join("\n\n")];
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
    const jaEnviadas = await midiasJaEnviadas(c.conversaId);
    /* a resposta apresenta 2 ou 3 motos e o pedido era de OUTRA (teste real de 06/10/2026: "uma opção mais em conta" mandou a T3):
       vale o que a resposta apresenta */
    if (midia?.modelo && resposta.length) {
      const modelosDaResposta = (await motosComMidia(c)).filter((m) => ultimaCitada([m], resposta.join("\n")));
      if (modelosDaResposta.length >= 2 && !modelosDaResposta.some((m) => m.id === midia!.modelo!.id)) midia = null;
    }
    if (!midia && intencao === "compra" && respostaDaIa && resposta.length) {
      try {
        const modelos = await motosComMidia(c);
        /* Milton (12/10/2026): foto só do modelo que o cliente escolheu. Pesquisando ou com 2 ou 3 opções na resposta
           ("valor dos patinetes?"), vão os preços em texto e a pergunta de qual interessou; a foto vai quando ele escolher
           (antes ia uma foto de cada: 6 fotos em 1 minuto na conversa (81) 7301-7155). planejarOpcoes fica para consulta. */
        midia = c.momento === "pesquisando" ? null : planejarApresentacao({ modelos, textoCliente: c.textoBuffer, resposta: resposta.join("\n"), jaEnviadas });
      } catch {
        midia = null;
      }
    }
    /* foto e vídeo só UMA vez (o dono, 06/10/2026: "não adianta mandar a foto pro cliente 10x"): o que já foi na conversa não vai
       de novo, e no máximo 3 arquivos por resposta */
    /* motos cuja foto o cliente pediu agora mas que já foi antes na conversa (não vai de novo) */
    let jaForam: string[] = [];
    if (midia) {
      const pedidoAgora = midia.pedido.length > 0;
      /* o cliente PEDIU (usuário, 12/10/2026: "pedi foto da M6 e ele não enviou"; tinha ido na véspera): vai de novo,
         a não ser que tenha ido há menos de 30 min. Sem pedido, a trava de 24 h continua */
      const bloqueadas = pedidoAgora ? await midiasJaEnviadas(c.conversaId, 0.5) : jaEnviadas;
      const itens = midia.itens.filter((i) => !bloqueadas.includes(i.url)).slice(0, 3);
      if (pedidoAgora) jaForam = midia.itens.filter((i) => bloqueadas.includes(i.url)).map((i) => i.legenda.replace(/\*/g, "").replace(/^Vídeo d[aeo]s?\s+/iu, "").split(" na cor")[0].trim());
      midia = itens.length ? { ...midia, itens } : { ...midia, itens: [] };
    }
    const antesDoFiltro = resposta.length;
    /* nada vai junto: frase que promete foto/vídeo ("segue a foto") sai */
    let vao: string[] = [];
    /* texto montado pelo sistema (catálogo da foto, lista dos disponíveis) não passa por esta limpeza: "com foto e preço" é do site */
    const textoDoSistema = !!c.pipe?.texto && c.pipe.texto === c.pipe.textoCatalogo;
    if (!midia?.itens.length) {
      if (!textoDoSistema) resposta = resposta.map(tirarPromessaDeMidia).filter((b) => /\p{L}/u.test(b));
    } else {
      /* texto e foto batem: frase que promete foto de OUTRA moto (não a que vai) sai (Arine, 06/10/2026) */
      const todos = (await motosComMidia(c)).map((m) => m.nome);
      vao = todos.filter((n) => midia!.itens.some((i) => ultimaCitada([{ nome: n }], i.legenda)));
      resposta = resposta.map((b) => tirarPromessaDeOutras(b, vao, todos)).filter((b) => /\p{L}/u.test(b));
    }
    /* a resposta ficou vazia ou o cliente pediu foto que já tinha ido: frase honesta no lugar (execução #408, 06/10/2026:
       "nada a enviar" e nem a foto da AG08 saiu) */
    const unicos = Array.from(new Set(jaForam)).filter((n) => !vao.some((v) => v.toLowerCase() === n.toLowerCase()));
    if (!resposta.length || (unicos.length && antesDoFiltro > resposta.length)) {
      const linhas: string[] = [];
      if (vao.length) linhas.push(`Olha ${vao.length > 1 ? "as fotos" : "a foto"} ${vao.map((n) => `d${artigo(n)} *${n}*`).join(" e ")} 👇`);
      if (unicos.length) linhas.push(`${unicos.length > 1 ? "As" : `${artigo(unicos[0]) === "o" ? "O" : "A"}`} ${unicos.map((n) => `*${n}*`).join(" e ")} eu já te mandei ali em cima 👆`);
      if (linhas.length) resposta = [...resposta, ...linhas];
    }
    /* abertura do Milton (P2 a P4): "Boa tarde, Carla! Tudo certinho? 😊 Me chamo Milton, sou da Gêmeos Motors…". O nome
       é só o que o cliente disse; se a resposta já fala do Milton (perguntou se é robô), não repete */
    /* qualificação (18/10/2026): da IA fica só o comentário; a pergunta é do sistema. Sem o nome ainda, a recepção pergunta
       o nome uma vez (decisão do dono) e a qualificação começa na resposta seguinte, já chamando pelo nome */
    if (c.qualificacao && !c.pipe?.humano) {
      const nomeCli = primeiroNome(c.memoria.fatos.nome || c.aprendido.fatos.nome);
      const pergunta = !nomeCli && !jaPerguntouONome(c.memoria.historico) ? variar(PERGUNTAS_NOME) : c.qualificacao.pergunta;
      const comentario = limparParaQualificacao(resposta, (await nomesDoCatalogo()).filter((n) => n.length >= 2));
      const corpo = [...(c.qualificacao.abertura ? [c.qualificacao.abertura] : []), ...comentario].slice(-2);
      const ultimo = corpo.at(-1);
      resposta = ultimo && ultimo.length <= 160 && !/\n/.test(ultimo) ? [...corpo.slice(0, -1), `${ultimo} ${pergunta}`] : [...corpo, pergunta];
    }
    /* uma pergunta por resposta: fica a última (Milton, 12/10/2026) */
    resposta = umaPerguntaSo(resposta);
    let abertura = saudacao;
    /* conversa indo para a equipe (reclamação, recado, pós-venda, dados do fechamento): nada de "Qual é o seu nome?" depois
       do pedido de desculpas (Arine, 06/10/2026) */
    const vaiParaEquipe = !!c.recado || reclamando || !!c.aguardaEquipe || !!c.pipe?.humano || c.intencao === "assistencia";
    if (abertura) {
      /* só o nome que o CLIENTE disse: o do perfil do WhatsApp erra ("Deus", apelido, nome de outra pessoa), 06/10/2026 */
      const nome = primeiroNome(c.memoria.fatos.nome || c.aprendido.fatos.nome);
      if (!nomeNovo) abertura = saudacaoComNome(abertura, nome);
      if (!/milton/iu.test(resposta.join(" "))) abertura = `${abertura} ${reclamando ? "Aqui é o Milton, da Gêmeos Motors." : variar(APRESENTACAO)}`;
      /* a IA SEMPRE pergunta o nome do cliente (dono, 06/10/2026), uma vez. Só cumprimentou: na abertura. Perguntou algo:
         a resposta primeiro e o nome no fim, se não houver outra pergunta (teste de 12/10/2026: "Com quem eu falo?" antes
         do preço da M6, o cliente via uma pergunta antes da resposta) */
      if (!nome && !nomeNovo && !vaiParaEquipe && !jaPerguntouONome(c.memoria.historico)) {
        if (soCumprimentou) abertura = `${abertura} ${variar(PERGUNTAS_NOME)}`;
        /* depois de uma lista ("• *T1* ... R$ 12.000"), a pergunta vai numa linha própria (teste de 13/10/2026) */
        else if (!resposta.some((b) => /\?/.test(b))) resposta = [...resposta.slice(0, -1), `${resposta.at(-1)}${/^•/mu.test(resposta.at(-1) ?? "") ? "\n\n" : " "}E com quem eu falo? 😊`];
      }
    } else if (resposta.length && !vaiParaEquipe && !clienteVaiRetornar(c.textoBuffer) && !clienteEncerrou(c.textoBuffer) && !primeiroNome(c.memoria.fatos.nome || c.aprendido.fatos.nome) && !jaPerguntouONome(c.memoria.historico) && !jaChamouPeloNome(c.conversa?.contatoNome, c.memoria.historico, resposta) && !resposta.some((b) => /\?/.test(b))) {
      /* conversa que já andou sem o nome: pergunta no fim, se a resposta não tem outra pergunta */
      resposta = [...resposta, variar(PERGUNTAS_NOME)];
    }
    /* perguntou o nome e o cliente não respondeu: pergunta de novo depois de 2 mensagens dele (no máximo 3 vezes), menos no
       meio de um passo importante (parcelas, entrega, dados, visita) — dono, 07/10/2026 */
    /* disse que ele volta a falar ("vou mostrar a ele") ou encerrou ("já resolveu"): não cobra o nome (12/10/2026) */
    const fechandoAConversa = clienteVaiRetornar(c.textoBuffer) || clienteEncerrou(c.textoBuffer);
    if (!abertura && resposta.length && !vaiParaEquipe && !fechandoAConversa && !primeiroNome(c.memoria.fatos.nome || c.aprendido.fatos.nome) && !jaChamouPeloNome(c.conversa?.contatoNome, c.memoria.historico, resposta) && deveRepetirPerguntaDoNome(c.memoria.historico)) {
      /* pela etapa da conversa, não por palavra solta ("pronta para entrega" bloqueava a pergunta, teste de 07/10/2026) */
      const passoImportante = ["quer_parcelar", "pediu_simulacao", "recusou_simulacao", "negociar", "decidido", "escolheu_entrega", "escolheu_retirada", "mandou_dados", "dados_parciais", "quer_visitar", "informou_visita"].includes(c.momento ?? "") || /nome\s+completo|cpf/iu.test(resposta.join(" "));
      if (!passoImportante && !resposta.some((b) => /\?/.test(b))) resposta = [...resposta, variar(REPERGUNTAS_NOME)];
    }
    /* autonomia só do catálogo: km que a ficha do modelo não tem vira "a confirmar" (06/10/2026) */
    if (resposta.length) {
      const fichas = await db.select({ nome: schema.modelos.nome, ficha: schema.modelos.ficha, descricao: schema.modelos.descricao }).from(schema.modelos).where(eq(schema.modelos.ativo, true));
      const fatos = fichas.map((f) => ({ nome: f.nome, autonomia: (f.ficha as Record<string, string> | null)?.autonomia ?? null, velocidade: (f.ficha as Record<string, string> | null)?.velocidade ?? null, descricao: f.descricao }));
      resposta = resposta.map((b) => corrigirKmSemFonte(b, fatos));
    }
    /* sem balão repetido nem a mesma pergunta da mensagem anterior (Arine, 06/10/2026) */
    resposta = semRepeticao(resposta, ultimaFalaDaLoja(c.memoria.historico));
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
    /* Genilso, 18/10/2026: "Deixa ver com minha esposa" e "Depois entro em contato" receberam duas respostas. Antes do 1º
       bloco: se o cliente mandou outra mensagem enquanto a IA escrevia, esta execução para e a da mensagem nova responde
       tudo junto (ela junta tudo desde a última resposta). Conversa que já foi para a equipe segue (a nova não responderia). */
    if (c.indice === 0 && !c.pipe?.humano && !c.aguardaEquipe && c.mensagemId) {
      const [nova] = await db
        .select({ id: schema.mensagens.id })
        .from(schema.mensagens)
        .where(and(eq(schema.mensagens.conversaId, c.conversaId), eq(schema.mensagens.direcao, "incoming"), gt(schema.mensagens.id, c.mensagemId)))
        .limit(1);
      if (nova) {
        await db.update(schema.conversas).set({ iaDigitandoAte: null }).where(eq(schema.conversas.id, c.conversaId));
        return { fim: "parou", detalhe: `Chegou mensagem nova (#${nova.id}) enquanto a IA escrevia: a execução dela responde tudo junto`, saida: { chegouNova: nova.id } };
      }
    }
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
  /* áudio: transcrito de novo desde 12/10/2026 (Mayna Dornelas: o áudio explicava o problema do aparelho e a IA não
     ouviu), só para ENTENDER o assunto; a IA não sugere moto pelo áudio (instrucaoDeAudio, lib/ia/foto-cliente.ts).
     Transcrição desligada no nó ou falhou: o cliente recebe o catálogo, como antes */
  /* foto não é descrita (dono, 10/10/2026: com a descrição a IA adivinhava a moto, muitas vezes de modelo que a loja nem
     trabalha): a IA vê só "[imagem]" e a legenda, e o cliente recebe o catálogo (lib/ia/foto-cliente.ts) */
  if (tipo === "imagem") return { ctx: { textoEntrada: textoDaMensagem({ tipo: m.tipo, conteudo: m.conteudo, transcricao: null }) }, saida: { texto: "foto não descrita (a IA não tenta reconhecer a moto)" } };
  const ja = transcricaoDe(m);
  if (ja) return { saida: { texto: ja, reaproveitada: true } };
  if (!ligado) return { saida: { texto: c.textoEntrada, observacao: "análise desligada nos ajustes do nó" } };
  if (!m.midiaUrl) return { saida: { texto: c.textoEntrada, observacao: "mensagem sem arquivo" } };
  const arq = await lerBytes(m.midiaUrl);
  if (!arq) return { saida: { texto: c.textoEntrada, observacao: "arquivo da mídia não encontrado" } };
  try {
    const analise = await analisarMidia(tipo, arq.bytes, m.midiaMime ?? arq.mime);
    const texto = [analise, m.conteudo ? `(legenda: ${m.conteudo})` : ""].filter(Boolean).join("\n");
    /* alteradaEm: a tela aberta recebe a transcrição na hora (aparece embaixo do áudio) */
    await db.update(schema.mensagens).set({ metadados: sql`coalesce(${schema.mensagens.metadados}, '{}'::jsonb) || ${JSON.stringify({ transcricao: texto })}::jsonb`, alteradaEm: new Date() }).where(eq(schema.mensagens.id, m.id));
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
