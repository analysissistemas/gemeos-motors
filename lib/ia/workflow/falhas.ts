/* ============================================================
   FALHAS DO WORKFLOW (puro)
   Quando um nó que depende de algo de fora (OpenAI, WhatsApp) falha, o motor
   tenta de novo 3 vezes, com esperas cada vez maiores. Aqui ficam as esperas,
   a classificação do motivo (em linguagem simples, com o que fazer) e o
   resumo que a aba Falhas mostra.
   ============================================================ */

/** Nós que tentam de novo e quanto esperar antes de cada nova tentativa (ms): 3 novas tentativas. */
export const RETENTATIVAS: Record<string, number[]> = {
  agente: [5_000, 20_000, 60_000],
  midia_audio: [3_000, 10_000, 30_000],
  midia_imagem: [3_000, 10_000, 30_000],
  midia_documento: [3_000, 10_000, 30_000],
  enviar: [5_000, 20_000, 60_000],
};

export type Tentativa = { n: number; em: string; erro: string; esperaMs: number | null };

export type TipoFalha = "sem_credito" | "chave" | "credencial" | "ia_desligada" | "tempo" | "limite" | "rede" | "formato" | "whatsapp" | "banco" | "outro";

export const TIPOS_FALHA: Record<TipoFalha, { rotulo: string; dica: string; temporaria: boolean }> = {
  sem_credito: { rotulo: "Conta da OpenAI sem crédito", dica: "Coloque crédito em platform.openai.com → Billing. Enquanto isso, as conversas vão para um vendedor.", temporaria: false },
  chave: { rotulo: "Chave da OpenAI recusada ou ausente", dica: "Confira a OPENAI_API_KEY no EasyPanel → serviço sistema → Ambiente.", temporaria: false },
  credencial: { rotulo: "IA sem credencial neste ambiente", dica: "Coloque a OPENAI_API_KEY no EasyPanel → Ambiente e implante de novo.", temporaria: false },
  ia_desligada: { rotulo: "IA desligada", dica: "Ligue em Inteligência artificial → Controle.", temporaria: false },
  tempo: { rotulo: "A IA demorou demais", dica: "Costuma ser lentidão passageira da OpenAI; as novas tentativas resolvem na maioria das vezes.", temporaria: true },
  limite: { rotulo: "Muitas chamadas ao mesmo tempo (limite da OpenAI)", dica: "Passageiro. Se acontecer sempre, aumente o limite da conta na OpenAI.", temporaria: true },
  rede: { rotulo: "Falha de conexão", dica: "A internet do servidor ou o serviço de fora oscilou. Se continuar, confira o VPS no EasyPanel.", temporaria: true },
  formato: { rotulo: "A IA respondeu fora do formato", dica: "Passageiro. Se repetir muito, revise o prompt (texto muito longo ou confuso).", temporaria: true },
  whatsapp: { rotulo: "O WhatsApp recusou o envio", dica: "Veja o motivo da Meta abaixo. Token vencido ou janela de 24 h fechada pedem ação da equipe.", temporaria: true },
  banco: { rotulo: "Falha no banco de dados", dica: "Confira o serviço banco no EasyPanel.", temporaria: true },
  outro: { rotulo: "Falha não identificada", dica: "Veja a mensagem técnica abaixo. Se repetir, mande para o suporte.", temporaria: true },
};

const REGRAS: [TipoFalha, RegExp][] = [
  ["sem_credito", /sem cr[eé]dito|insufficient_quota|exceeded your current quota|billing/i],
  ["ia_desligada", /IA est[aá] desligada/i],
  ["chave", /chave da openai|invalid_api_key|incorrect api key|OPENAI_API_KEY/i],
  ["credencial", /sem credencial|OIDC|authentication/i],
  ["limite", /\b429\b|rate.?limit|too many requests|limite de chamadas/i],
  ["tempo", /demorou|timeout|timed out|aborted/i],
  ["rede", /fetch failed|ECONN|ENOTFOUND|EAI_AGAIN|socket|network|conex[aã]o/i],
  ["formato", /No object generated|schema|JSON|parse|formato/i],
  ["whatsapp", /whatsapp|meta|graph|recusou o envio|\(#\d+\)|131\d{3}/i],
  ["banco", /database|relation "|postgres|connect ECONNREFUSED|deadlock/i],
];

export function classificarFalha(mensagem: string): TipoFalha {
  return REGRAS.find(([, rx]) => rx.test(mensagem))?.[0] ?? "outro";
}

/** Resumo de uma falha para a aba Falhas: onde, por quê, quantas tentativas e como terminou. */
export type ResumoFalha = { no: string; tipo: TipoFalha; motivo: string; tentativas: Tentativa[]; recuperou: boolean; desfecho: string };

export function resumirFalhas(passos: { no: string; status: string; tentativas?: Tentativa[]; ramo?: string }[]): ResumoFalha[] {
  return passos
    .filter((p) => p.tentativas?.length)
    .map((p) => {
      const t = p.tentativas!;
      const ultima = t.at(-1)!;
      const recuperou = p.status !== "erro";
      return {
        no: p.no,
        tipo: classificarFalha(ultima.erro),
        motivo: ultima.erro,
        tentativas: t,
        recuperou,
        desfecho: recuperou
          ? `Recuperou na ${t.length + 1}ª tentativa`
          : p.ramo === "erro"
            ? `Falhou nas ${t.length} tentativas; o fluxo seguiu pelo caminho de erro`
            : `Falhou nas ${t.length} tentativas; a execução parou aqui`,
      };
    });
}
