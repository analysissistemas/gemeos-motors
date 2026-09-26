import "server-only";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { autorizar, ErroAcesso, type UsuarioAtual } from "./dal";
import { lerSessao } from "./sessao";

/* Trava das configurações (Configurações e Inteligência artificial): mesmo logado
   como admin, é preciso digitar a senha de novo A CADA ENTRADA na tela (pedido do dono,
   por segurança). Cada área tem o seu cookie assinado, preso ao usuário e à sessão;
   a tela tranca ao sair (TrancarAoSair) e o cookie vence sozinho em DESBLOQUEIO_MIN
   minutos, mesmo com a tela aberta. A conferência é feita no servidor em cada página e
   ação — a tela de senha sozinha não protege nada. */
export type AreaConfig = "config" | "ia";
export const AREAS_CONFIG: readonly AreaConfig[] = ["config", "ia"];
const cookieDe = (area: AreaConfig) => (area === "ia" ? "gm_ia" : "gm_config");
export const DESBLOQUEIO_MIN = 15;

function chave() {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) throw new Error("SESSION_SECRET ausente ou curta");
  return new TextEncoder().encode(`config:${s}`);
}

export async function liberarConfig(uid: number, area: AreaConfig) {
  const s = await lerSessao();
  if (!s || s.uid !== uid) throw new ErroAcesso("Sua sessão expirou. Entre de novo.");
  const token = await new SignJWT({ uid, v: s.v, area })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${DESBLOQUEIO_MIN}m`)
    .sign(chave());
  (await cookies()).set(cookieDe(area), token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: DESBLOQUEIO_MIN * 60,
  });
}

export async function trancarConfig(area: AreaConfig) {
  (await cookies()).delete(cookieDe(area));
}

export async function configLiberada(u: UsuarioAtual, area: AreaConfig) {
  const token = (await cookies()).get(cookieDe(area))?.value;
  if (!token) return false;
  const s = await lerSessao();
  if (!s) return false;
  try {
    const { payload } = await jwtVerify(token, chave(), { algorithms: ["HS256"] });
    return payload.uid === u.id && payload.v === s.v && payload.area === area;
  } catch {
    return false;
  }
}

/** Para as ações das configurações: admin E senha digitada há pouco. */
export async function autorizarConfig(area: AreaConfig) {
  const u = await autorizar("config.gerenciar");
  if (!(await configLiberada(u, area))) throw new ErroAcesso("Esta tela foi trancada. Recarregue a página e digite a senha de novo.");
  return u;
}
