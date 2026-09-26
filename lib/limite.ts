/** Limitador simples em memória (por instância serverless): suficiente para
 *  frear abuso barato sem banco. Devolve false quando estourou o limite. */
const baldes = new Map<string, { n: number; ate: number }>();
export function limitar(chave: string, max: number, janelaMs: number, agora = Date.now()) {
  if (baldes.size > 5000) for (const [k, b] of baldes) if (b.ate < agora) baldes.delete(k);
  const b = baldes.get(chave);
  if (!b || b.ate < agora) {
    baldes.set(chave, { n: 1, ate: agora + janelaMs });
    return true;
  }
  b.n++;
  return b.n <= max;
}
