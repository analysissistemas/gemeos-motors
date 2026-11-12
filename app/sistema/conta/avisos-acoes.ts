"use server";
import { z } from "zod";
import { autorizar, ErroAcesso, obterUsuario } from "@/lib/auth/dal";
import { executar, ErroRegra } from "@/lib/acao";
import { chavePublica, desinscrever, enviarAviso, inscrever, inscricoes } from "@/lib/avisos/push";
import { registrarLog } from "@/lib/logs";

/* Avisos no celular (Minha conta): cada pessoa ativa no próprio aparelho. */

const eu = async () => {
  const u = await obterUsuario();
  if (!u) throw new ErroAcesso("Sua sessão expirou. Entre de novo.");
  return u;
};

export async function acaoChavePublicaAvisos() {
  return executar(async () => {
    await eu();
    return await chavePublica();
  });
}

const esquemaInscricao = z.object({ endpoint: z.string().url().max(1000), keys: z.object({ p256dh: z.string().min(10).max(300), auth: z.string().min(8).max(100) }) });

export async function acaoAtivarAvisos(inscricao: unknown, aparelho: string | null) {
  return executar(async () => {
    const u = await eu();
    const s = esquemaInscricao.parse(inscricao);
    await inscrever(u.id, s, aparelho);
    await registrarLog(u, { acao: "avisos.ativados", entidade: "usuario", entidadeId: u.id, descricao: `Ativou os avisos no celular (${aparelho ?? "aparelho"})` });
    return true;
  }, "Avisos ativados neste aparelho");
}

export async function acaoDesativarAvisos(endpoint: string) {
  return executar(async () => {
    const u = await eu();
    await desinscrever(endpoint);
    await registrarLog(u, { acao: "avisos.desativados", entidade: "usuario", entidadeId: u.id, descricao: "Desativou os avisos neste aparelho" });
    return true;
  }, "Avisos desativados neste aparelho");
}

export async function acaoAvisoDeTeste() {
  return executar(async () => {
    const u = await eu();
    if (!(await inscricoes()).some((i) => i.usuarioId === u.id)) throw new ErroRegra("Ative os avisos neste aparelho primeiro.");
    const r = await enviarAviso(
      { titulo: "🔔 Aviso de teste", corpo: "Os avisos da Gêmeos Motors estão chegando neste celular.", tag: `teste-${Date.now()}`, urgente: true, url: "/sistema/conta" },
      { soPara: [u.id], ignorarHorario: true },
    );
    if (!r.enviados) throw new ErroRegra(`O aviso não saiu (${r.motivo ?? "o celular recusou"}). Desative e ative de novo.`);
    return r.enviados;
  }, "Aviso de teste enviado");
}

/* ---------- relatório das 8h no WhatsApp do Milton (só administrador) ---------- */

export async function acaoWhatsappRelatorio() {
  return executar(async () => {
    await autorizar("config.gerenciar");
    const { lerWhatsappEquipe, situacaoModeloRelatorio } = await import("@/lib/avisos/whatsapp-equipe");
    const e = await lerWhatsappEquipe();
    let modelo: { status: string; motivo: string | null } | null = null;
    let erroModelo: string | null = null;
    try {
      modelo = await situacaoModeloRelatorio();
    } catch (x) {
      erroModelo = x instanceof Error ? x.message : String(x);
    }
    return { telefone: e?.telefone ?? "", nome: e?.nome ?? "Milton", ultimaMsgEm: e?.ultimaMsgEm ?? null, ultimoEnvio: e?.ultimoEnvio ?? null, modelo, erroModelo };
  });
}

export async function acaoSalvarWhatsappRelatorio(telefone: string, nome: string) {
  return executar(async () => {
    const u = await autorizar("config.gerenciar");
    const d = telefone.replace(/\D/g, "");
    if (d && (d.length < 10 || d.length > 13)) throw new ErroRegra("Número inválido. Use DDD + número, ex.: (81) 99386-9767.");
    const { salvarWhatsappEquipe } = await import("@/lib/avisos/whatsapp-equipe");
    await salvarWhatsappEquipe(d, nome);
    await registrarLog(u, { acao: "avisos.whatsapp", entidade: "configuracao", entidadeId: 0, descricao: d ? "Cadastrou o WhatsApp do relatório das 8h" : "Removeu o WhatsApp do relatório das 8h" });
    return true;
  }, "Número salvo");
}

export async function acaoCriarModeloRelatorio() {
  return executar(async () => {
    const u = await autorizar("config.gerenciar");
    const { criarModeloRelatorio } = await import("@/lib/avisos/whatsapp-equipe");
    let r;
    try {
      r = await criarModeloRelatorio();
    } catch (x) {
      throw new ErroRegra(`A Meta recusou: ${x instanceof Error ? x.message : String(x)}`);
    }
    await registrarLog(u, { acao: "avisos.modelo", entidade: "configuracao", entidadeId: 0, descricao: `Criou o modelo de mensagem relatorio_manha na Meta (${r.status})` });
    return r;
  });
}

export async function acaoEnviarRelatorioAgora() {
  return executar(async () => {
    await autorizar("config.gerenciar");
    const { relatorioDaManha, resumoParaWhatsapp } = await import("@/lib/consultas/relatorio-manha");
    const { enviarRelatorioWhatsApp } = await import("@/lib/avisos/whatsapp-equipe");
    const r = await enviarRelatorioWhatsApp(resumoParaWhatsapp(await relatorioDaManha()));
    if (!r.ok) throw new ErroRegra(`Não saiu: ${r.erro ?? "erro desconhecido"}`);
    return r.como;
  });
}

/* ---------- modelos da Meta para o contato do dia com o cliente (só administrador) ---------- */

export async function acaoModelosCliente() {
  return executar(async () => {
    await autorizar("config.gerenciar");
    const { situacaoModelosCliente } = await import("@/lib/avisos/modelos-cliente");
    try {
      return { modelos: await situacaoModelosCliente(), erro: null as string | null };
    } catch (x) {
      return { modelos: [], erro: x instanceof Error ? x.message : String(x) };
    }
  });
}

export async function acaoCriarModelosCliente() {
  return executar(async () => {
    const u = await autorizar("config.gerenciar");
    const { criarModelosCliente } = await import("@/lib/avisos/modelos-cliente");
    let r;
    try {
      r = await criarModelosCliente();
    } catch (x) {
      throw new ErroRegra(`A Meta recusou: ${x instanceof Error ? x.message : String(x)}`);
    }
    await registrarLog(u, { acao: "avisos.modelo", entidade: "configuracao", entidadeId: 0, descricao: `Criou os modelos de lembrete ao cliente na Meta (${r.map((m) => `${m.nome}: ${m.status ?? "não criado"}`).join(", ")})` });
    return r;
  });
}

/* ---------- aviso do crédito da IA no WhatsApp (programadores e dono, 12/11/2026; só administrador) ---------- */

export async function acaoAvisoCredito() {
  return executar(async () => {
    await autorizar("config.gerenciar");
    const { lerAvisoCredito, situacaoModeloCredito } = await import("@/lib/avisos/credito-whatsapp");
    const g = await lerAvisoCredito();
    let modelo: { status: string; motivo: string | null } | null = null;
    let erroModelo: string | null = null;
    try {
      modelo = await situacaoModeloCredito();
    } catch (x) {
      erroModelo = x instanceof Error ? x.message : String(x);
    }
    return { telefones: g.telefones, ultimo: g.ultimo, modelo, erroModelo };
  });
}

export async function acaoSalvarAvisoCredito(texto: string) {
  return executar(async () => {
    const u = await autorizar("config.gerenciar");
    const { lerListaTelefones, salvarTelefonesCredito } = await import("@/lib/avisos/credito-whatsapp");
    const { telefones, invalidos } = lerListaTelefones(texto);
    if (invalidos.length) throw new ErroRegra(`Número inválido: ${invalidos.join(", ")}. Use DDD + número, ex.: (81) 99999-9999.`);
    await salvarTelefonesCredito(telefones);
    await registrarLog(u, { acao: "avisos.credito", entidade: "configuracao", entidadeId: 0, descricao: `Cadastrou ${telefones.length} WhatsApp(s) para o aviso do crédito da IA` });
    return telefones.length;
  }, "Números salvos");
}

export async function acaoCriarModeloCredito() {
  return executar(async () => {
    const u = await autorizar("config.gerenciar");
    const { criarModeloCredito } = await import("@/lib/avisos/credito-whatsapp");
    let r;
    try {
      r = await criarModeloCredito();
    } catch (x) {
      throw new ErroRegra(`A Meta recusou: ${x instanceof Error ? x.message : String(x)}`);
    }
    await registrarLog(u, { acao: "avisos.modelo", entidade: "configuracao", entidadeId: 0, descricao: `Criou o modelo de mensagem aviso_credito_ia na Meta (${r.status})` });
    return r;
  });
}

/** Primeira mensagem para todos (usuário, 12/11/2026: "a partir de agora todos serão avisados sobre o token da IA"):
 *  serve também de teste de que o número recebe. */
export async function acaoTesteAvisoCredito() {
  return executar(async () => {
    const u = await autorizar("config.gerenciar");
    const { enviarAvisoCreditoWhatsApp, FRASE_BOAS_VINDAS } = await import("@/lib/avisos/credito-whatsapp");
    const envios = await enviarAvisoCreditoWhatsApp(FRASE_BOAS_VINDAS);
    if (!envios.length) throw new ErroRegra("Cadastre pelo menos um número primeiro.");
    const ok = envios.filter((e) => e.ok).length;
    await registrarLog(u, { acao: "avisos.credito", entidade: "configuracao", entidadeId: 0, descricao: `Enviou o aviso inicial do crédito da IA (${ok} de ${envios.length})` });
    if (!ok) throw new ErroRegra(`Não saiu para ninguém: ${envios[0].erro ?? "erro desconhecido"}`);
    return `${ok} de ${envios.length}`;
  });
}
