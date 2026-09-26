/* ============================================================
   CORES DO CATÁLOGO
   Paleta de SUGESTÃO para cadastrar a cor de um modelo: os mesmos nomes e tons
   de public/cores-motos.js (a bolinha da vitrine), para o cadastro novo já nascer
   batendo com o que a vitrine conhece. Não é dado da loja: nada daqui vai para o
   banco sozinho — só quando alguém escolhe e salva.
   ============================================================ */

export const PALETA_CORES: { nome: string; hex: string }[] = [
  { nome: "Branca", hex: "#f4f5f7" },
  { nome: "Preta", hex: "#1f2020" },
  { nome: "Cinza", hex: "#7c8085" },
  { nome: "Prata", hex: "#d7dade" },
  { nome: "Bege", hex: "#e8dfcb" },
  { nome: "Vinho", hex: "#6d1f33" },
  { nome: "Vermelha", hex: "#b3122b" },
  { nome: "Azul", hex: "#1f4e79" },
  { nome: "Verde", hex: "#2c6e49" },
  { nome: "Amarela", hex: "#f2c518" },
  { nome: "Rosa", hex: "#e0a0b4" },
  { nome: "Laranja", hex: "#e2662a" },
];

/** "#ABC", "abc123", " #aabbcc " -> "#aabbcc"; qualquer outra coisa -> null. */
export function normalizarHex(v: string | null | undefined): string | null {
  const s = (v ?? "").trim().toLowerCase().replace(/^#/, "");
  if (/^[0-9a-f]{6}$/.test(s)) return `#${s}`;
  if (/^[0-9a-f]{3}$/.test(s)) return `#${s[0]}${s[0]}${s[1]}${s[1]}${s[2]}${s[2]}`;
  return null;
}

/** Cor clara demais para aparecer sozinha sobre fundo branco (ganha contorno). */
export function corClara(hex: string) {
  const h = normalizarHex(hex);
  if (!h) return false;
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  return 0.299 * r + 0.587 * g + 0.114 * b > 200;
}
