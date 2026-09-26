"use server";
import { and, eq, gt, sql } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/lib/db";
import { autorizar } from "@/lib/auth/dal";
import { AREAS_CONFIG, configLiberada, liberarConfig, trancarConfig, type AreaConfig } from "@/lib/auth/desbloqueio";
import { conferirSenha } from "@/lib/auth/senha";
import { executar, ErroRegra } from "@/lib/acao";
import { registrarLog } from "@/lib/logs";

const LIMITE_TENTATIVAS = 5;
const JANELA_MIN = 15;
const areaValida = (area: unknown) => z.enum(AREAS_CONFIG as [AreaConfig, ...AreaConfig[]]).parse(area);

export async function acaoDesbloquearConfig(senha: string, area: AreaConfig) {
  return executar(async () => {
    const u = await autorizar("config.gerenciar");
    const a = areaValida(area);
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
    await liberarConfig(u.id, a);
    await registrarLog(u, { acao: "config.desbloqueio", entidade: "usuario", entidadeId: u.id, descricao: a === "ia" ? "Abriu as configurações da IA com a senha" : "Abriu as configurações com a senha" });
    return null;
  });
}

export async function acaoTrancarConfig(area: AreaConfig) {
  return executar(async () => {
    await autorizar("config.gerenciar");
    await trancarConfig(areaValida(area));
    return null;
  });
}

/** A tela voltou pelo "Voltar" do navegador (cache do roteador)? Confere se ainda está liberada. */
export async function acaoConfigLiberada(area: AreaConfig) {
  return executar(async () => {
    const u = await autorizar("config.gerenciar");
    return configLiberada(u, areaValida(area));
  });
}
