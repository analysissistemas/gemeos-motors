/* Os erros de envio da Meta em português de gente (dono, 19/10/2026: "traduza esses erros pra
   entender"). Serve para o erro que volta na hora do envio e para o que chega depois pelo
   webhook ("Não enviada: …"), inclusive os já gravados em inglês. Sem "server-only": a tela usa. */

const TRADUCOES: Record<number, string> = {
  131047: "Faz mais de 24 h que o cliente não escreve para este número da loja. A Meta só deixa mandar um modelo aprovado até ele responder.",
  470: "Faz mais de 24 h que o cliente não escreve para este número da loja. A Meta só deixa mandar um modelo aprovado até ele responder.",
  131026: "Não deu para entregar: o número pode não ter WhatsApp, ou o WhatsApp do cliente está desatualizado.",
  131049: "A Meta segurou esta mensagem para não encher o cliente de propaganda. Tente mais tarde ou espere ele responder.",
  131050: "O cliente pediu para não receber propaganda da loja.",
  131051: "A Meta não aceita esse tipo de mensagem.",
  131052: "Não deu para baixar o arquivo que o cliente mandou.",
  131053: "Não deu para enviar o arquivo: formato ou tamanho que a Meta não aceita.",
  131056: "Muitas mensagens para o mesmo cliente em pouco tempo. Espere um pouco e mande de novo.",
  130429: "Muitas mensagens em pouco tempo. Espere um pouco e mande de novo.",
  131048: "A Meta limitou os envios deste número por reclamações. Espere e mande menos mensagens seguidas.",
  131000: "A Meta teve um problema. Mande de novo daqui a pouco.",
  131016: "A Meta está fora do ar agora. Mande de novo daqui a pouco.",
  131008: "Faltou uma informação obrigatória na mensagem.",
  131009: "A mensagem tem uma informação que a Meta não aceita.",
  131021: "Não dá para mandar mensagem para o próprio número da loja.",
  131031: "A conta do WhatsApp da loja está bloqueada pela Meta. Veja o Gerenciador do WhatsApp.",
  131042: "Problema de pagamento na conta da Meta. Veja a forma de pagamento no Gerenciador do WhatsApp.",
  131045: "O número da loja não está registrado na Meta.",
  132000: "O modelo de mensagem está com campos faltando ou sobrando.",
  132001: "Esse modelo de mensagem não existe ou ainda não foi aprovado.",
  132005: "O texto do modelo ficou grande demais depois de preenchido.",
  132007: "O modelo de mensagem foi recusado pelas regras da Meta.",
  132015: "Esse modelo de mensagem foi pausado pela Meta por baixa qualidade.",
  132016: "Esse modelo de mensagem foi desativado pela Meta.",
  190: "A Meta recusou o token. Confira o token em Configurações → API Oficial.",
  368: "A conta da loja está temporariamente bloqueada pela Meta por violar regras.",
};

/** Texto para a equipe a partir do código da Meta; sem código conhecido, devolve null. */
export function traduzirCodigoMeta(codigo?: number | null) {
  return codigo ? (TRADUCOES[codigo] ?? null) : null;
}

/** Erro já gravado ("… — código 131047"): troca o inglês da Meta pela tradução, mantendo o código. */
export function traduzirErroGravado(erro: string) {
  const m = /código (\d+)/.exec(erro);
  const pt = traduzirCodigoMeta(m ? Number(m[1]) : null);
  return pt ? `${pt} (código ${m![1]})` : erro;
}
