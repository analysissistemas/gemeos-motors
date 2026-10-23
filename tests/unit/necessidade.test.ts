/* Qualificação consultiva (dono, 18/10/2026). Frases das conversas reais (61 conversas lidas em 18/10/2026).
   Roda com `npm run test:ia`. */
import assert from "node:assert/strict";
import { validarResposta } from "../../lib/ia/validador.ts";
import { test } from "node:test";
import {
  faixaDoTexto,
  respondendoFaixa,
  faixasDoEstoque,
  indicarMotos,
  instrucaoQualificacao,
  limparParaQualificacao,
  jaIndicou,
  kmDiaDoTexto,
  lerDoCliente,
  NECESSIDADE_VAZIA,
  pediuOpcoes,
  perguntaPendente,
  perguntasFeitas,
  proximoPasso,
  cartoesIndicacao,
  fonteDaFaixa,
  textoIndicacao,
  textoPergunta,
  type MotoParaIndicar,
} from "../../lib/ia/necessidade.ts";

const ESTOQUE: MotoParaIndicar[] = [
  { nome: "N2", tipo: "moto_eletrica", preco: 5890, autonomia: "40 a 50 km", carga: "150 kg", velocidade: "32 km/h", descricao: "Cesta frontal e banco de garupa." },
  { nome: "UFOFAST F01", tipo: "moto_eletrica", preco: 6490, autonomia: "40 a 50 km", carga: null, velocidade: null, descricao: "Banco com encosto." },
  { nome: "DF17", tipo: "moto_eletrica", preco: 7190, autonomia: "40 a 50 km", carga: null, velocidade: null, descricao: "Compacta e leve." },
  { nome: "AG08", tipo: "moto_eletrica", preco: 8999.9, autonomia: "40 a 45 km", carga: "200 kg", velocidade: "32 km/h", descricao: "Scooter econômica com função de ré e banco plano." },
  { nome: "T3 RETRÔ", tipo: "moto_eletrica", preco: 11000, autonomia: "60 a 70 km", carga: "180 kg", velocidade: null, descricao: "Visual retrô, aceita garupa." },
  { nome: "T5 RETRÔ", tipo: "moto_eletrica", preco: 11000, autonomia: "55 a 70 km", carga: null, velocidade: null, descricao: "Retrô com freio a disco." },
  { nome: "M6", tipo: "moto_eletrica", preco: 11900, autonomia: "até 60 km", carga: "180 kg", velocidade: null, descricao: "Mais alcance." },
  { nome: "T1", tipo: "moto_eletrica", preco: 12000, autonomia: "até 70 km", carga: null, velocidade: null, descricao: "Bateria com 2 anos de garantia." },
  { nome: "Patinete X", tipo: "patinete", preco: 2500, autonomia: "25 km", carga: "100 kg", velocidade: null, descricao: null },
];
const PRECOS = ESTOQUE.filter((m) => m.tipo === "moto_eletrica").map((m) => m.preco!);

test("lê o uso, os km, a garupa e a faixa das frases reais", () => {
  const leandro = lerDoCliente("quero usar na cidade, 20km");
  assert.equal(leandro.uso, "cidade");
  assert.equal(leandro.kmDia, 20);
  assert.equal(lerDoCliente("para entregas").uso, "entregas");
  assert.equal(lerDoCliente("Me disse que vai usar o delivery").uso, "entregas");
  assert.equal(lerDoCliente("A moto pra idoso").uso, "outra_pessoa");
  assert.equal(lerDoCliente("é pra minha esposa ir pro trabalho").uso, "outra_pessoa");
  assert.equal(lerDoCliente("eu ando cerca de 10 a 20 km por dia").kmDia, 20);
  assert.equal(lerDoCliente("uns 100 km por semana").kmDia, 17);
  assert.equal(lerDoCliente("Então, estou buscando uma que o valor seja abaixo de 10K").faixaAte, 10000);
  /* Simulador, 18/10/2026: o "k" de "km" virava "mil" (faixa de até 20 mil) */
  const trabalho = lerDoCliente("Oi, boa tarde! Quero uma moto elétrica pra ir trabalhar, rodo uns 20 km por dia");
  assert.equal(trabalho.faixaAte, null);
  assert.equal(trabalho.kmDia, 20);
  assert.equal(trabalho.uso, "trabalho");
  /* tudo numa frase só: o "uns 25 km" vem antes do "até uns 12 mil" */
  const paulo = lerDoCliente("Boa noite! Me chamo Paulo. Quero uma moto elétrica pra ir trabalhar, rodo uns 25 km por dia, às vezes levo minha esposa na garupa, e quero gastar até uns 12 mil");
  assert.deepEqual([paulo.uso, paulo.kmDia, paulo.garupa, paulo.faixaAte], ["trabalho", 25, true, 12000]);
  assert.equal(lerDoCliente("Queria abaixo dos 5.000").faixaAte, 5000);
  assert.equal(lerDoCliente("Tem menor valor ?").maisBarata, true);
  assert.equal(lerDoCliente("Olha eu sou muito obesa quais opções você tem ?").pesoKg, 120);
  assert.equal(lerDoCliente("levo meu filho pra escola").garupa, true);
  assert.equal(lerDoCliente("Tem patinete ?").tipo, "patinete");
  assert.equal(lerDoCliente("Tem triciclo?").tipo, "triciclo");
});

test("respostas curtas valem pela pergunta que a loja fez", () => {
  assert.equal(lerDoCliente("20", NECESSIDADE_VAZIA, "E mais ou menos quantos km você roda por dia?").kmDia, 20);
  assert.equal(lerDoCliente("pouco, é pertinho", NECESSIDADE_VAZIA, "Quantos km você costuma rodar por dia, mais ou menos?").kmDia, 10);
  assert.equal(lerDoCliente("não, só eu", NECESSIDADE_VAZIA, "Você costuma levar alguém na garupa ou alguma carga, tipo compras?").garupa, false);
  assert.equal(lerDoCliente("sim", NECESSIDADE_VAZIA, "E vai levar alguém na garupa ou carga com você?").garupa, true);
  const faixa = "Pra eu te indicar dentro do seu bolso: você pensa em investir até uns 7 mil, entre 7 e 10 mil, ou acima de 10 mil?";
  assert.equal(perguntaPendente(faixa), "faixa");
  assert.deepEqual(faixaDoTexto("entre 7 e 10", true), { de: 7000, ate: 10000 });
  assert.equal(lerDoCliente("até 7", NECESSIDADE_VAZIA, faixa).faixaAte, 7000);
  assert.equal(lerDoCliente("acima de 10", NECESSIDADE_VAZIA, faixa).faixaDe, 10000);
  /* "20" sem a loja ter perguntado km não é km; "12x" não é km */
  assert.equal(lerDoCliente("20").kmDia, null);
  assert.equal(kmDiaDoTexto("em 12x", true), null);
});

test("não confunde preço, parcela e garantia com a necessidade", () => {
  const n = lerDoCliente("Fica quanto em 12x no master ? Quantos anos de garantia?");
  assert.equal(n.kmDia, null);
  assert.equal(n.faixaAte, null);
  assert.equal(n.uso, null);
  assert.equal(lerDoCliente("Capacidade de tolerância de peso? aguenta 120 kg?").pesoKg, null);
});

test("próximo passo: uma pergunta por vez, só o que falta, e indica quando sabe o suficiente", () => {
  const zero = { uso: 0, km: 0, garupa: 0, faixa: 0, tipo: 1 };
  const p = { falouDeValor: false, pediuOpcoesAntes: false, pedeOpcoesAgora: false };
  /* dono (21/10/2026): sem saber o tipo, a 1ª pergunta é o tipo (moto, bicicleta ou patinete); depois, a faixa */
  assert.deepEqual(proximoPasso(NECESSIDADE_VAZIA, { ...zero, tipo: 0 }, p), { acao: "perguntar", chave: "tipo" });
  assert.deepEqual(proximoPasso(lerDoCliente("quero uma moto"), { ...zero, tipo: 0 }, p), { acao: "perguntar", chave: "faixa" });
  /* Milton (20/10/2026): a única pergunta é a faixa de valor */
  assert.deepEqual(proximoPasso(NECESSIDADE_VAZIA, zero, p), { acao: "perguntar", chave: "faixa" });
  const leandro = lerDoCliente("quero usar na cidade, 20km");
  /* Milton (20/10/2026): sabendo o uso, já vai para a faixa (km e garupa não são mais perguntados) */
  assert.deepEqual(proximoPasso(leandro, zero, p), { acao: "perguntar", chave: "faixa" });
  /* falou de valor: a faixa vem logo depois do uso */
  assert.deepEqual(proximoPasso(lerDoCliente("pro trabalho"), zero, { ...p, falouDeValor: true }), { acao: "perguntar", chave: "faixa" });
  assert.deepEqual(proximoPasso(lerDoCliente("pra entregas"), zero, p), { acao: "perguntar", chave: "faixa" });
  const pronto = { ...leandro, garupa: false, faixaAte: 10000 };
  assert.deepEqual(proximoPasso(pronto, zero, p), { acao: "indicar" });
  /* perguntou 2 vezes e ele não respondeu: pula */
  assert.deepEqual(proximoPasso(leandro, { ...zero, garupa: 2 }, p), { acao: "perguntar", chave: "faixa" });
  /* pediu as opções pela 2ª vez: indica com o que tem */
  assert.deepEqual(proximoPasso(NECESSIDADE_VAZIA, zero, { ...p, pediuOpcoesAntes: true, pedeOpcoesAgora: true }), { acao: "indicar" });
  assert.ok(pediuOpcoes("Quais opções vocês tem") && pediuOpcoes("Manda o catálogo de motos elétricas por favor"));
  assert.ok(!pediuOpcoes("Moto elétrica"));
});

test("perguntas: a faixa sai dos preços do estoque", () => {
  assert.deepEqual(faixasDoEstoque(PRECOS), [7000, 11000]);
  const f = textoPergunta("faixa", { n: NECESSIDADE_VAZIA, precos: PRECOS, sorte: 0 });
  assert.equal(f, "Pra eu te mostrar as opções certas: você pensa em investir até 6 mil, até 8 mil, até 11 mil ou até 13 mil?");
  assert.equal(perguntaPendente(f), "faixa");
  assert.equal(perguntaPendente(textoPergunta("uso", { n: NECESSIDADE_VAZIA, precos: PRECOS, sorte: 0 })), "uso");
  assert.equal(perguntaPendente(textoPergunta("km", { n: NECESSIDADE_VAZIA, precos: PRECOS, sorte: 0.9 })), "km");
  assert.equal(perguntaPendente(textoPergunta("garupa", { n: NECESSIDADE_VAZIA, precos: PRECOS, sorte: 0 })), "garupa");
  assert.equal(perguntaPendente(textoPergunta("garupa", { n: lerDoCliente("entregas"), precos: PRECOS })), "garupa");
  assert.deepEqual(perguntasFeitas(["Me conta: você vai usar a moto mais pra trabalhar, pro dia a dia na cidade ou pra passear? 😊", "E mais ou menos quantos km você roda por dia?"]), { uso: 1, km: 1, garupa: 0, faixa: 0, tipo: 0 });
});

test("indicação: as 2 que combinam, com o porquê tirado da ficha", () => {
  /* trabalho, 40 km por dia, leva a esposa: autonomia com folga e garupa */
  const n = { ...NECESSIDADE_VAZIA, uso: "trabalho" as const, kmDia: 40, garupa: true };
  const r = indicarMotos(n, ESTOQUE);
  assert.equal(r[0].moto.nome, "T3 RETRÔ");
  assert.ok(r[0].motivos.some((m) => m.includes("folga pros seus 40 km")));
  assert.ok(r[0].motivos.includes("aceita garupa"));
  /* até 7 mil, dia a dia na cidade: primeiro a que fica entre 6 e 7 mil (faixa da loja), depois a N2 */
  const barata = indicarMotos({ ...NECESSIDADE_VAZIA, uso: "cidade", kmDia: 15, faixaAte: 7000 }, ESTOQUE);
  /* Milton (20/10/2026): a da faixa e o patinete que cabe */
  assert.deepEqual(barata.map((x) => x.moto.nome), ["UFOFAST F01", "Patinete X"]);
  assert.ok(barata[0].motivos.includes("cabe na faixa que você falou"));
  /* patinete: só patinete */
  assert.deepEqual(indicarMotos({ ...NECESSIDADE_VAZIA, tipo: "patinete" }, ESTOQUE).map((x) => x.moto.nome), ["Patinete X"]);
  /* quem pilota pesa uns 160 kg: só as que aguentam mais (a N2 aguenta 150) */
  const pesada = indicarMotos({ ...NECESSIDADE_VAZIA, pesoKg: 160 }, ESTOQUE);
  assert.ok(pesada.length && pesada.every((x) => x.moto.nome !== "N2"));
  assert.ok(pesada[0].motivos.some((m) => m.startsWith("aguenta até")));
});

test("na qualificação, da IA fica só o comentário: sem pergunta, preço, modelo ou lista", () => {
  const r = limparParaQualificacao(
    ["20 km por dia é tranquilo pra uma elétrica 👍 A *T1* sai por R$ 12.000. Quer ver as opções?", "Temos estas motos:\n• *AG08*: R$ 8.999,90\n• *N2*: R$ 5.890", "Dá pra parcelar em até 21x no cartão, e no Pix sai melhor."],
    ["T1", "AG08", "N2"],
  );
  assert.deepEqual(r, ["20 km por dia é tranquilo pra uma elétrica 👍", "Dá pra parcelar em até 21x no cartão, e no Pix sai melhor."]);
  assert.ok(instrucaoQualificacao(lerDoCliente("pro trabalho, 20 km")).includes("uso: trabalho · km por dia: 20"));
});

test("texto da indicação: o que ele contou, as motos e uma pergunta", () => {
  const n = { ...NECESSIDADE_VAZIA, uso: "trabalho" as const, kmDia: 40, garupa: true, faixaAte: 12000 };
  const t = textoIndicacao({ nome: "Genilso", n, indicadas: indicarMotos(n, ESTOQUE) })!;
  assert.ok(t.startsWith("Genilso, pelo que você me contou (pro trabalho, uns 40 km por dia, levando alguém na garupa, até uns 12 mil), as que mais combinam com você são:"));
  assert.ok(t.includes("• *T3 RETRÔ*:") && t.includes("R$ 11.000"));
  assert.equal((t.match(/\?/g) ?? []).length, 1);
  assert.ok(jaIndicou(t));
  /* tudo acima da faixa: avisa que dá pra parcelar */
  const caro = { ...NECESSIDADE_VAZIA, uso: "trabalho" as const, kmDia: 60, faixaAte: 5000 };
  const tc = textoIndicacao({ nome: null, n: caro, indicadas: indicarMotos(caro, ESTOQUE) })!;
  assert.ok(tc.includes("um pouco acima da faixa"));
});

test("Edimilson (19/10/2026): disse o uso e 'Até 7 mil reais': indica na hora, com foto, descrição e preço de cada", () => {
  const zero = { uso: 0, km: 0, garupa: 0, faixa: 0, tipo: 1 };
  const p = { falouDeValor: false, pediuOpcoesAntes: false, pedeOpcoesAgora: false };
  const faixa = "Pra eu te indicar dentro do seu bolso: você pensa em investir até uns 7 mil, entre 7 e 11 mil, ou acima de 11 mil?";
  const n = lerDoCliente("Até 7 mil reais", lerDoCliente("Passeio, e ir pegar criança na escola."), faixa);
  assert.equal(n.faixaAte, 7000);
  /* ir pegar criança na escola = garupa */
  assert.equal(n.garupa, true);
  assert.equal(lerDoCliente("meu filho anda comigo").garupa, true);
  assert.deepEqual(proximoPasso(n, { ...zero, uso: 1, faixa: 1 }, p), { acao: "indicar" });
  /* só o orçamento, logo de cara: também indica */
  assert.deepEqual(proximoPasso(lerDoCliente("tenho até 8 mil"), zero, p), { acao: "indicar" });
  /* até 3 opções: as motos que cabem e o patinete que cabe */
  const ind = indicarMotos(n, ESTOQUE, 3);
  /* com criança na garupa: as motos que cabem e levam garupa, sem patinete */
  assert.deepEqual(ind.map((x) => x.moto.nome).slice(0, 1), ["N2"]);
  assert.ok(!ind.some((x) => x.moto.tipo === "patinete"));
  /* só passeio, sem garupa: o patinete que cabe entra como opção */
  assert.ok(indicarMotos({ ...NECESSIDADE_VAZIA, uso: "passeio", faixaAte: 7000 }, ESTOQUE, 3).some((x) => x.moto.nome === "Patinete X"));
  const c = cartoesIndicacao({ nome: "Edimilson", n, indicadas: ind })!;
  assert.ok(c.abertura.startsWith("Edimilson, pelo que você me contou (pra passear, levando alguém na garupa, até uns 7 mil), separei as que mais combinam com você"));
  assert.ok(jaIndicou(c.abertura));
  assert.ok(c.cartoes.length >= 2);
  assert.equal(c.cartoes[0].legenda.split(String.fromCharCode(10))[0], "*N2*");
  assert.ok(c.cartoes[0].legenda.includes("💰 *R$ 5.890*"));
  assert.ok(c.cartoes.every((k) => k.legenda.split(String.fromCharCode(10)).length === 3), "nome, descrição e preço");
  assert.equal(c.pergunta, "Qual delas te agradou mais? 😊");
  /* tudo que vai em texto passa no validador (o 👇 da 1ª versão barrava a resposta) */
  const fontes = [c.cartoes.map((k) => k.legenda).join(" "), fonteDaFaixa(n)];
  for (const t of [c.abertura, c.pergunta, ...c.cartoes.map((k) => k.legenda)]) assert.ok(validarResposta(t, { fontesAutorizadas: fontes }).aprovada, t);
  /* o valor que ele disse pode ser repetido pela IA */
  const fonte = fonteDaFaixa(n);
  for (const v of ["R$ 7.000", "7 mil reais", "7 mil"]) assert.ok(fonte.includes(v), v);
  assert.equal(fonteDaFaixa(lerDoCliente("pro trabalho")), "");
});

test("Simulador (19/10/2026): 'me conta pra que você vai usar' sai do comentário (o sistema já faz a pergunta)", () => {
  const r = limparParaQualificacao(["Prazer, Edimilson! Que ótimo saber do seu interesse na moto elétrica. Para eu te indicar a melhor opção, me conta pra que você vai usar a moto no dia a dia."], []);
  assert.deepEqual(r, ["Prazer, Edimilson! Que ótimo saber do seu interesse na moto elétrica."]);
});

test("Milton (20/10/2026): poucas perguntas, faixas da loja e 'vespa' = T3/T5 Retrô", () => {
  const zero = { uso: 0, km: 0, garupa: 0, faixa: 0, tipo: 1 };
  const p = { falouDeValor: false, pediuOpcoesAntes: false, pedeOpcoesAgora: false };
  /* Dinho: disse o uso; a próxima é a faixa, nunca km nem garupa */
  assert.deepEqual(proximoPasso(lerDoCliente("pra passear"), zero, p), { acao: "perguntar", chave: "faixa" });
  const faixa = textoPergunta("faixa", { n: NECESSIDADE_VAZIA, precos: PRECOS });
  const nomes = (resposta: string, max = 3) => indicarMotos(lerDoCliente(resposta, lerDoCliente("pra passear"), faixa), ESTOQUE, max).map((x) => x.moto.nome);
  /* até 6: N2 e patinete, e a UFO, que fica um pouquinho acima */
  assert.deepEqual(nomes("até 6"), ["N2", "Patinete X", "UFOFAST F01"]);
  /* até 8: as de 6 a 8 (UFO e DF17), sem patinete, e a AG08 um pouquinho acima */
  assert.deepEqual(nomes("até 8 mil").sort(), ["AG08", "DF17", "UFOFAST F01"]);
  /* até 11: Retrô e AG08 */
  assert.deepEqual(nomes("11").sort(), ["AG08", "T3 RETRÔ", "T5 RETRÔ"]);
  /* até 13: as topadas */
  /* até 13: as topadas e, sobrando lugar, a logo abaixo (nunca as mais baratas da loja) */
  const treze = nomes("até 13 mil");
  assert.deepEqual(treze.slice(0, 2).sort(), ["M6", "T1"]);
  assert.ok(["T3 RETRÔ", "T5 RETRÔ"].includes(treze[2]), treze.join());
  /* só a M6 na faixa: completa com as logo abaixo, não com a N2 */
  const semT1 = indicarMotos({ ...NECESSIDADE_VAZIA, faixaAte: 13000 }, ESTOQUE.filter((m) => m.nome !== "T1"), 3).map((x) => x.moto.nome);
  assert.equal(semT1[0], "M6");
  assert.ok(!semT1.includes("N2") && !semT1.includes("Patinete X"), semT1.join());
  /* vespa: indica direto as retrô */
  const vespa = lerDoCliente("vocês têm aquela vespa?");
  assert.equal(vespa.estilo, "retro");
  assert.deepEqual(proximoPasso(vespa, zero, p), { acao: "indicar" });
  assert.deepEqual(indicarMotos(vespa, ESTOQUE, 3).map((x) => x.moto.nome).sort(), ["T3 RETRÔ", "T5 RETRÔ"]);
});

test("Milton (20/10/2026): só a faixa; 'média de 8 mil' vale; moto de trilha não é indicada", () => {
  const zero = { uso: 0, km: 0, garupa: 0, faixa: 0, tipo: 1 };
  const p = { falouDeValor: false, pediuOpcoesAntes: false, pedeOpcoesAgora: false };
  /* contou o uso sozinho: ainda é a faixa, nunca km nem garupa */
  assert.deepEqual(proximoPasso(lerDoCliente("é pra trabalhar, rodo uns 10 km"), zero, p), { acao: "perguntar", chave: "faixa" });
  assert.equal(lerDoCliente("na média de 8 mil").faixaAte, 8000);
  assert.equal(lerDoCliente("quero gastar uns 7 mil").faixaAte, 7000);
  const mt4: MotoParaIndicar = { nome: "Moto Elétrica Off-Road MT4 2000W", tipo: "moto_eletrica", preco: 8000, autonomia: "Até 50 km", carga: null, velocidade: "55 km/h", descricao: "Mini moto elétrica estilo motocross, ideal para trilhas leves e circuitos fechados." };
  assert.ok(!indicarMotos({ ...NECESSIDADE_VAZIA, faixaAte: 8000 }, [...ESTOQUE, mt4], 3).some((x) => x.moto.nome === mt4.nome));
  /* a que fica acima vai no cartão com o aviso */
  const c = cartoesIndicacao({ nome: null, n: { ...NECESSIDADE_VAZIA, faixaAte: 8000 }, indicadas: indicarMotos({ ...NECESSIDADE_VAZIA, faixaAte: 8000 }, ESTOQUE, 3) })!;
  assert.ok(c.cartoes.find((k) => k.nome === "AG08")!.legenda.includes("um pouquinho acima do valor que você falou"));
});

test("dono (21/10/2026): quem pediu moto não recebe patinete nem bicicleta; ficha 'Até 30 km' sai minúscula", () => {
  const n = lerDoCliente("abaixo de 6", lerDoCliente("quanto custa a moto eletrica de voces?"), "Pra eu te mostrar as opções certas: você pensa em investir até 6 mil, até 8 mil, até 11 mil ou até 13 mil?");
  assert.equal(n.tipo, "moto");
  assert.ok(!indicarMotos(n, ESTOQUE, 3).some((x) => x.moto.tipo === "patinete"));
  const bike: MotoParaIndicar = { nome: "Bicicleta", tipo: "moto_eletrica", preco: 4000, autonomia: "Até 30 km", carga: null, velocidade: "25 km/h", descricao: "Dobrável." };
  const c = cartoesIndicacao({ nome: null, n: NECESSIDADE_VAZIA, indicadas: indicarMotos(NECESSIDADE_VAZIA, [bike], 3) })!;
  assert.ok(c.cartoes[0].legenda.includes("Autonomia de até 30 km, até 25 km/h."), c.cartoes[0].legenda);
});

test("Simulador (20/10/2026): descrição em várias linhas vai só a 1ª no cartão", () => {
  const t5: MotoParaIndicar = { nome: "T5 RETRÔ", tipo: "moto_eletrica", preco: 11000, autonomia: "55 a 70 km", carga: null, velocidade: "32 km/h", descricao: "1000w potência de motor\nBateria de lítio removível\nFarol em led" };
  const c = cartoesIndicacao({ nome: null, n: NECESSIDADE_VAZIA, indicadas: indicarMotos(NECESSIDADE_VAZIA, [t5], 3) })!;
  assert.equal(c.cartoes[0].legenda, "*T5 RETRÔ*\n1000w potência de motor. Autonomia de 55 a 70 km, até 32 km/h.\n💰 *R$ 11.000*");
});

test("dono (21/10/2026): moto pra idoso oferece o triciclo, sem perguntar a faixa", () => {
  const fox: MotoParaIndicar = { nome: "Triciclo Foxscoo", tipo: "moto_eletrica", preco: 10000, autonomia: "45 km", carga: "150 kg", velocidade: null, descricao: "Triciclo Foxscoo\nBateria de lítio" };
  for (const frase of ["queria uma moto pra idoso", "é pro meu avô", "uma moto pra minha mãe que é idosa", "pra uma pessoa de idade"]) {
    const n = lerDoCliente(frase);
    assert.equal(n.idoso, true, frase);
    assert.deepEqual(proximoPasso(n, { uso: 0, km: 0, garupa: 0, faixa: 0 }, { falouDeValor: false, pediuOpcoesAntes: false, pedeOpcoesAgora: false }), { acao: "indicar" });
    assert.deepEqual(indicarMotos(n, [...ESTOQUE, fox], 3).map((x) => x.moto.nome), ["Triciclo Foxscoo"], frase);
  }
  assert.ok(!lerDoCliente("sou maior de idade").idoso);
  /* sem triciclo no estoque: segue a indicação de sempre */
  assert.ok(indicarMotos(lerDoCliente("moto pra idoso"), ESTOQUE, 3).length > 0);
});

test("José (21/10/2026): a mensagem só com o valor é o orçamento", () => {
  for (const [t, v] of [["13 mil", 13000], ["8 mil reais", 8000], ["R$ 8.000", 8000], ["uns 10 mil", 10000]] as const) assert.equal(faixaDoTexto(t)?.ate, v, t);
  /* número solto sem "mil" fora da pergunta da faixa não é orçamento ("13" pode ser hora, km...) */
  assert.equal(faixaDoTexto("13"), null);
  assert.equal(faixaDoTexto("rodo 20 km"), null);
});

test("Marcela (21/10/2026): pergunta o tipo, '4 km' não é orçamento, moto não manda bicicleta, 'motinha' depois troca o tipo", () => {
  const bike: MotoParaIndicar = { nome: "Bicicleta Elétrica Dobrável Urbana 400W", tipo: "moto_eletrica", preco: 4000, autonomia: "Até 30 km", carga: null, velocidade: null, descricao: "Bicicleta elétrica urbana." };
  const estoque = [...ESTOQUE, bike];
  const tipoQ = textoPergunta("tipo", { n: NECESSIDADE_VAZIA, precos: PRECOS });
  assert.equal(perguntaPendente(tipoQ), "tipo");
  const faixaQ = textoPergunta("faixa", { n: NECESSIDADE_VAZIA, precos: PRECOS });
  /* respondeu "4 km" à pergunta da faixa: não vira "até 4 mil" */
  assert.equal(faixaDoTexto("4 km", true), null);
  assert.equal(lerDoCliente("4 km", NECESSIDADE_VAZIA, faixaQ).faixaAte, null);
  /* escolheu moto: nada de bicicleta nem patinete */
  const moto = lerDoCliente("moto elétrica", NECESSIDADE_VAZIA, tipoQ);
  assert.equal(moto.tipo, "moto");
  const ate6 = indicarMotos(lerDoCliente("até 6", moto, faixaQ), estoque, 3).map((x) => x.moto.nome);
  assert.ok(!ate6.some((n) => /bicicleta|patinete/i.test(n)), ate6.join());
  /* escolheu bicicleta: só bicicleta */
  const bici = lerDoCliente("bicicleta", NECESSIDADE_VAZIA, tipoQ);
  assert.deepEqual(indicarMotos({ ...bici, faixaAte: 6000 }, estoque, 3).map((x) => x.moto.nome), [bike.nome]);
  /* depois da bicicleta, "gostei mais da motinha": vira moto */
  assert.equal(lerDoCliente("Gostei mais da motinho mesmo", bici, "Qual delas te agradou mais? 😊").tipo, "moto");
});

test("Simulador (21/10/2026): a lista sai e não sobra o 'Por exemplo:' solto", () => {
  assert.deepEqual(limparParaQualificacao(["Por exemplo:\n• N2 por R$ 5.890"], ["N2"]), []);
  assert.deepEqual(limparParaQualificacao(["Que bom falar com você! Por exemplo:\n• N2"], ["N2"]), ["Que bom falar com você!"]);
});

test("Nay (22/10/2026): '12' depois das opções é orçamento; triciclo só para quem pediu", () => {
  const opcoes = "Qual delas te agradou mais? 😊";
  assert.ok(respondendoFaixa(opcoes, "12"));
  assert.equal(lerDoCliente("12", { ...NECESSIDADE_VAZIA, faixaAte: 11000 }, opcoes).faixaAte, 12000);
  assert.ok(!respondendoFaixa(opcoes, "2"));
  assert.ok(!respondendoFaixa(opcoes, "12 vezes"));
  assert.ok(!respondendoFaixa("Quer que eu te mande o vídeo?", "12"));
  const fox: MotoParaIndicar = { nome: "Triciclo Foxscoo", tipo: "moto_eletrica", preco: 10000, autonomia: "45 km", carga: "150 kg", velocidade: null, descricao: "Triciclo elétrico de três rodas." };
  const onze = indicarMotos({ ...NECESSIDADE_VAZIA, faixaAte: 11000 }, [...ESTOQUE, fox], 3).map((x) => x.moto.nome);
  assert.ok(!onze.includes(fox.nome), onze.join());
  assert.deepEqual(indicarMotos({ ...NECESSIDADE_VAZIA, tipo: "triciclo" }, [...ESTOQUE, fox], 3).map((x) => x.moto.nome), [fox.nome]);
});
