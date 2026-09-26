import "server-only";
import { unstable_rethrow } from "next/navigation";
import { ZodError } from "zod";
import { ErroAcesso } from "@/lib/auth/dal";

export type Resultado<T = undefined> =
  | { ok: true; dados: T; mensagem?: string }
  | { ok: false; erro: string; campos?: Record<string, string> };

/** Erro de regra de negócio: a mensagem vai direto para a tela (e `campos`, se vier, destaca o campo). */
export class ErroRegra extends Error {
  constructor(
    mensagem: string,
    public campos?: Record<string, string>,
  ) {
    super(mensagem);
  }
}

type ErroPg = { code?: string; detail?: string; constraint?: string; cause?: ErroPg };

function erroPostgres(e: unknown): ErroPg | null {
  let x = e as ErroPg | undefined;
  for (let i = 0; i < 3 && x; i++) {
    if (x.code) return x;
    x = x.cause;
  }
  return null;
}

/* Toda ação de servidor passa por aqui: erros viram mensagem em português,
   redirecionamentos do Next continuam funcionando. */
export async function executar<T>(fn: () => Promise<T>, mensagem?: string): Promise<Resultado<T>> {
  try {
    const dados = await fn();
    return { ok: true, dados, mensagem };
  } catch (e) {
    unstable_rethrow(e);
    if (e instanceof ErroRegra && e.campos) return { ok: false, erro: e.message, campos: e.campos };
    if (e instanceof ErroAcesso || e instanceof ErroRegra) return { ok: false, erro: e.message };
    if (e instanceof ZodError) {
      const campos: Record<string, string> = {};
      for (const i of e.issues) campos[i.path.join(".")] ??= i.message;
      /* o primeiro problema vai junto: se o campo não estiver na tela, a pessoa
         ainda sabe o que corrigir */
      const primeiro = e.issues[0]?.message;
      return { ok: false, erro: primeiro ? `Confira os campos: ${primeiro}` : "Confira os campos destacados.", campos };
    }
    const pg = erroPostgres(e);
    if (pg?.code === "23505") {
      const alvo = `${pg.constraint ?? ""} ${pg.detail ?? ""}`;
      if (alvo.includes("modelo_cores")) return { ok: false, erro: "Este modelo já tem uma cor com esse nome.", campos: { nome: "Já cadastrada" } };
      if (alvo.includes("cpf")) return { ok: false, erro: "Já existe um cliente com este CPF.", campos: { cpf: "CPF já cadastrado" } };
      if (alvo.includes("chassi")) return { ok: false, erro: "Já existe um veículo com este chassi.", campos: { chassi: "Chassi já cadastrado" } };
      if (alvo.includes("placa")) return { ok: false, erro: "Já existe um veículo com esta placa.", campos: { placa: "Placa já cadastrada" } };
      if (alvo.includes("usuario")) return { ok: false, erro: "Este nome de usuário já está em uso.", campos: { usuario: "Já em uso" } };
      if (alvo.includes("atalho")) return { ok: false, erro: "Já existe uma resposta com este atalho.", campos: { atalho: "Já em uso" } };
      if (alvo.includes("vendas_negocio")) return { ok: false, erro: "Este negócio já tem uma venda em andamento." };
      return { ok: false, erro: "Este registro já existe." };
    }
    if (pg?.code === "23503") return { ok: false, erro: "Este registro está ligado a outros e não pode ser removido." };
    console.error("[acao]", e);
    return { ok: false, erro: "Não foi possível concluir agora. Tente de novo em instantes." };
  }
}
