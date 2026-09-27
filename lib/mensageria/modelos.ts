/* Modelos de mensagem aprovados pela Meta (templates). Sem `server-only` e sem alias, para os
   testes rodarem direto no Node.

   Por quê: fora da janela de 24 h (contato novo, ou cliente calado há mais de um dia) a Meta
   só deixa a loja escrever com um modelo aprovado (erro 131047). O modelo é criado e aprovado
   no Gerenciador do WhatsApp da Meta; aqui o sistema só lista os aprovados, preenche os campos
   e envia.

   Suportado: campos no CORPO, numerados ({{1}}) ou com nome ({{nome}}), cabeçalho de texto sem
   campo, rodapé e botões fixos. Modelo com campo no cabeçalho, cabeçalho de foto/vídeo/documento
   ou botão de link com campo aparece na lista como "não suportado", com o motivo. */

export type CampoModelo = { chave: string; nomeado: boolean };
export type ModeloMensagem = {
  nome: string;
  idioma: string;
  categoria: string;
  cabecalho: string | null;
  corpo: string;
  rodape: string | null;
  botoes: string[];
  campos: CampoModelo[];
  suportado: boolean;
  motivo: string | null;
};
export type EnvioModelo = { nome: string; idioma: string; parametros: { nome: string | null; valor: string }[] };

type ComponenteMeta = { type?: string; format?: string; text?: string; buttons?: { type?: string; text?: string; url?: string }[] };
export type ModeloMeta = { name?: string; language?: string; status?: string; category?: string; components?: ComponenteMeta[] };

const CAMPO = /\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g;

/** Campos do texto, na ordem em que aparecem, sem repetir. */
export function camposDoTexto(texto: string): CampoModelo[] {
  const vistos = new Set<string>();
  const out: CampoModelo[] = [];
  for (const m of texto.matchAll(CAMPO)) {
    if (vistos.has(m[1])) continue;
    vistos.add(m[1]);
    out.push({ chave: m[1], nomeado: !/^\d+$/.test(m[1]) });
  }
  /* numerados vão na ordem do número, que é como a Meta espera os parâmetros */
  if (out.every((c) => !c.nomeado)) out.sort((a, b) => Number(a.chave) - Number(b.chave));
  return out;
}

export function converterModeloMeta(t: ModeloMeta): ModeloMensagem | null {
  if (t.status !== "APPROVED" || !t.name || !t.language) return null;
  const comp = t.components ?? [];
  const corpo = comp.find((c) => c.type === "BODY")?.text ?? "";
  const cab = comp.find((c) => c.type === "HEADER");
  const rod = comp.find((c) => c.type === "FOOTER");
  const botoes = comp.find((c) => c.type === "BUTTONS")?.buttons ?? [];
  let motivo: string | null = null;
  if (cab && cab.format && cab.format !== "TEXT") motivo = "cabeçalho com foto, vídeo ou documento";
  else if (cab?.text && camposDoTexto(cab.text).length) motivo = "campo no cabeçalho";
  else if (botoes.some((b) => b.type === "URL" && b.url && camposDoTexto(b.url).length)) motivo = "botão de link com campo";
  const campos = camposDoTexto(corpo);
  if (!motivo && campos.some((c) => c.nomeado) && campos.some((c) => !c.nomeado)) motivo = "mistura campos numerados e com nome";
  return {
    nome: t.name,
    idioma: t.language,
    categoria: t.category ?? "",
    cabecalho: cab?.format === "TEXT" || (!cab?.format && cab?.text) ? (cab?.text ?? null) : null,
    corpo,
    rodape: rod?.text ?? null,
    botoes: botoes.map((b) => b.text ?? "").filter(Boolean),
    campos,
    suportado: !motivo && !!corpo,
    motivo: motivo ?? (corpo ? null : "sem texto no corpo"),
  };
}

/** Texto final com os campos preenchidos (é o que fica gravado no chat). */
export function montarTexto(m: Pick<ModeloMensagem, "cabecalho" | "corpo" | "rodape" | "campos">, valores: string[]) {
  const mapa = new Map(m.campos.map((c, i) => [c.chave, valores[i] ?? ""]));
  const corpo = m.corpo.replace(CAMPO, (_, k: string) => mapa.get(k) ?? "");
  return [m.cabecalho ? `*${m.cabecalho}*` : null, corpo, m.rodape ? `_${m.rodape}_` : null].filter(Boolean).join("\n\n");
}

/** Parte "components" do envio para a Graph API. */
export function componentesDoEnvio(m: Pick<ModeloMensagem, "campos">, valores: string[]) {
  if (!m.campos.length) return [];
  return [
    {
      type: "body",
      parameters: m.campos.map((c, i) => (c.nomeado ? { type: "text", parameter_name: c.chave, text: valores[i] } : { type: "text", text: valores[i] })),
    },
  ];
}
