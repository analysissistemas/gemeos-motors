/* Site + IA conversando (usuário e Milton, 04 a 06/11/2026: "a gente tem site + IA, os 2 tem que conversar"; "Cliente quer
   foto. Já disse produto. Aí ele vai levando com a barriga"; a bicicleta dobrável é a mais barata e a IA disse só a N2). */
import assert from "node:assert/strict";
import { test } from "node:test";
import { cardDoSite, instrucaoCardDoSite, instrucaoDisponibilidade, RX_DISPONIBILIDADE } from "../../lib/ia/intencao.ts";
import { linkDoSite, textoSiteOpcoes } from "../../lib/ia/foto-cliente.ts";
import { textoAPartirDe } from "../../lib/ia/necessidade.ts";
import { tirarPromessaDeMidia } from "../../lib/ia/midia-tipos.ts";

const ESTOQUE = [
  { nome: "N2", tipo: "moto_eletrica", preco: 5890 },
  { nome: "AG08", tipo: "moto_eletrica", preco: 10990 },
  { nome: "Bicicleta Dobrável 400W", tipo: "moto_eletrica", preco: 3990 },
  { nome: "V8 BIKE", tipo: "moto_eletrica", preco: 4490 },
  { nome: "Patinete 530W", tipo: "patinete", preco: 4200 },
  { nome: "MT4 2000W", tipo: "moto_eletrica", preco: 2500, descricao: "Uso em circuitos fechados e propriedades privadas." },
  { nome: "Triciclo Foxscoo", tipo: "moto_eletrica", preco: 3000, descricao: "Triciclo elétrico, três rodas." },
];

test("Amanda: 'tem a partir de quanto?' sem dizer o tipo traz a bicicleta, a mais barata, e não só a moto", () => {
  const t = textoAPartirDe(null, ESTOQUE)!;
  assert.match(t, /^Temos bicicleta elétrica a partir de \*R\$ 3\.990\*, patinete elétrico a partir de \*R\$ 4\.200\* e moto elétrica a partir de \*R\$ 5\.890\*/);
  assert.doesNotMatch(t, /2\.500/, "moto de trilha (MT4) não entra no 'a partir de'");
});

test("disse o tipo: só o preço do tipo dele", () => {
  assert.match(textoAPartirDe("moto", ESTOQUE)!, /^Temos moto elétrica a partir de \*R\$ 5\.890\*/);
  assert.match(textoAPartirDe("bicicleta", ESTOQUE)!, /^Temos bicicleta elétrica a partir de \*R\$ 3\.990\*/);
  assert.match(textoAPartirDe("patinete", ESTOQUE)!, /^Temos patinete elétrico a partir de \*R\$ 4\.200\*/);
  assert.equal(textoAPartirDe("patinete", ESTOQUE.filter((m) => m.tipo !== "patinete")), null);
  assert.match(textoAPartirDe(null, [ESTOQUE[0]])!, /^Temos moto elétrica a partir de \*R\$ 5\.890\*, com pronta entrega/);
});

test("Anderso: 'Mas acabou ou tem ainda' é pergunta de disponibilidade e vira instrução de responder primeiro", () => {
  for (const t of ["Mas acabou ou tem ainda", "ainda tem a AG08?", "tem disponível?", "Tá disponível", "tem pronta entrega?", "esgotou?"]) assert.ok(RX_DISPONIBILIDADE.test(t), t);
  for (const t of ["ainda tá caro", "tem garupa?", "quanto custa", "acabamento preto"]) assert.ok(!RX_DISPONIBILIDADE.test(t), t);
  assert.match(instrucaoDisponibilidade("Mas acabou ou tem ainda"), /Responda isso PRIMEIRO.*não fale de troca, de orçamento/s);
  assert.equal(instrucaoDisponibilidade("quero ver as motos"), "");
});

const CARD = ["Olá! Tenho interesse nesta moto do site:", "", "*AG08*", "Cinza", "Nova", "Zero km, sem uso", "Sem avarias", "", "1000W - Até 60 km", "", "*R$ 10.990*", "", "Ainda tem em estoque?"].join("\n");

test("card do site: a IA lê o modelo e a cor, e responde direto sem qualificação", () => {
  assert.deepEqual(cardDoSite(CARD), { modelo: "AG08", cor: "Cinza" });
  assert.deepEqual(cardDoSite(CARD.replace("Cinza\n", "")), { modelo: "AG08", cor: null }, "sem a cor, a linha seguinte (condição) não vira cor");
  assert.equal(cardDoSite(CARD.replace("Tenho interesse nesta moto", "Quero reservar esta moto"))?.modelo, "AG08");
  assert.equal(cardDoSite("Olá! Vim pelo site da Gêmeos Motors e quero falar com um consultor."), null);
  assert.match(instrucaoCardDoSite(CARD), /Ele já escolheu: AG08 na cor Cinza\. NÃO pergunte o tipo, o orçamento/);
});

test("link direto do site: no modelo (sem acento, + no espaço) ou no tipo; sem nada, o site inteiro", () => {
  assert.equal(linkDoSite({ modelo: "Bicicleta Dobrável 400W" }), "gemeosmotors.com.br/#m=Bicicleta+Dobravel+400W");
  assert.equal(linkDoSite({ modelo: "T3 RETRÔ" }), "gemeosmotors.com.br/#m=T3+RETRO");
  assert.equal(linkDoSite({ tipo: "bicicleta" }), "gemeosmotors.com.br/#tipo=bicicleta");
  assert.equal(linkDoSite({ tipo: "triciclo" }), "gemeosmotors.com.br");
  assert.equal(linkDoSite(), "gemeosmotors.com.br");
  assert.match(textoSiteOpcoes("Ana", linkDoSite({ tipo: "patinete" })), /gemeosmotors\.com\.br\/#tipo=patinete/);
  assert.doesNotMatch(linkDoSite({ tipo: "moto" }), /\?/, "sem '?': não vira pergunta na frase");
});

test("Rafaelly: promessa de mostrar opções sem mandar nada sai da resposta", () => {
  assert.equal(
    tirarPromessaDeMidia("Entendi, Rafaelly! Sua mãe gosta de algo estiloso, então já vou focar em motos que combinem com esse perfil. Assim a gente encontra a mais legal pra ela! 😊"),
    "Entendi, Rafaelly! Assim a gente encontra a mais legal pra ela! 😊",
  );
  assert.equal(tirarPromessaDeMidia("Já já vou mostrar as opções que combinam com o jeito dela, Rafaelly!"), "");
  const pagamento = "Vou te passar as opções de pagamento certinho.";
  assert.equal(tirarPromessaDeMidia(pagamento), pagamento, "opções de pagamento não é promessa de moto");
});

test("disse moto e a bicicleta sai mais em conta: oferece a bicicleta também (Milton, 05/11/2026)", () => {
  assert.match(textoAPartirDe("moto", ESTOQUE)!, /^Temos moto elétrica a partir de \*R\$ 5\.890\* e, se quiser algo mais em conta, bicicleta elétrica a partir de \*R\$ 3\.990\*/);
  assert.match(textoAPartirDe("moto", ESTOQUE.filter((m) => !/bicicleta|bike/i.test(m.nome)))!, /^Temos moto elétrica a partir de \*R\$ 5\.890\*, com pronta entrega/);
});

test("na hora de indicar vai o site, sem opinião (Milton, 13/11/2026: 'Bom ela não opinar. Mandar ir ao catálogo')", async () => {
  const { textoSiteIndicacao } = await import("../../lib/ia/foto-cliente.ts");
  const { jaIndicou } = await import("../../lib/ia/necessidade.ts");
  const t = textoSiteIndicacao("Ana", linkDoSite({ tipo: "moto" }), "até uns 6 mil");
  assert.match(t, /^Ana, temos opções até uns 6 mil, com pronta entrega! 😃 No nosso site você vê todas, com foto, preço e cores: gemeosmotors\.com\.br\/#tipo=moto/);
  assert.doesNotMatch(t, /indico|combina|ideal/i);
  assert.ok(jaIndicou(`Loja: ${t}`), "depois do site a IA não volta a perguntar o orçamento");
  assert.match(textoSiteIndicacao(null, "gemeosmotors.com.br", null), /^Temos uma boa variedade de modelos/);
});
