import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, schema } from "@/lib/db";
import { autorizar, ErroAcesso } from "@/lib/auth/dal";
import { registrarLog } from "@/lib/logs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { guardarMidia } from "@/lib/mensageria/midia";
import { compactarVideoAte } from "@/lib/mensageria/compactar";

/* Vídeo da moto no catálogo (Estoque → Catálogo → editar modelo). A IA manda esse vídeo no WhatsApp
   junto com a ficha da moto. Rota própria (e não ação de servidor) porque a ação aceita só 4 MB.
   Aceita até 100 MB (proxyClientMaxBodySize no next.config): vídeo do celular passa fácil de 10 MB. Acima de 10 MB
   compacta na hora (720p), porque o WhatsApp aceita até 16 MB (dono, 17/10/2026: "todo vídeo que eu coloco fala que
   passa de 10 MB"). Fica no volume de mídia (/data), como os vídeos do chat. */
const VIDEO_LIMITE_BYTES = 100 * 1024 * 1024;
const VIDEO_DIRETO_BYTES = 10 * 1024 * 1024;
const WHATSAPP_LIMITE_BYTES = 16 * 1024 * 1024;

async function compactarNaHora(bytes: Uint8Array): Promise<Uint8Array> {
  const pasta = await mkdtemp(join(tmpdir(), "video-moto-"));
  try {
    const entrada = join(pasta, "original.mp4");
    const saida = join(pasta, "leve.mp4");
    await writeFile(entrada, bytes);
    await compactarVideoAte(entrada, saida, WHATSAPP_LIMITE_BYTES - 512 * 1024);
    return new Uint8Array(await readFile(saida));
  } finally {
    await rm(pasta, { recursive: true, force: true });
  }
}

const ehMp4 = (b: Uint8Array) => b.length > 12 && String.fromCharCode(...b.subarray(4, 8)) === "ftyp";

async function modeloDe(ctx: { params: Promise<{ id: string }> }) {
  const id = Number((await ctx.params).id);
  if (!Number.isInteger(id) || id <= 0) return null;
  const [m] = await db.select({ id: schema.modelos.id, nome: schema.modelos.nome, videoUrl: schema.modelos.videoUrl }).from(schema.modelos).where(eq(schema.modelos.id, id)).limit(1);
  return m ?? null;
}

const erro = (mensagem: string, status: number) => NextResponse.json({ erro: mensagem }, { status });

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const u = await autorizar("estoque.editar");
    const m = await modeloDe(ctx);
    if (!m) return erro("Modelo não encontrado.", 404);
    const dados = await req.formData().catch(() => null);
    const arquivo = dados?.get("video");
    if (!(arquivo instanceof File) || arquivo.size === 0) return erro("Escolha um vídeo.", 400);
    if (arquivo.size > VIDEO_LIMITE_BYTES) return erro("O vídeo passa de 100 MB. Mande um mais curto.", 413);
    let bytes: Uint8Array = new Uint8Array(await arquivo.arrayBuffer());
    if (!ehMp4(bytes)) return erro("Use um vídeo MP4 (o formato do celular).", 400);
    if (bytes.length > VIDEO_DIRETO_BYTES) bytes = await compactarNaHora(bytes);
    if (bytes.length > WHATSAPP_LIMITE_BYTES) return erro("Mesmo compactado, o vídeo ficou grande demais para o WhatsApp (16 MB). Mande um mais curto, de até 1 minuto.", 413);
    const midia = await guardarMidia(bytes, `video-${m.nome}.mp4`, "video/mp4");
    await db.transaction(async (tx) => {
      await tx.update(schema.modelos).set({ videoUrl: midia.url }).where(eq(schema.modelos.id, m.id));
      await registrarLog(u, { acao: "modelo.video_alterado", entidade: "modelo", entidadeId: m.id, descricao: `${m.videoUrl ? "Trocou" : "Colocou"} o vídeo do ${m.nome}` }, tx);
    });
    revalidatePath("/sistema/estoque");
    return NextResponse.json({ videoUrl: midia.url });
  } catch (e) {
    if (e instanceof ErroAcesso) return erro(e.message, 403);
    console.error("[catalogo] vídeo não gravou", e);
    return erro("Não foi possível guardar o vídeo agora. Tente de novo.", 500);
  }
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const u = await autorizar("estoque.editar");
    const m = await modeloDe(ctx);
    if (!m) return erro("Modelo não encontrado.", 404);
    await db.transaction(async (tx) => {
      await tx.update(schema.modelos).set({ videoUrl: null }).where(eq(schema.modelos.id, m.id));
      await registrarLog(u, { acao: "modelo.video_removido", entidade: "modelo", entidadeId: m.id, descricao: `Removeu o vídeo do ${m.nome}` }, tx);
    });
    revalidatePath("/sistema/estoque");
    return NextResponse.json({ videoUrl: null });
  } catch (e) {
    if (e instanceof ErroAcesso) return erro(e.message, 403);
    return erro("Não foi possível remover o vídeo agora.", 500);
  }
}
