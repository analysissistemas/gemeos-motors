import { NextResponse, type NextRequest } from "next/server";
import { obterUsuario } from "@/lib/auth/dal";
import { pode } from "@/lib/dominio";
import { conversasAlteradas, mensagensDaConversa, notasDaConversa, statusRecentes } from "@/lib/consultas/conversas";
import { marcarLida, simularAndamento } from "@/lib/mensageria/servico";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";

/* ============================================================
   TEMPO REAL — hoje por consulta curta (a tela chama a cada ~3 s).
   Devolve só o que mudou desde o último instante que a tela viu.
   Quando o WhatsApp real entrar, o mesmo formato de resposta pode vir
   por SSE ou WebSocket; a tela já trata as mudanças de forma incremental.
   ============================================================ */
export async function GET(req: NextRequest) {
  const u = await obterUsuario();
  if (!u) return NextResponse.json({ erro: "sessão expirada" }, { status: 401 });
  if (!pode(u.papel, "conversas.ver")) return NextResponse.json({ erro: "sem acesso" }, { status: 403 });

  const p = req.nextUrl.searchParams;
  const desdeTxt = p.get("desde");
  const desde = desdeTxt && !Number.isNaN(Date.parse(desdeTxt)) ? new Date(desdeTxt) : new Date(Date.now() - 60_000);
  const conversaId = Number(p.get("conversa")) || null;
  const ultimaMsg = Number(p.get("ultima")) || 0;
  const agora = new Date();

  await simularAndamento(conversaId ?? undefined);
  const [conversas, mensagens, alteradas, status, notas] = await Promise.all([
    conversasAlteradas(new Date(desde.getTime() - 1500)),
    conversaId ? mensagensDaConversa(conversaId, { depoisDeId: ultimaMsg }) : Promise.resolve([]),
    /* reação, apagada, resposta: a mensagem já está na tela e mudou */
    conversaId ? mensagensDaConversa(conversaId, { alteradasDesde: new Date(desde.getTime() - 1500) }) : Promise.resolve([]),
    conversaId ? statusRecentes(conversaId) : Promise.resolve([]),
    conversaId && p.get("notas") ? notasDaConversa(conversaId) : Promise.resolve(null),
  ]);
  const [dig] = conversaId ? await db.select({ ate: schema.conversas.iaDigitandoAte }).from(schema.conversas).where(eq(schema.conversas.id, conversaId)).limit(1) : [];
  const iaDigitando = !!dig?.ate && new Date(dig.ate) > agora;
  if (conversaId && mensagens.some((m) => m.direcao === "incoming")) await marcarLida(conversaId);
  return NextResponse.json({ agora: agora.toISOString(), conversas, mensagens, alteradas, status, notas, iaDigitando }, { headers: { "Cache-Control": "no-store" } });
}
