/** IP do cliente a partir de cabeçalhos que a Vercel define (o visitante não
 *  consegue forjar). x-forwarded-for cru NÃO é confiável: o visitante pode
 *  mandar o próprio valor. Fora da Vercel (dev local) devolve null. */
export function ipConfiavel(h: { get(nome: string): string | null }): string | null {
  const v = h.get("x-vercel-forwarded-for") ?? h.get("x-real-ip");
  const ip = v?.split(",")[0]?.trim();
  return ip && ip.length <= 64 ? ip : null;
}
