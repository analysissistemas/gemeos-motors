import { NextResponse, type NextRequest } from "next/server";
import { vigiarAtendimentos } from "@/lib/ia/workflow/vigia";
import { tokenDoVigia } from "@/lib/ia/workflow/vigia-regra";

/* Chamada só pelo próprio servidor, a cada minuto (instrumentation.ts). Sem o token certo, 404. */
export async function POST(req: NextRequest) {
  const segredo = process.env.SESSION_SECRET;
  if (!segredo || req.headers.get("x-vigia") !== (await tokenDoVigia(segredo))) return new NextResponse(null, { status: 404 });
  const r = await vigiarAtendimentos();
  return NextResponse.json(r, { headers: { "Cache-Control": "no-store" } });
}
