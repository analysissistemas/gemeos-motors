/* ============================================================
   SIMULAÇÃO LOCAL DO FLUXO DE IA (sem WhatsApp, sem Meta, sem produção)
   mensagem simulada → interpretação pela OpenAI → consulta ao estoque real
   → geração → trava de fatos → validador → permissão → MOCK de envio.

   Rodar:  npm run test:ia:local
   Precisa, no .env.local (que o Git ignora):
     OPENAI_API_KEY        chave de TESTE da OpenAI
     OPENAI_MODELO         opcional (padrão gpt-4.1-mini)
     MENSAGERIA_PROVEDOR   teste   (trava: recusa rodar sem isto)
   Regras deste script:
   - só LÊ o banco (SELECT). Nunca grava no banco nem toca estoque real.
   - o "envio" é um mock em memória: nada chega à Meta.
   - a chave nunca é impressa nem gravada; o registro vai só para _teste/ (ignorado pelo Git).
   - as permissões usadas aqui existem só em memória; nada é ligado em produção.
   Para testar o próprio script sem a OpenAI: SIMULAR_SEM_OPENAI=1 (modelo falso, registro separado).
   ============================================================ */
import { createHash } from "node:crypto";
import { appendFileSync, mkdirSync } from "node:fs";
import pg from "pg";
import { CAMPOS_DO_ITEM, decidirEstoque, type ItemEstoque } from "../lib/ia/estoque-tipos.ts";
import { criarModeloOpenAI, custoEstimadoUsd, ENDPOINT_OPENAI, MODELO_PADRAO, type ChamarModelo } from "../lib/ia/modelo-openai.ts";
import { CONTROLE_PADRAO, type ControleIa } from "../lib/ia/permissoes.ts";
import { processarMensagem, TEXTO_INDISPONIVEL, type Deps, type ResultadoPipeline, type SaidaModelo } from "../lib/ia/pipeline.ts";
import { CHAVES_SECOES, compilarPrompt } from "../lib/ia/secoes.ts";

const SIMULADO = process.env.SIMULAR_SEM_OPENAI === "1";
const chave = process.env.OPENAI_API_KEY ?? "";
const modeloNome = process.env.OPENAI_MODELO || MODELO_PADRAO;
const ARQUIVO = SIMULADO ? "_teste/ia-execucoes-simulado.jsonl" : "_teste/ia-execucoes.jsonl";

function abortar(msg: string): never {
  console.error(`\nERRO: ${msg}\n`);
  process.exit(2);
}
if (process.env.MENSAGERIA_PROVEDOR !== "teste") abortar("defina MENSAGERIA_PROVEDOR=teste no .env.local. É a trava que impede qualquer envio real.");
if (!SIMULADO && !chave) abortar("OPENAI_API_KEY não encontrada no .env.local. Coloque a chave de TESTE localmente (fora do Git) e rode de novo.");
if (!process.env.DATABASE_URL) abortar("DATABASE_URL ausente no .env.local.");

const oculta = (s: string) => (chave ? s.split(chave).join("[chave oculta]") : s);

/* ---------------- leitura do banco: só SELECT ---------------- */
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
const ler = async (texto: string) => (await pool.query(texto)).rows;
const linhas = (await ler("select id, tipo, marca, modelo, versao, cor, condicao, status from veiculos limit 1000")) as unknown as ItemEstoque[];
if (linhas[0] && Object.keys(linhas[0]).sort().join() !== [...CAMPOS_DO_ITEM].sort().join()) abortar("as colunas lidas do estoque não são exatamente as permitidas.");
const modelosCatalogo = (await ler("select nome, marca from modelos")) as unknown as { nome: string; marca: string | null }[];
const publicadas = (await ler("select secao, conteudo, versao from ia_prompt_versoes where status = 'publicada'")) as unknown as { secao: string; conteudo: string; versao: number }[];
const conhecimento = (await ler("select categoria, titulo, conteudo from ia_conhecimento where ativo = true order by categoria, titulo")) as unknown as { categoria: string; titulo: string; conteudo: string }[];

await pool.end();

const promptSistema = compilarPrompt(publicadas, conhecimento);
const promptHash = createHash("sha256").update(promptSistema).digest("hex").slice(0, 12);
const promptVersoes = Object.fromEntries(CHAVES_SECOES.map((c) => [c, publicadas.find((p) => p.secao === c)?.versao ?? null]));
const nomesDeProdutos = Array.from(new Set([...modelosCatalogo.flatMap((m) => [m.nome, m.marca]), ...linhas.flatMap((v) => [v.marca, v.modelo])].filter((x): x is string => !!x)));

/* Permissões só desta simulação, em memória. Nada disto é gravado. */
const CONTROLE_TESTE: ControleIa = { ligada: true, permissoes: { ...CONTROLE_PADRAO.permissoes, enviarMensagem: true, lerEstoque: true } };

/* Modelo falso, só para testar o próprio script sem a OpenAI. */
const modeloFalso: ChamarModelo = async ({ prompt }) => {
  const m = prompt.match(/<mensagem_do_cliente>\n([\s\S]*?)\n<\/mensagem_do_cliente>/)?.[1] ?? "";
  const saida: SaidaModelo = /\bT1\b/i.test(m)
    ? { mensagem: null, consultaEstoque: { termo: "T1" }, transferir: false }
    : { mensagem: "Olá! Você procura moto elétrica para trabalho ou para o dia a dia?", consultaEstoque: null, transferir: false };
  return { saida, tokensEntrada: 100, tokensSaida: 20 };
};

type Verificacao = { ok: boolean; descricao: string };
type Cenario = { id: string; titulo: string; mensagem: string; forcada?: string; verificar: (r: ResultadoPipeline, x: { recebidos: string[]; consultas: { termo: string; estado: string }[]; chamadas: number; forcadaOriginal: SaidaModelo | null }) => Verificacao[] };

const PROTECOES = ["chave_geral", "limite_da_mensagem", "deteccao_de_injecao", "trava_de_fatos", "validador", "permissao_de_envio"];
const RESPOSTA_FORCADA = "Sai por R$ 9.990 em 12x sem juros 😀";

const CENARIOS: Cenario[] = [
  {
    id: "1a_estoque_real",
    titulo: "1a — estoque real: a T1 está vendida; a resposta é o texto fixo do sistema",
    mensagem: "Vocês têm a T1?",
    verificar: (r, x) => [
      { ok: x.consultas.length === 1 && /t1/i.test(x.consultas[0].termo), descricao: "a OpenAI pediu a consulta de estoque da T1" },
      { ok: x.consultas[0]?.estado === "CONFIRMADO_INDISPONIVEL", descricao: "o estoque real confirmou INDISPONÍVEL" },
      { ok: x.chamadas === 1, descricao: "a OpenAI foi chamada só para interpretar (não escreveu sobre disponibilidade)" },
      { ok: r.acao === "enviada" && x.recebidos.length === 1 && x.recebidos[0] === TEXTO_INDISPONIVEL, descricao: "o mock recebeu exatamente o texto fixo do sistema" },
    ],
  },
  {
    id: "1b_geracao_real",
    titulo: "1b — geração real: a OpenAI interpreta e escreve a resposta",
    mensagem: "Quero uma moto elétrica",
    verificar: (r, x) => [
      { ok: x.consultas.length === 0, descricao: "não houve consulta de estoque (mensagem geral, sem modelo específico)" },
      { ok: r.acao === "enviada", descricao: "trava de fatos, validador e permissão aprovaram" },
      { ok: x.recebidos.length === 1 && x.recebidos[0] === r.texto, descricao: "o mock recebeu a resposta gerada pela OpenAI" },
    ],
  },
  {
    id: "invalido_resposta_forcada",
    titulo: "Inválido — resposta forçada com preço + 12x + emoji (resposta_forcada)",
    mensagem: "Quero uma moto elétrica",
    forcada: RESPOSTA_FORCADA,
    verificar: (r, x) => [
      { ok: x.forcadaOriginal !== null, descricao: "a OpenAI real foi chamada; o rascunho dela foi substituído pela resposta forçada" },
      { ok: r.acao === "bloqueada" && r.motivo === "validador", descricao: "o validador bloqueou" },
      { ok: ["preco", "parcelamento", "emoji"].every((k) => r.violacoes.some((v) => v.regra === k)), descricao: "motivos registrados: preço, parcelamento e emoji" },
      { ok: x.recebidos.length === 0, descricao: "o mock NÃO recebeu nenhuma mensagem" },
    ],
  },
];

mkdirSync("_teste", { recursive: true });
let falhou = false;

for (const c of CENARIOS) {
  const modelo = criarModeloOpenAI({ promptSistema, modelo: modeloNome, chave, chamar: SIMULADO ? modeloFalso : undefined });
  const recebidos: string[] = []; // mock de envio: só isto "recebe" a mensagem
  const consultas: { termo: string; estado: string; veiculos: { marca: string | null; modelo: string; status: string }[] }[] = [];
  let forcadaOriginal: SaidaModelo | null = null;

  const deps: Deps = {
    controle: CONTROLE_TESTE,
    promptSistema,
    nomesDeProdutos,
    fontesAutorizadas: conhecimento.map((k) => k.conteudo),
    gerar: async (p) => {
      const real = await modelo.gerar(p);
      if (c.forcada && !p.estoque) {
        forcadaOriginal = real;
        return { mensagem: c.forcada, consultaEstoque: null, transferir: false };
      }
      return real;
    },
    consultarEstoque: async (q) => {
      const r = decidirEstoque(linhas, q.termo);
      consultas.push({ termo: q.termo, estado: r.estado, veiculos: r.itens.map((i) => ({ marca: i.marca, modelo: i.modelo, status: i.status })) });
      return r;
    },
    enviar: async (t) => (recebidos.push(t), { ok: true }),
  };

  let r: ResultadoPipeline;
  try {
    r = await processarMensagem(c.mensagem, deps);
  } catch (e) {
    abortar(oculta(`falha ao executar o cenário ${c.id}: ${e instanceof Error ? e.message : String(e)}`));
  }

  const tokensEntrada = modelo.chamadas.reduce((s, x) => s + (x.tokensEntrada ?? 0), 0);
  const tokensSaida = modelo.chamadas.reduce((s, x) => s + (x.tokensSaida ?? 0), 0);
  const custo = custoEstimadoUsd(tokensEntrada, tokensSaida);
  const verificacoes = c.verificar(r, { recebidos, consultas, chamadas: modelo.chamadas.length, forcadaOriginal });
  const passou = verificacoes.every((v) => v.ok);
  if (!passou) falhou = true;

  const protecoes = Object.fromEntries(
    PROTECOES.map((p) => {
      const passo = r.trilha.find((t) => t.etapa === p);
      return [p, !passo ? "não chegou a rodar" : passo.resultado === "seguiu" ? "passou" : `bloqueou (${passo.detalhe ?? passo.resultado})`];
    }),
  );

  const registro = {
    quando: new Date().toISOString(),
    cenario: c.id,
    simulado_sem_openai: SIMULADO,
    resposta_forcada: !!c.forcada,
    fluxo: "primeiro_atendimento",
    endpoint: SIMULADO ? null : ENDPOINT_OPENAI,
    modelo: SIMULADO ? "modelo_falso" : modelo.modelo,
    prompt: { hash: promptHash, versoes_por_setor: promptVersoes, conhecimento_ativo: conhecimento.length },
    entrada: c.mensagem,
    chamadas_modelo: modelo.chamadas.map((x) => ({ etapa: x.etapa, saida: x.saida, tokens_entrada: x.tokensEntrada, tokens_saida: x.tokensSaida, ms: x.ms })),
    rascunho_original_da_openai: forcadaOriginal,
    ferramentas_chamadas: consultas.map((q) => ({ ferramenta: "estoque", termo: q.termo, estado: q.estado, veiculos: q.veiculos })),
    trilha: r.trilha,
    protecoes,
    validador: { aprovada: r.violacoes.length === 0 && r.motivo !== "validador", violacoes: r.violacoes },
    resultado: { acao: r.acao, motivo: r.motivo, transferir_humano: r.transferirHumano, texto: r.texto },
    mock_recebeu: recebidos.length > 0,
    mock_mensagens: recebidos,
    tokens: { entrada: tokensEntrada, saida: tokensSaida },
    custo_estimado_usd: Number(custo.toFixed(6)),
    verificacoes,
    passou,
  };
  const linha = JSON.stringify(registro);
  if (chave && linha.includes(chave)) abortar("a chave apareceu no registro; nada foi gravado.");
  appendFileSync(ARQUIVO, `${linha}\n`);

  /* ---------------- relatório ---------------- */
  const traco = "─".repeat(78);
  console.log(`\n${traco}\n${c.titulo}\n${traco}`);
  console.log(`Entrada (cliente): "${c.mensagem}"`);
  console.log(`\nOpenAI (${SIMULADO ? "MODELO FALSO" : modelo.modelo}):`);
  for (const x of modelo.chamadas) console.log(`  - ${x.etapa}: ${oculta(JSON.stringify(x.saida))}  [${x.tokensEntrada ?? "?"} entrada / ${x.tokensSaida ?? "?"} saída, ${x.ms} ms]`);
  if (forcadaOriginal) console.log(`  - rascunho original da OpenAI foi SUBSTITUÍDO por resposta_forcada: "${c.forcada}"`);
  console.log(`\nConsulta ao estoque real: ${consultas.length ? consultas.map((q) => `"${q.termo}" → ${q.estado}${q.veiculos.length ? ` (${q.veiculos.map((v) => `${v.modelo} ${v.status}`).join(", ")})` : ""}`).join("; ") : "não houve"}`);
  console.log("\nEtapas executadas:");
  for (const t of r.trilha) console.log(`  ${t.resultado === "seguiu" ? "✓" : t.resultado === "encerrou" ? "■" : "✗"} ${t.etapa}${t.detalhe ? ` — ${t.detalhe}` : ""} (${t.ms} ms)`);
  console.log("\nProteções:");
  for (const [p, v] of Object.entries(protecoes)) console.log(`  ${p}: ${v}`);
  console.log(`\nValidador: ${r.violacoes.length ? `REPROVOU — ${r.violacoes.map((v) => v.rotulo).join("; ")}` : r.trilha.some((t) => t.etapa === "validador" && t.resultado === "seguiu") ? "aprovou" : "não chegou a rodar"}`);
  console.log(`Resultado do fluxo: ${r.acao}${r.motivo ? ` (motivo: ${r.motivo})` : ""}; transferir para humano: ${r.transferirHumano ? "sim" : "não"}`);
  console.log(`Mock de envio recebeu: ${recebidos.length ? `SIM → "${recebidos[0]}"` : "NÃO"}`);
  console.log(`Tokens: ${tokensEntrada} entrada + ${tokensSaida} saída | custo estimado: US$ ${custo.toFixed(6)}`);
  console.log("\nVerificações:");
  for (const v of verificacoes) console.log(`  ${v.ok ? "PASSOU" : "FALHOU"} — ${v.descricao}`);
  console.log(`CENÁRIO ${c.id}: ${passou ? "PASSOU" : "FALHOU"}`);
}

console.log(`\nRegistro gravado em ${ARQUIVO} (ignorado pelo Git). Nada foi escrito no banco.`);
process.exit(falhou ? 1 : 0);
