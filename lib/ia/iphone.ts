/* iPhone é com a outra loja (Milton, 29/10/2026: "iPhone já é bom ele redirecionar ao outro número ou outro Instagram e
   não tratar desse assunto"; a IA tinha aceitado iPhone na troca). Qualquer assunto de iPhone ou Apple (comprar, vender,
   dar na troca): a IA não trata e indica o Instagram da Gêmeos do iPhone. Puro, sem banco. */

export const INSTAGRAM_IPHONE = "@gemeosdoiphone";

const norm = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/\s+/g, " ").trim();
const RX_APPLE = /\b(?:iphone|iphones|ipad|apple\s?watch|airpods?|macbook)\b/;

export const falouDeIphone = (texto: string) => RX_APPLE.test(norm(texto));

export const textoIphone = (nome: string | null) =>
  `${nome ? `${nome}, aqui` : "Aqui"} na Gêmeos Motors a gente trabalha só com as motos, então de iPhone eu não consigo tratar por aqui 🙏\n\nPra iPhone (comprar, vender ou dar na troca), fale com a Gêmeos do iPhone no Instagram: *${INSTAGRAM_IPHONE}* 📲\n\nSe quiser ver as motos, é só me falar!`;
