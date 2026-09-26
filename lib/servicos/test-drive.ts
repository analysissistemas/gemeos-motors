import "server-only";
import { and, asc, desc, eq, gt, gte, inArray, isNull, lt, ne, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { z } from "zod";
import { db, schema, type Tx } from "@/lib/db";
import { ErroRegra } from "@/lib/acao";
import { registrarLog } from "@/lib/logs";
import { ETAPAS_ABERTAS } from "@/lib/dominio";
import { data, dataHora, formatarTelefone, hora, soDigitos, telefoneWhatsapp } from "@/lib/formato";
import { mensagemSistema } from "@/lib/mensageria/anotacoes";
import { DURACAO_TEST_DRIVE_MIN, STATUS_ABERTOS, STATUS_TEST_DRIVE, type StatusTestDrive } from "@/lib/test-drive";

type Quem = { id: number; nome: string };

/* ============================================================
   TEST DRIVE — agendar, remarcar, mudar status e listar
   Sempre na loja física de Goiana (a única). Cada agendamento ocupa o
   veículo por 45 minutos. O mesmo veículo do estoque (ou a moto de
   demonstração do mesmo modelo) não pode ter dois test drives que se cruzem.
   Nada aqui manda mensagem ao cliente: a confirmação no WhatsApp é
   opcional e fica na ação da tela.
   ============================================================ */

const id = z.coerce.number().int().positive();
const idOpcional = z.union([z.null(), z.literal(""), id]).optional().transform((v) => (v === "" || v == null ? null : v));
const textoOpcional = (max: number) =>
  z
    .string()
    .max(max, `Máximo de ${max} caracteres`)
    .nullable()
    .optional()
    .transform((v) => v?.trim() || null);

export const esquemaTestDrive = z.object({
  conversaId: idOpcional,
  clienteId: idOpcional,
  negocioId: idOpcional,
  nomeContato: textoOpcional(120),
  telefone: textoOpcional(30),
  modeloId: idOpcional,
  veiculoId: idOpcional,
  veiculoDescricao: textoOpcional(200),
  agendadoPara: z.coerce.date({ error: "Escolha a data e a hora" }),
  responsavelId: idOpcional,
  observacoes: textoOpcional(1000),
});

const esquemaStatus = z.object({
  status: z.enum(["confirmado", "realizado", "nao_compareceu", "cancelado"]),
  nota: textoOpcional(1000),
});

function conferirFuturo(quando: Date) {
  if (Number.isNaN(quando.getTime())) throw new ErroRegra("Data inválida.");
  if (quando.getTime() < Date.now() - 60_000) throw new ErroRegra("Escolha uma data e hora no futuro.");
}

/* Um agendamento por vez: dois vendedores marcando o mesmo horário ao
   mesmo tempo não passam os dois pela conferência de conflito. */
const travarAgenda = (tx: Tx) => tx.execute(sql`select pg_advisory_xact_lock(hashtext('test_drives'))`);

/** Lança ErroRegra se o veículo já tem test drive que se cruza com o horário. */
async function conferirConflito(
  tx: Tx,
  d: { agendadoPara: Date; veiculoId: number | null; modeloId: number | null; ignorarId?: number },
) {
  const t = schema.testDrives;
  let alvo: SQL | undefined;
  /* veículo do estoque: é aquela unidade; só o modelo: é a moto de demonstração daquele modelo */
  if (d.veiculoId) alvo = eq(t.veiculoId, d.veiculoId);
  else if (d.modeloId) alvo = and(eq(t.modeloId, d.modeloId), isNull(t.veiculoId));
  if (!alvo) return; // só texto livre: não há como saber se é o mesmo veículo
  const janela = DURACAO_TEST_DRIVE_MIN * 60_000;
  const [c] = await tx
    .select({ agendadoPara: t.agendadoPara, veiculo: t.veiculoDescricao, cliente: sql<string | null>`coalesce(${schema.clientes.nome}, ${t.nomeContato})` })
    .from(t)
    .leftJoin(schema.clientes, eq(schema.clientes.id, t.clienteId))
    .where(
      and(
        alvo,
        inArray(t.status, STATUS_ABERTOS),
        gt(t.agendadoPara, new Date(d.agendadoPara.getTime() - janela)),
        lt(t.agendadoPara, new Date(d.agendadoPara.getTime() + janela)),
        d.ignorarId ? ne(t.id, d.ignorarId) : undefined,
      ),
    )
    .orderBy(asc(t.agendadoPara))
    .limit(1);
  if (c)
    throw new ErroRegra(
      `${c.veiculo ?? "Este veículo"} já tem test drive marcado em ${data(c.agendadoPara)} às ${hora(c.agendadoPara)}${c.cliente ? ` (${c.cliente})` : ""}. Cada test drive ocupa ${DURACAO_TEST_DRIVE_MIN} minutos: escolha outro horário ou outro veículo.`,
    );
}

async function buscar(tx: Tx | typeof db, testDriveId: number) {
  const [x] = await tx
    .select({ td: schema.testDrives, cliente: schema.clientes.nome })
    .from(schema.testDrives)
    .leftJoin(schema.clientes, eq(schema.clientes.id, schema.testDrives.clienteId))
    .where(eq(schema.testDrives.id, testDriveId))
    .limit(1);
  if (!x) throw new ErroRegra("Test drive não encontrado.");
  return { ...x.td, nomeCliente: x.cliente ?? x.td.nomeContato ?? (x.td.telefone ? formatarTelefone(x.td.telefone) : "cliente") };
}

/* Anota no chat e na linha do tempo do negócio, quando o test drive tem os dois. */
async function anotar(tx: Tx, td: { conversaId: number | null; negocioId: number | null }, u: Quem, texto: string) {
  if (td.conversaId) {
    await mensagemSistema(tx, td.conversaId, `${texto} (por ${u.nome})`);
    await tx.update(schema.conversas).set({ atualizadoEm: new Date() }).where(eq(schema.conversas.id, td.conversaId));
  }
  if (td.negocioId) await tx.insert(schema.negocioEventos).values({ negocioId: td.negocioId, tipo: "test_drive", descricao: texto, usuarioId: u.id });
}

export async function criarTestDrive(u: Quem, entrada: unknown) {
  const d = esquemaTestDrive.parse(entrada);
  conferirFuturo(d.agendadoPara);

  /* quem é o cliente: a conversa manda; sem conversa, o cadastro; sem os dois, nome e telefone */
  let clienteId = d.clienteId;
  let negocioId = d.negocioId;
  let nomeContato = d.nomeContato;
  let telefone = d.telefone ? telefoneWhatsapp(d.telefone) : null;
  let responsavelId = d.responsavelId;
  if (d.conversaId) {
    const [c] = await db.select().from(schema.conversas).where(eq(schema.conversas.id, d.conversaId)).limit(1);
    if (!c) throw new ErroRegra("Conversa não encontrada.");
    clienteId ??= c.clienteId;
    negocioId ??= c.negocioId;
    nomeContato ??= c.contatoNome;
    telefone ??= c.contatoTelefone;
    responsavelId ??= c.responsavelId;
  }
  if (clienteId) {
    const [cli] = await db.select({ nome: schema.clientes.nome, whatsapp: schema.clientes.whatsapp, telefone: schema.clientes.telefone }).from(schema.clientes).where(eq(schema.clientes.id, clienteId)).limit(1);
    if (!cli) throw new ErroRegra("Cliente não encontrado.");
    nomeContato ??= cli.nome;
    telefone ??= cli.whatsapp || cli.telefone ? telefoneWhatsapp(cli.whatsapp ?? cli.telefone) : null;
    if (!negocioId) {
      const [n] = await db
        .select({ id: schema.negocios.id })
        .from(schema.negocios)
        .where(and(eq(schema.negocios.clienteId, clienteId), inArray(schema.negocios.etapa, ETAPAS_ABERTAS)))
        .orderBy(desc(schema.negocios.criadoEm))
        .limit(1);
      negocioId = n?.id ?? null;
    }
  }
  if (!clienteId && !d.conversaId && (!nomeContato || soDigitos(telefone).length < 10))
    throw new ErroRegra("Informe o cliente, ou o nome e o telefone de quem vai fazer o test drive.");

  /* qual veículo */
  let modeloId = d.modeloId;
  let descricao = d.veiculoDescricao;
  if (d.veiculoId) {
    const [v] = await db.select().from(schema.veiculos).where(eq(schema.veiculos.id, d.veiculoId)).limit(1);
    if (!v) throw new ErroRegra("Veículo não encontrado no estoque.");
    if (v.status === "vendido" || v.status === "inativo") throw new ErroRegra("Este veículo não está mais à venda. Escolha outro.");
    modeloId ??= v.modeloId;
    descricao ??= [v.marca, v.modelo, v.cor, v.anoModelo].filter(Boolean).join(" ");
  } else if (modeloId) {
    const [m] = await db.select({ marca: schema.modelos.marca, nome: schema.modelos.nome }).from(schema.modelos).where(eq(schema.modelos.id, modeloId)).limit(1);
    if (!m) throw new ErroRegra("Modelo não encontrado.");
    descricao ??= [m.marca, m.nome].filter(Boolean).join(" ");
  }
  if (!descricao) throw new ErroRegra("Escolha o veículo ou modelo do test drive.");

  return db.transaction(async (tx) => {
    await travarAgenda(tx);
    await conferirConflito(tx, { agendadoPara: d.agendadoPara, veiculoId: d.veiculoId, modeloId });
    const [td] = await tx
      .insert(schema.testDrives)
      .values({
        clienteId,
        nomeContato,
        telefone,
        conversaId: d.conversaId,
        negocioId,
        modeloId,
        veiculoId: d.veiculoId,
        veiculoDescricao: descricao,
        agendadoPara: d.agendadoPara,
        responsavelId: responsavelId ?? u.id,
        observacoes: d.observacoes,
        criadoPor: u.id,
      })
      .returning({ id: schema.testDrives.id });
    await anotar(tx, { conversaId: d.conversaId, negocioId }, u, `Test drive agendado: ${descricao}, ${dataHora(d.agendadoPara)}`);
    await registrarLog(
      u,
      {
        acao: "testdrive.criado",
        entidade: "test_drive",
        entidadeId: td.id,
        descricao: `Agendou test drive de ${nomeContato ?? formatarTelefone(telefone)} (${descricao}) para ${dataHora(d.agendadoPara)}`,
        dados: { conversaId: d.conversaId, clienteId, negocioId, modeloId, veiculoId: d.veiculoId },
      },
      tx,
    );
    return { id: td.id, conversaId: d.conversaId, quando: d.agendadoPara };
  });
}

export async function reagendarTestDrive(u: Quem, testDriveId: number, quando: Date) {
  conferirFuturo(quando);
  return db.transaction(async (tx) => {
    await travarAgenda(tx);
    const td = await buscar(tx, testDriveId);
    if (!STATUS_ABERTOS.includes(td.status as StatusTestDrive)) throw new ErroRegra(`Este test drive já está como "${STATUS_TEST_DRIVE[td.status as StatusTestDrive] ?? td.status}".`);
    await conferirConflito(tx, { agendadoPara: quando, veiculoId: td.veiculoId, modeloId: td.modeloId, ignorarId: td.id });
    /* horário novo precisa de confirmação nova */
    await tx.update(schema.testDrives).set({ agendadoPara: quando, status: "agendado", atualizadoEm: new Date() }).where(eq(schema.testDrives.id, td.id));
    await anotar(tx, td, u, `Test drive remarcado de ${dataHora(td.agendadoPara)} para ${dataHora(quando)}`);
    await registrarLog(
      u,
      { acao: "testdrive.remarcado", entidade: "test_drive", entidadeId: td.id, descricao: `Remarcou o test drive de ${td.nomeCliente} de ${dataHora(td.agendadoPara)} para ${dataHora(quando)}`, dados: { de: td.agendadoPara, para: quando } },
      tx,
    );
    return { id: td.id, conversaId: td.conversaId, quando };
  });
}

export async function mudarStatusTestDrive(u: Quem, testDriveId: number, entrada: unknown) {
  const d = esquemaStatus.parse(entrada);
  return db.transaction(async (tx) => {
    const td = await buscar(tx, testDriveId);
    if (!STATUS_ABERTOS.includes(td.status as StatusTestDrive)) throw new ErroRegra(`Este test drive já está como "${STATUS_TEST_DRIVE[td.status as StatusTestDrive] ?? td.status}".`);
    if (d.status === "confirmado" && td.status === "confirmado") throw new ErroRegra("Este test drive já está confirmado.");
    if ((d.status === "realizado" || d.status === "nao_compareceu") && (!d.nota || d.nota.length < 3))
      throw new ErroRegra(d.status === "realizado" ? "Conte como foi o test drive (o que o cliente achou, próximo passo)." : "Anote o que aconteceu (tentou contato? vai remarcar?).");
    if (d.status === "nao_compareceu" && td.agendadoPara.getTime() > Date.now()) throw new ErroRegra("O horário ainda não chegou. Para desmarcar antes, use Cancelar.");
    const encerra = d.status !== "confirmado";
    await tx
      .update(schema.testDrives)
      .set({
        status: d.status,
        ...(encerra ? { resultado: d.nota, encerradoEm: new Date(), encerradoPor: u.id } : {}),
        atualizadoEm: new Date(),
      })
      .where(eq(schema.testDrives.id, td.id));
    const rotulo = STATUS_TEST_DRIVE[d.status];
    await anotar(tx, td, u, `Test drive de ${dataHora(td.agendadoPara)}: ${rotulo.toLowerCase()}${d.nota ? `. ${d.nota}` : ""}`);
    await registrarLog(
      u,
      { acao: `testdrive.${d.status}`, entidade: "test_drive", entidadeId: td.id, descricao: `Marcou o test drive de ${td.nomeCliente} (${dataHora(td.agendadoPara)}) como "${rotulo}"`, dados: d.nota ? { nota: d.nota } : undefined },
      tx,
    );
  });
}

/* ---------------- leitura ---------------- */
export async function listarTestDrives(f: {
  de?: Date | null;
  ate?: Date | null;
  status?: StatusTestDrive[];
  conversaId?: number;
  clienteId?: number;
  ordem?: "asc" | "desc";
  limite?: number;
}) {
  const t = schema.testDrives;
  const resp = alias(schema.usuarios, "resp_td");
  return db
    .select({
      id: t.id,
      agendadoPara: t.agendadoPara,
      status: t.status,
      veiculo: t.veiculoDescricao,
      modeloId: t.modeloId,
      veiculoId: t.veiculoId,
      observacoes: t.observacoes,
      resultado: t.resultado,
      encerradoEm: t.encerradoEm,
      conversaId: t.conversaId,
      clienteId: t.clienteId,
      negocioId: t.negocioId,
      cliente: sql<string | null>`coalesce(${schema.clientes.nome}, ${t.nomeContato})`,
      telefone: sql<string | null>`coalesce(${t.telefone}, ${schema.clientes.whatsapp}, ${schema.clientes.telefone})`,
      responsavel: resp.nome,
    })
    .from(t)
    .leftJoin(schema.clientes, eq(schema.clientes.id, t.clienteId))
    .leftJoin(resp, eq(resp.id, t.responsavelId))
    .where(
      and(
        f.de ? gte(t.agendadoPara, f.de) : undefined,
        f.ate ? lt(t.agendadoPara, f.ate) : undefined,
        f.status?.length ? inArray(t.status, f.status) : undefined,
        f.conversaId ? eq(t.conversaId, f.conversaId) : undefined,
        f.clienteId ? eq(t.clienteId, f.clienteId) : undefined,
      ),
    )
    .orderBy(f.ordem === "desc" ? desc(t.agendadoPara) : asc(t.agendadoPara))
    .limit(f.limite ?? 300);
}
export type ItemTestDrive = Awaited<ReturnType<typeof listarTestDrives>>[number];

/** O que o formulário de agendamento oferece: modelos do catálogo e veículos à venda. */
export async function opcoesTestDrive() {
  const [modelos, veiculos] = await Promise.all([
    db.select({ id: schema.modelos.id, nome: schema.modelos.nome, marca: schema.modelos.marca, tipo: schema.modelos.tipo }).from(schema.modelos).where(eq(schema.modelos.ativo, true)).orderBy(asc(schema.modelos.nome)),
    db
      .select({
        id: schema.veiculos.id,
        descricao: sql<string>`concat_ws(' ', ${schema.veiculos.marca}, ${schema.veiculos.modelo}, ${schema.veiculos.cor}, ${schema.veiculos.anoModelo})`,
        placa: schema.veiculos.placa,
        tipo: schema.veiculos.tipo,
        modeloId: schema.veiculos.modeloId,
      })
      .from(schema.veiculos)
      .where(inArray(schema.veiculos.status, ["disponivel", "reservado"]))
      .orderBy(asc(schema.veiculos.modelo))
      .limit(500),
  ]);
  return { modelos, veiculos };
}
export type OpcoesTestDrive = Awaited<ReturnType<typeof opcoesTestDrive>>;
