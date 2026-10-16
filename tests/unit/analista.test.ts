/* Analista (dono, 15/10/2026): ficha de cada conversa. Regras puras. Roda com `npm run test:ia`. */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  anonimizar,
  calcularMetricas,
  conferirProvas,
  diasParaAnalisar,
  precisaAnalisar,
  transcreverParaAnalise,
  type MensagemAnalise,
} from "../../lib/ia/analista-regras.ts";

test("anonimizar tira CPF, telefone, e-mail, CEP e endereço", () => {
  const t = anonimizar("Meu CPF é 123.456.789-09, zap (81) 99386-9767, email joao.silva@gmail.com, CEP 55900-000, moro na Rua das Flores, 120, perto da praça");
  assert.ok(!t.includes("123.456.789-09"), t);
  assert.ok(!t.includes("99386"), t);
  assert.ok(!t.includes("joao.silva"), t);
  assert.ok(!t.includes("55900-000"), t);
  assert.ok(!t.includes("Flores"), t);
  assert.ok(t.includes("[cpf]") && t.includes("[telefone]") && t.includes("[e-mail]") && t.includes("[cep]") && t.includes("[endereço]"), t);
  assert.ok(t.includes("perto da praça"), t);
});

test("anonimizar não mexe em preço, parcela, autonomia nem modelo", () => {
  for (const frase of ["A N2 sai por R$ 5.890 à vista", "Faz em 18x de R$ 399,90?", "Autonomia de 40 a 50 km, 32 km/h", "Quero a DF17 na cor verde", "Total R$ 8.999,90", "CPF só na hora de fechar", "Avenida? não sei"]) {
    assert.equal(anonimizar(frase), frase);
  }
  // 11 dígitos sem pontuação podem ser CPF ou celular: o rótulo tanto faz, o número não pode passar
  assert.match(anonimizar("telefone 81993869767"), /^telefone \[(cpf|telefone)\]$/);
  assert.equal(anonimizar("cpf 12345678909"), "cpf [cpf]");
});

const ms = (min: number) => new Date(Date.UTC(2026, 9, 15, 15, 0) + min * 60_000);
const msg = (id: number, autor: string, min: number, conteudo = "oi", tipo = "texto"): MensagemAnalise => ({ id, autor, tipo, conteudo, criadoEm: ms(min) });

test("transcrição leva o número de cada mensagem e esconde dado pessoal", () => {
  const t = transcreverParaAnalise([msg(10, "cliente", 0, "meu cpf 123.456.789-09"), msg(11, "ia", 1, "Obrigado!"), msg(12, "cliente", 2, null, "audio")]);
  const linhas = t.split("\n");
  assert.match(linhas[0], /^#10 \(15\/10 12:00\) CLIENTE: meu cpf \[cpf\]$/);
  assert.match(linhas[1], /^#11 .* IA: Obrigado!$/);
  assert.match(linhas[2], /^#12 .* CLIENTE: \[audio\]$/);
});

test("métricas: primeira resposta, maior espera, espera pela equipe e fim sem resposta", () => {
  const r = calcularMetricas([
    msg(1, "cliente", 0),
    msg(2, "cliente", 1),
    msg(3, "ia", 2), // 2 min
    msg(4, "sistema", 3),
    msg(5, "usuario", 10), // equipe entra
    msg(6, "cliente", 20),
    msg(7, "usuario", 140), // equipe demorou 120 min
    msg(8, "cliente", 150),
  ]);
  assert.equal(r.msgsCliente, 4);
  assert.equal(r.msgsIa, 1);
  assert.equal(r.msgsEquipe, 2);
  assert.equal(r.primeiraRespostaMin, 2);
  assert.equal(r.maiorEsperaMin, 120);
  assert.equal(r.maiorEsperaEquipeMin, 120);
  assert.equal(r.terminouSemResposta, true);
});

test("métricas: conversa só da IA não conta espera pela equipe", () => {
  const r = calcularMetricas([msg(1, "cliente", 0), msg(2, "ia", 1), msg(3, "cliente", 5), msg(4, "ia", 6)]);
  assert.equal(r.maiorEsperaEquipeMin, null);
  assert.equal(r.terminouSemResposta, false);
});

test("achado que cita mensagem inexistente é descartado", () => {
  const ficha = { resumo: "x", objecoes: [{ tipo: "preco", descricao: "achou caro", mensagemId: 10 }, { tipo: "parcela", descricao: "inventada", mensagemId: 999 }, { tipo: "outro", descricao: "sem prova", mensagemId: null }], errosIa: [] };
  const r = conferirProvas(ficha, new Set([10, 11]), ["objecoes", "errosIa"]);
  assert.equal(r.descartados, 2);
  assert.deepEqual(r.ficha.objecoes.map((o) => o.descricao), ["achou caro"]);
  assert.equal(ficha.objecoes.length, 3, "não altera a ficha original");
});

test("dias: antes das 18:30 só o dia anterior; depois, hoje também", () => {
  // 15/10 18:00 em Recife = 21:00 UTC
  assert.deepEqual(diasParaAnalisar(new Date("2026-10-15T21:00:00Z")), [{ dia: "2026-10-14", refazerSeMudou: true }]);
  // 15/10 18:30 em Recife
  assert.deepEqual(diasParaAnalisar(new Date("2026-10-15T21:30:00Z")), [
    { dia: "2026-10-15", refazerSeMudou: false },
    { dia: "2026-10-14", refazerSeMudou: true },
  ]);
  // 16/10 02:00 em Recife (05:00 UTC): confere o dia 15 de novo
  assert.deepEqual(diasParaAnalisar(new Date("2026-10-16T05:00:00Z")), [{ dia: "2026-10-15", refazerSeMudou: true }]);
});

test("precisa analisar: sem ficha sempre; com ficha, só de madrugada e se chegou mensagem nova", () => {
  assert.equal(precisaAnalisar({ jaTemFicha: false, ultimaAnalisadaId: null, ultimaDoDiaId: 5, refazerSeMudou: false }), true);
  assert.equal(precisaAnalisar({ jaTemFicha: true, ultimaAnalisadaId: 5, ultimaDoDiaId: 9, refazerSeMudou: false }), false);
  assert.equal(precisaAnalisar({ jaTemFicha: true, ultimaAnalisadaId: 5, ultimaDoDiaId: 9, refazerSeMudou: true }), true);
  assert.equal(precisaAnalisar({ jaTemFicha: true, ultimaAnalisadaId: 9, ultimaDoDiaId: 9, refazerSeMudou: true }), false);
});
