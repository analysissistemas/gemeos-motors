import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { ZodError } from "zod";
import { ErroRegra } from "@/lib/acao";
import { ipConfiavel } from "@/lib/ip";
import { LimiteReserva, criarReservaPublica } from "@/lib/servicos/reservas";

/* Formulário público de reserva de lançamento (o site chama sem login).
   Body: { modeloId, nome, whatsapp, cor?, site } — `site` é armadilha para robô.
   Resposta: { ok: true, mensagem, whatsapp } ou { ok: false, erro } (422/429/503). */
export const dynamic = "force-dynamic";

const semCache = { "Cache-Control": "no-store" };

export async function POST(req: Request) {
  let corpo: unknown;
  try {
    corpo = await req.json();
  } catch {
    return NextResponse.json({ ok: false, erro: "Pedido inválido." }, { status: 422, headers: semCache });
  }
  try {
    const ip = ipConfiavel(await headers());
    const r = await criarReservaPublica(corpo, ip);
    return NextResponse.json({ ok: true, ...r }, { headers: semCache });
  } catch (e) {
    if (e instanceof ZodError) return NextResponse.json({ ok: false, erro: e.issues[0]?.message ?? "Confira os dados." }, { status: 422, headers: semCache });
    if (e instanceof ErroRegra) return NextResponse.json({ ok: false, erro: e.message }, { status: 422, headers: semCache });
    if (e instanceof LimiteReserva) return NextResponse.json({ ok: false, erro: e.message }, { status: 429, headers: semCache });
    console.error("[vitrine/reserva]", e);
    return NextResponse.json({ ok: false, erro: "Não deu para registrar agora. Chame a gente no WhatsApp." }, { status: 503, headers: semCache });
  }
}
