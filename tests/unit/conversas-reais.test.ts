/* Bateria de regressão com as conversas REAIS que deram problema (05 e 06/10/2026). Cada caso é a frase do cliente e o
   que o sistema precisa decidir. Se algum erro voltar, este arquivo falha antes de ir para o ar. A da Arine está em
   conversa-arine.test.ts. Roda com `npm run test:ia`. */
import assert from "node:assert/strict";
import { test } from "node:test";
import { instrucaoTriciclo, intencaoDoTexto, reclamouDoAtendimento, RX_RECADO, semAberturaDoSite, textoRecado, veioDoSite } from "../../lib/ia/intencao.ts";
import { detectarMomento, tirarAdiamento } from "../../lib/ia/fechamento.ts";
import { disponibilidadeDoEstoque } from "../../lib/ia/pipeline.ts";
import { ultimaCitada } from "../../lib/ia/midia-tipos.ts";

const NOMES = ["TANK AG11", "T1", "M6", "T3 RETRÔ", "MM3", "DF17", "AG08"];

test("Dinho — recado para o dono não é venda e não é negado", () => {
  const msg = "Boa noite me chamo dinho, sou o menino que o senhor deu presente na brincadeira. Quero abrir mão do celular pra minha amiga";
  assert.equal(intencaoDoTexto(msg, NOMES), null);
  assert.ok(RX_RECADO.test("Eu quero falar com o Moço que fez essa brincadeira com eu"));
  const t = textoRecado({ nome: "Dinho", lojaAberta: false, jaEncaminhou: false });
  assert.match(t, /passar o seu recado/);
  assert.doesNotMatch(t, /moto|como posso te ajudar/i);
});

test("Any — mensagem pronta do site não é recado; triciclo é o MM3", () => {
  const site = "Olá! Vim pelo site da Gêmeos Motors e quero falar com um consultor.";
  assert.ok(veioDoSite(site));
  assert.ok(!RX_RECADO.test(semAberturaDoSite(site)));
  assert.equal(intencaoDoTexto("Bom dia! Vcs tem triciclo elétrico?", NOMES), "compra");
  assert.match(instrucaoTriciclo("Vcs tem triciclo elétrico?", ["MM3"]), /\*MM3\*/);
});

test("Rita — \"não temos a M6 disponível\" (encomenda a caminho) não é barrado", () => {
  const deps = { nomesDoCatalogo: NOMES, modelosComEstoque: ["T1", "TANK AG11", "DF17", "AG08"] };
  assert.equal(disponibilidadeDoEstoque("No momento não temos a M6 disponível. A próxima remessa chega em 09/10.", deps), true);
  assert.equal(disponibilidadeDoEstoque("A M6 está disponível para pronta entrega.", deps), false);
});

test("TANK — \"moto tank\" é a TANK AG11 e \"quero que entregue\" é escolha de entrega", () => {
  assert.equal(ultimaCitada(NOMES.map((nome) => ({ nome })), "fechado, quero a moto tank")?.nome, "TANK AG11");
  assert.equal(detectarMomento({ textoCliente: "quero que entregue, moro em Goiana", ultimaDaLoja: "Prefere vir buscar aqui na loja ou que a gente entregue pra você? 🛵", conheceModelo: true }), "escolheu_entrega");
});

test("Joana — loja fechada não adia a venda", () => {
  assert.deepEqual(tirarAdiamento(["É um modelo com motor forte. O que acha de conversarmos melhor amanhã para confirmar sua compra? 🙂"]), ["É um modelo com motor forte."]);
});

test("Arine — reclamação do atendimento é reconhecida", () => {
  assert.ok(reclamouDoAtendimento("Acho que tô falando com atendente virtual. Depois passo aí pessoalmente"));
  assert.ok(!reclamouDoAtendimento("você é robô?"));
});
