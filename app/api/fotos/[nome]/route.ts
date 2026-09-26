import { NextResponse } from "next/server";
import { obterUsuario } from "@/lib/auth/dal";
import { lerFoto } from "@/lib/fotos";

/* Entrega a foto de perfil (equipe ou cliente) só para quem está logado. Todo
   perfil vê clientes e colegas, então basta a sessão. O nome do arquivo muda a
   cada troca de foto, por isso o navegador pode guardar a cópia por um bom tempo. */
export async function GET(_req: Request, ctx: { params: Promise<{ nome: string }> }) {
  const u = await obterUsuario();
  if (!u) return NextResponse.json({ erro: "sessão expirada" }, { status: 401 });

  const { nome } = await ctx.params;
  const foto = await lerFoto(decodeURIComponent(nome));
  if (!foto) return NextResponse.json({ erro: "foto não encontrada" }, { status: 404 });

  return new Response(new Uint8Array(foto.bytes), {
    headers: {
      "Content-Type": foto.mime,
      "Content-Length": String(foto.bytes.byteLength),
      "Cache-Control": "private, max-age=604800, immutable",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'",
    },
  });
}
