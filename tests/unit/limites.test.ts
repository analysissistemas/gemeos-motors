/* Limites da IA (compilado de 20/10/2026, testado no Simulador; dono, 21/10/2026): idade sem falar de lei, garantia só
   do cadastro, despedida curta e "seio" = sítio. */
import assert from "node:assert/strict";
import { test } from "node:test";
import { corrigirDigitacao, perguntaDeIdade, soDespedida, textoDespedida, tirarFalaDeIdade, TEXTO_IDADE } from "../../lib/ia/limites.ts";
import { corrigirGarantiaSemFonte } from "../../lib/ia/ficha-fatos.ts";
import { validarResposta } from "../../lib/ia/validador.ts";

test("pergunta de idade de quem vai pilotar", () => {
  for (const t of ["Oi, quero uma moto elétrica pro meu filho de 13 anos. Ele pode andar?", "Essas duas motos é autorizado pessoa de 13 anos andar", "Pra pessoa de 13anos de idade", "qual a idade mínima?", "menor de idade pode pilotar?"])
    assert.ok(perguntaDeIdade(t), t);
  for (const t of ["tenho 25 anos e quero a N2", "a bateria dura quantos anos?", "quero levar meu filho na escola", "Quanto custa a AG08?"]) assert.ok(!perguntaDeIdade(t), t);
  assert.ok(validarResposta(TEXTO_IDADE, { promptSistema: "", fontesAutorizadas: [] }).aprovada);
});

test("frase da IA que junta idade e lei sai; entra o texto fixo uma vez", () => {
  const r = tirarFalaDeIdade([
    "A moto elétrica é uma ótima opção. Para o seu filho de 13 anos, a legislação recomenda motos elétricas com velocidade máxima de até 32 km/h.",
    "Samuel, para um jovem de 13 anos, nossas motos elétricas são seguras e indicadas para passeios 😊. Qual chamou mais sua atenção?",
  ]);
  assert.deepEqual(r, ["A moto elétrica é uma ótima opção.", "Qual chamou mais sua atenção?", TEXTO_IDADE]);
  assert.deepEqual(tirarFalaDeIdade(["A N2 anda até 32 km/h e leva garupa."]), ["A N2 anda até 32 km/h e leva garupa."]);
  assert.deepEqual(tirarFalaDeIdade([TEXTO_IDADE]), [TEXTO_IDADE]);
});

test("garantia só do cadastro daquele modelo", () => {
  const fichas = [
    { nome: "T3 RETRÔ", garantia: null, descricao: "Leva garupa: duas pessoas, respeitando a carga máxima de 180 kg." },
    { nome: "T5 RETRÔ", garantia: null, descricao: "2 anos de garantia na bateria." },
  ];
  assert.equal(
    corrigirGarantiaSemFonte("A *T3 Retrô* tem 2 anos de garantia na bateria e 1 ano no restante da moto. Quer saber mais? 😊", fichas),
    "Quer saber mais? 😊 A garantia da *T3 RETRÔ* eu confirmo com a equipe.",
  );
  assert.equal(corrigirGarantiaSemFonte("A *T5 Retrô* tem 2 anos de garantia na bateria.", fichas), "A *T5 Retrô* tem 2 anos de garantia na bateria.");
  assert.equal(corrigirGarantiaSemFonte("Todas têm 1 ano de garantia.", fichas), "A garantia certinha eu confirmo com a equipe.");
  assert.equal(corrigirGarantiaSemFonte("Todas têm 1 ano de garantia.", fichas, "Garantia\nTodas as motos têm 1 ano de garantia."), "Todas têm 1 ano de garantia.");
  assert.equal(corrigirGarantiaSemFonte("Tem garantia sim, a equipe te passa os detalhes.", fichas), "Tem garantia sim, a equipe te passa os detalhes.");
});

test("despedida: curta e sem pergunta", () => {
  for (const t of ["Ok, obrigada! No momento não", "Valeu!", "obrigado 🙏", "Só isso, obrigada", "No momento não, obrigado"]) assert.ok(soDespedida(t), t);
  for (const t of ["Obrigado, e a AG08 quanto custa?", "ok", "obrigado, vou querer a N2", "não gostei"]) assert.ok(!soDespedida(t), t);
  assert.equal(textoDespedida("Ana"), "Eu que agradeço, Ana! Quando quiser, é só me chamar por aqui 😊");
});

test("digitação: 'seio' é sítio, 'trilah' é trilha", () => {
  assert.equal(corrigirDigitacao("Quero uma moto pra usar no seio"), "Quero uma moto pra usar no sítio");
  assert.equal(corrigirDigitacao("Para seio"), "Para seio");
  assert.equal(corrigirDigitacao("moto de trilah"), "moto de trilha");
});
