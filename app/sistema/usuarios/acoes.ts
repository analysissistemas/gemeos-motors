"use server";
import { and, eq, ne, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, schema } from "@/lib/db";
import { autorizar, ErroAcesso, obterUsuario } from "@/lib/auth/dal";
import { gerarHash } from "@/lib/auth/senha";
import { executar, ErroRegra } from "@/lib/acao";
import { registrarLog } from "@/lib/logs";
import { apagarFoto, guardarFoto } from "@/lib/fotos";
import { PAPEIS } from "@/lib/dominio";
import { esquemaUsuario, senhaForte } from "@/lib/validacao";

async function garantirOutroAdmin(ignorarId: number) {
  const [{ n }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.usuarios)
    .where(and(eq(schema.usuarios.papel, "admin"), eq(schema.usuarios.ativo, true), ne(schema.usuarios.id, ignorarId)));
  if (n === 0) throw new ErroRegra("O sistema precisa de pelo menos um administrador ativo.");
}

export async function acaoCriarUsuario(dados: Record<string, unknown>) {
  return executar(async () => {
    const u = await autorizar("usuarios.gerenciar");
    const d = esquemaUsuario.parse(dados);
    const senha = senhaForte.parse(dados.senha);
    const [novo] = await db.insert(schema.usuarios).values({ ...d, senhaHash: await gerarHash(senha) }).returning({ id: schema.usuarios.id });
    await registrarLog(u, { acao: "usuario.criado", entidade: "usuario", entidadeId: novo.id, descricao: `Criou o usuário ${d.nome} (${d.usuario}) como ${PAPEIS[d.papel]}` });
    revalidatePath("/sistema/usuarios");
    return { id: novo.id };
  }, "Usuário criado");
}

export async function acaoEditarUsuario(id: number, dados: Record<string, unknown>) {
  return executar(async () => {
    const u = await autorizar("usuarios.gerenciar");
    const d = esquemaUsuario.parse(dados);
    const [antes] = await db.select().from(schema.usuarios).where(eq(schema.usuarios.id, id)).limit(1);
    if (!antes) throw new ErroRegra("Usuário não encontrado.");
    if (antes.papel === "admin" && d.papel !== "admin") await garantirOutroAdmin(id);
    const mudouPapel = antes.papel !== d.papel;
    await db
      .update(schema.usuarios)
      .set({ ...d, atualizadoEm: new Date(), ...(mudouPapel && { sessaoVersao: antes.sessaoVersao + 1 }) })
      .where(eq(schema.usuarios.id, id));
    await registrarLog(u, {
      acao: "usuario.editado",
      entidade: "usuario",
      entidadeId: id,
      descricao: mudouPapel ? `Mudou o perfil de ${d.nome} de ${PAPEIS[antes.papel as keyof typeof PAPEIS]} para ${PAPEIS[d.papel]}` : `Editou os dados de ${d.nome}`,
    });
    revalidatePath("/sistema/usuarios");
    return null;
  }, "Usuário atualizado");
}

export async function acaoAlternarAtivo(id: number) {
  return executar(async () => {
    const u = await autorizar("usuarios.gerenciar");
    if (id === u.id) throw new ErroRegra("Você não pode desativar o próprio acesso.");
    const [alvo] = await db.select().from(schema.usuarios).where(eq(schema.usuarios.id, id)).limit(1);
    if (!alvo) throw new ErroRegra("Usuário não encontrado.");
    if (alvo.ativo && alvo.papel === "admin") await garantirOutroAdmin(id);
    await db
      .update(schema.usuarios)
      .set({ ativo: !alvo.ativo, sessaoVersao: alvo.sessaoVersao + 1, atualizadoEm: new Date() })
      .where(eq(schema.usuarios.id, id));
    await registrarLog(u, { acao: alvo.ativo ? "usuario.desativado" : "usuario.reativado", entidade: "usuario", entidadeId: id, descricao: `${alvo.ativo ? "Desativou" : "Reativou"} o acesso de ${alvo.nome}` });
    revalidatePath("/sistema/usuarios");
    return null;
  }, "Acesso atualizado");
}

export async function acaoRedefinirSenha(id: number, senha: string) {
  return executar(async () => {
    const u = await autorizar("usuarios.gerenciar");
    const nova = senhaForte.parse(senha);
    const [alvo] = await db.select().from(schema.usuarios).where(eq(schema.usuarios.id, id)).limit(1);
    if (!alvo) throw new ErroRegra("Usuário não encontrado.");
    await db
      .update(schema.usuarios)
      .set({ senhaHash: await gerarHash(nova), sessaoVersao: alvo.sessaoVersao + 1, atualizadoEm: new Date() })
      .where(eq(schema.usuarios.id, id));
    await registrarLog(u, { acao: "usuario.senha_redefinida", entidade: "usuario", entidadeId: id, descricao: `Redefiniu a senha de ${alvo.nome} (sessões abertas encerradas)` });
    return null;
  }, "Senha redefinida");
}

/* ---------- foto de perfil ---------- */

/** A própria foto qualquer pessoa troca; a de outra, só quem gerencia usuários. */
async function autorizarFoto(id: number) {
  const eu = await obterUsuario();
  if (!eu) throw new ErroAcesso("Sua sessão expirou. Entre de novo.");
  if (eu.id === id) return eu;
  return autorizar("usuarios.gerenciar");
}

async function trocarFotoUsuario(id: number, fotoUrl: string | null) {
  const u = await autorizarFoto(id);
  const [alvo] = await db.select({ nome: schema.usuarios.nome, fotoUrl: schema.usuarios.fotoUrl }).from(schema.usuarios).where(eq(schema.usuarios.id, id)).limit(1);
  if (!alvo) {
    await apagarFoto(fotoUrl);
    throw new ErroRegra("Usuário não encontrado.");
  }
  await db.update(schema.usuarios).set({ fotoUrl, atualizadoEm: new Date() }).where(eq(schema.usuarios.id, id));
  await apagarFoto(alvo.fotoUrl);
  const deQuem = id === u.id ? "a própria foto" : `a foto de ${alvo.nome}`;
  await registrarLog(u, {
    acao: fotoUrl ? "usuario.foto_alterada" : "usuario.foto_removida",
    entidade: "usuario",
    entidadeId: id,
    descricao: `${fotoUrl ? (alvo.fotoUrl ? "Trocou" : "Colocou") : "Removeu"} ${deQuem}`,
  });
  revalidatePath("/sistema", "layout");
  return { fotoUrl };
}

export async function acaoFotoUsuario(id: number, dados: FormData) {
  return executar(async () => {
    await autorizarFoto(id);
    return trocarFotoUsuario(id, await guardarFoto(dados.get("foto"), { tipo: "usuario", id }));
  }, "Foto atualizada");
}

export async function acaoRemoverFotoUsuario(id: number) {
  return executar(() => trocarFotoUsuario(id, null), "Foto removida");
}
