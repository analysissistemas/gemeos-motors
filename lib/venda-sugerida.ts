/* Venda já preenchida com o que o cliente disse no WhatsApp (dono, 15/10/2026: "sim" para a venda nascer com a moto,
   o valor e o pagamento da conversa; o vendedor só confere). Puro, sem banco. */
import type { FormaPagamento } from "@/lib/dominio";

const norm = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/\s+/g, " ").trim();
const temPalavra = (texto: string, termo: string) => {
  const t = norm(termo).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return !!t && new RegExp(`(?<![\\p{L}\\p{N}])${t}(?![\\p{L}\\p{N}])`, "u").test(norm(texto));
};

export type VeiculoEscolha = { id: number; modelo: string; versao: string | null; cor: string | null; status: string; valorAnunciado: number | null };

/** A unidade do estoque que o cliente pediu: o modelo citado (o nome mais longo que aparece no texto), a cor se ele
 *  disse, e disponível antes de reservado. Null se o texto não cita modelo nenhum do estoque. */
export function escolherVeiculo(veiculos: VeiculoEscolha[], interesse: string | null): VeiculoEscolha | null {
  if (!interesse?.trim()) return null;
  const nome = (v: VeiculoEscolha) => [v.modelo, v.versao].filter(Boolean).join(" ");
  const citados = veiculos.filter((v) => temPalavra(interesse, nome(v)) || temPalavra(interesse, v.modelo));
  if (!citados.length) return null;
  const maior = Math.max(...citados.map((v) => norm(v.modelo).length));
  const doModelo = citados.filter((v) => norm(v.modelo).length === maior);
  const daCor = doModelo.filter((v) => v.cor && temPalavra(interesse, v.cor));
  const opcoes = daCor.length ? daCor : doModelo;
  return opcoes.find((v) => v.status === "disponivel") ?? opcoes[0];
}

/** A forma de pagamento que o cliente disse ("18 vezes no elo", "no pix", "cartão"). Parcelas vão na observação. */
export function pagamentoDoTexto(texto: string | null): { forma: FormaPagamento; observacao: string | null } | null {
  if (!texto?.trim()) return null;
  const t = norm(texto);
  const parcelas = /(?<![\p{N}])(\d{1,2})\s*(?:x|vezes)(?![\p{L}])/u.exec(t)?.[1];
  const bandeira = /(?<![\p{L}])(elo|visa|master(?:card)?|hiper(?:card)?|amex)(?![\p{L}])/u.exec(t)?.[1];
  const obs = [parcelas ? `${parcelas}x` : null, bandeira ? bandeira[0].toUpperCase() + bandeira.slice(1) : null].filter(Boolean).join(" no ") || null;
  if (/financ/u.test(t)) return { forma: "financiamento", observacao: null };
  if (/(?<![\p{L}])debito(?![\p{L}])/u.test(t)) return { forma: "debito", observacao: bandeira ? obs : null };
  if (parcelas || bandeira || /cartao|credito/u.test(t)) return { forma: "credito", observacao: obs };
  if (/(?<![\p{L}])pix(?![\p{L}])/u.test(t)) return { forma: "pix", observacao: null };
  if (/dinheiro|especie/u.test(t)) return { forma: "dinheiro", observacao: null };
  if (/transfer|\bted\b/u.test(t)) return { forma: "transferencia", observacao: null };
  return null;
}

/** "Pagamento: ..." mais recente nas observações do negócio (a IA anota ao receber os dados do pedido). */
export function pagamentoDasObservacoes(obs: string | null): string | null {
  const todos = [...(obs ?? "").matchAll(/Pagamento:\s*([^\n]+)/giu)].map((m) => m[1].trim()).filter((p) => !/a confirmar/iu.test(p));
  return todos.at(-1) ?? null;
}
