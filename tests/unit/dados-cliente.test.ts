/* Leitura dos dados que o cliente manda para fechar (lib/ia/dados-cliente.ts): com rótulo, sem rótulo
   e tudo numa linha. Pedido do dono em 03/10/2026: guardar no CRM. */
import assert from "node:assert/strict";
import { test } from "node:test";
import { camposFaltando, cpfValido, enderecoDe, lerDadosDoCliente } from "../../lib/ia/dados-cliente.ts";

test("CPF só vale com dígito verificador certo", () => {
  assert.ok(cpfValido("111.444.777-35"));
  assert.ok(!cpfValido("123.456.789-00"));
  assert.ok(!cpfValido("111.111.111-11"));
});

test("sem rótulo, uma informação por linha (o teste do Carlos)", () => {
  const d = lerDadosDoCliente("Carlos Teste da Silva\n111.444.777-35\n81 90000-0210\n01/01/1990\n55900-000\nRua das Flores, 120, Centro\nPerto da praça\nAté 18h\nPix");
  assert.deepEqual(d, {
    nomeCompleto: "Carlos Teste da Silva",
    cpf: "11144477735",
    telefone: "81900000210",
    nascimento: "1990-01-01",
    cep: "55900000",
    rua: "Rua das Flores",
    numero: "120",
    bairro: "Centro",
    referencia: "Perto da praça",
    horario: "Até 18h",
    pagamento: "Pix",
  });
  assert.deepEqual(camposFaltando(d, "entrega", { cidade: "Goiana" }), []);
  assert.equal(enderecoDe(d, "Goiana"), "Rua das Flores, 120 · Centro · Goiana · CEP 55900-000");
});

test("com rótulo, como a lista do Milton", () => {
  const d = lerDadosDoCliente("Nome completo: maria joana de souza\nCPF: 111.444.777-35\nNúmero pra contato: (81) 98888-7777\nData de nascimento: 5/3/88\nCidade: Itambé\nCEP: 55920-000\nRua: Rua Projetada\nBairro: Centro\nN: 45\nPonto de referência: em frente à igreja\nAté que horas vc pode receber? 17h\nForma de pagamento: cartão em 10x");
  assert.equal(d.nomeCompleto, "maria joana de souza");
  assert.equal(d.telefone, "81988887777");
  assert.equal(d.nascimento, "1988-03-05");
  assert.equal(d.cidade, "Itambé");
  assert.equal(d.numero, "45");
  assert.equal(d.pagamento, "Cartão de crédito (10x)");
  assert.equal(d.horario, "17h");
});

test("retirada: nome, CPF e horário", () => {
  const d = lerDadosDoCliente("José Carlos Lima, 111.444.777-35, sábado às 10h");
  /* tudo numa linha sem rótulo: o CPF e o horário saem; o nome fica para a equipe conferir se não der */
  assert.equal(d.cpf, "11144477735");
  assert.deepEqual(camposFaltando({ nomeCompleto: "José Lima", cpf: "11144477735", horario: "sábado 10h" }, "retirada"), ["forma de pagamento"]);
});

test("CPF inválido não vai para o cadastro; telefone de 11 dígitos não vira CPF", () => {
  assert.equal(lerDadosDoCliente("CPF: 123.456.789-00").cpf, undefined);
  const d = lerDadosDoCliente("81988887777");
  assert.equal(d.cpf, undefined);
  assert.equal(d.telefone, "81988887777");
});
