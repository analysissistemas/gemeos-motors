/* Peças puras do workflow (testadas em tests/unit/workflow.test.ts). */

/** Quebra a resposta da IA em até `max` mensagens curtas: primeiro por parágrafo;
 *  parágrafo único e longo é dividido por frases. O excesso junta no último bloco. */
export function quebrarEmBlocos(texto: string, max: number): string[] {
  const limpo = texto.replace(/\r/g, "").trim();
  if (!limpo) return [];
  let partes = limpo.split(/\n\s*\n/).map((s) => s.trim()).filter(Boolean);
  if (partes.length === 1 && limpo.length > 280 && max > 1) {
    const frases = limpo.match(/[^.!?]+[.!?]+(?:\s|$)|[^.!?]+$/g)?.map((s) => s.trim()).filter(Boolean) ?? [limpo];
    const alvo = Math.ceil(limpo.length / Math.min(max, Math.ceil(limpo.length / 160)));
    partes = [];
    let atual = "";
    for (const f of frases) {
      if (atual && (atual + " " + f).length > alvo) {
        partes.push(atual);
        atual = f;
      } else atual = atual ? `${atual} ${f}` : f;
    }
    if (atual) partes.push(atual);
  }
  if (partes.length <= max) return partes;
  return [...partes.slice(0, max - 1), partes.slice(max - 1).join("\n\n")];
}

/** Pausa antes de um bloco: o intervalo configurado, maior para texto longo (até o dobro). */
/** Quanto tempo uma pessoa levaria digitando este bloco no celular: ~20 letras por segundo,
    entre 2 e 9 s, com uma variação pequena para não ficar robótico. `sorte` (0 a 1) é para o teste. */
export function tempoDigitando(bloco: string, sorte = Math.random()) {
  const base = 1200 + bloco.trim().length * 50;
  const variacao = 0.85 + sorte * 0.3;
  return Math.round(Math.min(9000, Math.max(2000, base * variacao)));
}

export function pausaDoBloco(bloco: string, intervaloSegundos: number) {
  const base = intervaloSegundos * 1000;
  return Math.round(Math.min(base * 2, base * (0.6 + bloco.length / 250)));
}

export type MensagemMemoria = { autor: string; tipo: string; conteudo: string | null; transcricao?: string | null; criadoEm: Date };

/** Texto que representa a mensagem para a IA (mídia usa a transcrição/descrição). */
export function textoDaMensagem(m: Pick<MensagemMemoria, "tipo" | "conteudo" | "transcricao">) {
  if (m.tipo === "texto") return m.conteudo ?? "";
  const rotulo = { audio: "áudio", imagem: "imagem", documento: "documento", video: "vídeo", localizacao: "localização", contato: "contato" }[m.tipo] ?? m.tipo;
  if (m.transcricao) return `[${rotulo}] ${m.transcricao}`;
  return `[${rotulo}${m.conteudo ? `: ${m.conteudo}` : ""}]`;
}

/** Histórico no formato do n8n ("Lead: …", "Agente IA: …"), do mais antigo para o mais novo. */
export function formatarHistorico(msgs: MensagemMemoria[]) {
  return msgs
    .filter((m) => m.autor !== "sistema")
    .map((m) => `${m.autor === "cliente" ? "Lead" : m.autor === "ia" ? "Agente IA" : "Vendedor"}: ${textoDaMensagem(m)}`)
    .join("\n\n");
}

export type FatosLead = { nome?: string | null; interesse?: string | null; uso?: string | null; pagamento?: string | null; troca?: string | null; cidade?: string | null; observacoes?: string | null };

/** Junta fatos novos aos antigos: valor vazio nunca apaga o que já se sabia. */
export function mesclarFatos(antigos: FatosLead, novos: FatosLead): FatosLead {
  const r: FatosLead = { ...antigos };
  for (const [k, v] of Object.entries(novos) as [keyof FatosLead, string | null | undefined][]) if (typeof v === "string" && v.trim()) r[k] = v.trim().slice(0, 300);
  return r;
}
