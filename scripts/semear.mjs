/* ============================================================
   Dados iniciais REAIS — rodar uma vez depois das migrations.
   npm run db:seed

   Idempotente: rodar de novo não duplica nada. Não cria cliente, venda
   nem estoque: isso é a loja que cadastra. O que entra aqui é só o que
   o sistema precisa para funcionar e que já é fato:
     - o usuário administrador (senha gerada e mostrada UMA vez)
     - as duas lojas (Goiana e Carpina)
     - os dados da empresa que aparecem nos documentos
     - o catálogo das 8 elétricas, com ficha e preço do site oficial
     - respostas rápidas padrão do atendimento
   ============================================================ */
import { criarSql } from "./sql.mjs";
import { randomBytes, scryptSync } from "node:crypto";

const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL não configurada");
const sql = criarSql(url);

function hash(senha) {
  const sal = randomBytes(16);
  const h = scryptSync(senha, sal, 32, { N: 16384, r: 8, p: 1 });
  return `scrypt$16384$8$1$${sal.toString("base64")}$${h.toString("base64")}`;
}
function senhaForte() {
  const alfabeto = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  return Array.from(randomBytes(14), (b) => alfabeto[b % alfabeto.length]).join("");
}

/* ---------- administrador ---------- */
const [temAdmin] = await sql`select id from usuarios where usuario = 'admin'`;
if (!temAdmin) {
  const senha = process.env.SEED_ADMIN_SENHA || senhaForte();
  await sql`insert into usuarios (nome, usuario, senha_hash, papel)
            values ('Administrador', 'admin', ${hash(senha)}, 'admin')`;
  console.log(`\n  usuário: admin\n  senha:   ${senha}\n  (anote agora — ela não é mostrada de novo)\n`);
} else {
  console.log("admin já existe — senha mantida");
}

/* ---------- lojas ---------- */
for (const nome of ["Goiana", "Carpina"]) {
  await sql`insert into unidades (nome, cidade, estado) values (${nome}, ${nome}, 'PE')
            on conflict (nome) do nothing`;
}

/* ---------- empresa ---------- */
await sql`insert into empresa (id, nome_fantasia, whatsapp, instagram, estado, condicoes_venda, condicoes_os)
  values (1, 'Gêmeos Motors', '5581993869767', '@gemeosmotors_goiana', 'PE',
    ${"O comprador declara ter examinado o veículo e recebido as informações sobre condição, quilometragem e ficha técnica descritas neste documento. Garantia conforme informado pela loja para cada condição (zero km: garantia de fábrica; seminovo: garantia da loja). A transferência de documentação, quando houver, segue os prazos legais."},
    ${"O cliente autoriza a análise e o serviço descritos. Peças e serviços não listados só são executados com nova autorização. A garantia do serviço cobre exclusivamente o que foi executado e não cobre danos por queda, alagamento ou mau uso."})
  on conflict (id) do nothing`;

/* ---------- catálogo real (site gemeosmotors.com.br) ---------- */
const catalogo = [
  ["moto_eletrica", "TANK AG11", 11990, { motor: "1000W", autonomia: "50 a 55 km", velocidade: "32 km/h", bateria: "Lítio 60V 32Ah", peso: "180 kg", recarga: "4h a 8h" }],
  ["moto_eletrica", "T1", 12000, { motor: "1000W", autonomia: "Até 70 km", velocidade: "32 km/h", bateria: "Lítio 64V 30Ah", pneu: "Dianteiro 90-90-11 / Traseiro 90-90-10", peso: "180 kg", recarga: "6h a 7h" }],
  ["moto_eletrica", "M6", 10990, { motor: "1000W", autonomia: "Até 70 km", velocidade: "32 km/h", bateria: "Lítio 60V 32Ah", pneu: "Dianteiro 90-80-12 / Traseiro 3.0-10", peso: "180 kg", recarga: "6h a 8h" }],
  ["moto_eletrica", "T3 RETRÔ", 9990, { motor: "1000W", autonomia: "60 a 70 km", velocidade: "32 km/h", bateria: "Lítio 64V 30Ah", pneu: "Dianteiro 3.0-10 / Traseiro 3.0-10", peso: "180 kg", recarga: "6h a 7h" }],
  ["moto_eletrica", "AG08", 8990, { motor: "1000W", autonomia: "40 a 45 km", velocidade: "32 km/h", bateria: "Lítio 60V 24Ah", peso: "200 kg", recarga: "4h a 8h" }],
  ["moto_eletrica", "DF17", 7190, { motor: "1000W", autonomia: "40 a 50 km", velocidade: "32 km/h", bateria: "Lítio 48V 20Ah", pneu: "2.75-10", peso: "150 kg", recarga: "4h a 6h" }],
  ["moto_eletrica", "TCN BASKET", 5200, { motor: "500W", autonomia: "Até 40 km", bateria: "Chumbo-ácido selada 48V 12Ah", peso: "150 kg" }],
  ["triciclo_eletrico", "MM3", 10500, { motor: "1000W", autonomia: "45 a 55 km", velocidade: "32 km/h", bateria: "Lítio 60V 24Ah", pneu: "300/10", peso: "180 kg", recarga: "6h a 8h" }],
];
for (const [tipo, nome, preco, ficha] of catalogo) {
  await sql`insert into modelos (tipo, nome, preco_tabela, eletrico, ficha)
            values (${tipo}, ${nome}, ${preco}, true, ${JSON.stringify(ficha)}::jsonb)
            on conflict (nome) do nothing`;
}

/* ---------- respostas rápidas ---------- */
const respostas = [
  ["saudacao", "Saudação", "Olá! Tudo bem? Sou da equipe Gêmeos Motors. Como posso ajudar?"],
  ["troca", "Troca", "Claro! Trabalhamos com veículos na troca. Qual veículo você pretende deixar?"],
  ["visita", "Agendar visita", "Podemos agendar uma visita para você conhecer o veículo. Qual dia e horário ficam melhor para você?"],
  ["documentos", "Documentos", "Para seguir com a compra, preciso de um documento com foto e CPF. Pode me enviar por aqui?"],
];
for (const [atalho, titulo, conteudo] of respostas) {
  await sql`insert into respostas_rapidas (atalho, titulo, conteudo) values (${atalho}, ${titulo}, ${conteudo})
            on conflict (atalho) do nothing`;
}

/* ---------- configurações ---------- */
await sql`insert into configuracoes (chave, valor) values ('ia.triagem_automatica', 'true'::jsonb)
          on conflict (chave) do nothing`;

console.log("dados iniciais conferidos");
await sql.end();
