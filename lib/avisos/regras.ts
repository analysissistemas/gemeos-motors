/* Avisos no celular do Milton (dono, 15/10/2026): o que vira aviso e com que texto. Escolhidos pelo dono: os 5 da hora
   (cliente pronto, mandou os dados, pediu uma pessoa/reclamou/foi para Humano, esperando em Humano, visita marcada), o
   resumo das 8h e as tarefas do dia. Toda mensagem de cliente NÃO vira aviso (vira barulho). Puro, sem banco. */

export type Aviso = {
  titulo: string;
  corpo: string;
  /** mesma tag = um aviso só (o celular troca o anterior; o servidor não repete em 30 min) */
  tag: string;
  /** fora do horário da loja só sai o que é urgente (cliente pronto e dados para fechar) */
  urgente: boolean;
  /** abre ao tocar */
  url: string;
};

const conversa = (id: number) => `/sistema/conversas?c=${id}`;
const curto = (s: string, n = 140) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/** Aviso para uma anotação do sistema na conversa (null: essa anotação não vira aviso). */
export function avisoDaAnotacao(texto: string, p: { conversaId: number; nome: string }): Aviso | null {
  const t = texto.trim();
  /* dados para fechar a compra */
  if (/^Dados do pedido salvos no cadastro/u.test(t)) {
    const linhas = t.split("\n").map((l) => l.trim());
    const pedido = linhas.find((l) => /^Pedido pelo WhatsApp/u.test(l))?.replace(/^Pedido pelo WhatsApp \(IA\):\s*/u, "") ?? "moto";
    const como = linhas.find((l) => /^(Retirada na loja|Entrega):/u.test(l))?.replace(/\s*·\s*endere[çc]o do cliente:.*$/u, "") ?? "";
    const pag = linhas.find((l) => /^Pagamento:/u.test(l)) ?? "";
    return { titulo: `✅ ${p.nome} mandou os dados da ${pedido}`, corpo: curto([como, pag].filter(Boolean).join(" · ") || "Confira e confirme com o cliente."), tag: `dados-${p.conversaId}`, urgente: true, url: conversa(p.conversaId) };
  }
  /* reclamou do atendimento */
  if (/^REVISAR ATENDIMENTO DA IA/u.test(t)) {
    const fala = /\("(.+)"\)/u.exec(t)?.[1] ?? "";
    return { titulo: `🙋 ${p.nome} reclamou do atendimento`, corpo: curto(fala ? `"${fala}"` : "Veja a conversa e assuma."), tag: `humano-${p.conversaId}`, urgente: false, url: conversa(p.conversaId) };
  }
  /* passou para a equipe (o fechamento já tem o aviso dos dados, que vem logo depois) */
  if (/^Transferido para atendimento humano/u.test(t)) {
    const motivo = /Motivo:\s*(.+?)(?:\.\s*Resumo:|$)/su.exec(t)?.[1]?.trim() ?? "";
    if (/^Fechamento/u.test(motivo)) return null;
    const pediuPessoa = /recado|falar com|pessoa|dono|propriet|gerente|atendente/iu.test(motivo);
    return {
      titulo: pediuPessoa ? `🙋 ${p.nome} quer falar com alguém` : `🙋 ${p.nome} foi passado para a equipe`,
      corpo: curto(motivo.replace(/^Recado \/ outro assunto\.\s*/u, "") || "Assuma a conversa."),
      tag: `humano-${p.conversaId}`,
      urgente: false,
      url: conversa(p.conversaId),
    };
  }
  /* esperando em Humano (o vigia anota aos 5 min) */
  const espera = /^Cliente esperando resposta há (\d+) min/u.exec(t);
  if (espera) return { titulo: `⏰ ${p.nome} está esperando há ${espera[1]} min`, corpo: "A IA está travada nesta conversa (Humano). Responda ou volte a chave para IA.", tag: `espera-${p.conversaId}`, urgente: false, url: conversa(p.conversaId) };
  return null;
}

/** Cliente respondeu a um follow-up com sinal de compra (o mesmo critério de "Prontos para o vendedor"). */
export function avisoProntoParaFechar(p: { conversaId: number; nome: string; sinal: string; texto: string; interesse: string | null }): Aviso {
  return {
    titulo: `🔥 ${p.nome}${p.interesse ? ` quer a ${p.interesse}` : " está pronto para fechar"}`,
    corpo: curto(`${p.sinal}: "${p.texto.replace(/\s+/g, " ").trim()}"`),
    tag: `pronto-${p.conversaId}`,
    urgente: true,
    url: conversa(p.conversaId),
  };
}

/** Visita ou test drive que a IA marcou. */
export function avisoVisitaMarcada(p: { conversaId: number | null; nome: string; descricao: string | null; quandoExtenso: string }): Aviso {
  const visita = !p.descricao || /^visita/iu.test(p.descricao);
  return {
    titulo: `📅 ${p.nome} marcou ${visita ? "uma visita" : `test drive da ${p.descricao}`}`,
    corpo: `${p.quandoExtenso[0].toUpperCase()}${p.quandoExtenso.slice(1)}. Marcado pela IA no WhatsApp.`,
    tag: `visita-${p.conversaId ?? p.nome}`,
    urgente: false,
    url: p.conversaId ? conversa(p.conversaId) : "/sistema/test-drives",
  };
}

/** Tarefa da retirada chegou na hora (separar a moto). */
export function avisoTarefa(p: { followUpId: number; notas: string; conversaId: number | null }): Aviso {
  return { titulo: "🛵 Separar a moto da retirada", corpo: curto(p.notas, 160), tag: `tarefa-${p.followUpId}`, urgente: false, url: p.conversaId ? conversa(p.conversaId) : "/sistema/follow-ups" };
}

/** Lembrete automático que não saiu: a equipe avisa o cliente. */
export function avisoLembreteNaoSaiu(p: { conversaId: number; nome: string; doQue: string }): Aviso {
  return { titulo: `⚠️ O lembrete ${p.doQue} de ${p.nome} não saiu`, corpo: "Avise o cliente pela conversa (o texto está em Follow-ups).", tag: `lembrete-${p.conversaId}`, urgente: false, url: conversa(p.conversaId) };
}

/** Resumo das 8h. Sem nada no dia: null (não manda aviso vazio). */
export function avisoResumoDoDia(n: { retiradas: number; testDrives: number; followUps: number; prontos: number; esperando: number }): Aviso | null {
  const partes = [
    n.prontos && `${n.prontos} ${n.prontos === 1 ? "cliente pronto" : "clientes prontos"} para fechar`,
    n.retiradas && `${n.retiradas} ${n.retiradas === 1 ? "retirada" : "retiradas"}`,
    n.testDrives && `${n.testDrives} ${n.testDrives === 1 ? "test drive/visita" : "test drives/visitas"}`,
    n.followUps && `${n.followUps} follow-up${n.followUps === 1 ? "" : "s"} da equipe`,
    n.esperando && `${n.esperando} ${n.esperando === 1 ? "cliente esperando" : "clientes esperando"} resposta`,
  ].filter(Boolean);
  if (!partes.length) return null;
  return { titulo: "☀️ Bom dia! O dia na Gêmeos Motors", corpo: `Hoje: ${partes.join(", ")}.`, tag: "resumo-do-dia", urgente: true, url: "/sistema/follow-ups" };
}
