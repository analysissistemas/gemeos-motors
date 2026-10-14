/* Raio-X dos 10 leads (relatório de 13/10/2026): as frases reais das conversas de 06 a 10/10/2026 que a IA não entendia.
   Decisão do dono (13/10/2026): pedido de desconto → primeiro a IA persuade com os ganhos; insistiu → vendedor.
   Roda com `npm run test:ia`. */
import assert from "node:assert/strict";
import { test } from "node:test";
import { detectarMomento, objecoesDePrecoAntes, textoNegociacao, tirarFraseProibida, instrucaoDeFechamento } from "../../lib/ia/fechamento.ts";
import { clienteEncerrou, clienteRecusouOModelo, clienteVaiRetornar } from "../../lib/ia/aquecimento.ts";
import { jaChamouPeloNome } from "../../lib/ia/workflow/util.ts";
import { validarResposta } from "../../lib/ia/validador.ts";

const PRECO_PATINETE = "O *Patinete 350W* está disponível na cor preta e tem pronta entrega ✅ O valor é R$ 2.200.";
const PRECO_X = "A *X GÊMEOS* está disponível na cor preta e sai por *R$ 10.000* 🛵";
const momento = (textoCliente: string, ultimaDaLoja: string, objecoesAntes = 0) => detectarMomento({ textoCliente, ultimaDaLoja, conheceModelo: true, objecoesAntes });

test("Andressa: 'faz 1800 à vista?' é pedido de desconto; 1ª vez a IA persuade, insistiu vai para o vendedor", () => {
  assert.equal(momento("Vc faz 1800 a vista?", PRECO_PATINETE), "objecao_preco");
  assert.equal(momento("Queria desconto", "Me fala quantos km você roda por dia", objecoesDePrecoAntes("Lead: Vc faz 1800 a vista?")), "negociar");
  for (const t of ["deixa por 1.800?", "consegue fazer por 2000?", "dá pra baixar o preço?", "qual o menor valor?", "faz mais barato?"]) assert.equal(momento(t, PRECO_PATINETE), "objecao_preco", t);
  /* não é desconto: parcelas e prazo */
  assert.notEqual(momento("faz em 10x?", PRECO_PATINETE), "objecao_preco");
  assert.notEqual(momento("faz 2 anos que quero uma", PRECO_PATINETE), "objecao_preco");
});

test("Danilo: preço de anúncio vai direto para o vendedor conferir", () => {
  assert.equal(momento("Ok. Mas e esse do anúncio ? Neste preço do anúncio, não tem ?", PRECO_PATINETE), "negociar");
  assert.match(textoNegociacao({ nome: "Danilo", anuncio: true, lojaAberta: true }), /conferir esse anúncio/u);
  assert.doesNotMatch(textoNegociacao({ nome: null, anuncio: false, lojaAberta: false }), /R\$|desconto/u);
});

test("'deixa quieto' e 'brgd' logo depois do preço: uma tentativa de persuasão", () => {
  assert.equal(momento("Então deixa quieto", PRECO_PATINETE), "objecao_preco");
  assert.equal(momento("Brgd", PRECO_X), "objecao_preco");
  /* sem preço antes, "obrigado" é só obrigado */
  assert.equal(momento("Brgd", "Nossa loja fica em Goiana, na PE-75."), null);
});

test("a persuasão vira o jogo e nunca fecha a porta do desconto", () => {
  const instr = instrucaoDeFechamento("objecao_preco", "Patinete 350W");
  assert.match(instr, /NUNCA diga que não tem desconto/u);
  assert.match(instr, /GANHA/u);
  assert.match(instr, /patinete/iu);
});

test("frases proibidas saem da resposta e o resto fica", () => {
  const r = tirarFraseProibida([
    "O preço do *Patinete 350W* é R$ 2.200 à vista, sem possibilidade de desconto. 😊 É um investimento que vale pela qualidade.",
    "O *Patinete 530W* que temos disponível está por R$ 3.500, igual ao do anúncio que você viu.",
    "Às vezes o preço divulgado pode variar conforme a disponibilidade ou promoções pontuais.",
    "Infelizmente não podemos reduzir o preço.",
  ]);
  assert.equal(r.length, 1);
  assert.match(r[0], /investimento que vale/u);
  assert.doesNotMatch(r.join(" "), /desconto|anúncio|variar|reduzir/u);
  /* a blindagem com 50% de desconto (verdade da base) continua */
  assert.equal(tirarFraseProibida(["Na compra da moto a blindagem sai com 50% de desconto!"]).length, 1);
});

test("o texto da negociação passa no validador", () => {
  for (const anuncio of [true, false]) {
    const v = validarResposta(textoNegociacao({ nome: "Andressa", anuncio, lojaAberta: true }));
    assert.equal(v.aprovada, true, JSON.stringify(v.violacoes));
  }
});

test("follow-up para quando o cliente encerra ('já comprei', 'deixa quieto', 'brgd', 'boas vendas')", () => {
  for (const t of ["Já comprei", "Então deixa quieto", "Brgd", "Ok, obrigado", "Boas vendas", "comprei em outra loja"]) assert.equal(clienteEncerrou(t), true, t);
  assert.equal(clienteEncerrou("Ok"), false);
});

test("Lucileide e Arine: 'dou uma passadinha' e 'depois passo aí' são visita (só o follow-up de 23 h)", () => {
  assert.equal(momento("Essa semana dou uma passadinha aí ta certo", PRECO_X), "quer_visitar");
  assert.equal(momento("Acho que tô falando com atendente virtual. Depois passo aí pessoalmente", PRECO_X), "quer_visitar");
  assert.equal(clienteVaiRetornar("Essa semana dou uma passadinha aí ta certo"), true);
  assert.equal(clienteVaiRetornar("Depois passo aí pessoalmente"), true);
  /* respondeu o dia que a loja pediu */
  assert.equal(momento("Creio que quarta feira.", "Fico Muito feliz! me fala o dia e horário para eu deixar tudo certinho com a minha equipe!"), "informou_visita");
});

test("o nome do patinete (350W) não é ficha: a frase de falta de estoque não some (Simulador, 14/10/2026)", async () => {
  const { soOQuePerguntou } = await import("../../lib/ia/fechamento.ts");
  const r = soOQuePerguntou(["No momento não temos unidade disponível do *Patinete 350W* para pronta entrega. Posso anotar seu interesse e te avisar aqui assim que chegar?"], "Oi, quanto custa o patinete 350W?");
  assert.match(r.join(" "), /não temos unidade disponível do \*Patinete 350W\*/u);
  /* a ficha de verdade continua saindo no orçamento */
  assert.doesNotMatch(soOQuePerguntou(["O *Patinete 530W* sai por R$ 3.500. Ele tem motor de 530W e anda a 30 km/h."], "quanto custa o patinete 530W?").join(" "), /30 km\/h/u);
});

test("Danilo Ferreira: 'essa não' tira o modelo do follow-up", () => {
  assert.equal(clienteRecusouOModelo("Não meu caro\n\nEssa não"), true);
  assert.equal(clienteRecusouOModelo("Essa aqui"), false);
  assert.equal(clienteRecusouOModelo("gostei dessa"), false);
});

test("Andressa e Lucileide: chamou pelo nome do perfil, não pergunta 'com quem eu falo?'", () => {
  const hist = "Lead: Queria desconto\n\nAgente IA: Entendo seu desejo por um desconto, Andressa.";
  assert.equal(jaChamouPeloNome("Andressa Souto", hist, []), true);
  assert.equal(jaChamouPeloNome("Lucileide Maria", "Lead: oi", ["Claro, Lucileide! Estamos abertos até as 18h."]), true);
  assert.equal(jaChamouPeloNome("Andressa Souto", "Agente IA: Boa noite! Tudo certinho?", []), false);
  assert.equal(jaChamouPeloNome(null, hist, []), false);
});
