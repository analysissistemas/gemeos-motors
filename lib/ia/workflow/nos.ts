import "server-only";
import { and, desc, eq, gt, lt, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/lib/db";
import { analisarMidia, gerarObjeto, MODELO_IA } from "@/lib/ia/cliente";
import { consultarEstoque } from "@/lib/ia/estoque";
import { consultarCatalogo } from "@/lib/ia/catalogo";
import { lerControle } from "@/lib/ia/controle";
import { enviarRespostaDaIa } from "@/lib/ia/envio";
import { validarResposta } from "@/lib/ia/validador";
import { catalogoParaIa, fontesAutorizadas, lerHorario, montarPromptSistema } from "@/lib/ia/prompt";
import { agoraNaLoja, corrigirCumprimento, lojaAberta, saudacaoDoHorario } from "@/lib/ia/horario";
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
  validadorDeResposta,
  type Ctx as CtxPipeline,
  type Deps,
  type SaidaModelo,
} from "@/lib/ia/pipeline";
import { registrarInteresse } from "@/lib/servicos/interesses";
import { criarNegocio } from "@/lib/servicos/negocios";
import { mensagemSistema } from "@/lib/mensageria/anotacoes";
import { lerBytes } from "@/lib/mensageria/midia";
import type { ConfigWorkflow } from "./grafo";
import type { ImplNo } from "./motor";
import { formatarHistorico, mesclarFatos, quebrarEmBlocos, tempoDigitando, textoDaMensagem, tirarCumprimentoRepetido, type FatosLead } from "./util";
import { obterProvedor } from "@/lib/mensageria/provedores";
import { organizarTexto } from "@/lib/ia/organizar";

/* fora do horário ninguém assume agora: a IA avisa sem prometer atendimento imediato */
const TEXTO_FORA_HORARIO = "Anotei tudo por aqui! Nossa equipe te responde assim que a loja abrir. Enquanto isso, pode me perguntar o que quiser.";
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
  return enviarRespostaDaIa(db, { conversaId: c.conversaId, telefone: c.conversa!.contatoTelefone, texto, origem: c.simulado ? "workflow (teste)" : "workflow", simulado: c.simulado || !!c.conversa?.demo, respostaA, gravarFalha });
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
- saudacao: SÓ quando for o começo da conversa (histórico vazio) ou a última mensagem foi há mais de 6 horas: um cumprimento caloroso e humano, no estilo do tom de voz, usando o cumprimento certo do horário (variando a frase). Fale como a Gêmeos Motors, sem nome de pessoa. Ele vai como a primeira mensagem, sozinho; a resposta ao que o cliente perguntou continua em "mensagem". Nas outras vezes, null.`;

/* Roda a trava de fatos e o validador sobre a resposta; se barrariam, devolve a instrução de correção. */
async function motivoDoBloqueio(ctx: CtxPipeline): Promise<string | null> {
  const trava = await travaDeFatos.rodar(ctx);
  if (trava.encerrar) {
    return trava.detalhe === "sem_fonte_autorizada"
      ? "Você citou horário ou endereço que não está na base de conhecimento. Reescreva sem citar horário nem endereço."
      : 'Você afirmou estoque ("temos", "disponível", "pronta entrega") de modelo que NÃO está marcado EM ESTOQUE no catálogo, ou citou marca ou modelo que não está no CATÁLOGO DA LOJA. Reescreva: cite só modelos do catálogo e, para os que não estão EM ESTOQUE, diga que a equipe confirma o prazo. Continue ajudando o cliente e faça UMA pergunta para avançar a venda.';
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

async function montarDeps(c: CtxWorkflow, gerar: Deps["gerar"]): Promise<Deps> {
  const incluirTeste = !!c.conversa?.demo;
  const [controle, promptSistema, modelos, veiculos, conhecimento, catalogo] = await Promise.all([
    lerControle(),
    montarPromptSistema(),
    db.select({ nome: schema.modelos.nome, marca: schema.modelos.marca }).from(schema.modelos),
    db.select({ marca: schema.veiculos.marca, modelo: schema.veiculos.modelo }).from(schema.veiculos).where(incluirTeste ? undefined : eq(schema.veiculos.teste, false)).limit(1000),
    fontesAutorizadas(),
    catalogoParaIa({ incluirTeste }),
  ]);
  return {
    controle,
    promptSistema,
    nomesDeProdutos: Array.from(new Set([...modelos.flatMap((m) => [m.nome, m.marca]), ...veiculos.flatMap((v) => [v.marca, v.modelo])].filter((x): x is string => !!x))),
    /* só motos elétricas e acessórios do catálogo podem ser citados; "tem" só com unidade no estoque */
    nomesDoCatalogo: catalogo.nomes,
    modelosComEstoque: catalogo.comEstoque,
    fontesAutorizadas: conhecimento,
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
    const promptSistema = [await montarPromptSistema(), (await catalogoParaIa({ incluirTeste: !!c.conversa?.demo })).texto].filter(Boolean).join("\n\n");
    const horario = await lerHorario();
    const agora = agoraNaLoja();
    const aberta = lojaAberta(horario);
    const g = criarGerador({
      promptSistema,
      memoria: c.memoria,
      agora: `# AGORA
Hoje é ${agora.extenso} (horário de Recife). A loja está ${aberta ? "ABERTA" : "FECHADA"} agora. Cumprimento certo agora: "${saudacaoDoHorario()}".${aberta ? "" : " Se o cliente quiser vir à loja ou falar com um vendedor, diga com naturalidade que a equipe responde assim que a loja abrir."}`,
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
    return { ctx: { pipe: r.ctx, aprendido, saudacao: g.saudacao(), motivoTransferencia: ultimo?.motivoTransferencia ?? (r.ctx.humano ? "Estoque não confirmado: um vendedor confirma" : null) }, entrada: { texto: c.textoBuffer }, saida };
  },

  trava_fatos: async (c) => {
    const pipe = c.pipe!;
    const r = await travaDeFatos.rodar(pipe);
    if (r.encerrar) return { ramo: "bloqueada", ctx: { pipe: { ...pipe, ...r.ctx, texto: null }, motivoTransferencia: "A resposta citava dado que o sistema não confirmou" }, entrada: { texto: pipe.texto }, saida: { bloqueada: r.detalhe } };
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
    if (r.encerrar) return { ramo: "reprovada", ctx: { saudacao, pipe: { ...pipe, ...r.ctx, texto: null }, motivoTransferencia: "A resposta foi reprovada pelo validador" }, entrada: { texto: pipe.texto, saudacao: c.saudacao }, saida: { violacoes: r.ctx?.violacoes, saudacao, saudacaoReprovada } };
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
      await mensagemSistema(db, c.conversaId, `Fora do horário: a IA continua atendendo. Quando a loja abrir, um vendedor deve assumir. Motivo: ${c.motivoTransferencia ?? "não informado"}. Resumo: ${resumo}`, { triagem: true });
      const texto = pipe.texto ?? TEXTO_FORA_HORARIO;
      return { ctx: { pipe: { ...pipe, texto, humano: false } }, saida: { transferida: false, motivo: "fora do horário: a IA segue e a equipe assume ao abrir", avisoAoCliente: texto } };
    }
    /* trava de segurança sempre passa para humano; pedido da IA só com a permissão marcada */
    if (pedidoDaIa && !controle.permissoes.transferirHumano) {
      await mensagemSistema(db, c.conversaId, `A IA sugere passar para um vendedor: ${c.motivoTransferencia ?? "sinal de fechamento"}. (Permissão "Transferir para um vendedor" desligada.)`);
      return { saida: { transferida: false, motivo: "permissão de transferência desligada; ficou só o aviso" } };
    }
    const cv = c.conversa!;
    let negocioId = cv.negocioId;
    await db.transaction(async (tx) => {
      await tx.update(schema.conversas).set({ modo: "humano", prioridade: "alta", atualizadoEm: new Date() }).where(eq(schema.conversas.id, c.conversaId));
      await mensagemSistema(tx, c.conversaId, `Transferido para atendimento humano pela IA. Motivo: ${c.motivoTransferencia ?? "não informado"}. Resumo: ${resumo}`, { triagem: true });
      if (cv.clienteId && !negocioId) {
        const f = { ...c.memoria.fatos, ...c.aprendido.fatos };
        negocioId = await criarNegocio(null, { clienteId: cv.clienteId, veiculoInteresse: f.interesse ?? null, origem: "whatsapp", temTroca: !!f.troca, trocaDescricao: f.troca ?? null, responsavelId: null }, { demo: cv.demo, triagemIa: resumo }, tx);
        if (negocioId) await tx.update(schema.conversas).set({ negocioId }).where(eq(schema.conversas.id, c.conversaId));
      }
    });
    const texto = pipe.texto ?? (pedidoDaIa ? TEXTO_TRANSFERENCIA : null);
    return { ctx: { pipe: { ...pipe, texto } }, saida: { transferida: true, status: "HUMANO", motivo: c.motivoTransferencia, resumo, negocio: negocioId, avisoAoCliente: texto } };
  },

  memoria_salva: async (c) => {
    const fatos = mesclarFatos(c.memoria.fatos, c.aprendido.fatos);
    const resumo = c.aprendido.resumo ?? c.memoria.resumo;
    await gravarMemoria(c.conversaId, { fatos, resumo });
    return { saida: { fatos, resumo } };
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
    const saudacao = jaConversou ? null : c.saudacao;
    /* o cumprimento sai sempre certo para o horário de Recife, mesmo que a IA erre */
    let resposta = quebrarEmBlocos(organizarTexto(c.pipe?.texto ?? ""), c.config.maxBlocos).map((b) => corrigirCumprimento(b));
    /* saudação já foi (agora, solta, ou antes na conversa): cumprimento/apresentação no começo da resposta sai */
    if ((saudacao || jaConversou) && resposta.length) resposta = [tirarCumprimentoRepetido(resposta[0]), ...resposta.slice(1)].filter(Boolean);
    const blocos = [...(saudacao ? [corrigirCumprimento(saudacao.trim())] : []), ...resposta];
    /* como no WhatsApp da loja: a saudação vai solta e a resposta cita a mensagem do cliente */
    const citar = c.config.citarMensagem && resposta.length ? (saudacao ? 1 : 0) : -1;
    return blocos.length ? { ctx: { blocos, indice: 0, citar }, saida: { blocos, citaMensagemDoCliente: citar >= 0 ? citar + 1 : null } } : { ramo: "vazio", saida: { blocos: [] } };
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
    return { ctx: { indice: c.indice + 1, enviados: c.enviados + 1 }, entrada: { texto }, saida: { enviada: true, citou: c.indice === c.citar, simulado: c.simulado } };
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
