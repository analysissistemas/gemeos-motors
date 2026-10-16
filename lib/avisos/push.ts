import "server-only";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import webpush from "web-push";
import { db, schema } from "@/lib/db";
import { lerHorario } from "@/lib/ia/prompt";
import { lojaAberta } from "@/lib/ia/horario";
import type { Aviso } from "./regras";

/* Aviso no celular (Web Push), dono 15/10/2026: "aviso no celular do Milton". No iPhone funciona com o sistema
   adicionado à Tela de Início (iOS 16.4+). As chaves do Web Push (VAPID) nascem sozinhas no primeiro uso e ficam no
   banco, a privada cifrada com o SESSION_SECRET (o repositório é público: nada disso vai para arquivo). As inscrições
   (um celular/navegador cada) ficam na tabela de configurações, sem migration. */

const CHAVE_VAPID = "avisos.vapid";
const CHAVE_INSCRICOES = "avisos.inscricoes";
const CHAVE_ENVIADOS = "avisos.enviados";
const REPETE_MIN = 30;

export type Inscricao = { usuarioId: number; endpoint: string; p256dh: string; auth: string; aparelho: string | null; criadoEm: string };

function chaveCifra() {
  const s = process.env.SESSION_SECRET;
  if (!s) throw new Error("SESSION_SECRET ausente");
  return createHash("sha256").update(`avisos-vapid:${s}`).digest();
}
const cifrar = (t: string) => {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", chaveCifra(), iv);
  const d = Buffer.concat([c.update(t, "utf8"), c.final()]);
  return [iv, c.getAuthTag(), d].map((b) => b.toString("base64")).join(".");
};
const decifrar = (v: string) => {
  try {
    const [iv, tag, d] = v.split(".").map((p) => Buffer.from(p, "base64"));
    const x = createDecipheriv("aes-256-gcm", chaveCifra(), iv);
    x.setAuthTag(tag);
    return Buffer.concat([x.update(d), x.final()]).toString("utf8");
  } catch {
    return "";
  }
};

async function ler<T>(chave: string): Promise<T | null> {
  const [l] = await db.select({ valor: schema.configuracoes.valor }).from(schema.configuracoes).where(eq(schema.configuracoes.chave, chave)).limit(1);
  return (l?.valor as T) ?? null;
}
async function gravar(chave: string, valor: unknown) {
  await db.insert(schema.configuracoes).values({ chave, valor }).onConflictDoUpdate({ target: schema.configuracoes.chave, set: { valor, atualizadoEm: new Date() } });
}

/** Chaves VAPID (cria no primeiro uso). Se o SESSION_SECRET mudar, a privada não abre: gera um par novo e os celulares
 *  precisam ativar os avisos de novo. */
async function chaves(): Promise<{ publica: string; privada: string }> {
  const g = await ler<{ publica: string; privadaCifrada: string }>(CHAVE_VAPID);
  const privada = g ? decifrar(g.privadaCifrada) : "";
  if (g && privada) return { publica: g.publica, privada };
  const novo = webpush.generateVAPIDKeys();
  await gravar(CHAVE_VAPID, { publica: novo.publicKey, privadaCifrada: cifrar(novo.privateKey) });
  await gravar(CHAVE_INSCRICOES, []);
  return { publica: novo.publicKey, privada: novo.privateKey };
}

export const chavePublica = async () => (await chaves()).publica;

export async function inscricoes() {
  return (await ler<Inscricao[]>(CHAVE_INSCRICOES)) ?? [];
}

export async function inscrever(usuarioId: number, s: { endpoint: string; keys: { p256dh: string; auth: string } }, aparelho: string | null) {
  const atuais = (await inscricoes()).filter((i) => i.endpoint !== s.endpoint);
  atuais.push({ usuarioId, endpoint: s.endpoint, p256dh: s.keys.p256dh, auth: s.keys.auth, aparelho: aparelho?.slice(0, 120) ?? null, criadoEm: new Date().toISOString() });
  await gravar(CHAVE_INSCRICOES, atuais.slice(-30));
}

export async function desinscrever(endpoint: string) {
  await gravar(CHAVE_INSCRICOES, (await inscricoes()).filter((i) => i.endpoint !== endpoint));
}

/** Manda o aviso para todos os celulares inscritos. Fora do horário da loja só o urgente; a mesma tag não repete em
 *  30 min. Celular que desinstalou (410/404) sai da lista. Nunca derruba quem chamou. */
export async function enviarAviso(a: Aviso, opcoes: { soPara?: number[]; ignorarHorario?: boolean } = {}) {
  try {
    const lista = (await inscricoes()).filter((i) => !opcoes.soPara || opcoes.soPara.includes(i.usuarioId));
    if (!lista.length) return { enviados: 0, motivo: "nenhum celular inscrito" };
    if (!opcoes.ignorarHorario && !a.urgente && !lojaAberta(await lerHorario())) return { enviados: 0, motivo: "loja fechada (não urgente)" };
    /* não repete a mesma tag em 30 min (marca antes de mandar: dois processos ao mesmo tempo não duplicam) */
    const agora = Date.now();
    const enviados = (await ler<Record<string, number>>(CHAVE_ENVIADOS)) ?? {};
    if (!opcoes.ignorarHorario && enviados[a.tag] && agora - enviados[a.tag] < REPETE_MIN * 60_000) return { enviados: 0, motivo: "repetido" };
    const limpos = Object.fromEntries(Object.entries(enviados).filter(([, t]) => agora - t < 24 * 3_600_000));
    await gravar(CHAVE_ENVIADOS, { ...limpos, [a.tag]: agora });

    const { publica, privada } = await chaves();
    const site = process.env.SITE_URL ? `https://${process.env.SITE_URL.replace(/^https?:\/\//, "")}` : "https://gemeosmotors.com.br";
    webpush.setVapidDetails(site, publica, privada);
    const payload = JSON.stringify({ titulo: a.titulo, corpo: a.corpo, tag: a.tag, url: a.url });
    let ok = 0;
    const mortos: string[] = [];
    await Promise.all(
      lista.map(async (i) => {
        try {
          await webpush.sendNotification({ endpoint: i.endpoint, keys: { p256dh: i.p256dh, auth: i.auth } }, payload, { TTL: 6 * 3600, urgency: a.urgente ? "high" : "normal" });
          ok++;
        } catch (e) {
          const status = (e as { statusCode?: number }).statusCode;
          if (status === 404 || status === 410) mortos.push(i.endpoint);
          else console.error("[avisos] envio", status, (e as Error).message);
        }
      }),
    );
    for (const m of mortos) await desinscrever(m);
    return { enviados: ok };
  } catch (e) {
    console.error("[avisos]", e);
    return { enviados: 0, motivo: "erro" };
  }
}

/** Nome para o aviso (cliente, perfil do WhatsApp ou telefone). Conversa do Simulador: null (teste não avisa). */
export async function quemEDaConversa(conversaId: number): Promise<{ nome: string; demo: boolean } | null> {
  const [c] = await db
    .select({ nome: sql<string | null>`coalesce(${schema.clientes.nome}, ${schema.conversas.contatoNome})`, telefone: schema.conversas.contatoTelefone, demo: schema.conversas.demo })
    .from(schema.conversas)
    .leftJoin(schema.clientes, eq(schema.clientes.id, schema.conversas.clienteId))
    .where(eq(schema.conversas.id, conversaId))
    .limit(1);
  if (!c) return null;
  const nome = c.nome && /\p{L}{2}/u.test(c.nome) ? c.nome.trim().split(/\s+/).slice(0, 2).join(" ") : c.telefone;
  /* a conversa do próprio Milton (número da equipe) não gera aviso */
  const { ehDaEquipe } = await import("./whatsapp-equipe");
  return { nome, demo: c.demo || (await ehDaEquipe(c.telefone)) };
}
