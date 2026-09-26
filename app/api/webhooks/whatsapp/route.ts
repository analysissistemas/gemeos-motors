import { createHmac, timingSafeEqual } from "node:crypto";
import { after, NextResponse, type NextRequest } from "next/server";
import { aplicarStatus, executarTriagem, receberMensagem, triagemAutomaticaLigada } from "@/lib/mensageria/servico";
import { obterProvedor, ProvedorWhatsAppCloud } from "@/lib/mensageria/provedores";
import { armazenamentoDisponivel, guardarMidia } from "@/lib/mensageria/midia";
import { lerConfigWhatsApp } from "@/lib/mensageria/whatsapp-config";
import { analisarMensagemEntrante } from "@/lib/servicos/ligacoes";
import { medirDuracao } from "@/lib/mensageria/audio-formatos";
import type { MensagemEntrante, Midia, TipoMensagem } from "@/lib/mensageria/tipos";

/* ============================================================
   WEBHOOK DO WHATSAPP (Cloud API da Meta)
   Cadastrado no app da Meta com o endereço e o token de verificação que
   aparecem em Configurações > WhatsApp API Oficial. A verificação (GET)
   funciona assim que o token existe; as mensagens (POST) só são aceitas
   com a API Oficial ATIVA e o segredo do app salvo, porque a assinatura
   de cada chamada é conferida.
   ============================================================ */

const desligado = () => NextResponse.json({ erro: "WhatsApp real não configurado (sistema em modo simulado)" }, { status: 503 });

/** Validação do webhook pela Meta (hub.challenge). */
export async function GET(req: NextRequest) {
  const { verifyToken } = await lerConfigWhatsApp();
  if (!verifyToken) return desligado();
  const p = req.nextUrl.searchParams;
  const enviado = p.get("hub.verify_token") ?? "";
  const confere = enviado.length === verifyToken.length && timingSafeEqual(Buffer.from(enviado), Buffer.from(verifyToken));
  if (p.get("hub.mode") === "subscribe" && confere) {
    return new Response(p.get("hub.challenge") ?? "", { status: 200 });
  }
  return NextResponse.json({ erro: "token de verificação não confere" }, { status: 403 });
}

type ValorMeta = {
  contacts?: { profile?: { name?: string }; wa_id?: string }[];
  messages?: { id: string; from: string; type: string; text?: { body?: string }; image?: { id: string; caption?: string; mime_type?: string }; document?: { id: string; filename?: string; mime_type?: string; caption?: string }; audio?: { id: string; mime_type?: string } }[];
  statuses?: { id: string; status: "sent" | "delivered" | "read" | "failed"; errors?: { code?: number; title?: string; message?: string; error_data?: { details?: string } }[] }[];
};

export async function POST(req: NextRequest) {
  const cfg = await lerConfigWhatsApp();
  const { appSecret } = cfg;
  if ((await obterProvedor()).simulado || !appSecret) return desligado();
  const bruto = await req.text();
  const assinatura = req.headers.get("x-hub-signature-256") ?? "";
  const esperado = "sha256=" + createHmac("sha256", appSecret).update(bruto).digest("hex");
  if (assinatura.length !== esperado.length || !timingSafeEqual(Buffer.from(assinatura), Buffer.from(esperado))) {
    return NextResponse.json({ erro: "assinatura inválida" }, { status: 401 });
  }
  let corpo: { entry?: { changes?: { value?: ValorMeta }[] }[] };
  try {
    corpo = JSON.parse(bruto);
  } catch {
    return NextResponse.json({ erro: "corpo inválido" }, { status: 400 });
  }
  const recebidas: MensagemEntrante[] = [];
  for (const entrada of corpo.entry ?? []) {
    for (const mudanca of entrada.changes ?? []) {
      const v = mudanca.value ?? {};
      for (const s of v.statuses ?? []) {
        if (s.status === "sent") continue;
        /* a Meta explica a falha em error_data.details; o título sozinho costuma ser genérico */
        const e = s.errors?.[0];
        const erro = e ? [e.error_data?.details ?? e.message ?? e.title, e.code ? `código ${e.code}` : null].filter(Boolean).join(" — ") : undefined;
        await aplicarStatus(s.id, s.status, erro);
      }
      for (const m of v.messages ?? []) {
        const nome = v.contacts?.find((c) => c.wa_id === m.from)?.profile?.name ?? null;
        const tipo: TipoMensagem = m.type === "text" ? "texto" : m.type === "image" ? "imagem" : m.type === "document" ? "documento" : m.type === "audio" ? "audio" : "texto";
        const baixado = await baixarEGuardar(cfg, m);
        recebidas.push({
          canal: "whatsapp",
          provedor: "whatsapp_cloud",
          telefone: m.from,
          nomeContato: nome,
          externoId: m.id,
          tipo,
          conteudo: m.text?.body ?? m.image?.caption ?? m.document?.caption ?? (tipo === "texto" ? `[${m.type}]` : null),
          midia: baixado.midia,
          metadados: { mediaId: m.image?.id ?? m.document?.id ?? m.audio?.id, mime: m.image?.mime_type ?? m.document?.mime_type ?? m.audio?.mime_type, arquivo: m.document?.filename, ...(baixado.duracao ? { duracao: baixado.duracao } : {}) },
        });
      }
    }
  }
  const conversas: number[] = [];
  const paraAnalisar: { id: number; texto: string }[] = [];
  for (const m of recebidas) {
    const r = await receberMensagem(m);
    if (r.conversaId && r.modo === "ia") conversas.push(r.conversaId);
    if (r.conversaId && m.tipo === "texto" && m.conteudo) paraAnalisar.push({ id: r.conversaId, texto: m.conteudo });
  }
  /* responde rápido para a Meta; a leitura de intenções (ligação, follow-up) e a triagem rodam depois */
  after(async () => {
    for (const a of paraAnalisar) await analisarMensagemEntrante(a.id, a.texto);
  });
  if (conversas.length && (await triagemAutomaticaLigada())) after(async () => {
    for (const id of new Set(conversas)) await executarTriagem(id);
  });
  return NextResponse.json({ ok: true });
}

type MensagemMeta = NonNullable<ValorMeta["messages"]>[number];

/* A Meta manda só o id da mídia: baixamos com o token e guardamos no disco do
   VPS (volume /data, fora do alcance público). Se falhar, a mensagem entra mesmo
   assim, sem o arquivo. */
async function baixarEGuardar(cfg: Awaited<ReturnType<typeof lerConfigWhatsApp>>, m: MensagemMeta): Promise<{ midia: Midia | null; duracao: number | null }> {
  const anexo = m.image ?? m.document ?? m.audio;
  if (!anexo || !armazenamentoDisponivel()) return { midia: null, duracao: null };
  try {
    const arq = await new ProvedorWhatsAppCloud(cfg).baixarMidia(anexo.id);
    if (!arq) return { midia: null, duracao: null };
    const ext = arq.mime.split("/")[1]?.split(";")[0] ?? "bin";
    const nome = (m.document && m.document.filename) || `${m.type}-${m.id.slice(-8)}.${ext}`;
    /* duração do áudio recebido: lida do arquivo, nunca inventada */
    const duracao = m.audio ? await medirDuracao(arq.bytes, arq.mime) : null;
    return { midia: await guardarMidia(arq.bytes, nome, arq.mime), duracao };
  } catch {
    return { midia: null, duracao: null };
  }
}
