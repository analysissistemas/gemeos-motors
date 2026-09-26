"use server";
import { and, eq, gt, sql } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/lib/db";
import { autorizar } from "@/lib/auth/dal";
import { liberarConfig, trancarConfig } from "@/lib/auth/desbloqueio";
import { conferirSenha } from "@/lib/auth/senha";
import { executar, ErroRegra } from "@/lib/acao";
import { registrarLog } from "@/lib/logs";

const LIMITE_TENTATIVAS = 5;
const JANELA_MIN = 15;

export async function acaoDesbloquearConfig(senha: string) {
  return executar(async () => {
    const u = await autorizar("config.gerenciar");
    const s = z.string().min(1, "Digite a senha.").max(200).parse(senha);
    const [{ falhas }] = await db
      .select({ falhas: sql<number>`count(*)::int` })
      .from(schema.logs)
      .where(and(eq(schema.logs.acao, "config.senha_falha"), eq(schema.logs.entidadeId, String(u.id)), gt(schema.logs.criadoEm, sql`now() - make_interval(mins => ${JANELA_MIN})`)));
    if (falhas >= LIMITE_TENTATIVAS) throw new ErroRegra(`Muitas tentativas erradas. Aguarde ${JANELA_MIN} minutos e tente de novo.`);

    const [l] = await db.select({ senhaHash: schema.usuarios.senhaHash }).from(schema.usuarios).where(eq(schema.usuarios.id, u.id)).limit(1);
    if (!l || !(await conferirSenha(s, l.senhaHash))) {
      await registrarLog(u, { acao: "config.senha_falha", entidade: "usuario", entidadeId: u.id, descricao: "Errou a senha ao abrir as configurações" });
      throw new ErroRegra("Senha não confere.");
    }
    await liberarConfig(u.id);
    await registrarLog(u, { acao: "config.desbloqueio", entidade: "usuario", entidadeId: u.id, descricao: "Abriu as configurações com a senha" });
    return null;
  });
}

export async function acaoTrancarConfig() {
  return executar(async () => {
    await autorizar("config.gerenciar");
    await trancarConfig();
    return null;
  });
}
