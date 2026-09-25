"use server";
import { asc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db, schema } from "@/lib/db";
import { autorizar } from "@/lib/auth/dal";
import { executar, ErroRegra } from "@/lib/acao";
import { STATUS_CONVERSA, type StatusConversa } from "@/lib/dominio";
import { contextoDaConversa, listarConversas, mensagensDaConversa, notasDaConversa, temMaisAntigas, type FiltroConversa } from "@/lib/consultas/conversas";
import {
  abrirConversaDoCliente,
  adicionarNota,
  agendarFollowUp,
  assumirConversa,
  atribuirConversa,
  criarNegocioDaConversa,
  encerrarFollowUp,
  enviarMensagem,
  executarTriagem,
  marcarLida,
  mudarStatusConversa,
  receberMensagem,
  triagemAutomaticaLigada,
  vincularCliente,
} from "@/lib/mensageria/servico";
import { obterProvedor } from "@/lib/mensageria/provedores";
import type { TipoMensagem } from "@/lib/mensageria/tipos";

const revalidarFunil = () => {
  revalidatePath("/sistema/funil");
  revalidatePath("/sistema/follow-ups");
};

export async function acaoListarConversas(filtro: FiltroConversa, q: string, antesDe?: string | null) {
  const u = await autorizar("conversas.ver");
  return listarConversas({ filtro, q, usuarioId: u.id, antesDe: antesDe ? new Date(antesDe) : null });
}

export async function acaoAbrirConversa(id: number) {
  await autorizar("conversas.ver");
  await marcarLida(id);
  const [mensagens, notas, contexto] = await Promise.all([mensagensDaConversa(id, {}), notasDaConversa(id), contextoDaConversa(id)]);
  if (!contexto) throw new ErroRegra("Conversa não encontrada.");
  return { mensagens, notas, contexto, temMais: mensagens.length ? await temMaisAntigas(id, mensagens[0].id) : false };
}

export async function acaoMensagensAntigas(id: number, antesDeId: number) {
  await autorizar("conversas.ver");
  const mensagens = await mensagensDaConversa(id, { antesDeId });
  return { mensagens, temMais: mensagens.length ? await temMaisAntigas(id, mensagens[0].id) : false };
}

export async function acaoContexto(id: number) {
  await autorizar("conversas.ver");
  return contextoDaConversa(id);
}

export async function acaoMarcarLida(id: number) {
  await autorizar("conversas.ver");
  await marcarLida(id);
}

const TIPOS_MIDIA = /^(image\/(png|jpe?g|webp|gif)|application\/pdf|text\/plain|application\/(msword|vnd\.openxmlformats-officedocument\.[a-z.]+))$/;
const esquemaEnvio = z.object({
  tipo: z.enum(["texto", "imagem", "documento", "audio"]),
  conteudo: z.string().max(4096).nullable().optional(),
  respostaA: z.number().int().positive().nullable().optional(),
  midia: z
    .object({
      url: z.string().max(3_000_000, "Arquivo grande demais (até 2 MB no modo simulado)"),
      nome: z.string().max(200).nullable().optional(),
      mime: z.string().max(120).nullable().optional(),
      tamanho: z.number().int().max(2_100_000, "Arquivo grande demais (até 2 MB)").nullable().optional(),
    })
    .nullable()
    .optional(),
  duracao: z.number().int().min(1).max(600).optional(),
});

export async function acaoEnviarMensagem(conversaId: number, dados: unknown) {
  return executar(async () => {
    const u = await autorizar("conversas.ver");
    const d = esquemaEnvio.parse(dados);
    if (d.midia && (!d.midia.mime || !TIPOS_MIDIA.test(d.midia.mime))) throw new ErroRegra("Tipo de arquivo não aceito. Envie imagem, PDF ou documento.");
    if (d.midia && !d.midia.url.startsWith("data:") && !d.midia.url.startsWith("https://")) throw new ErroRegra("Arquivo inválido.");
    if (d.tipo === "audio" && !(await obterProvedor()).simulado) throw new ErroRegra("Áudio ainda não disponível no WhatsApp real.");
    const id = await enviarMensagem(u, conversaId, {
      tipo: d.tipo as TipoMensagem,
      conteudo: d.conteudo,
      midia: d.midia ?? null,
      respostaA: d.respostaA ?? null,
      metadados: d.tipo === "audio" ? { duracao: d.duracao ?? 12, simulado: true } : undefined,
    });
    return { id };
  });
}

export async function acaoNota(conversaId: number, texto: string) {
  return executar(async () => {
    const u = await autorizar("conversas.ver");
    return { id: await adicionarNota(u, conversaId, texto) };
  }, "Nota interna salva");
}

export async function acaoAssumir(conversaId: number) {
  return executar(async () => {
    const u = await autorizar("conversas.ver");
    await assumirConversa(u, conversaId);
    revalidarFunil();
    return null;
  }, "Você assumiu o atendimento");
}

export async function acaoAtribuir(conversaId: number, responsavelId: number | null) {
  return executar(async () => {
    const u = await autorizar("conversas.ver");
    await atribuirConversa(u, conversaId, responsavelId);
    revalidarFunil();
    return null;
  }, "Responsável atualizado");
}

export async function acaoStatusConversa(conversaId: number, status: string) {
  return executar(async () => {
    const u = await autorizar("conversas.ver");
    if (!(status in STATUS_CONVERSA)) throw new ErroRegra("Status inválido.");
    await mudarStatusConversa(u, conversaId, status as StatusConversa);
    return null;
  }, "Status atualizado");
}

export async function acaoAgendarFollowUp(conversaId: number, quandoIso: string, notas: string) {
  return executar(async () => {
    const u = await autorizar("conversas.ver");
    const id = await agendarFollowUp(u, conversaId, new Date(quandoIso), notas);
    revalidarFunil();
    return { id };
  }, "Follow-up agendado");
}

export async function acaoEncerrarFollowUp(followUpId: number, como: "concluido" | "cancelado") {
  return executar(async () => {
    const u = await autorizar("conversas.ver");
    await encerrarFollowUp(u, followUpId, como);
    revalidarFunil();
    return null;
  }, como === "concluido" ? "Follow-up concluído" : "Follow-up cancelado");
}

export async function acaoVincularCliente(conversaId: number, clienteId: number) {
  return executar(async () => {
    const u = await autorizar("clientes.editar");
    await vincularCliente(u, conversaId, clienteId);
    return null;
  }, "Conversa ligada ao cliente");
}

export async function acaoNegocioDaConversa(conversaId: number, dados: Record<string, unknown>) {
  return executar(async () => {
    const u = await autorizar("funil.editar");
    const id = await criarNegocioDaConversa(u, conversaId, dados);
    revalidarFunil();
    return { id };
  }, "Negócio criado no funil");
}

export async function acaoTriagem(conversaId: number) {
  return executar(async () => {
    await autorizar("conversas.ver");
    const r = await executarTriagem(conversaId);
    if (!r.ok) throw new ErroRegra(r.motivo);
    return r.triagem;
  }, "Triagem atualizada");
}

export async function acaoConversaDoCliente(clienteId: number) {
  return executar(async () => {
    const u = await autorizar("conversas.ver");
    return { id: await abrirConversaDoCliente(u, clienteId) };
  });
}

export async function acaoRespostasRapidas() {
  await autorizar("conversas.ver");
  return db
    .select({ id: schema.respostasRapidas.id, atalho: schema.respostasRapidas.atalho, titulo: schema.respostasRapidas.titulo, conteudo: schema.respostasRapidas.conteudo })
    .from(schema.respostasRapidas)
    .where(eq(schema.respostasRapidas.ativo, true))
    .orderBy(asc(schema.respostasRapidas.atalho));
}

/* ---------------- SIMULADOR (só existe com o provedor MOCK) ----------------
   Faz o papel do cliente mandando mensagem. Usa exatamente o mesmo caminho
   que o webhook real vai usar (receberMensagem), então o que funciona aqui
   funciona com o WhatsApp de verdade. */
const esquemaSimulacao = z.object({
  telefone: z.string().min(10, "Telefone com DDD"),
  nome: z.string().max(80).optional(),
  texto: z.string().trim().min(1, "Escreva a mensagem do cliente").max(2000),
});

export async function acaoSimularCliente(dados: unknown) {
  return executar(async () => {
    const u = await autorizar("conversas.ver");
    void u;
    if (!(await obterProvedor()).simulado) throw new ErroRegra("O simulador só funciona no modo de demonstração.");
    const d = esquemaSimulacao.parse(dados);
    const r = await receberMensagem({ canal: "whatsapp", provedor: "mock", telefone: d.telefone, nomeContato: d.nome || null, tipo: "texto", conteudo: d.texto, externoId: `mock-in-${crypto.randomUUID()}`, demo: true });
    let triagem: string | null = null;
    if (r.conversaId && r.modo === "ia" && (await triagemAutomaticaLigada())) {
      const t = await executarTriagem(r.conversaId);
      triagem = t.ok ? "ok" : t.motivo;
    }
    return { conversaId: r.conversaId, triagem };
  }, "Mensagem do cliente simulada");
}
