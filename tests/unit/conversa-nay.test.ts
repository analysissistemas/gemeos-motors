/* Nay (21/10/2026, conversa 299): pediu a "preta grandona" (o vendedor já tinha dito "Tank, custa 12.900"), escreveu
   "Tnk 11" e a IA leu "até 11 mil"; mandou o print do Instagram com "TANK | PRETA" e recebeu o catálogo duas vezes;
   escreveu "Tank ag11", depois só "Visa", e a simulação saiu em 11x (o 11 do nome). */
import assert from "node:assert/strict";
import { test } from "node:test";
import { semNomesDeModelo, ultimaCitada } from "../../lib/ia/midia-tipos.ts";
import { faixaDoTexto, lerDoCliente } from "../../lib/ia/necessidade.ts";
import { decidirSimulacao } from "../../lib/ia/simulacao-fluxo.ts";
import { respostaParaMidia } from "../../lib/ia/foto-cliente.ts";
import { textoDaMensagem, PREFIXO_MODELO_NA_FOTO } from "../../lib/ia/workflow/util.ts";

const NOMES = ["TANK AG11", "T1", "M6", "T3 RETRÔ", "T5 RETRÔ", "MM3", "DF17", "AG08", "UFOFAST", "Triciclo Foxscoo", "Bicicleta Elétrica Dobrável 400W", "Patinete 530W"];
const MODELOS = NOMES.map((nome) => ({ nome }));

test("'Tnk 11' é a TANK AG11, não orçamento", () => {
  for (const t of ["Tnk 11", "tamk", "a tannk preta", "Tank ag11"]) assert.equal(ultimaCitada(MODELOS, t)?.nome, "TANK AG11", t);
  for (const t of ["tanto faz", "obrigado", "quero uma moto", "tem trilha?"]) assert.equal(ultimaCitada(MODELOS, t), null, t);
  assert.equal(faixaDoTexto(semNomesDeModelo("Tnk 11", MODELOS), true), null);
  assert.equal(faixaDoTexto(semNomesDeModelo("Tank ag11 até 13 mil", MODELOS))?.ate, 13000);
  /* a palavra do tipo fica: "bicicleta" e "triciclo" continuam dizendo o que ele quer */
  assert.equal(lerDoCliente(semNomesDeModelo("quero uma bicicleta", MODELOS)).tipo, "bicicleta");
  assert.equal(lerDoCliente(semNomesDeModelo("quero um triciclo", MODELOS)).tipo, "triciclo");
});

test("'Visa' depois de 'Tank ag11': pergunta em quantas vezes, não simula 11x", () => {
  const d = decidirSimulacao({
    textoCliente: "Visa",
    recentesCliente: "Lead: Tank ag11\nLead: Sim",
    historicoCliente: "Lead: Tnk 11\nLead: Tank ag11\nLead: Sim",
    ultimaDaLoja: "E qual é a bandeira do seu cartão?",
    modelo: "TANK AG11",
    preco: 12900,
    nome: "Nay",
  });
  assert.equal(d.acao, "perguntar");
  /* em 10x dito antes continua valendo */
  const e = decidirSimulacao({ textoCliente: "Visa", recentesCliente: "Lead: Tank ag11 em 10x", ultimaDaLoja: "E qual é a bandeira do seu cartão?", modelo: "TANK AG11", preco: 12900, nome: "Nay" });
  assert.equal(e.acao, "enviar");
  assert.match(e.acao === "enviar" ? e.registro : "", /10x/);
});

test("print com o nome do modelo escrito: atende sobre ele, sem catálogo", () => {
  const foto = textoDaMensagem({ tipo: "imagem", conteudo: null, transcricao: `${PREFIXO_MODELO_NA_FOTO} TANK AG11` });
  assert.equal(foto, "[imagem] (modelo escrito na foto: TANK AG11)");
  assert.equal(respostaParaMidia({ textoBuffer: foto, ultimaDaLoja: "", modelos: NOMES, foraDaVenda: false }), null);
  /* descrição antiga guardada não entra; foto sem nome escrito continua indo o catálogo */
  assert.equal(textoDaMensagem({ tipo: "imagem", conteudo: "essa", transcricao: "Uma moto preta" }), "[imagem: essa]");
  assert.equal(respostaParaMidia({ textoBuffer: "[imagem]", ultimaDaLoja: "", modelos: NOMES, foraDaVenda: false }), "catalogo_foto");
});
