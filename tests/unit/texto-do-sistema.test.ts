/* Texto pronto do sistema x escrito pela IA (18/10/2026: a Sonix propôs regra para um texto fixo do código, chamado #20).
   Roda com `npm run test:ia`. */
import assert from "node:assert/strict";
import { test } from "node:test";
import { acaoDeCodigo, ehTextoDoSistema } from "../../lib/ia/texto-do-sistema.ts";

test("reconhece os textos prontos do sistema (mensagens antigas, sem a marca)", () => {
  for (const t of [
    "Entendi! Me conta o que está acontecendo com o seu aparelho, qual é o modelo e quando você comprou, que eu já registro tudo pra nossa assistência técnica 🙏",
    "Já anotei tudo! Um vendedor te responde assim que a loja abrir, e enquanto isso eu sigo te ajudando por aqui 🛵",
    "Pra nossa equipe avaliar, me manda por aqui:\n• Marca e modelo",
    "Genilso, pelo que você me contou (pro trabalho), as que mais combinam com você são:",
  ])
    assert.equal(ehTextoDoSistema(t), true, t);
  for (const t of ["A *AG08* está disponível na cor preta, por R$ 8.999,90 ✅", "Que bom! 20 km por dia é tranquilo pra uma elétrica 👍"]) assert.equal(ehTextoDoSistema(t), false, t);
});

test("a marca na mensagem vale mais que a frase", () => {
  assert.equal(ehTextoDoSistema("Já anotei tudo! Um vendedor te responde", { textoDoSistema: false }), false);
  assert.equal(ehTextoDoSistema("qualquer coisa", { textoDoSistema: true }), true);
});

test("plano de ação diz que é no código e mostra o que saiu", () => {
  const a = acaoDeCodigo({ problema: "A IA perguntava de assistência num áudio de troca.", trecho: "Me conta o que está acontecendo com o seu aparelho" });
  assert.ok(a.startsWith("Precisa mudar o código") && a.includes("Resposta que saiu"));
});
