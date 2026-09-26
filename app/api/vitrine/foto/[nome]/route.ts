import { NextResponse } from "next/server";
import { lerFotoCatalogo } from "@/lib/fotos";

/* Foto da moto numa cor, PÚBLICA (a vitrine mostra sem login). O nome é validado
   pelo formato que o sistema grava (modelo-<id>-<aleatório>.webp), então não dá
   para pedir arquivo de outra pasta. O nome muda a cada troca de foto: a cópia
   pode ficar guardada no navegador e no proxy por um ano. */
export async function GET(_req: Request, ctx: { params: Promise<{ nome: string }> }) {
  const { nome } = await ctx.params;
  let decodificado: string;
  try {
    decodificado = decodeURIComponent(nome);
  } catch {
    decodificado = "";
  }
  const foto = decodificado ? await lerFotoCatalogo(decodificado) : null;
  if (!foto) return NextResponse.json({ erro: "foto não encontrada" }, { status: 404, headers: { "Cache-Control": "no-store" } });

  return new Response(new Uint8Array(foto.bytes), {
    headers: {
      "Content-Type": foto.mime,
      "Content-Length": String(foto.bytes.byteLength),
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'",
    },
  });
}
