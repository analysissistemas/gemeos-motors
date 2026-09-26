/** IP do cliente a partir do cabeçalho que o proxy do VPS (Traefik, no EasyPanel)
 *  define com o endereço de quem conectou; um valor mandado pelo visitante é
 *  substituído pelo proxy. x-forwarded-for cru NÃO é confiável: o visitante pode
 *  mandar o próprio valor. Sem proxy na frente (dev local) devolve null. */
export function ipConfiavel(h: { get(nome: string): string | null }): string | null {
  const v = h.get("x-real-ip");
  const ip = v?.split(",")[0]?.trim();
  return ip && ip.length <= 64 ? ip : null;
}
