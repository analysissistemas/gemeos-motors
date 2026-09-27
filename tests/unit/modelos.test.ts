/* Modelos de mensagem da Meta: leitura do que a Graph API devolve, texto preenchido e o
   formato do envio (campos numerados e com nome). */
import assert from "node:assert/strict";
import { test } from "node:test";
import { camposDoTexto, componentesDoEnvio, converterModeloMeta, montarTexto } from "../../lib/mensageria/modelos.ts";

const aprovado = {
  name: "retomar_contato",
  language: "pt_BR",
  status: "APPROVED",
  category: "MARKETING",
  components: [
    { type: "HEADER", format: "TEXT", text: "Gêmeos Motors" },
    { type: "BODY", text: "Olá, {{1}}! A {{2}} chegou. {{1}}, quer ver?" },
    { type: "FOOTER", text: "Responda SAIR para não receber" },
    { type: "BUTTONS", buttons: [{ type: "QUICK_REPLY", text: "Quero ver" }] },
  ],
};

test("campos numerados saem em ordem e sem repetir", () => {
  assert.deepEqual(camposDoTexto("{{2}} e {{1}} e {{2}}").map((c) => c.chave), ["1", "2"]);
  assert.deepEqual(camposDoTexto("Oi {{nome}}, {{ modelo }}"), [{ chave: "nome", nomeado: true }, { chave: "modelo", nomeado: true }]);
});

test("modelo aprovado vira a forma da tela; o que não é aprovado some", () => {
  const m = converterModeloMeta(aprovado);
  assert.ok(m);
  assert.equal(m.suportado, true);
  assert.equal(m.cabecalho, "Gêmeos Motors");
  assert.deepEqual(m.botoes, ["Quero ver"]);
  assert.equal(m.campos.length, 2);
  assert.equal(converterModeloMeta({ ...aprovado, status: "PENDING" }), null);
  assert.equal(converterModeloMeta({ ...aprovado, status: "REJECTED" }), null);
});

test("cabeçalho de foto e botão de link com campo ficam como não suportados, com motivo", () => {
  const foto = converterModeloMeta({ ...aprovado, components: [{ type: "HEADER", format: "IMAGE" }, { type: "BODY", text: "Oi {{1}}" }] });
  assert.equal(foto?.suportado, false);
  assert.match(foto?.motivo ?? "", /foto/);
  const link = converterModeloMeta({ ...aprovado, components: [{ type: "BODY", text: "Oi" }, { type: "BUTTONS", buttons: [{ type: "URL", text: "Ver", url: "https://x.com/{{1}}" }] }] });
  assert.equal(link?.suportado, false);
});

test("texto preenchido repete o mesmo campo e traz cabeçalho e rodapé", () => {
  const m = converterModeloMeta(aprovado)!;
  const t = montarTexto(m, ["Ana", "AG08"]);
  assert.equal(t, "*Gêmeos Motors*\n\nOlá, Ana! A AG08 chegou. Ana, quer ver?\n\n_Responda SAIR para não receber_");
});

test("envio para a Graph API: numerados só com text; com nome leva parameter_name", () => {
  const m = converterModeloMeta(aprovado)!;
  assert.deepEqual(componentesDoEnvio(m, ["Ana", "AG08"]), [{ type: "body", parameters: [{ type: "text", text: "Ana" }, { type: "text", text: "AG08" }] }]);
  const nomeado = converterModeloMeta({ ...aprovado, components: [{ type: "BODY", text: "Oi {{nome}}" }] })!;
  assert.deepEqual(componentesDoEnvio(nomeado, ["Ana"]), [{ type: "body", parameters: [{ type: "text", parameter_name: "nome", text: "Ana" }] }]);
  const sem = converterModeloMeta({ ...aprovado, components: [{ type: "BODY", text: "Olá! Tudo bem?" }] })!;
  assert.deepEqual(componentesDoEnvio(sem, []), []);
});
