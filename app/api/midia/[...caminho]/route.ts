import { NextResponse, type NextRequest } from "next/server";
import { obterUsuario } from "@/lib/auth/dal";
import { pode } from "@/lib/dominio";
import { abrirMidia } from "@/lib/mensageria/midia";

/* Entrega mídia do chat guardada no Blob privado, só para quem está logado
   e tem acesso ao atendimento. */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ caminho: string[] }> }) {
  const u = await obterUsuario();
  if (!u) return NextResponse.json({ erro: "sessão expirada" }, { status: 401 });
  if (!pode(u.papel, "conversas.ver")) return NextResponse.json({ erro: "sem acesso" }, { status: 403 });

  const { caminho } = await ctx.params;
  const pathname = caminho.map(decodeURIComponent).join("/");
  if (!pathname.startsWith("chat/") || pathname.includes("..")) return NextResponse.json({ erro: "arquivo inválido" }, { status: 400 });

  const r = await abrirMidia(pathname);
  if (!r) return NextResponse.json({ erro: "arquivo não encontrado" }, { status: 404 });
  return new Response(r.stream, {
    headers: {
      "Content-Type": r.mime,
      "Content-Length": String(r.tamanho),
      "Cache-Control": "private, max-age=3600",
      "X-Content-Type-Options": "nosniff",
      ...(/^(image\/|application\/pdf)/.test(r.mime) ? {} : { "Content-Disposition": "attachment" }),
    },
  });
}
