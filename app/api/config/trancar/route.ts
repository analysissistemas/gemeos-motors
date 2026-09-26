import { NextResponse, type NextRequest } from "next/server";
import { AREAS_CONFIG, trancarConfig, type AreaConfig } from "@/lib/auth/desbloqueio";

/* Chamada pelo navegador (sendBeacon) ao fechar a aba ou recarregar Configurações/IA:
   apaga o cookie de desbloqueio para a senha ser pedida de novo. Só apaga, então não
   precisa de login — no máximo alguém tranca a própria tela. */
export async function POST(req: NextRequest) {
  const area = req.nextUrl.searchParams.get("area") as AreaConfig | null;
  if (area && AREAS_CONFIG.includes(area)) await trancarConfig(area);
  return new NextResponse(null, { status: 204 });
}
