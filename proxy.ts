import { NextResponse, type NextRequest } from "next/server";

/* 1) MANUTENÇÃO: com MODO_MANUTENCAO=1, quem não está num endereço liberado vê só a página
      "em manutenção" (503, sem indexar). O webhook do WhatsApp continua ligado, para não perder
      mensagem de cliente. Endereços liberados: MANUTENCAO_LIBERADOS (separados por vírgula);
      localhost sempre passa.
   2) Sessão: sem cookie, nem tenta renderizar o sistema — manda para o login. A checagem de
      verdade (assinatura, usuário ativo, permissão) acontece em lib/auth/dal.ts. */

const PAGINA_MANUTENCAO = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Gêmeos Motors — voltamos já</title><style>html,body{margin:0;height:100%;background:#000;color:#f5f5f7;font-family:system-ui,-apple-system,Segoe UI,sans-serif}main{min-height:100dvh;display:grid;place-items:center;text-align:center;padding:24px}.c{max-width:440px}.t{display:inline-block;border:1px solid rgba(242,197,24,.4);color:#f2c518;border-radius:999px;padding:4px 12px;font-size:11px;letter-spacing:.18em;text-transform:uppercase;font-weight:600}h1{font-size:26px;margin:22px 0 10px;letter-spacing:-.01em}p{color:#a1a1a6;line-height:1.55;font-size:15px;margin:0}.b{display:inline-block;margin-top:26px;background:#f2c518;color:#000;text-decoration:none;font-weight:600;border-radius:999px;padding:12px 22px}</style></head><body><main><div class="c"><span class="t">Gêmeos Motors</span><h1>Estamos preparando novidades</h1><p>Nosso site está em manutenção e volta em breve. Para falar com a gente agora, chame no WhatsApp.</p><a class="b" href="https://wa.me/5511948709625">Chamar no WhatsApp</a></div></main></body></html>`;

function emManutencao(request: NextRequest) {
  if (process.env.MODO_MANUTENCAO !== "1") return false;
  const host = (request.headers.get("host") ?? "").split(":")[0].toLowerCase();
  if (host === "localhost" || host === "127.0.0.1") return false;
  const liberados = (process.env.MANUTENCAO_LIBERADOS ?? "teste.gemeosmotors.com.br").split(",").map((h) => h.trim().toLowerCase());
  return !liberados.includes(host);
}

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  if (pathname.startsWith("/api/webhooks/")) return NextResponse.next();

  if (emManutencao(request)) {
    if (pathname.startsWith("/api/")) return NextResponse.json({ erro: "Em manutenção" }, { status: 503, headers: { "Retry-After": "3600" } });
    return new NextResponse(PAGINA_MANUTENCAO, {
      status: 503,
      headers: { "Content-Type": "text/html; charset=utf-8", "Retry-After": "3600", "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" },
    });
  }

  if (pathname.startsWith("/sistema") && !request.cookies.has("gm_sessao")) {
    const url = new URL("/login", request.url);
    const destino = pathname + search;
    if (destino !== "/sistema") url.searchParams.set("de", destino);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

/* tudo, menos os arquivos internos do Next e o ícone */
export const config = { matcher: ["/((?!_next/|favicon.ico).*)"] };
