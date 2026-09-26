import "server-only";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";

const CHAVE = "whatsapp.api_oficial";

type Guardado = {
  ativo: boolean;
  telefone: string;
  phoneNumberId: string;
  wabaId: string;
  verifyToken: string;
  tokenCifrado: string;
  appSecretCifrado: string;
};

export type ConfigWhatsApp = {
  ativo: boolean;
  telefone: string;
  phoneNumberId: string;
  wabaId: string;
  verifyToken: string;
  token: string;
  appSecret: string;
};

const VAZIO: Guardado = { ativo: false, telefone: "", phoneNumberId: "", wabaId: "", verifyToken: "", tokenCifrado: "", appSecretCifrado: "" };

/* Token e segredo do app ficam cifrados (AES-256-GCM) no banco; a chave sai do
   SESSION_SECRET, que só existe na aba Ambiente do EasyPanel. O repositório é público: nada disso
   pode aparecer em arquivo. */
function chave() {
  const s = process.env.SESSION_SECRET;
  if (!s) throw new Error("SESSION_SECRET ausente");
  return createHash("sha256").update(`whatsapp-config:${s}`).digest();
}

function cifrar(texto: string) {
  if (!texto) return "";
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", chave(), iv);
  const dados = Buffer.concat([c.update(texto, "utf8"), c.final()]);
  return [iv, c.getAuthTag(), dados].map((b) => b.toString("base64")).join(".");
}

function decifrar(valor: string) {
  if (!valor) return "";
  try {
    const [iv, tag, dados] = valor.split(".").map((p) => Buffer.from(p, "base64"));
    const d = createDecipheriv("aes-256-gcm", chave(), iv);
    d.setAuthTag(tag);
    return Buffer.concat([d.update(dados), d.final()]).toString("utf8");
  } catch {
    return "";
  }
}

async function lerGuardado(): Promise<Guardado> {
  const [l] = await db.select({ valor: schema.configuracoes.valor }).from(schema.configuracoes).where(eq(schema.configuracoes.chave, CHAVE)).limit(1);
  return { ...VAZIO, ...((l?.valor as Partial<Guardado> | undefined) ?? {}) };
}

/** Configuração completa (com token decifrado) — só para uso no servidor. */
export async function lerConfigWhatsApp(): Promise<ConfigWhatsApp> {
  const g = await lerGuardado();
  return {
    ativo: g.ativo,
    telefone: g.telefone,
    phoneNumberId: g.phoneNumberId,
    wabaId: g.wabaId,
    verifyToken: g.verifyToken || process.env.WHATSAPP_VERIFY_TOKEN || "",
    token: decifrar(g.tokenCifrado) || process.env.WHATSAPP_TOKEN || "",
    appSecret: decifrar(g.appSecretCifrado) || process.env.WHATSAPP_APP_SECRET || "",
  };
}

/** Versão para a tela: nunca leva token nem segredo, só se existem. */
export async function lerConfigParaTela() {
  const c = await lerConfigWhatsApp();
  return {
    ativo: c.ativo,
    telefone: c.telefone,
    phoneNumberId: c.phoneNumberId || process.env.WHATSAPP_PHONE_NUMBER_ID || "",
    wabaId: c.wabaId,
    verifyToken: c.verifyToken,
    tokenSalvo: !!c.token,
    appSecretSalvo: !!c.appSecret,
  };
}

export type EntradaConfig = {
  ativo: boolean;
  telefone: string;
  phoneNumberId: string;
  wabaId: string;
  /** vazio = manter o que já está salvo */
  token?: string;
  appSecret?: string;
};

export async function salvarConfigWhatsApp(e: EntradaConfig, usuarioId: number) {
  const atual = await lerGuardado();
  const novo: Guardado = {
    ...atual,
    ativo: e.ativo,
    telefone: e.telefone,
    phoneNumberId: e.phoneNumberId,
    wabaId: e.wabaId,
    tokenCifrado: e.token ? cifrar(e.token) : atual.tokenCifrado,
    appSecretCifrado: e.appSecret ? cifrar(e.appSecret) : atual.appSecretCifrado,
  };
  await gravar(novo, usuarioId);
}

export async function gerarVerifyToken(usuarioId: number) {
  const atual = await lerGuardado();
  const verifyToken = `gm_${randomBytes(24).toString("hex")}`;
  await gravar({ ...atual, verifyToken }, usuarioId);
  return verifyToken;
}

async function gravar(valor: Guardado, usuarioId: number) {
  await db
    .insert(schema.configuracoes)
    .values({ chave: CHAVE, valor, atualizadoPor: usuarioId })
    .onConflictDoUpdate({ target: schema.configuracoes.chave, set: { valor, atualizadoEm: new Date(), atualizadoPor: usuarioId } });
}

/** Endereço público que a Meta chama: o domínio em SITE_URL (aba Ambiente do EasyPanel). */
export function urlCallback() {
  const host = (process.env.SITE_URL || "teste.gemeosmotors.com.br").replace(/^https?:\/\//, "").replace(/\/+$/, "");
  return `https://${host}/api/webhooks/whatsapp`;
}
