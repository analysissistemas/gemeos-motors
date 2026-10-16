/* Relatório das 8h no WhatsApp do Milton (dono, 16/10/2026). Roda com `npm run test:ia`. */
import assert from "node:assert/strict";
import { test } from "node:test";
import { MODELO_RELATORIO, parametrosRelatorio, textoRelatorioWhatsApp, type ResumoRelatorio } from "../../lib/avisos/relatorio-texto.ts";

const r: ResumoRelatorio = {
  conversasOntem: 5,
  vendasOntem: 1,
  valorOntem: 3000,
  vendasMes: 5,
  valorMes: 20890,
  prontos: [{ nome: "Amigo", porque: "Falou de pagamento" }],
  esperando: ["grazhy"],
  retiradas: [],
  testDrives: [],
  atrasados: 6,
  disponiveis: 16,
  semUnidade: [],
  procuradosSemEstoque: [],
  nota: 6.4,
  maiorEsperaMin: 16,
  sugestoes: ["Atuação ágil da equipe em atendimento"],
  plano: ["Fechar com Amigo (TANK AG11): falou de pagamento"],
};

test("campos do modelo: sem quebra de linha, na ordem do texto aprovado", () => {
  const p = parametrosRelatorio("Milton", r);
  assert.deepEqual(p, ["Milton", "5 conversas, 1 venda (R$ 3.000)", "1 cliente pronto para fechar, 1 cliente esperando resposta, 6 follow-ups atrasados", "1 melhoria para aprovar"]);
  assert.ok(p.every((x) => !/\n/.test(x)));
  assert.equal((MODELO_RELATORIO.definicao.components[0].text.match(/\{\{\d\}\}/g) ?? []).length, 4);
});

test("texto inteiro separado por área", () => {
  const t = textoRelatorioWhatsApp("Milton", r);
  for (const area of ["Plano de ação de hoje", "Atendimento (ontem)", "Vendas", "Estoque", "O que a IA sugere"]) assert.ok(t.includes(area), area);
  assert.match(t, /nota 6,4/);
  assert.match(t, /no mês: 5 \(R\$\s20\.890\)/);
});
