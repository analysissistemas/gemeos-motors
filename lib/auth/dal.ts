import "server-only";
import { cache } from "react";
import { eq } from "drizzle-orm";
import { forbidden, redirect } from "next/navigation";
import { db, schema } from "@/lib/db";
import { pode, type Papel, type Permissao } from "@/lib/dominio";
import { lerSessao } from "./sessao";

export type UsuarioAtual = { id: number; nome: string; usuario: string; papel: Papel; email: string | null; fotoUrl: string | null };

/* Uma consulta por requisição, mesmo que várias partes da página perguntem. */
export const obterUsuario = cache(async (): Promise<UsuarioAtual | null> => {
  const s = await lerSessao();
  if (!s) return null;
  const [u] = await db
    .select({
      id: schema.usuarios.id,
      nome: schema.usuarios.nome,
      usuario: schema.usuarios.usuario,
      papel: schema.usuarios.papel,
      email: schema.usuarios.email,
      fotoUrl: schema.usuarios.fotoUrl,
      ativo: schema.usuarios.ativo,
      sessaoVersao: schema.usuarios.sessaoVersao,
    })
    .from(schema.usuarios)
    .where(eq(schema.usuarios.id, s.uid))
    .limit(1);
  if (!u || !u.ativo || u.sessaoVersao !== s.v) return null;
  return { id: u.id, nome: u.nome, usuario: u.usuario, papel: u.papel as Papel, email: u.email, fotoUrl: u.fotoUrl };
});

export async function exigirUsuario() {
  const u = await obterUsuario();
  if (!u) redirect("/login");
  return u;
}

/** Para páginas: sem permissão, mostra a tela de acesso negado. */
export async function exigirPermissao(p: Permissao) {
  const u = await exigirUsuario();
  if (!pode(u.papel, p)) forbidden();
  return u;
}

/** Para ações e rotas: devolve o usuário ou lança erro que vira mensagem. */
export async function autorizar(p: Permissao) {
  const u = await obterUsuario();
  if (!u) throw new ErroAcesso("Sua sessão expirou. Entre de novo.");
  if (!pode(u.papel, p)) throw new ErroAcesso("Seu perfil não tem acesso a esta ação.");
  return u;
}

export class ErroAcesso extends Error {}
