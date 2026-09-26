import "server-only";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { autorizar, ErroAcesso, type UsuarioAtual } from "./dal";
import { lerSessao } from "./sessao";

/* Trava das configurações (Configurações e Inteligência artificial): mesmo logado
   como admin, é preciso digitar a senha de novo. O desbloqueio é um cookie assinado,
   preso ao usuário e à sessão dele, que vale DESBLOQUEIO_MIN minutos. A conferência
   é feita no servidor em cada página e ação — a tela de senha sozinha não protege nada. */
const COOKIE = "gm_config";
export const DESBLOQUEIO_MIN = 15;

function chave() {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) throw new Error("SESSION_SECRET ausente ou curta");
  return new TextEncoder().encode(`config:${s}`);
}

export async function liberarConfig(uid: number) {
  const s = await lerSessao();
  if (!s || s.uid !== uid) throw new ErroAcesso("Sua sessão expirou. Entre de novo.");
  const token = await new SignJWT({ uid, v: s.v })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${DESBLOQUEIO_MIN}m`)
    .sign(chave());
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: DESBLOQUEIO_MIN * 60,
  });
}

export async function trancarConfig() {
  (await cookies()).delete(COOKIE);
}

export async function configLiberada(u: UsuarioAtual) {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return false;
  const s = await lerSessao();
  if (!s) return false;
  try {
    const { payload } = await jwtVerify(token, chave(), { algorithms: ["HS256"] });
    return payload.uid === u.id && payload.v === s.v;
  } catch {
    return false;
  }
}

/** Para as ações das configurações: admin E senha digitada há pouco. */
export async function autorizarConfig() {
  const u = await autorizar("config.gerenciar");
  if (!(await configLiberada(u))) throw new ErroAcesso("As configurações foram trancadas. Recarregue a página e digite a senha de novo.");
  return u;
}
