import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { ipConfiavel } from "@/lib/ip";
import { limitar } from "@/lib/limite";
import { pdfDaVenda, respostaPdf } from "@/lib/pdf/gerar";

/* Rota pública: quem tem o link de assinatura pode ver o documento dele.
   O token é aleatório (256 bits) e só serve para aquele documento.
   Proteções: link pendente respeita a expiração; depois de assinado o PDF
   fica acessível só por 24h; limite por IP e por token; cache curto do PDF
   em memória (evita renderizar de novo a cada chamada). */
const DEPOIS_ASSINADO_MS = 24 * 60 * 60 * 1000;
const CACHE_MS = 5 * 60 * 1000;
const cache = new Map<string, { em: number; hash: string; buffer: Buffer; nome: string }>();

export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[A-Za-z0-9_-]{30,60}$/.test(token)) return NextResponse.json({ erro: "Link inválido" }, { status: 404 });
  const ip = ipConfiavel(req.headers) ?? "sem-ip";
  if (!limitar(`doc-ip:${ip}`, 30, 60_000) || !limitar(`doc-tk:${token}`, 10, 60_000))
    return NextResponse.json({ erro: "Muitas requisições. Tente em instantes." }, { status: 429, headers: { "Retry-After": "60" } });
  const [a] = await db.select().from(schema.assinaturas).where(eq(schema.assinaturas.token, token)).limit(1);
  if (!a || a.status === "cancelado" || a.documentoTipo !== "venda") return NextResponse.json({ erro: "Link inválido" }, { status: 404 });
  const agora = Date.now();
  if (a.status === "pendente" && a.expiraEm && a.expiraEm.getTime() < agora) return NextResponse.json({ erro: "Link expirado" }, { status: 410 });
  if (a.status === "assinado" && (!a.assinadoEm || agora - a.assinadoEm.getTime() > DEPOIS_ASSINADO_MS))
    return NextResponse.json({ erro: "Link expirado. Peça a via assinada à loja." }, { status: 410 });

  const chave = `${token}:${a.status}`;
  const c = cache.get(chave);
  if (c && agora - c.em < CACHE_MS && c.hash === (a.documentoHash ?? "")) return respostaPdf(c.buffer, c.nome, false);
  const pdf = await pdfDaVenda(a.documentoId);
  if (!pdf) return NextResponse.json({ erro: "Documento indisponível" }, { status: 404 });
  if (cache.size > 50) cache.clear();
  cache.set(chave, { em: agora, hash: a.documentoHash ?? "", buffer: pdf.buffer, nome: pdf.nome });
  return respostaPdf(pdf.buffer, pdf.nome, false);
}
