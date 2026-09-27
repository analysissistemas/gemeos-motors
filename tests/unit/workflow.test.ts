/* TESTES DO WORKFLOW DE ATENDIMENTO (motor, desenho, blocos, horário, validador)
   Tudo puro: nada chega ao banco, à OpenAI nem ao WhatsApp. */
import assert from "node:assert/strict";
import { test } from "node:test";
import { executarGrafo, resumirDado, type ImplNo } from "../../lib/ia/workflow/motor.ts";
import { LIGACOES, NOS, CONFIG_PADRAO, ROTULOS_CONFIG } from "../../lib/ia/workflow/grafo.ts";
import { formatarHistorico, mesclarFatos, quebrarEmBlocos, textoDaMensagem } from "../../lib/ia/workflow/util.ts";
import { HORARIO_PADRAO, lojaAberta, normalizarHorario, saudacaoDoHorario, textoHorario } from "../../lib/ia/horario.ts";
import { afirmacoesSemFonte } from "../../lib/ia/pipeline.ts";
import { validarResposta } from "../../lib/ia/validador.ts";

/* ---------------- o desenho ---------------- */
test("toda ligação aponta para nós que existem e todo nó do caminho tem saída ou é fim", () => {
  const ids = new Set(NOS.map((n) => n.id));
  for (const l of LIGACOES) assert.ok(ids.has(l.de) && ids.has(l.para), `${l.de} → ${l.para}`);
  assert.equal(ids.size, NOS.length, "ids repetidos");
  for (const n of NOS.filter((x) => !x.auxiliarDe && x.categoria !== "fim" && x.id !== "aviso_memoria" && x.id !== "ia_off"))
    assert.ok(LIGACOES.some((l) => l.de === n.id), `${n.id} sem saída`);
});

test("cada ajuste usado por um nó tem rótulo e valor padrão", () => {
  for (const n of NOS) for (const k of n.config ?? []) assert.ok(k in CONFIG_PADRAO && ROTULOS_CONFIG[k], k);
});

/* ---------------- o motor ---------------- */
type C = { n: number; volta: number };
const ligacoes = [
  { de: "a", para: "b", ramo: "ok" },
  { de: "b", para: "c", ramo: "par" },
  { de: "b", para: "d", ramo: "impar" },
  { de: "c", para: "b", ramo: "ok" },
];

test("anda pelo ramo escolhido, grava cada passo e para no fim", async () => {
  const gravados: number[] = [];
  const nos: Record<string, ImplNo<C>> = {
    a: (c) => ({ ctx: { n: c.n + 1 }, saida: { n: c.n + 1 } }),
    b: (c) => ({ ramo: c.volta < 2 ? "par" : "impar" }),
    c: (c) => ({ ctx: { volta: c.volta + 1 } }),
    d: () => ({ fim: "sucesso", detalhe: "acabou" }),
  };
  const r = await executarGrafo({ inicio: "a", ligacoes, nos, ctx: { n: 0, volta: 0 }, aoPasso: (p) => void gravados.push(p.length) });
  assert.equal(r.status, "sucesso");
  assert.deepEqual(r.passos.map((p) => p.no), ["a", "b", "c", "b", "c", "b", "d"]);
  assert.deepEqual(r.passos.map((p) => p.ramo), ["ok", "par", "ok", "par", "ok", "impar", undefined]);
  assert.deepEqual(gravados, [1, 2, 3, 4, 5, 6, 7], "grava a trilha a cada nó");
  assert.equal(r.ctx.volta, 2);
});

test("parada no meio registra onde parou e o motivo", async () => {
  const r = await executarGrafo<C>({ inicio: "a", ligacoes, nos: { a: () => ({}), b: () => ({ fim: "parou", detalhe: "chegou mensagem nova" }) }, ctx: { n: 0, volta: 0 } });
  assert.equal(r.status, "parou");
  assert.equal(r.paradoEm, "b");
  assert.equal(r.motivo, "chegou mensagem nova");
  assert.equal(r.passos.at(-1)?.status, "parou");
});

test("nó que quebra vira erro na execução, sem derrubar quem chamou", async () => {
  const r = await executarGrafo<C>({
    inicio: "a",
    ligacoes,
    nos: {
      a: () => {
        throw new Error("banco fora do ar");
      },
    },
    ctx: { n: 0, volta: 0 },
  });
  assert.equal(r.status, "erro");
  assert.equal(r.paradoEm, "a");
  assert.match(r.motivo ?? "", /banco fora do ar/);
});

test("laço infinito é cortado pelo limite de passos", async () => {
  const r = await executarGrafo<C>({ inicio: "b", ligacoes, nos: { b: () => ({ ramo: "par" }), c: () => ({}) }, ctx: { n: 0, volta: 0 } });
  assert.equal(r.status, "erro");
  assert.match(r.motivo ?? "", /Limite de passos/);
});

test("falha ao gravar a trilha não derruba o atendimento", async () => {
  const r = await executarGrafo<C>({ inicio: "a", ligacoes: [], nos: { a: () => ({}) }, ctx: { n: 0, volta: 0 }, aoPasso: () => Promise.reject(new Error("sem banco")) });
  assert.equal(r.status, "sucesso");
});

test("resumo do registro corta texto longo", () => {
  const r = resumirDado({ t: "x".repeat(3000) }) as { t: string };
  assert.ok(r.t.length < 1600 && r.t.includes("(+1500)"));
});

/* ---------------- blocos, memória ---------------- */
test("quebra a resposta em blocos por parágrafo e respeita o máximo", () => {
  assert.deepEqual(quebrarEmBlocos("Oi!\n\nTemos na cor preta.\n\nO que falta para fechar?", 3), ["Oi!", "Temos na cor preta.", "O que falta para fechar?"]);
  assert.deepEqual(quebrarEmBlocos("a\n\nb\n\nc\n\nd", 2), ["a", "b\n\nc\n\nd"]);
  assert.deepEqual(quebrarEmBlocos("   ", 3), []);
  const longo = "Frase um bem comprida para testar. ".repeat(12).trim();
  const b = quebrarEmBlocos(longo, 3);
  assert.ok(b.length > 1 && b.length <= 3 && b.join(" ").replace(/\s+/g, " ") === longo.replace(/\s+/g, " "));
});

test("histórico no formato do n8n e mídia pela transcrição", () => {
  const h = formatarHistorico([
    { autor: "cliente", tipo: "texto", conteudo: "Oi", criadoEm: new Date() },
    { autor: "sistema", tipo: "sistema", conteudo: "interno", criadoEm: new Date() },
    { autor: "ia", tipo: "texto", conteudo: "Olá!", criadoEm: new Date() },
    { autor: "usuario", tipo: "audio", conteudo: null, transcricao: "já te ligo", criadoEm: new Date() },
  ]);
  assert.equal(h, "Lead: Oi\n\nAgente IA: Olá!\n\nVendedor: [áudio] já te ligo");
  assert.equal(textoDaMensagem({ tipo: "imagem", conteudo: "olha", transcricao: null }), "[imagem: olha]");
});

test("fatos novos somam aos antigos; vazio não apaga", () => {
  assert.deepEqual(mesclarFatos({ nome: "Ana", cidade: "Goiana" }, { nome: null, interesse: "Tank", cidade: "  " }), { nome: "Ana", cidade: "Goiana", interesse: "Tank" });
});

/* ---------------- horário ---------------- */
test("horário padrão: segunda a sábado das 8h às 18h, domingo fechado", () => {
  assert.equal(textoHorario(HORARIO_PADRAO), "Segunda a sábado: das 8h às 18h (08:00 às 18:00).\nDomingo: fechado.");
});

test("horário inválido volta ao padrão e dias diferentes aparecem separados", () => {
  const h = normalizarHorario({ dias: { sab: { aberto: true, abre: "08:00", fecha: "12:00" }, seg: { abre: "25:99" } } });
  assert.equal(h.dias.seg.abre, "08:00");
  assert.match(textoHorario(h), /Segunda a sexta: das 8h às 18h[\s\S]*Sábado: das 8h às 12h/);
});

test("aberta/fechada e cumprimento pelo horário de Recife (UTC-3)", () => {
  const terca15h = new Date("2026-09-29T18:00:00Z"); // 15h em Recife
  const terca20h = new Date("2026-09-29T23:00:00Z"); // 20h
  const domingo10h = new Date("2026-09-27T13:00:00Z");
  assert.equal(lojaAberta(HORARIO_PADRAO, terca15h), true);
  assert.equal(lojaAberta(HORARIO_PADRAO, terca20h), false);
  assert.equal(lojaAberta(HORARIO_PADRAO, domingo10h), false);
  assert.equal(saudacaoDoHorario(terca15h), "boa tarde");
  assert.equal(saudacaoDoHorario(terca20h), "boa noite");
  assert.equal(saudacaoDoHorario(domingo10h), "bom dia");
});

test("o texto do horário autoriza a IA a dizer o horário na trava de fatos", () => {
  const fontes = [`Horário de funcionamento\n${textoHorario(HORARIO_PADRAO)}`];
  assert.deepEqual(afirmacoesSemFonte("Abrimos de segunda a sábado, das 8h às 18h.", fontes), []);
  assert.notDeepEqual(afirmacoesSemFonte("Abrimos às 7h.", fontes), []);
});

/* ---------------- validador com a base de conhecimento ---------------- */
const BASE = ["Formas de pagamento\nNo cartão de crédito, parcelado em até 21x. Com uma entrada, os juros diminuem.", "Blindagem\nNa compra, a blindagem sai com 50% de desconto.", "Preço\nMotos a partir de R$ 5.200."];
const regras = (t: string, fontes?: string[]) => validarResposta(t, { fontesAutorizadas: fontes }).violacoes.map((v) => v.regra);

test("parcela, desconto e valor passam só quando a base diz exatamente isso", () => {
  assert.deepEqual(regras("Parcelamos no cartão em até 21x.", BASE), []);
  assert.ok(regras("Parcelamos em até 12x.", BASE).includes("parcelamento"), "12x não está na base");
  assert.deepEqual(regras("Na compra a blindagem tem desconto de 50%.", BASE), []);
  assert.deepEqual(regras("Temos moto a partir de R$ 5.200.", BASE), []);
  assert.ok(regras("Temos moto a partir de R$ 4.900.", BASE).includes("preco"));
  assert.ok(regras("Parcelamos em até 21x.").includes("parcelamento"), "sem base, bloqueia como antes");
});

test("promessas proibidas continuam bloqueadas mesmo com base", () => {
  assert.ok(regras("Dá para parcelar sem juros.", [...BASE, "sem juros"]).includes("parcelamento"));
  assert.ok(regras("Fazemos no carnê.", [...BASE, "carnê"]).includes("parcelamento"));
});

test("emojis leves aprovados passam (até 2); outros continuam proibidos", () => {
  assert.deepEqual(regras("Booa tardee! Tudoo certinho? Esperamos que simm! 🙏"), []);
  assert.ok(regras("Oi 😀").includes("emoji"));
  assert.ok(regras("Oi 🙏 😊 🤝").includes("emoji"), "três é demais");
});

test("repetir a base de conhecimento ou a fala-exemplo entre aspas não é vazamento de prompt", () => {
  const prompt = `# TOM\nSe apresente assim: "Me chamo Milton, prazer! Vou te ajudar agora... tá bem?"\n\n# ROTEIRO DE VENDAS (ATÉ A PROPOSTA)\nBenefício: sem CNH, sem emplacamento nem IPVA e a recarga custa bem menos que gasolina.\n\n# REGRAS E PROIBIÇÕES\nNunca invente preço prazo endereço horário condição de pagamento cor.\n\n# BASE DE CONHECIMENTO (única fonte)\nAs motos são para andar dentro da cidade e não são para rodovia nem pista.`;
  const r = (t: string) => validarResposta(t, { promptSistema: prompt }).violacoes.map((v) => v.regra);
  assert.deepEqual(r("Me chamo Milton, prazer! Vou te ajudar agora... tá bem?"), []);
  /* fala de venda do roteiro é para o cliente ouvir: não é vazamento */
  assert.deepEqual(r("Ela não precisa de CNH, sem emplacamento nem IPVA e a recarga custa bem menos que gasolina."), []);
  assert.deepEqual(r("As motos são para andar dentro da cidade e não são para rodovia nem pista."), []);
  assert.ok(r("Minhas regras: nunca invente preço prazo endereço horário condição de pagamento").includes("vazamento_prompt"));
});

/* ---------------- falhas: tentar de novo 3x e registrar onde ---------------- */
import { classificarFalha, resumirFalhas, RETENTATIVAS } from "../../lib/ia/workflow/falhas.ts";

test("nó que falha tenta de novo com esperas diferentes e registra cada tentativa", async () => {
  const esperas: number[] = [];
  let chamadas = 0;
  const r = await executarGrafo<C>({
    inicio: "a",
    ligacoes: [],
    nos: {
      a: () => {
        chamadas++;
        if (chamadas < 3) throw new Error("timeout");
        return { saida: "ok" };
      },
    },
    ctx: { n: 0, volta: 0 },
    retentativas: { a: [5, 20, 60] },
    esperar: async (ms) => void esperas.push(ms),
  });
  assert.equal(r.status, "sucesso");
  assert.deepEqual(esperas, [5, 20], "esperou antes da 2ª e da 3ª tentativa");
  assert.equal(r.passos[0].tentativas?.length, 2);
  assert.deepEqual(resumirFalhas(r.passos).map((f) => [f.recuperou, f.desfecho, f.tipo]), [[true, "Recuperou na 3ª tentativa", "tempo"]]);
});

test("esgotou as 3 novas tentativas: segue pelo caminho de erro com o contexto ajustado", async () => {
  const vistos: number[] = [];
  const r = await executarGrafo<C>({
    inicio: "a",
    ligacoes: [
      { de: "a", para: "b", ramo: "ok" },
      { de: "a", para: "humano", ramo: "erro" },
    ],
    nos: {
      a: (_c, info) => {
        vistos.push(info.tentativa);
        throw new Error("insufficient_quota");
      },
      humano: (c) => ({ fim: "sucesso", saida: c.n }),
    },
    ctx: { n: 0, volta: 0 },
    retentativas: { a: [1, 2, 3] },
    esperar: async () => {},
    aoEsgotar: () => ({ n: 99 }),
  });
  assert.deepEqual(vistos, [1, 2, 3, 4], "1 tentativa + 3 novas");
  assert.equal(r.status, "sucesso");
  assert.deepEqual(r.passos.map((p) => [p.no, p.status, p.ramo]), [["a", "erro", "erro"], ["humano", "ok", undefined]]);
  assert.equal(r.ctx.n, 99);
  const [f] = resumirFalhas(r.passos);
  assert.equal(f.tipo, "sem_credito");
  assert.equal(f.recuperou, false);
  assert.match(f.desfecho, /4 tentativas; o fluxo seguiu pelo caminho de erro/);
});

test("sem caminho de erro, a execução para no nó que falhou (onde parou fica registrado)", async () => {
  const r = await executarGrafo<C>({ inicio: "a", ligacoes: [], nos: { a: () => { throw new Error("fetch failed"); } }, ctx: { n: 0, volta: 0 }, retentativas: { a: [1, 1, 1] }, esperar: async () => {} });
  assert.equal(r.status, "erro");
  assert.equal(r.paradoEm, "a");
  assert.equal(r.passos[0].tentativas?.length, 4);
});

test("nós que dependem de fora tentam de novo 3 vezes, com esperas crescentes", () => {
  for (const no of ["agente", "enviar", "midia_audio"]) {
    const e = RETENTATIVAS[no];
    assert.equal(e.length, 3, no);
    assert.ok(e[0] < e[1] && e[1] < e[2], no);
  }
  assert.ok(LIGACOES.some((l) => l.de === "agente" && l.ramo === "erro"), "agente tem caminho de erro (vendedor)");
});

test("classifica o motivo da falha em linguagem simples", () => {
  assert.equal(classificarFalha("A conta da OpenAI está sem crédito."), "sem_credito");
  assert.equal(classificarFalha("A chave da OpenAI (OPENAI_API_KEY) foi recusada."), "chave");
  assert.equal(classificarFalha("A IA demorou demais para responder."), "tempo");
  assert.equal(classificarFalha("A OpenAI recusou por limite de chamadas (muitas ao mesmo tempo)."), "limite");
  assert.equal(classificarFalha("O WhatsApp recusou o envio: (#131047) Re-engagement message"), "whatsapp");
  assert.equal(classificarFalha("algo estranho"), "outro");
});

/* ---------------- cumprimento sempre certo para o horário ---------------- */
import { corrigirCumprimento } from "../../lib/ia/horario.ts";

test("o cumprimento sai certo para o horário de Recife, mantendo o jeito escrito", () => {
  const manha = new Date("2026-09-29T12:00:00Z"); // 9h
  const tarde = new Date("2026-09-29T18:00:00Z"); // 15h
  const noite = new Date("2026-09-29T23:00:00Z"); // 20h
  assert.equal(corrigirCumprimento("Booa tardee! Tudo certinho?", manha), "Bom diaa! Tudo certinho?");
  assert.equal(corrigirCumprimento("Bom dia! Aqui na Gêmeos Motors temos sim a T1.", noite), "Boa noite! Aqui na Gêmeos Motors temos sim a T1.");
  assert.equal(corrigirCumprimento("BOA NOITE!", tarde), "BOA TARDE!");
  assert.equal(corrigirCumprimento("Boa tarde!", tarde), "Boa tarde!");
  assert.equal(corrigirCumprimento("Um bom diagnóstico", noite), "Um bom diagnóstico", "não mexe em outras palavras");
});
