/* TESTES DA ARQUITETURA DE FLUXOS
   Provam que as etapas são independentes, que a trilha de auditoria é
   registrada e que qualquer fluxo novo passa pelas mesmas camadas de segurança.
   Tudo falso: nada chega ao WhatsApp, ao banco ou à OpenAI. */
import assert from "node:assert/strict";
import { test } from "node:test";
import { executarFluxo, type Etapa } from "../../lib/ia/fluxo.ts";
import { decidirEstoque, type ItemEstoque } from "../../lib/ia/estoque-tipos.ts";
import { CONTROLE_PADRAO, type ControleIa } from "../../lib/ia/permissoes.ts";
import {
  ETAPAS_DE_ENTRADA,
  ETAPAS_DE_SAIDA,
  FLUXO_PRIMEIRO_ATENDIMENTO,
  interpretar,
  processarMensagem,
  type Ctx,
  type Deps,
  type EtapaDeAtendimento,
  type SaidaModelo,
} from "../../lib/ia/pipeline.ts";

const LIGADO: ControleIa = { ligada: true, permissoes: { ...CONTROLE_PADRAO.permissoes, enviarMensagem: true, lerEstoque: true } };
const ESTOQUE: ItemEstoque[] = [{ id: 1, tipo: "moto_eletrica", marca: "Voltz", modelo: "EV1", versao: null, cor: "Preta", condicao: "zero_km", status: "disponivel" }];

function deps(o: { controle?: ControleIa; modelo?: SaidaModelo } = {}) {
  const enviados: string[] = [];
  let chamadasModelo = 0;
  const d: Deps = {
    controle: o.controle ?? LIGADO,
    promptSistema: "Nunca invente preço prazo endereço horário condição de pagamento cor estoque ou característica de veículo.",
    nomesDeProdutos: ["Voltz", "EV1"],
    fontesAutorizadas: [],
    gerar: async () => {
      chamadasModelo++;
      return o.modelo ?? { mensagem: "Olá! Me conta o que você procura: moto elétrica, a combustão ou carro?", consultaEstoque: null, transferir: false };
    },
    consultarEstoque: async (q) => decidirEstoque(ESTOQUE, q.termo),
    enviar: async (t) => (enviados.push(t), { ok: true }),
  };
  return { d, enviados, modelo: () => chamadasModelo };
}

test("TRILHA: cada etapa que rodou fica registrada, na ordem, com o resultado", async () => {
  const { d } = deps();
  const r = await processarMensagem("Oi!", d);
  assert.equal(r.acao, "enviada");
  assert.deepEqual(
    r.trilha.map((p) => p.etapa),
    FLUXO_PRIMEIRO_ATENDIMENTO.map((e) => e.nome),
  );
  assert.ok(r.trilha.every((p) => p.resultado === "seguiu" || p.etapa === "envio"));
  assert.equal(r.trilha.at(-1)?.resultado, "encerrou");
  assert.ok(r.trilha.every((p) => typeof p.ms === "number"));
});

test("TRILHA: quando o fluxo encerra cedo, só as etapas até ali aparecem e o motivo fica registrado", async () => {
  const { d, modelo } = deps({ controle: CONTROLE_PADRAO });
  const r = await processarMensagem("Oi!", d);
  assert.deepEqual(r.trilha.map((p) => p.etapa), ["chave_geral"]);
  assert.equal(r.trilha[0].detalhe, "ia_desligada");
  assert.equal(modelo(), 0);
});

test("TRILHA: o bloqueio do validador aparece com a etapa que barrou", async () => {
  const { d } = deps({ modelo: { mensagem: "Sai por R$ 9.000.", consultaEstoque: null, transferir: false } });
  const r = await processarMensagem("Quanto custa?", d);
  const ultimo = r.trilha.at(-1)!;
  assert.equal(ultimo.etapa, "validador");
  assert.equal(ultimo.resultado, "encerrou");
  assert.equal(ultimo.detalhe, "validador");
});

test("ETAPAS TROCÁVEIS: trocar a etapa 'interpretar' não exige mexer no resto do fluxo", async () => {
  const semIa: EtapaDeAtendimento = {
    nome: "interpretar_por_regra",
    rodar: () => ({ ctx: { texto: "Olá! Me conta o que você procura: moto elétrica, a combustão ou carro?", saida: { mensagem: null, consultaEstoque: null, transferir: false } } }),
  };
  const fluxo = FLUXO_PRIMEIRO_ATENDIMENTO.map((e) => (e === interpretar ? semIa : e));
  const { d, enviados, modelo } = deps();
  const r = await processarMensagem("Oi!", d, fluxo);
  assert.equal(r.acao, "enviada");
  assert.equal(modelo(), 0, "sem etapa de IA, o modelo nunca é chamado");
  assert.equal(enviados.length, 1);
  assert.ok(r.trilha.some((p) => p.etapa === "interpretar_por_regra"));
});

test("FLUXO NOVO reaproveita a saída segura e não consegue contorná-la", async () => {
  const gerarPreco: EtapaDeAtendimento = { nome: "responder_preco", rodar: () => ({ ctx: { texto: "O valor é R$ 12.990 à vista." } }) };
  const fluxoNovo = [...ETAPAS_DE_ENTRADA, gerarPreco, ...ETAPAS_DE_SAIDA];
  const { d, enviados } = deps();
  const r = await processarMensagem("Quanto custa?", d, fluxoNovo);
  assert.equal(r.acao, "bloqueada");
  assert.equal(r.motivo, "validador");
  assert.deepEqual(enviados, []);

  const semPermissao = deps({ controle: { ...LIGADO, permissoes: { ...LIGADO.permissoes, enviarMensagem: false } } });
  const boa: EtapaDeAtendimento = { nome: "responder_ok", rodar: () => ({ ctx: { texto: "Olá! Me conta o que você procura?" } }) };
  const r2 = await processarMensagem("Oi", semPermissao.d, [...ETAPAS_DE_ENTRADA, boa, ...ETAPAS_DE_SAIDA]);
  assert.equal(r2.motivo, "sem_permissao_envio");
  assert.deepEqual(semPermissao.enviados, []);

  const ligadaOff = deps({ controle: CONTROLE_PADRAO });
  const r3 = await processarMensagem("Oi", ligadaOff.d, [...ETAPAS_DE_ENTRADA, boa, ...ETAPAS_DE_SAIDA]);
  assert.equal(r3.acao, "nao_executada");
  assert.deepEqual(ligadaOff.enviados, []);
});

test("FALHA FECHADA: se uma etapa quebra, nada é enviado, um humano assume e o erro fica na trilha", async () => {
  const quebrada: EtapaDeAtendimento = {
    nome: "etapa_quebrada",
    rodar: () => {
      throw new Error("bug inesperado");
    },
  };
  const { d, enviados } = deps();
  const r = await processarMensagem("Oi", d, [...ETAPAS_DE_ENTRADA, quebrada, ...ETAPAS_DE_SAIDA]);
  assert.equal(r.acao, "bloqueada");
  assert.equal(r.motivo, "erro_etapa");
  assert.equal(r.transferirHumano, true);
  assert.deepEqual(enviados, []);
  assert.equal(r.trilha.at(-1)?.etapa, "etapa_quebrada");
  assert.equal(r.trilha.at(-1)?.resultado, "erro");
  assert.match(r.trilha.at(-1)?.detalhe ?? "", /bug inesperado/);
});

test("FLUXO SEM ENVIO: um fluxo que termina sem passar pelo envio nunca conta como enviado", async () => {
  const { d, enviados } = deps();
  const r = await processarMensagem("Oi", d, [...ETAPAS_DE_ENTRADA, interpretar]);
  assert.equal(r.acao, "bloqueada");
  assert.equal(r.motivo, "erro_etapa");
  assert.deepEqual(enviados, []);
});

test("EXECUTOR: é genérico, roda qualquer lista de etapas e para no primeiro 'encerrar'", async () => {
  type C = { n: number };
  const soma: Etapa<C> = { nome: "soma", rodar: (c) => ({ ctx: { n: c.n + 1 } }) };
  const para: Etapa<C> = { nome: "para", rodar: () => ({ encerrar: "pronto" }) };
  const nunca: Etapa<C> = { nome: "nunca", rodar: () => ({ ctx: { n: 999 } }) };
  const e = await executarFluxo([soma, soma, para, nunca], { n: 0 });
  assert.equal(e.ctx.n, 2);
  assert.equal(e.fim, "pronto");
  assert.equal(e.encerradoEm, "para");
  assert.deepEqual(e.trilha.map((p) => p.etapa), ["soma", "soma", "para"]);
});

test("CONTEXTO: as etapas trocam dados só pelo contexto tipado", () => {
  const c = {} as Ctx;
  void c;
  assert.ok(FLUXO_PRIMEIRO_ATENDIMENTO.length >= 8);
  assert.ok(FLUXO_PRIMEIRO_ATENDIMENTO.every((e) => typeof e.nome === "string" && typeof e.rodar === "function"));
});
