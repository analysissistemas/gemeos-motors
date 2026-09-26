/* ============================================================
   Apaga SÓ o que os testes de ponta a ponta criaram:
   - clientes cujo nome começa com "E2E " (e tudo ligado a eles:
     negócios, vendas, assinaturas, OS, conversas, follow-ups)
   - veículos cujo modelo começa com "E2E "
   - usuários cujo login começa com "e2e."
   - os registros de histórico dessas entidades
   Dado real nunca tem essa marca. Uso: npm run test:limpar
   ============================================================ */
import { criarSql } from "./sql.mjs";

const sql = criarSql(process.env.DATABASE_URL);

const ids = async (q) => (await q).map((r) => r.id);
const cli = await ids(sql`select id from clientes where nome like 'E2E %'`);
const usr = await ids(sql`select id from usuarios where usuario like 'e2e.%'`);
const vei = await ids(sql`select id from veiculos where modelo like 'E2E %'`);
const conv = await ids(sql`select id from conversas where cliente_id = any(${cli}) or contato_nome like 'E2E %'`);
const neg = await ids(sql`select id from negocios where cliente_id = any(${cli})`);
const ven = await ids(sql`select id from vendas where cliente_id = any(${cli}) or veiculo_id = any(${vei})`);
const os = await ids(sql`select id from ordens_servico where cliente_id = any(${cli})`);

const txt = (xs) => xs.map(String);
await sql.transaction([
  sql`delete from logs where
        (entidade = 'cliente' and entidade_id = any(${txt(cli)}))
     or (entidade = 'negocio' and entidade_id = any(${txt(neg)}))
     or (entidade = 'venda' and entidade_id = any(${txt(ven)}))
     or (entidade = 'os' and entidade_id = any(${txt(os)}))
     or (entidade = 'conversa' and entidade_id = any(${txt(conv)}))
     or (entidade = 'veiculo' and entidade_id = any(${txt(vei)}))
     or (entidade = 'usuario' and (entidade_id = any(${txt(usr)}) or entidade_id like 'e2e.%'))
     or usuario_id = any(${usr})
     or descricao like '%E2E %'`,
  sql`delete from assinaturas where documento_tipo = 'venda' and documento_id = any(${ven})`,
  sql`delete from assinaturas where documento_tipo = 'os' and documento_id = any(${os})`,
  sql`delete from follow_ups where cliente_id = any(${cli}) or conversa_id = any(${conv}) or negocio_id = any(${neg})`,
  sql`delete from conversas where id = any(${conv})`,
  sql`delete from ordens_servico where id = any(${os})`,
  sql`delete from vendas where id = any(${ven})`,
  sql`delete from negocios where id = any(${neg})`,
  sql`delete from clientes where id = any(${cli})`,
  sql`delete from veiculos where id = any(${vei})`,
  sql`delete from usuarios where id = any(${usr})`,
]);

/* tabela que ficou vazia volta a numerar do 1: a primeira venda real é a V-0001 */
const tabelas = ["clientes", "veiculos", "negocios", "negocio_eventos", "interacoes", "vendas", "venda_pagamentos", "assinaturas", "ordens_servico", "os_itens", "os_eventos", "conversas", "mensagens", "conversa_notas", "follow_ups", "logs"];
for (const t of tabelas) {
  const [{ n }] = await sql.query(`select count(*)::int as n from ${t}`);
  if (n === 0) await sql.query(`alter table ${t} alter column id restart with 1`);
}
const maxUsr = (await sql`select coalesce(max(id), 0)::int as m from usuarios`)[0].m;
await sql.query(`alter table usuarios alter column id restart with ${maxUsr + 1}`);

console.log(`limpeza E2E: ${cli.length} clientes, ${vei.length} veículos, ${neg.length} negócios, ${ven.length} vendas, ${os.length} OS, ${conv.length} conversas, ${usr.length} usuários`);
await sql.end();
