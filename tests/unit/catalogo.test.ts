import { test } from "node:test";
import assert from "node:assert/strict";
import { decidirCatalogo, textoModeloSemEstoque, type ModeloCatalogo } from "../../lib/ia/catalogo-tipos.ts";
import type { ItemEstoque } from "../../lib/ia/estoque-tipos.ts";

const mod = (id: number, nome: string, tipo: string, marca: string | null, eletrico = true): ModeloCatalogo => ({ id, nome, tipo, marca, eletrico, ativo: true });
const vei = (id: number, modelo: string, tipo: string, status = "disponivel"): ItemEstoque => ({ id, tipo, marca: null, modelo, versao: null, cor: null, condicao: "zero_km", status });
const M = [mod(1, "EV1", "moto_eletrica", "Voltz"), mod(2, "HB20", "carro", "Hyundai", false), mod(3, "SHI175", "moto_combustao", "Shineray", false), mod(4, "CG160", "moto_combustao", "Honda", false)];

test("modelo eletrico sem estoque: reconhece e registra interesse", () => {
  const r = decidirCatalogo(M, [], "EV1");
  assert.equal(r.estado, "EXISTE_INDISPONIVEL");
  assert.ok(r.registrarInteresse && r.modeloConhecido);
  assert.match(textoModeloSemEstoque(r) ?? "", /Voltz EV1/);
});
test("com estoque disponivel", () => assert.equal(decidirCatalogo(M, [vei(9, "EV1", "moto_eletrica")], "ev1").estado, "DISPONIVEL"));
test("so vendido: indisponivel e registra interesse", () => {
  const r = decidirCatalogo(M, [vei(9, "EV1", "moto_eletrica", "vendido")], "EV1");
  assert.equal(r.estado, "EXISTE_INDISPONIVEL");
  assert.ok(r.registrarInteresse);
});
test("HB20 e SHI175 sao ofertaveis", () => {
  assert.equal(decidirCatalogo(M, [vei(1, "HB20", "carro")], "HB20").estado, "DISPONIVEL");
  assert.equal(decidirCatalogo(M, [], "SHI175").estado, "EXISTE_INDISPONIVEL");
});
test("outra combustao fica fora da regra, mesmo em estoque", () => {
  assert.equal(decidirCatalogo(M, [vei(5, "CG160", "moto_combustao")], "CG160").estado, "NAO_EXISTE");
});
test("modelo inexistente nao e inventado", () => {
  const r = decidirCatalogo(M, [], "EV10");
  assert.equal(r.estado, "NAO_EXISTE");
  assert.equal(r.registrarInteresse, false);
  assert.equal(decidirCatalogo(M, [], "x").estado, "ERRO");
});
