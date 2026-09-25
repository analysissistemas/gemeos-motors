/* Permissões da IA. Cada coisa que a IA pode fazer tem sua chave, e o servidor
   decide se ela realmente acontece. Tudo começa DESLIGADO. Sem a chave geral
   ligada, a IA não roda para nada (nem análise, nem resposta). */

export const PERMISSOES_IA = [
  {
    chave: "enviarMensagem",
    rotulo: "Enviar mensagens ao cliente",
    descricao: "A IA responde a primeira mensagem do cliente (triagem). Toda resposta passa pelo validador antes de sair; se reprovar, não é enviada.",
    efeito: true,
  },
  {
    chave: "sugerirResposta",
    rotulo: "Sugerir resposta ao atendente",
    descricao: "A IA escreve um rascunho e o atendente aprova antes de enviar (modo sugestão).",
    efeito: false,
  },
  {
    chave: "lerEstoque",
    rotulo: "Consultar o estoque",
    descricao: "A IA consulta o estoque real do banco por uma ferramenta. Nunca recebe uma cópia fixa no texto.",
    efeito: false,
  },
  {
    chave: "sugerirEtapa",
    rotulo: "Sugerir mudança de etapa no funil",
    descricao: "A IA sugere a etapa; quem move é o sistema, e o funil só avança.",
    efeito: false,
  },
  {
    chave: "transferirHumano",
    rotulo: "Transferir para um vendedor",
    descricao: "A IA aciona a passagem para o vendedor quando há sinal de fechamento.",
    efeito: false,
  },
] as const;

export type ChavePermissaoIa = (typeof PERMISSOES_IA)[number]["chave"];
export type ControleIa = { ligada: boolean; permissoes: Record<ChavePermissaoIa, boolean> };

export const CONTROLE_PADRAO: ControleIa = {
  ligada: false,
  permissoes: { enviarMensagem: false, sugerirResposta: false, lerEstoque: false, sugerirEtapa: false, transferirHumano: false },
};

export const MOTIVOS_BLOQUEIO: Record<string, string> = {
  sem_permissao: "Sem permissão de envio",
  validador: "Reprovada pelo validador",
  falha_envio: "Falha ao enviar",
};
