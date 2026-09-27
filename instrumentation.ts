/* Relógio do servidor: a cada minuto chama o vigia do atendente (lib/ia/workflow/vigia.ts) pela rota
   interna /api/interno/vigia, que roda com o mesmo contexto das outras rotas. VIGIA_ATENDIMENTO=0 desliga. */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.VIGIA_ATENDIMENTO === "0") return;
  const segredo = process.env.SESSION_SECRET;
  if (!segredo) return;
  const { tokenDoVigia } = await import("./lib/ia/workflow/vigia-regra");
  const token = await tokenDoVigia(segredo);
  const url = `http://127.0.0.1:${process.env.PORT || 3000}/api/interno/vigia`;
  let rodando = false;
  const ciclo = async () => {
    if (rodando) return;
    rodando = true;
    try {
      await fetch(url, { method: "POST", headers: { "x-vigia": token }, signal: AbortSignal.timeout(50_000) });
    } catch {
      /* servidor ainda subindo ou banco fora: tenta no próximo minuto */
    } finally {
      rodando = false;
    }
  };
  setInterval(ciclo, 60_000).unref?.();
}
