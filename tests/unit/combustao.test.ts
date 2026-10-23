/* Moto a combustão seminova (dono, 17/10/2026: a loja vende as que entram na troca). Os benefícios da elétrica
   (gasolina, IPVA, emplacamento) não podem aparecer nelas. Roda com `npm run test:ia`. */
import assert from "node:assert/strict";
import { test } from "node:test";
import { definirMotosACombustao, ehACombustao } from "../../lib/ia/estoque-tipos.ts";
import { instrucaoDeFechamento, parabens, persuasao, textoRecusouSimulacao, textoTabelaCompleta } from "../../lib/ia/fechamento.ts";
import { mensagemPadraoAquecimento } from "../../lib/ia/aquecimento.ts";

const ELETRICA = /gasolina|IPVA|emplacamento/i;

test("moto a combustão: textos sem os benefícios da elétrica", () => {
  definirMotosACombustao(["Kawasaki Z400 ABS 2021"]);
  const z = "Kawasaki Z400 ABS 2021";
  assert.ok(ehACombustao(z) && ehACombustao(" kawasaki z400 abs 2021 "));
  assert.ok(!ELETRICA.test(persuasao(z)));
  for (const p of parabens(z)) assert.ok(!ELETRICA.test(p), p);
  assert.ok(!ELETRICA.test(textoTabelaCompleta({ nome: null, modelo: z, bandeira: "Visa", aVista: 21500, linhas: [{ parcelas: 2, parcela: 11000, total: 22000 }] })));
  assert.ok(!/esquece a gasolina/.test(textoRecusouSimulacao({ nome: null, modelo: z, aVista: 21500, maiorParcela: 12, maisEmConta: null })));
  assert.ok(/NÃO diga que é sem gasolina/.test(instrucaoDeFechamento("decidido", z)));
  assert.ok(/NÃO fale de economia de gasolina/.test(instrucaoDeFechamento("objecao_preco", z)));
  assert.ok(!ELETRICA.test(mensagemPadraoAquecimento({ etapa: 2, nome: "Ana", modelo: z })));
});

test("moto elétrica continua com os benefícios", () => {
  definirMotosACombustao(["Kawasaki Z400 ABS 2021"]);
  assert.ok(!ehACombustao("AG08"));
  assert.ok(/esquece a gasolina/.test(persuasao("AG08")));
  assert.ok(parabens("AG08").some((p) => /gasolina/.test(p)));
  assert.ok(/sem IPVA/.test(instrucaoDeFechamento("decidido", "AG08")));
});

test("Simulador (22/10/2026): 'Quais formas de pagamento?' não perde a frase do à vista por ter ficha junto", async () => {
  const { soOQuePerguntou } = await import("../../lib/ia/fechamento.ts");
  const r = soOQuePerguntou(["A *TANK AG11*, com motor de 1000W, pode ser paga à vista no Pix, dinheiro ou transferência, sem taxa. Também é possível parcelar no cartão em até 21 vezes."], "Quais formas de pagamento?");
  assert.match(r.join(" "), /à vista no Pix/);
  assert.equal(soOQuePerguntou(["A bateria dura muito. Também é possível parcelar em até 21 vezes."], "como paga?")[0], "É possível parcelar em até 21 vezes.");
});
