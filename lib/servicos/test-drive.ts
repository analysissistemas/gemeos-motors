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
import { DURACAO_TEST_DRIVE_MIN, paraCampoLocal, STATUS_ABERTOS, STATUS_TEST_DRIVE, type StatusTestDrive } from "@/lib/test-drive";
import { planoRetirada, textoLembreteVisita } from "@/lib/ia/retirada";
import { MODELO_CONFIRMAR_VISITA, MODELO_LEMBRETE_VISITA, textoDoDia, valoresConfirmar, valoresLembrete } from "@/lib/ia/contato-do-dia";

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
  tipo: z.enum(["test_drive", "visita", "compra"]).optional(),
  /** false: só o dia ("sexta vou aí"); a hora fica a combinar e o veículo não é reservado */
  horaDefinida: z.boolean().optional(),
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
async function anotar(tx: Tx, td: { conversaId: number | null; negocioId: number | null }, u: Quem | null, texto: string) {
  if (td.conversaId) {
    await mensagemSistema(tx, td.conversaId, `${texto} (${u ? `por ${u.nome}` : "pela IA"})`);
    await tx.update(schema.conversas).set({ atualizadoEm: new Date() }).where(eq(schema.conversas.id, td.conversaId));
  }
  if (td.negocioId) await tx.insert(schema.negocioEventos).values({ negocioId: td.negocioId, tipo: "test_drive", descricao: texto, usuarioId: u?.id ?? null });
}

/** `u` null = agendado pela IA no WhatsApp (pedido do dono, 03/10/2026), com a mesma regra de conflito da equipe. */
export async function criarTestDrive(u: Quem | null, entrada: unknown) {
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

  const tipo = d.tipo ?? "test_drive";
  const horaDefinida = d.horaDefinida ?? true;
  const rotulo = { test_drive: "Test drive agendado", visita: "Visita anotada", compra: "Compra prevista anotada" }[tipo];
  const quandoTexto = horaDefinida ? dataHora(d.agendadoPara) : `${data(d.agendadoPara)} (horário a combinar)`;
  const criado = await db.transaction(async (tx) => {
    await travarAgenda(tx);
    /* sem hora não ocupa o veículo: a equipe combina o horário */
    if (horaDefinida) await conferirConflito(tx, { agendadoPara: d.agendadoPara, veiculoId: d.veiculoId, modeloId });
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
        responsavelId: responsavelId ?? u?.id ?? null,
        observacoes: d.observacoes,
        criadoPor: u?.id ?? null,
        tipo,
        horaDefinida,
      })
      .returning({ id: schema.testDrives.id });
    await anotar(tx, { conversaId: d.conversaId, negocioId }, u, `${rotulo}: ${descricao}, ${quandoTexto}`);
    await registrarLog(
      u,
      {
        acao: "testdrive.criado",
        entidade: "test_drive",
        entidadeId: td.id,
        descricao: `${rotulo} de ${nomeContato ?? formatarTelefone(telefone)} (${descricao}) para ${quandoTexto}`,
        dados: { conversaId: d.conversaId, clienteId, negocioId, modeloId, veiculoId: d.veiculoId, tipo, horaDefinida },
      },
      tx,
    );
    return { id: td.id, conversaId: d.conversaId, quando: d.agendadoPara };
  });
  await agendarLembreteTestDrive(criado.id).catch((e) => console.error("[lembrete test drive]", e));
  /* marcado pela IA: aviso no celular do Milton (o que a equipe marca, ela já sabe) */
  if (!u && horaDefinida) void import("@/lib/avisos/gatilhos").then((g) => g.avisarVisitaMarcada({ conversaId: d.conversaId ?? null, nome: nomeContato ?? null, descricao, quando: d.agendadoPara })).catch(() => null);
  return criado;
}

/* Lembrete do test drive / visita no dia (dono, 15/10/2026: "lembrete de visita e test drive"): 2 h antes, nunca
   antes das 8 h. Vale para o que a IA marca e para o que a equipe marca. Remarcou: o lembrete acompanha; cancelou: o envio
   confere e não sai. Desde 20/10/2026 (dono: "disparar automaticamente") sai também fora da janela de 24 h do WhatsApp,
   pelo modelo aprovado da Meta (lib/ia/contato-do-dia.ts); sem modelo aprovado, vira tarefa da equipe na hora. */
export async function agendarLembreteTestDrive(testDriveId: number) {
  const F = schema.followUps;
  const [td] = await db.select().from(schema.testDrives).where(eq(schema.testDrives.id, testDriveId)).limit(1);
  if (!td) return null;
  await db
    .update(F)
    .set({ status: "cancelado", concluidoEm: new Date() })
    .where(and(eq(F.status, "pendente"), eq(F.tipo, "lembrete_visita"), sql`(${F.contexto}->>'testDriveId')::int = ${td.id}`));
  if (!td.conversaId || !STATUS_ABERTOS.includes(td.status as StatusTestDrive)) return null;
  /* marcou de verdade: o contato do "talvez", o "Cliente combinou de voltar" das regras (intencoes.ts) e a tarefa do dia
     que esta agenda já tinha saem; a agenda cuida dele daqui para a frente (sem tarefa em dobro) */
  await db
    .update(F)
    .set({ status: "cancelado", concluidoEm: new Date() })
    .where(and(eq(F.conversaId, td.conversaId), eq(F.status, "pendente"), sql`((${F.tipo} = 'lembrete_visita' and ${F.contexto}->>'talvez' = 'true') or (${F.tipo} = 'retorno_cliente' and (${F.contexto}->>'detectadoPor' = 'regras' or (${F.contexto}->>'agendaId')::int = ${td.id})))`));
  const [cli] = td.clienteId ? await db.select({ nome: schema.clientes.nome }).from(schema.clientes).where(eq(schema.clientes.id, td.clienteId)).limit(1) : [];
  const primeiro = (cli?.nome ?? td.nomeContato ?? "").trim().split(/\s+/)[0] || null;
  const nome = primeiro && /\p{L}{2}/u.test(primeiro) ? primeiro : null;
  const agora = new Date();
  /* só o dia (visita avisada, compra prevista): no dia a equipe recebe a tarefa de confirmar com o cliente. Na visita, às
     8h a IA já pergunta o horário ao cliente, e a tarefa da equipe fica para as 10h (se ele não respondeu) */
  if (!td.horaDefinida) {
    const diaLocal = paraCampoLocal(td.agendadoPara).slice(0, 10);
    const oito = new Date(`${diaLocal}T08:00:00-03:00`);
    const dez = new Date(`${diaLocal}T10:00:00-03:00`);
    const iaChama = td.tipo !== "compra" && oito.getTime() > agora.getTime() + 60 * 60_000;
    if (iaChama) {
      const modelo = /^visita/iu.test(td.veiculoDescricao ?? "") ? null : td.veiculoDescricao;
      await db.insert(F).values({
        conversaId: td.conversaId,
        clienteId: td.clienteId,
        negocioId: td.negocioId,
        usuarioId: td.responsavelId,
        agendadoPara: oito,
        tipo: "lembrete_visita",
        motivo: "Perguntar o horário da visita",
        origem: "ia",
        notas: "A IA pergunta ao cliente o horário da visita de hoje. Cancele se não quiser que saia.",
        contexto: { texto: textoDoDia({ nome, modelo, periodo: null }), testDriveId: td.id, quando: td.agendadoPara.toISOString(), doQue: "da visita", modelo: { nome: MODELO_CONFIRMAR_VISITA.nome, valores: valoresConfirmar({ nome, modelo }) } },
      });
    }
    const oQue = td.tipo === "compra" ? `disse que fecha a compra (${td.veiculoDescricao ?? "moto"}) hoje` : `disse que vem à loja hoje (${td.veiculoDescricao ?? "visita"})`;
    const quandoTarefa = iaChama ? dez : oito;
    await db.insert(F).values({
      conversaId: td.conversaId,
      clienteId: td.clienteId,
      negocioId: td.negocioId,
      usuarioId: td.responsavelId,
      agendadoPara: quandoTarefa.getTime() > agora.getTime() ? quandoTarefa : agora,
      tipo: "retorno_cliente",
      motivo: td.tipo === "compra" ? "Compra prevista para hoje" : "Visita avisada para hoje",
      origem: "ia",
      notas: `${td.nomeContato ?? "O cliente"} ${oQue}. ${iaChama ? "A IA perguntou o horário a ele às 8h; se ele ainda não respondeu, chame você." : "Chame ele para combinar o horário."}`,
      contexto: { agendaId: td.id, detectadoPor: "ia" },
    });
    return null;
  }
  /* janela de 24 h: o envio decide (texto dentro, modelo fora); aqui só a hora do lembrete */
  const lembreteEm = planoRetirada(td.agendadoPara, agora, td.agendadoPara).lembreteEm;
  if (!lembreteEm) return null;
  const texto = textoLembreteVisita({ nome, descricao: td.veiculoDescricao, quando: td.agendadoPara });
  await db.insert(F).values({
    conversaId: td.conversaId,
    clienteId: td.clienteId,
    negocioId: td.negocioId,
    usuarioId: td.responsavelId,
    agendadoPara: lembreteEm,
    tipo: "lembrete_visita",
    motivo: "Lembrete do test drive",
    origem: "ia",
    notas: `Lembrete automático do test drive de ${dataHora(td.agendadoPara)}. Cancele se não quiser que saia.`,
    contexto: { texto, testDriveId: td.id, quando: td.agendadoPara.toISOString(), modelo: { nome: MODELO_LEMBRETE_VISITA.nome, valores: valoresLembrete({ nome, descricao: td.veiculoDescricao, hora: hora(td.agendadoPara).replace(/:00$/, "h").replace(":", "h") }) } },
  });
  return lembreteEm;
}

export async function reagendarTestDrive(u: Quem | null, testDriveId: number, quando: Date, o: { horaDefinida?: boolean } = {}) {
  conferirFuturo(quando);
  return db.transaction(async (tx) => {
    await travarAgenda(tx);
    const td = await buscar(tx, testDriveId);
    if (!STATUS_ABERTOS.includes(td.status as StatusTestDrive)) throw new ErroRegra(`Este test drive já está como "${STATUS_TEST_DRIVE[td.status as StatusTestDrive] ?? td.status}".`);
    const horaDefinida = o.horaDefinida ?? true;
    if (horaDefinida) await conferirConflito(tx, { agendadoPara: quando, veiculoId: td.veiculoId, modeloId: td.modeloId, ignorarId: td.id });
    /* horário novo precisa de confirmação nova */
    await tx.update(schema.testDrives).set({ agendadoPara: quando, horaDefinida, status: "agendado", atualizadoEm: new Date() }).where(eq(schema.testDrives.id, td.id));
    /* anotado só com o dia: "de 23/10 às 12:00" não existia (Simulador, 19/10/2026) */
    const de = td.horaDefinida ? dataHora(td.agendadoPara) : data(td.agendadoPara);
    const para = horaDefinida ? dataHora(quando) : `${data(quando)} (horário a combinar)`;
    const nome = { test_drive: "Test drive", visita: "Visita", compra: "Compra prevista" }[td.tipo as "test_drive" | "visita" | "compra"] ?? "Test drive";
    await anotar(tx, td, u, !td.horaDefinida && horaDefinida && data(td.agendadoPara) === data(quando) ? `${nome} com horário definido: ${dataHora(quando)}` : `${nome} ${td.tipo === "test_drive" ? "remarcado" : "remarcada"} de ${de} para ${para}`);
    await registrarLog(
      u,
      { acao: "testdrive.remarcado", entidade: "test_drive", entidadeId: td.id, descricao: `Remarcou ${td.tipo === "test_drive" ? "o test drive" : td.tipo === "compra" ? "a compra prevista" : "a visita"} de ${td.nomeCliente} de ${de} para ${para}`, dados: { de: td.agendadoPara, para: quando } },
      tx,
    );
    return { id: td.id, conversaId: td.conversaId, quando };
  }).then(async (r) => {
    await agendarLembreteTestDrive(r.id).catch((e) => console.error("[lembrete test drive]", e));
    return r;
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
      tipo: t.tipo,
      horaDefinida: t.horaDefinida,
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
    db.select({ id: schema.modelos.id, nome: schema.modelos.nome, marca: schema.modelos.marca, tipo: schema.modelos.tipo }).from(schema.modelos).where(and(eq(schema.modelos.ativo, true), ne(schema.modelos.tipo, "acessorio"))).orderBy(asc(schema.modelos.nome)),
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
