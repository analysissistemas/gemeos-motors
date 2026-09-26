import "server-only";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";

/* Sessão em cookie assinado (HS256), só no servidor. O cookie guarda o id do
   usuário e a versão da sessão; a cada requisição o DAL confere no banco se o
   usuário continua ativo e se a versão bate (troca de senha derruba sessões).
   "Lembrar login" = manter esta sessão (nunca a senha). Ela vale no máximo
   2 horas a partir do login, sem renovar sozinha. */
export const COOKIE_SESSAO = "gm_sessao";
export const DURACAO_SESSAO_H = 2;
const DURACAO_H = DURACAO_SESSAO_H;

function chave() {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) throw new Error("SESSION_SECRET ausente ou curta");
  return new TextEncoder().encode(s);
}

export type ConteudoSessao = { uid: number; v: number };

export async function criarSessao(c: ConteudoSessao) {
  const token = await new SignJWT(c)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${DURACAO_H}h`)
    .sign(chave());
  (await cookies()).set(COOKIE_SESSAO, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: DURACAO_H * 3600,
  });
}

export async function lerSessao(): Promise<ConteudoSessao | null> {
  const token = (await cookies()).get(COOKIE_SESSAO)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, chave(), { algorithms: ["HS256"] });
    if (typeof payload.uid !== "number" || typeof payload.v !== "number") return null;
    return { uid: payload.uid, v: payload.v };
  } catch {
    return null;
  }
}

export async function encerrarSessao() {
  (await cookies()).delete(COOKIE_SESSAO);
}
