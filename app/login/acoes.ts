"use server";
import { and, eq, gt, sql } from "drizzle-orm";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { ipConfiavel } from "@/lib/ip";
import { z } from "zod";
import { db, schema } from "@/lib/db";
import { conferirSenha } from "@/lib/auth/senha";
import { criarSessao, encerrarSessao } from "@/lib/auth/sessao";
import { obterUsuario } from "@/lib/auth/dal";
import { registrarLog } from "@/lib/logs";

const esquema = z.object({
  usuario: z.string().trim().toLowerCase().min(1, "Informe o usuário"),
  senha: z.string().min(1, "Informe a senha"),
  de: z.string().optional(),
});

export type EstadoLogin = { erro?: string; nome?: string; destino?: string } | null;

const LIMITE_TENTATIVAS = 5; // por usuário E por IP: quem erra é barrado, quem só digita o nome de outro não
const LIMITE_GERAL_USUARIO = 30; // contra chute distribuído em vários IPs
const JANELA_MIN = 15;
/* hash de mentira: usuário inexistente gasta o mesmo tempo de um existente (não revela quem existe) */
const HASH_FALSO = "scrypt$16384$8$1$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";

export async function entrar(_: EstadoLogin, form: FormData): Promise<EstadoLogin> {
  const p = esquema.safeParse(Object.fromEntries(form));
  if (!p.success) return { erro: p.error.issues[0]?.message };
  const { usuario, senha } = p.data;

  /* trava: 5 erros do mesmo IP para o mesmo usuário em 15 minutos, ou 30 erros de qualquer origem.
     Assim ninguém tranca o admin de fora só digitando o nome dele. */
  const ip = ipConfiavel(await headers());
  const janela = gt(schema.logs.criadoEm, sql`now() - make_interval(mins => ${JANELA_MIN})`);
  const doUsuario = and(eq(schema.logs.acao, "auth.falha"), eq(schema.logs.entidadeId, usuario), janela);
  const [{ falhasIp, falhasTotal }] = await db
    .select({
      falhasIp: sql<number>`count(*) filter (where ${schema.logs.ip} is not distinct from ${ip})::int`,
      falhasTotal: sql<number>`count(*)::int`,
    })
    .from(schema.logs)
    .where(doUsuario);
  if (falhasIp >= LIMITE_TENTATIVAS || falhasTotal >= LIMITE_GERAL_USUARIO) {
    return { erro: `Muitas tentativas. Aguarde ${JANELA_MIN} minutos e tente de novo.` };
  }

  const [u] = await db.select().from(schema.usuarios).where(eq(schema.usuarios.usuario, usuario)).limit(1);
  const confere = await conferirSenha(senha, u?.senhaHash ?? HASH_FALSO);
  if (!u || !confere || !u.ativo) {
    await registrarLog(null, {
      acao: "auth.falha",
      entidade: "usuario",
      entidadeId: usuario,
      descricao: u && !u.ativo ? `Tentativa de acesso com usuário desativado (${usuario})` : `Tentativa de acesso sem sucesso (${usuario})`,
    });
    return { erro: "Usuário ou senha não conferem." };
  }

  await criarSessao({ uid: u.id, v: u.sessaoVersao });
  await db.update(schema.usuarios).set({ ultimoAcessoEm: new Date() }).where(eq(schema.usuarios.id, u.id));
  await registrarLog({ id: u.id, nome: u.nome }, { acao: "auth.entrada", entidade: "usuario", entidadeId: u.id, descricao: "Entrou no sistema" });

  const de = p.data.de;
  const destino = de && de.startsWith("/sistema") && !de.startsWith("//") ? de : u.papel === "tecnico" ? "/sistema/assistencia" : "/sistema";
  return { nome: u.nome, destino };
}

export async function sair() {
  const u = await obterUsuario();
  if (u) await registrarLog(u, { acao: "auth.saida", entidade: "usuario", entidadeId: u.id, descricao: "Saiu do sistema" });
  await encerrarSessao();
  redirect("/login");
}
