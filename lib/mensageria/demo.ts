import "server-only";
import { and, eq, inArray, notExists, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { registrarLog } from "@/lib/logs";

/* ============================================================
   ⚠️  DADOS MOCK — SÓ PARA DEMONSTRAÇÃO DO ATENDIMENTO SIMULADO  ⚠️
   ------------------------------------------------------------
   Tudo que sai daqui nasce com demo=true: aparece com o selo
   "Simulado", NÃO entra nas métricas do painel e sai inteiro no
   botão "Limpar dados de demonstração" (Configurações).
   Nomes, telefones e conversas são inventados.
   ============================================================ */

type Quem = { id: number; nome: string };
const min = (n: number) => new Date(Date.now() - n * 60_000);

type Cena = {
  contato: string;
  telefone: string;
  cliente?: { nome: string; cpf?: string; email?: string; cidade?: string };
  negocio?: { etapa: string; veiculoInteresse: string; valorAnunciado?: number; valorProposta?: number; temTroca?: boolean; trocaDescricao?: string; perdaMotivo?: string; perdaObservacoes?: string };
  status: string;
  modo: "ia" | "humano";
  naoLidas: number;
  triagem?: Record<string, unknown>;
  nota?: string;
  followUpEmHoras?: number;
  mensagens: { a: "cliente" | "usuario" | "ia" | "sistema"; t: string; m: number; tipo?: string; midia?: { url: string; nome?: string; mime?: string } }[];
};

const CENAS: Cena[] = [
  {
    contato: "Carlos Henrique",
    telefone: "5581981110001",
    cliente: { nome: "Carlos Henrique Barbosa", email: "carlos.demo@exemplo.com", cidade: "Goiana" },
    negocio: { etapa: "negociando", veiculoInteresse: "Toyota Corolla XEi 2024", valorAnunciado: 145000, temTroca: true, trocaDescricao: "Chevrolet Onix 2022" },
    status: "em_atendimento",
    modo: "humano",
    naoLidas: 2,
    nota: "Cliente demonstrou interesse, mas precisa consultar o financiamento.",
    followUpEmHoras: 26,
    mensagens: [
      { a: "cliente", t: "Boa tarde, ainda está disponível o Corolla?", m: 190 },
      { a: "ia", t: "Boa tarde! Sou o assistente virtual da Gêmeos Motors. Já chamei um consultor para confirmar para você.", m: 189 },
      { a: "sistema", t: "Atendimento humano iniciado por {consultor}", m: 184 },
      { a: "usuario", t: "Boa tarde! Sim, está disponível.", m: 183 },
      { a: "cliente", t: "Faz troca?", m: 180 },
      { a: "usuario", t: "Fazemos sim. Qual veículo você pretende deixar na troca?", m: 178 },
      { a: "cliente", t: "Tenho um Onix 2022.", m: 170 },
      { a: "usuario", t: "Ótimo. Pode me mandar fotos do Onix e a quilometragem? Assim já adianto a avaliação.", m: 168 },
      { a: "cliente", t: "Mando sim, tá com 38 mil km.", m: 12 },
      { a: "cliente", t: "Consigo fazer a troca do meu veículo e financiar o restante?", m: 11 },
    ],
  },
  {
    contato: "Maria Eduarda",
    telefone: "5581982220002",
    status: "nova",
    modo: "ia",
    naoLidas: 1,
    triagem: {
      resumo: "Interessada na TANK AG11 vista no Instagram; quer saber se precisa de CNH.",
      interesse: "Moto elétrica",
      veiculo: "TANK AG11",
      temTroca: false,
      trocaDescricao: null,
      intencaoCompra: "media",
      dadosColetados: ["Viu o anúncio no Instagram", "Não tem veículo para troca"],
      faltaPerguntar: ["Forma de pagamento", "Quando pretende comprar"],
      prontoParaHumano: true,
    },
    mensagens: [
      { a: "cliente", t: "Oi! Vi a TANK AG11 no Instagram. Precisa de CNH?", m: 25 },
      { a: "ia", t: "Olá! Obrigado pelo contato. Você tem algum veículo para dar na troca?", m: 24 },
      { a: "cliente", t: "Não tenho não", m: 20 },
      { a: "ia", t: "Perfeito! Um consultor vai continuar o seu atendimento e tirar todas as dúvidas.", m: 19 },
      { a: "sistema", t: "Triagem da IA concluída: interessada na TANK AG11 vista no Instagram; quer saber se precisa de CNH — aguardando consultor.", m: 19 },
      { a: "cliente", t: "Tá bom, aguardo", m: 4 },
    ],
  },
  {
    contato: "João Pedro",
    telefone: "5581983330003",
    cliente: { nome: "João Pedro Alves", cidade: "Goiana" },
    negocio: { etapa: "proposta", veiculoInteresse: "T1 branca", valorAnunciado: 12000, valorProposta: 11500 },
    status: "aguardando_cliente",
    modo: "humano",
    naoLidas: 0,
    mensagens: [
      { a: "cliente", t: "Qual o valor da T1 à vista?", m: 60 * 26 },
      { a: "sistema", t: "Atendimento humano iniciado por {consultor}", m: 60 * 26 - 5 },
      { a: "usuario", t: "Olá, João! A T1 sai por R$ 12.000. No Pix consigo fazer R$ 11.500 para você.", m: 60 * 26 - 6 },
      { a: "usuario", t: "Segue a foto dela aqui na loja.", m: 60 * 26 - 7, tipo: "imagem", midia: { url: "/fotos/motos/t1.webp", nome: "t1.webp", mime: "image/webp" } },
      { a: "cliente", t: "Vou ver com minha esposa e te falo", m: 60 * 25 },
      { a: "usuario", t: "Combinado! Qualquer dúvida é só chamar.", m: 60 * 25 - 2 },
    ],
  },
  {
    contato: "Roberto Lima",
    telefone: "5581984440004",
    cliente: { nome: "Roberto Lima" },
    negocio: { etapa: "perdida", veiculoInteresse: "AG08", valorAnunciado: 8990, valorProposta: 8700, perdaMotivo: "concorrencia", perdaObservacoes: "Cliente disse que achou a mesma moto mais barata em Recife e fechou lá." },
    status: "resolvida",
    modo: "humano",
    naoLidas: 0,
    mensagens: [
      { a: "cliente", t: "Vocês fazem a AG08 por quanto?", m: 60 * 72 },
      { a: "usuario", t: "Boa tarde, Roberto! A AG08 está R$ 8.990. Consigo R$ 8.700 no Pix.", m: 60 * 72 - 10 },
      { a: "cliente", t: "Achei por 8.200 em Recife", m: 60 * 50 },
      { a: "usuario", t: "Entendo. Aqui você tem assistência própria e garantia por escrito. Consigo chegar em R$ 8.500.", m: 60 * 50 - 15 },
      { a: "cliente", t: "Vou fechar lá mesmo, obrigado", m: 60 * 30 },
    ],
  },
  {
    contato: "Fernanda Costa",
    telefone: "5581985550005",
    cliente: { nome: "Fernanda Costa" },
    status: "em_atendimento",
    modo: "humano",
    naoLidas: 1,
    nota: "Pedir para trazer o carregador junto para teste na bancada.",
    mensagens: [
      { a: "cliente", t: "Bom dia! Minha DF17 não está carregando desde ontem", m: 95 },
      { a: "sistema", t: "Atendimento humano iniciado por {consultor}", m: 93 },
      { a: "usuario", t: "Bom dia, Fernanda! A luz do carregador acende quando você liga na tomada?", m: 92 },
      { a: "cliente", t: "Acende vermelha e não muda", m: 80 },
      { a: "cliente", t: "Áudio explicando", m: 79, tipo: "audio" },
      { a: "cliente", t: "Nota fiscal da compra", m: 78, tipo: "documento", midia: { url: "data:text/plain;base64,RG9jdW1lbnRvIHNpbXVsYWRv", nome: "nota-fiscal-simulada.pdf", mime: "application/pdf" } },
    ],
  },
];

export async function carregarDemonstracao(u: Quem) {
  const [ja] = await db.select({ id: schema.conversas.id }).from(schema.conversas).where(eq(schema.conversas.demo, true)).limit(1);
  if (ja) return { criadas: 0, mensagem: "As conversas de demonstração já estão carregadas." };

  await db.transaction(async (tx) => {
    for (const c of CENAS) {
      let clienteId: number | null = null;
      if (c.cliente) {
        const [cli] = await tx
          .insert(schema.clientes)
          .values({ nome: c.cliente.nome, whatsapp: c.telefone.slice(2), email: c.cliente.email, cidade: c.cliente.cidade, estado: "PE", origem: "whatsapp", responsavelId: u.id, demo: true, criadoPor: u.id, criadoEm: min(c.mensagens[0].m + 5) })
          .returning({ id: schema.clientes.id });
        clienteId = cli.id;
      }
      let negocioId: number | null = null;
      if (clienteId && c.negocio) {
        const perdida = c.negocio.etapa === "perdida";
        const [n] = await tx
          .insert(schema.negocios)
          .values({
            clienteId,
            etapa: c.negocio.etapa,
            veiculoInteresse: c.negocio.veiculoInteresse,
            valorAnunciado: c.negocio.valorAnunciado,
            valorProposta: c.negocio.valorProposta,
            temTroca: !!c.negocio.temTroca,
            trocaDescricao: c.negocio.trocaDescricao,
            origem: "whatsapp",
            responsavelId: u.id,
            atendimentoHumanoId: u.id,
            etapaDesde: min(perdida ? 60 * 30 : c.mensagens[1]?.m ?? 60),
            ultimaInteracaoEm: min(c.mensagens[c.mensagens.length - 1].m),
            perdaMotivo: c.negocio.perdaMotivo,
            perdaObservacoes: c.negocio.perdaObservacoes,
            perdidoEm: perdida ? min(60 * 30) : null,
            demo: true,
            criadoPor: u.id,
            criadoEm: min(c.mensagens[0].m),
          })
          .returning({ id: schema.negocios.id });
        negocioId = n.id;
        await tx.insert(schema.negocioEventos).values([
          { negocioId, tipo: "criado", descricao: "Negócio criado a partir do WhatsApp (demonstração)", criadoEm: min(c.mensagens[0].m) },
          ...(c.negocio.valorProposta ? [{ negocioId, tipo: "proposta", descricao: `Proposta registrada: R$ ${c.negocio.valorProposta.toLocaleString("pt-BR")}`, usuarioId: u.id, criadoEm: min(c.mensagens[2]?.m ?? 30) }] : []),
          ...(perdida ? [{ negocioId, tipo: "perdida", descricao: "Venda perdida — motivo: Comprou na concorrência", usuarioId: u.id, criadoEm: min(60 * 30) }] : []),
        ]);
      }
      const ultima = c.mensagens[c.mensagens.length - 1];
      const [conv] = await tx
        .insert(schema.conversas)
        .values({
          canal: "whatsapp",
          provedor: "mock",
          contatoTelefone: c.telefone,
          contatoNome: c.contato,
          clienteId,
          negocioId,
          responsavelId: c.modo === "humano" ? u.id : null,
          status: c.status,
          modo: c.modo,
          triagemIa: c.triagem as never,
          triagemEm: c.triagem ? min(19) : null,
          prioridade: c.triagem ? "normal" : "normal",
          atendimentoHumanoPor: c.modo === "humano" ? u.id : null,
          atendimentoHumanoEm: c.modo === "humano" ? min(c.mensagens[0].m - 5) : null,
          ultimaMensagemEm: min(ultima.m),
          ultimaMensagemTexto: ultima.tipo === "audio" ? "Áudio" : ultima.tipo === "documento" ? `Documento: ${ultima.midia?.nome}` : ultima.t,
          ultimaMensagemDirecao: ultima.a === "cliente" ? "incoming" : "outgoing",
          naoLidas: c.naoLidas,
          demo: true,
          criadoEm: min(c.mensagens[0].m),
        })
        .returning({ id: schema.conversas.id });
      const qtd = c.mensagens.length;
      await tx.insert(schema.mensagens).values(
        c.mensagens.map((m, i) => {
          const entrada = m.a === "cliente";
          const sistema = m.a === "sistema";
          return {
            conversaId: conv.id,
            direcao: sistema ? "system" : entrada ? "incoming" : "outgoing",
            autor: m.a,
            usuarioId: m.a === "usuario" ? u.id : null,
            tipo: sistema ? "sistema" : (m.tipo ?? "texto"),
            conteudo: sistema ? m.t.replace("{consultor}", u.nome) : m.tipo === "audio" ? null : m.t,
            midiaUrl: m.midia?.url ?? null,
            midiaNome: m.midia?.nome ?? null,
            midiaMime: m.midia?.mime ?? null,
            status: entrada ? "received" : sistema ? "sent" : "read",
            externoId: sistema ? null : `mock-demo-${conv.id}-${i}`,
            metadados: m.tipo === "audio" ? { duracao: 23, simulado: true } : { demo: true },
            lidaEm: entrada && i < qtd - c.naoLidas ? min(m.m - 1) : null,
            criadoEm: min(m.m),
          };
        }),
      );
      if (c.nota) await tx.insert(schema.conversaNotas).values({ conversaId: conv.id, usuarioId: u.id, conteudo: c.nota, criadoEm: min(Math.max(1, ultima.m - 1)) });
      if (c.followUpEmHoras)
        await tx.insert(schema.followUps).values({ conversaId: conv.id, clienteId, negocioId, usuarioId: u.id, agendadoPara: new Date(Date.now() + c.followUpEmHoras * 3600_000), notas: "Retornar sobre avaliação do Onix e simulação do financiamento", criadoPor: u.id });
    }
    await registrarLog(u, { acao: "demo.carregada", entidade: "sistema", descricao: `Carregou ${CENAS.length} conversas de demonstração (WhatsApp simulado)` }, tx);
  });
  return { criadas: CENAS.length, mensagem: `${CENAS.length} conversas de demonstração carregadas.` };
}

export async function limparDemonstracao(u: Quem) {
  return db.transaction(async (tx) => {
    /* test drive marcado pela IA numa conversa simulada não pode ficar na agenda de verdade */
    await tx.delete(schema.testDrives).where(inArray(schema.testDrives.conversaId, tx.select({ id: schema.conversas.id }).from(schema.conversas).where(eq(schema.conversas.demo, true))));
    const convs = await tx.delete(schema.conversas).where(eq(schema.conversas.demo, true)).returning({ id: schema.conversas.id });
    const negs = await tx
      .delete(schema.negocios)
      .where(and(eq(schema.negocios.demo, true), notExists(tx.select({ x: sql`1` }).from(schema.vendas).where(eq(schema.vendas.negocioId, schema.negocios.id)))))
      .returning({ id: schema.negocios.id });
    const clisDemo = await tx.select({ id: schema.clientes.id }).from(schema.clientes).where(eq(schema.clientes.demo, true));
    const ids = clisDemo.map((c) => c.id);
    let removidos = 0;
    if (ids.length) {
      const presos = new Set(
        [
          ...(await tx.select({ id: schema.vendas.clienteId }).from(schema.vendas).where(inArray(schema.vendas.clienteId, ids))),
          ...(await tx.select({ id: schema.ordensServico.clienteId }).from(schema.ordensServico).where(inArray(schema.ordensServico.clienteId, ids))),
          ...(await tx.select({ id: schema.negocios.clienteId }).from(schema.negocios).where(inArray(schema.negocios.clienteId, ids))),
        ].map((x) => x.id),
      );
      const livres = ids.filter((id) => !presos.has(id));
      if (livres.length) removidos = (await tx.delete(schema.clientes).where(inArray(schema.clientes.id, livres)).returning({ id: schema.clientes.id })).length;
    }
    await registrarLog(u, { acao: "demo.removida", entidade: "sistema", descricao: `Removeu dados de demonstração: ${convs.length} conversas, ${negs.length} negócios, ${removidos} clientes` }, tx);
    return { conversas: convs.length, negocios: negs.length, clientes: removidos };
  });
}
