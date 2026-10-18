/* Qualificação automática do lead pelo que a IA aprendeu na conversa (pedido do dono, 27/09/2026:
   converter venda e aumentar o faturamento). Regra pura, sem banco, para os testes rodarem no Node.

   Temperatura:
   - quente: sabe a moto de interesse E a forma de pagamento, ou o cliente pediu proposta / quer comprar;
   - morno: sabe a moto de interesse ou o uso;
   - frio: o resto (só cumprimentou, perguntou algo solto).
   Ela vira a "intenção de compra" da triagem da conversa (alta / média / baixa), que a tela já mostra. */
import type { TriagemIa } from "../db/schema";
import type { FatosLead } from "./workflow/util";
import { lerNecessidade, resumoDaNecessidade } from "./necessidade.ts";

export type Temperatura = "quente" | "morno" | "frio";

export const INTENCAO_DA_TEMPERATURA = { quente: "alta", morno: "media", frio: "baixa" } as const;
export const ROTULO_TEMPERATURA: Record<Temperatura, string> = { quente: "Quente", morno: "Morno", frio: "Frio" };

const tem = (v?: string | null) => !!v && !!v.trim();

export function temperaturaDoLead(f: FatosLead, sinais: { pediuProposta?: boolean } = {}): Temperatura {
  if (sinais.pediuProposta || (tem(f.interesse) && tem(f.pagamento))) return "quente";
  if (tem(f.interesse) || tem(f.uso)) return "morno";
  return "frio";
}

export function temperaturaDaIntencao(i?: string | null): Temperatura | null {
  return i === "alta" ? "quente" : i === "media" ? "morno" : i === "baixa" ? "frio" : null;
}

/** "Não tenho", "nenhuma", "sem troca" contam como sem troca. */
export function temTroca(troca?: string | null): boolean | null {
  if (!tem(troca)) return null;
  return !/^\s*(n[aã]o|nenhum|nenhuma|sem\b|nada)/i.test(troca!);
}

const CAMPOS: [keyof FatosLead, string][] = [
  ["nome", "nome"],
  ["interesse", "moto de interesse"],
  ["uso", "uso"],
  ["pagamento", "forma de pagamento"],
  ["troca", "troca"],
  ["cidade", "cidade"],
];

/** Triagem da conversa montada a partir dos fatos (mantém o que a triagem anterior já tinha). A necessidade da
 *  qualificação (uso, km por dia, garupa/carga, faixa de valor) entra no "Falta perguntar" do vendedor. */
export function triagemDosFatos(f: FatosLead, resumo: string | null, anterior: TriagemIa | null, sinais: { pediuProposta?: boolean } = {}): TriagemIa {
  const temperatura = temperaturaDoLead(f, sinais);
  const troca = temTroca(f.troca);
  const n = lerNecessidade(f.necessidade);
  const necessidade = resumoDaNecessidade(n) || null;
  const daQualificacao: [boolean, string][] = [
    [!!n.uso || tem(f.uso), "uso"],
    [!!n.kmDia, "km por dia"],
    [n.garupa !== null || n.carga !== null, "garupa ou carga"],
    [!!(n.faixaAte || n.faixaDe || n.maisBarata), "faixa de valor"],
  ];
  const outros = CAMPOS.filter(([k]) => k !== "uso");
  return {
    resumo: resumo?.trim() || anterior?.resumo || "",
    interesse: tem(f.interesse) ? f.interesse!.trim() : (anterior?.interesse ?? null),
    veiculo: anterior?.veiculo ?? null,
    temTroca: troca ?? anterior?.temTroca ?? null,
    trocaDescricao: troca ? f.troca!.trim() : troca === false ? null : (anterior?.trocaDescricao ?? null),
    intencaoCompra: INTENCAO_DA_TEMPERATURA[temperatura],
    dadosColetados: [...outros.filter(([k]) => tem(f[k])).map(([, r]) => r), ...daQualificacao.filter(([ok]) => ok).map(([, r]) => r)],
    faltaPerguntar: [...daQualificacao.filter(([ok]) => !ok).map(([, r]) => r), ...outros.filter(([k]) => !tem(f[k])).map(([, r]) => r)],
    prontoParaHumano: anterior?.prontoParaHumano ?? false,
    necessidade: necessidade ?? anterior?.necessidade ?? null,
  };
}
