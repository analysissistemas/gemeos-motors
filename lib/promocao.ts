/* Regra de promoção por tempo limitado. Pura (sem banco) para ser testada e usada por tela e vitrine.
   Vale enquanto ativa e dentro de [inicio, fim). Passou do fim, o preço normal volta sozinho. */
export type Promocao = { precoPromocional: number; inicioEm: Date; fimEm: Date; ativo: boolean };

export function promocaoVale(p: Promocao | null | undefined, agora: Date = new Date()): p is Promocao {
  return !!p && p.ativo && p.inicioEm.getTime() <= agora.getTime() && agora.getTime() < p.fimEm.getTime();
}

/** Preço a cobrar/mostrar agora e, se houver promoção vigente, quanto falta para acabar. */
export function precoVigente(precoNormal: number | null, p: Promocao | null | undefined, agora: Date = new Date()) {
  if (promocaoVale(p, agora) && p.precoPromocional > 0 && (precoNormal == null || p.precoPromocional < precoNormal)) {
    return { preco: p.precoPromocional, emPromocao: true as const, precoNormal, restanteMs: p.fimEm.getTime() - agora.getTime() };
  }
  return { preco: precoNormal, emPromocao: false as const, precoNormal, restanteMs: 0 };
}

/** "2d 03h 10min" / "03h 10min" / "10min". */
export function formatarRestante(ms: number): string {
  const min = Math.max(0, Math.floor(ms / 60000));
  const d = Math.floor(min / 1440);
  const h = Math.floor((min % 1440) / 60);
  const m = min % 60;
  const dois = (n: number) => String(n).padStart(2, "0");
  return d > 0 ? `${d}d ${dois(h)}h ${dois(m)}min` : h > 0 ? `${dois(h)}h ${dois(m)}min` : `${m}min`;
}
