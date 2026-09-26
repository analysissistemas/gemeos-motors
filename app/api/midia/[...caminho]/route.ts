import { NextResponse, type NextRequest } from "next/server";
import { obterUsuario } from "@/lib/auth/dal";
import { pode } from "@/lib/dominio";
import { abrirMidia, caminhoValido, infoMidia } from "@/lib/mensageria/midia";

/* Entrega mídia do chat guardada no disco do VPS, só para quem está logado
   e tem acesso ao atendimento. Áudio precisa de "Range" (resposta 206): sem isso
   o Safari/iPhone não toca e nenhum navegador consegue avançar no áudio. */
export async function GET(req: NextRequest, ctx: { params: Promise<{ caminho: string[] }> }) {
  const u = await obterUsuario();
  if (!u) return NextResponse.json({ erro: "sessão expirada" }, { status: 401 });
  if (!pode(u.papel, "conversas.ver")) return NextResponse.json({ erro: "sem acesso" }, { status: 403 });

  const { caminho } = await ctx.params;
  const pathname = caminho.map(decodeURIComponent).join("/");
  if (!caminhoValido(pathname)) return NextResponse.json({ erro: "arquivo inválido" }, { status: 400 });

  const r = await infoMidia(pathname);
  if (!r) return NextResponse.json({ erro: "arquivo não encontrado" }, { status: 404 });

  const tocavel = /^(image\/|audio\/|video\/|application\/pdf)/.test(r.mime);
  const base: Record<string, string> = {
    "Content-Type": r.mime,
    "Accept-Ranges": "bytes",
    "Cache-Control": "private, max-age=3600",
    "X-Content-Type-Options": "nosniff",
    ...(tocavel ? {} : { "Content-Disposition": "attachment" }),
  };

  const faixa = /^bytes=(\d*)-(\d*)$/.exec(req.headers.get("range") ?? "");
  if (!faixa || (faixa[1] === "" && faixa[2] === "")) {
    const inteiro = await abrirMidia(pathname);
    if (!inteiro) return NextResponse.json({ erro: "arquivo não encontrado" }, { status: 404 });
    return new Response(inteiro.stream, { headers: { ...base, "Content-Length": String(r.tamanho) } });
  }

  let ini: number;
  let fim: number;
  if (faixa[1] === "") {
    ini = Math.max(r.tamanho - Number(faixa[2]), 0);
    fim = r.tamanho - 1;
  } else {
    ini = Number(faixa[1]);
    fim = faixa[2] === "" ? r.tamanho - 1 : Math.min(Number(faixa[2]), r.tamanho - 1);
  }
  if (ini >= r.tamanho || ini > fim) return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${r.tamanho}` } });

  /* lê do disco só o pedaço pedido */
  const pedaco = await abrirMidia(pathname, { ini, fim });
  if (!pedaco) return NextResponse.json({ erro: "arquivo não encontrado" }, { status: 404 });
  return new Response(pedaco.stream, { status: 206, headers: { ...base, "Content-Range": `bytes ${ini}-${fim}/${r.tamanho}`, "Content-Length": String(fim - ini + 1) } });
}
