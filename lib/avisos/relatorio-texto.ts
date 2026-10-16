/* Textos do relatório das 8h no WhatsApp do Milton (dono, 16/10/2026). Puro, sem banco. */

/** Resumo que o WhatsApp precisa (sai de lib/consultas/relatorio-manha.ts). */
export type ResumoRelatorio = {
  conversasOntem: number;
  vendasOntem: number;
  valorOntem: number;
  vendasMes: number;
  valorMes: number;
  prontos: { nome: string; porque: string }[];
  esperando: string[];
  retiradas: string[];
  testDrives: string[];
  atrasados: number;
  disponiveis: number;
  semUnidade: string[];
  procuradosSemEstoque: string[];
  nota: number | null;
  maiorEsperaMin: number | null;
  sugestoes: string[];
  plano: string[];
};

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const pl = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;
/* parâmetro de modelo da Meta: sem quebra de linha, sem 5 espaços seguidos, curto */
const param = (s: string) => s.replace(/\s+/g, " ").trim().slice(0, 300) || "—";

/** Modelo "relatorio_manha" (categoria Utilidade). Criado pelo sistema na conta da loja (autorizado em 16/10/2026). */
export const MODELO_RELATORIO = {
  nome: "relatorio_manha",
  idioma: "pt_BR",
  definicao: {
    name: "relatorio_manha",
    language: "pt_BR",
    category: "UTILITY",
    components: [
      {
        type: "BODY",
        text: "Bom dia, {{1}}! Relatório da manhã da Gêmeos Motors.\n\nOntem: {{2}}.\nHoje: {{3}}.\nSugestões da IA: {{4}}.\n\nO relatório completo, separado por área, está no sistema.",
        example: { body_text: [["Milton", "5 conversas, 1 venda (R$ 3.000)", "3 clientes prontos para fechar, 6 follow-ups atrasados", "6 melhorias para aprovar"]] },
      },
      { type: "BUTTONS", buttons: [{ type: "URL", text: "Abrir relatório", url: "https://gemeosmotors.com.br/sistema/relatorio" }] },
    ],
  },
} as const;

function linhaHoje(r: ResumoRelatorio) {
  const partes = [
    r.prontos.length && pl(r.prontos.length, "cliente pronto para fechar", "clientes prontos para fechar"),
    r.esperando.length && pl(r.esperando.length, "cliente esperando resposta", "clientes esperando resposta"),
    r.retiradas.length && pl(r.retiradas.length, "retirada", "retiradas"),
    r.testDrives.length && pl(r.testDrives.length, "test drive/visita", "test drives/visitas"),
    r.atrasados && pl(r.atrasados, "follow-up atrasado", "follow-ups atrasados"),
    r.procuradosSemEstoque.length && pl(r.procuradosSemEstoque.length, "modelo procurado sem estoque", "modelos procurados sem estoque"),
  ].filter(Boolean);
  return partes.length ? partes.join(", ") : "nada pendente";
}

/** Os 4 campos do modelo. */
export function parametrosRelatorio(nome: string, r: ResumoRelatorio): string[] {
  return [
    param(nome),
    param(`${pl(r.conversasOntem, "conversa", "conversas")}, ${pl(r.vendasOntem, "venda", "vendas")}${r.valorOntem ? ` (${brl(r.valorOntem)})` : ""}`),
    param(linhaHoje(r)),
    param(r.sugestoes.length ? `${pl(r.sugestoes.length, "melhoria", "melhorias")} para aprovar` : "nenhuma nova"),
  ];
}

/** Relatório inteiro em texto (dentro da janela de 24 h), separado por área, no formato do WhatsApp. */
export function textoRelatorioWhatsApp(nome: string, r: ResumoRelatorio): string {
  const lista = (xs: string[], n = 5) => xs.slice(0, n).map((x) => `• ${x}`).join("\n");
  const blocos = [
    `☀️ *Bom dia, ${nome}! Relatório da manhã*`,
    r.plano.length ? `📋 *Plano de ação de hoje*\n${r.plano.slice(0, 8).map((p, i) => `${i + 1}. ${p}`).join("\n")}` : "📋 *Plano de ação*: nada pendente registrado.",
    `💬 *Atendimento (ontem)*\n${pl(r.conversasOntem, "conversa", "conversas")}${r.nota != null ? ` · nota ${String(r.nota).replace(".", ",")}` : ""}${r.maiorEsperaMin != null ? ` · maior espera ${r.maiorEsperaMin} min` : ""}${r.esperando.length ? `\nEsperando a loja agora:\n${lista(r.esperando)}` : "\nNinguém esperando resposta."}`,
    `📈 *Vendas*\nOntem: ${pl(r.vendasOntem, "venda", "vendas")}${r.valorOntem ? ` (${brl(r.valorOntem)})` : ""} · no mês: ${r.vendasMes}${r.valorMes ? ` (${brl(r.valorMes)})` : ""}${r.prontos.length ? `\nProntos para fechar:\n${lista(r.prontos.map((p) => `${p.nome}: ${p.porque.toLowerCase()}`))}` : ""}`,
    `📦 *Estoque*\n${pl(r.disponiveis, "moto disponível", "motos disponíveis")}${r.semUnidade.length ? `\nSem unidade: ${r.semUnidade.join(", ")}` : ""}${r.procuradosSemEstoque.length ? `\nProcurados sem estoque: ${r.procuradosSemEstoque.join(", ")}` : ""}`,
    r.retiradas.length + r.testDrives.length ? `📅 *Hoje na loja*\n${lista([...r.retiradas, ...r.testDrives], 8)}` : null,
    r.sugestoes.length ? `🤖 *O que a IA sugere*\n${lista(r.sugestoes, 4)}` : null,
    "Tudo no sistema: gemeosmotors.com.br/sistema/relatorio",
  ];
  return blocos.filter(Boolean).join("\n\n");
}
