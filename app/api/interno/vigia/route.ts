import { NextResponse, type NextRequest } from "next/server";
import { vigiarAtendimentos } from "@/lib/ia/workflow/vigia";
import { tokenDoVigia } from "@/lib/ia/workflow/vigia-regra";
import { atualizarGasolinaSePreciso } from "@/lib/ia/gasolina";

/* Chamada só pelo próprio servidor, a cada minuto (instrumentation.ts). Sem o token certo, 404. */
export async function POST(req: NextRequest) {
  const segredo = process.env.SESSION_SECRET;
  if (!segredo || req.headers.get("x-vigia") !== (await tokenDoVigia(segredo))) return new NextResponse(null, { status: 404 });
  const r = await vigiarAtendimentos();
  /* preço da gasolina (ANP): confere a cada 12 h, sem atrasar o vigia */
  void atualizarGasolinaSePreciso().catch((e) => console.error("[gasolina ANP]", e instanceof Error ? e.message : e));
  return NextResponse.json(r, { headers: { "Cache-Control": "no-store" } });
}
