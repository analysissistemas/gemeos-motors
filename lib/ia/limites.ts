/* Assuntos em que a IA não improvisa (compilado de 20/10/2026, testado no Simulador): ela respondeu "para um jovem de 13
   anos, nossas motos são seguras e indicadas" e "a legislação recomenda motos até 32 km/h". Dono, 21/10/2026: não
   precisa passar para a equipe; vai um texto fixo, sem falar de lei. Puro: sem banco. */

const semAcento = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

/** "meu filho de 13 anos pode andar?", "é autorizado pessoa de 13 anos?", "qual a idade mínima?". */
export function perguntaDeIdade(texto: string): boolean {
  const t = semAcento(texto);
  const idade = Array.from(t.matchAll(/(?<!\d)(\d{1,2})\s*anos/g)).some((m) => Number(m[1]) < 18);
  const menor = /\b(menor de idade|de menor|adolescente|idade minima|qual (?:a )?idade|que idade|a partir de que idade|crianca pode|criancas podem)\b/.test(t);
  return idade || menor;
}

export const TEXTO_IDADE =
  "As nossas motos elétricas não precisam de CNH nem de emplacamento 😊 Para quem é menor de idade, quem decide e se responsabiliza por pilotar são os pais ou responsáveis.";

/** "ok, obrigada! no momento não", "só isso, valeu": a resposta é uma despedida curta, sem pergunta. */
export function soDespedida(texto: string): boolean {
  const t = semAcento(texto).trim();
  if (!t || /\?/.test(t) || t.split(/\s+/).length > 10) return false;
  const resto = t
    .replace(/(?<![a-z])(ok|okay|ta|beleza|blz|certo|entendi|show|perfeito|top|tudo bem|de nada|abracos?|tchau|ate mais|ate logo|boa noite|bom dia|boa tarde|muito|mto)(?![a-z])/g, " ")
    .replace(/(?<![a-z])(obrigad[oa]s?|obgd?|brgd|brigad[oa]|valeu|vlw|agradeco)(?![a-z])/g, " ")
    .replace(/(?<![a-z])(no momento nao|por enquanto (?:e so|nao)|so isso|e so isso|era so isso|nao preciso|vou pensar)(?![a-z])/g, " ")
    .replace(/[\s.,!🙏😊🙂👍❤️]+/gu, "");
  return !resto && /(obrigad|obg|brgd|brigad|valeu|vlw|agradec|momento nao|so isso|tchau)/.test(t);
}

export function textoDespedida(nome: string | null): string {
  return `Eu que agradeço${nome ? `, ${nome}` : ""}! Quando quiser, é só me chamar por aqui 😊`;
}

/** "usar no seio" é sítio (Simulador, 20/10/2026: "Usar a moto no seio é uma opção prática"). Só a palavra solta,
 *  com "no/pro/pra/do/em": "seio" sozinho não muda. */
export function corrigirDigitacao(texto: string): string {
  return texto.replace(/\b(no|pro|pra|para o|do|ao|em|meu|nosso|o)\s+seio\b/giu, (_, a) => `${a} sítio`).replace(/\btrilah\b/giu, "trilha");
}

/* Frase que a IA escreveu juntando idade com lei/permissão ("para um jovem de 13 anos, nossas motos são seguras e
   indicadas"; "liberadas para maior de 18 anos, conforme a legislação") sai; no fim entra o texto fixo, uma vez. */
const FRASES = /(?:[^.!?\n]|[.!?](?=\d))+[.!?]*\s*(?:\p{Extended_Pictographic}️?\s*)*|\n/gu;
const RX_IDADE = /(\d{1,2}\s*anos|menor(?:es)? de (?:idade|18)|maior(?:es)? de (?:idade|18)|jovem|jovens|crian[çc]a|adolescente|idade)/iu;
const RX_PERMISSAO = /(legisla|\blei\b|\bleis\b|permitid|autorizad|liberad|indicad|segur[ao]s?\b|pode(?:m)? (?:andar|pilotar|dirigir|usar)|regras? (?:locais|de circula)|respons[áa]ve)/iu;
export function tirarFalaDeIdade(resposta: string[]): string[] {
  let tirou = false;
  const out = resposta
    .map((b) => {
      if (b === TEXTO_IDADE) return b;
      const partes = b.match(FRASES) ?? [b];
      const ficam = partes.filter((f) => {
        /* "até 32 km/h" sozinho é ficha da moto; com lei ou legislação junto, sai */
        const sai = RX_IDADE.test(f) && RX_PERMISSAO.test(f) && (/legisla|\blei\b/iu.test(f) || !/km\s*\/?\s*h|autonomia/iu.test(f));
        if (sai) tirou = true;
        return !sai;
      });
      return ficam.join("").replace(/\n{3,}/g, "\n\n").trim();
    })
    .filter((b) => /\p{L}/u.test(b));
  return tirou && !out.includes(TEXTO_IDADE) ? [...out, TEXTO_IDADE] : out;
}
