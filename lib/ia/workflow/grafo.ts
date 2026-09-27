/* ============================================================
   WORKFLOW DE ATENDIMENTO DA IA — o desenho (puro, sem banco)
   Mesma lógica do workflow do n8n "Gemeos do Iphone" (91 nós), refeita dentro do
   sistema: gatilho → lead → palavra-chave → roteamento IA/HUMANO → mídia →
   buffer → memória → agente → travas → transferência → blocos → envio.
   Cada nó tem id, posição na tela e as saídas (ramos) que pode seguir. O motor
   (motor.ts) anda por essas ligações e grava cada passo; a tela desenha o mesmo
   objeto, então o que aparece no painel é exatamente o que roda.
   ============================================================ */

export type CategoriaNo = "gatilho" | "dados" | "logica" | "midia" | "buffer" | "memoria" | "ia" | "ferramenta" | "seguranca" | "roteamento" | "envio" | "fim";

export type NoWorkflow = {
  id: string;
  nome: string;
  categoria: CategoriaNo;
  x: number;
  y: number;
  descricao: string;
  /** chaves de ConfigWorkflow que este nó usa (a tela mostra para editar) */
  config?: (keyof ConfigWorkflow)[];
  /** nó auxiliar ligado a outro (modelo, ferramentas): não entra no caminho, só aparece */
  auxiliarDe?: string;
};

export type Ligacao = { de: string; para: string; ramo: string };

export type ConfigWorkflow = {
  /** true = toda mensagem do WhatsApp passa por este workflow (no lugar da triagem antiga) */
  ativo: boolean;
  palavraLimpar: string;
  transcreverAudio: boolean;
  analisarImagem: boolean;
  analisarDocumento: boolean;
  bufferSegundos: number;
  janelaMemoria: number;
  maxBlocos: number;
  intervaloSegundos: number;
  avisoMemoriaApagada: boolean;
  citarMensagem: boolean;
};

export const CONFIG_PADRAO: ConfigWorkflow = {
  ativo: false,
  palavraLimpar: "#limpar",
  transcreverAudio: true,
  analisarImagem: true,
  analisarDocumento: true,
  bufferSegundos: 10,
  janelaMemoria: 20,
  maxBlocos: 3,
  intervaloSegundos: 3,
  avisoMemoriaApagada: true,
  citarMensagem: true,
};

export const LIMITES_CONFIG = {
  bufferSegundos: [0, 60],
  janelaMemoria: [4, 60],
  maxBlocos: [1, 5],
  intervaloSegundos: [0, 15],
} as const;

export const ROTULOS_CONFIG: Record<keyof ConfigWorkflow, { rotulo: string; ajuda: string }> = {
  ativo: { rotulo: "Workflow ligado", ajuda: "Toda mensagem do WhatsApp passa por este workflow, no lugar da triagem antiga." },
  palavraLimpar: { rotulo: "Palavra que apaga a memória", ajuda: "Quando o cliente (ou você, testando) manda exatamente esta palavra, a memória da conversa é apagada." },
  transcreverAudio: { rotulo: "Transcrever áudio", ajuda: "O áudio do cliente vira texto antes de ir para a IA." },
  analisarImagem: { rotulo: "Descrever imagem", ajuda: "A foto do cliente vira uma descrição em texto." },
  analisarDocumento: { rotulo: "Ler documento (PDF)", ajuda: "O PDF do cliente vira um resumo em texto." },
  bufferSegundos: { rotulo: "Espera do buffer (segundos)", ajuda: "Quanto tempo esperar por mais mensagens antes de responder tudo de uma vez." },
  janelaMemoria: { rotulo: "Mensagens na memória", ajuda: "Quantas mensagens recentes da conversa a IA lê a cada resposta." },
  maxBlocos: { rotulo: "Máximo de blocos por resposta", ajuda: "A resposta é quebrada em até este número de mensagens curtas." },
  intervaloSegundos: { rotulo: "Intervalo entre mensagens (segundos)", ajuda: "Pausa entre um bloco e outro, para parecer uma pessoa digitando." },
  avisoMemoriaApagada: { rotulo: "Avisar \"Memória apagada\"", ajuda: "Depois de apagar a memória, responde \"Memória apagada!\" na conversa." },
  citarMensagem: { rotulo: "Responder citando a mensagem do cliente", ajuda: "A resposta aparece como resposta à mensagem do cliente (a saudação vai solta, como no WhatsApp da loja)." },
};

const X = 250;
const col = (n: number) => n * X;

export const NOS: NoWorkflow[] = [
  { id: "gatilho", nome: "Mensagem recebida", categoria: "gatilho", x: col(0), y: 300, descricao: "O WhatsApp (webhook da Meta) ou o teste do painel entregou uma mensagem nova do cliente." },
  { id: "variaveis", nome: "Variáveis globais", categoria: "dados", x: col(1), y: 300, descricao: "Separa telefone, nome, tipo da mensagem e texto, como o nó \"Variáveis Globais\" do n8n." },
  { id: "lead", nome: "Busca o lead", categoria: "dados", x: col(2), y: 300, descricao: "Lê a conversa e o cliente ligado ao telefone. A conversa já foi criada na entrada da mensagem." },
  { id: "palavra_chave", nome: "Identifica palavra-chave", categoria: "logica", x: col(3), y: 300, descricao: "Se a mensagem for a palavra de limpar memória, apaga a memória e para aqui.", config: ["palavraLimpar"] },
  { id: "apagar_memoria", nome: "Apagar memória", categoria: "memoria", x: col(4), y: 90, descricao: "Zera a memória da IA para esta conversa: histórico passa a contar só daqui para frente e os fatos do lead são apagados." },
  { id: "aviso_memoria", nome: "Envia \"Memória apagada\"", categoria: "envio", x: col(5), y: 90, descricao: "Confirma na conversa que a memória foi apagada.", config: ["avisoMemoriaApagada"] },
  { id: "verifica_modo", nome: "Verifica status IA / HUMANO", categoria: "roteamento", x: col(4), y: 300, descricao: "Roteamento: se um vendedor assumiu a conversa (modo HUMANO), a IA não responde. A mensagem continua na memória." },
  { id: "ia_off", nome: "Salva interação com IA OFF", categoria: "memoria", x: col(5), y: 510, descricao: "Com atendimento humano, a IA fica em silêncio. A mensagem já está no histórico e entra na memória quando a IA voltar." },
  { id: "tipo_msg", nome: "Analisa tipo da mensagem", categoria: "logica", x: col(5), y: 300, descricao: "Texto segue direto. Áudio, imagem, documento e vídeo passam antes pela análise de mídia." },
  { id: "midia_audio", nome: "Transcreve áudio", categoria: "midia", x: col(6), y: 60, descricao: "Transcreve o áudio em português (OpenAI). Se falhar, tenta de novo 3 vezes (3 s, 10 s e 30 s); se não der, segue com a mensagem sem análise.", config: ["transcreverAudio"] },
  { id: "midia_imagem", nome: "Descreve imagem", categoria: "midia", x: col(6), y: 180, descricao: "Descreve a foto em português (OpenAI, visão). Se falhar, tenta de novo 3 vezes (3 s, 10 s e 30 s); se não der, segue com a mensagem sem análise.", config: ["analisarImagem"] },
  { id: "midia_documento", nome: "Lê documento", categoria: "midia", x: col(6), y: 420, descricao: "Resume o PDF em português (OpenAI). Se falhar, tenta de novo 3 vezes (3 s, 10 s e 30 s); se não der, segue com a mensagem sem análise.", config: ["analisarDocumento"] },
  { id: "midia_video", nome: "Vídeo", categoria: "midia", x: col(6), y: 540, descricao: "O modelo não assiste vídeo: registra que o cliente mandou um vídeo (com a legenda, se houver)." },
  { id: "buffer_guarda", nome: "Buffer: guarda a mensagem", categoria: "buffer", x: col(7), y: 300, descricao: "Coloca a mensagem (ou a transcrição) na fila desta conversa." },
  { id: "buffer_espera", nome: "Buffer: espera", categoria: "buffer", x: col(8), y: 300, descricao: "Espera o cliente terminar de digitar. Cada mensagem nova começa a própria espera.", config: ["bufferSegundos"] },
  { id: "buffer_compara", nome: "Buffer: chegou mensagem nova?", categoria: "buffer", x: col(9), y: 300, descricao: "Se chegou outra mensagem durante a espera, esta execução para: a mais nova responde tudo junto (igual ao \"Comparar Memórias\" do n8n)." },
  { id: "buffer_outra", nome: "A execução mais nova responde", categoria: "fim", x: col(10), y: 480, descricao: "Fim desta execução, sem erro. Não é falha: é o buffer funcionando." },
  { id: "buffer_junta", nome: "Juntar mensagens", categoria: "buffer", x: col(10), y: 300, descricao: "Junta todas as mensagens do cliente desde a última resposta em um texto só." },
  { id: "reconfere_modo", nome: "Confere status de novo", categoria: "roteamento", x: col(11), y: 300, descricao: "Durante a espera um vendedor pode ter assumido. Se assumiu, a IA não responde." },
  { id: "memoria_carrega", nome: "Memória: histórico + fatos", categoria: "memoria", x: col(12), y: 300, descricao: "Lê as últimas mensagens da conversa (cliente, IA e vendedor) e os fatos já sabidos do lead.", config: ["janelaMemoria"] },
  { id: "travas_entrada", nome: "Travas de entrada", categoria: "seguranca", x: col(13), y: 300, descricao: "Mensagem longa demais ou tentativa de manipular a IA vai direto para um humano, sem chamar o modelo." },
  { id: "agente", nome: "Agente IA", categoria: "ia", x: col(14), y: 300, descricao: "Lê o prompt do sistema (setores publicados + base de conhecimento), a memória e o texto do cliente. Pode usar as ferramentas abaixo. Se a IA falhar, tenta de novo 3 vezes (depois de 5 s, 20 s e 1 min); se continuar falhando, passa a conversa para um vendedor." },
  { id: "modelo", nome: "Modelo OpenAI", categoria: "ferramenta", x: col(13.5), y: 500, descricao: "Modelo de linguagem usado pelo agente.", auxiliarDe: "agente" },
  { id: "prompt", nome: "Prompt do sistema", categoria: "ferramenta", x: col(14.5), y: 500, descricao: "Setores do prompt (aba Prompt por setor) e base de conhecimento. Mude lá e publique.", auxiliarDe: "agente" },
  { id: "tool_estoque", nome: "buscar_estoque", categoria: "ferramenta", x: col(13.5), y: 600, descricao: "Ferramenta: consulta o estoque real do banco. Só o que ela confirmar pode ser afirmado.", auxiliarDe: "agente" },
  { id: "tool_catalogo", nome: "catálogo + interesse", categoria: "ferramenta", x: col(14.5), y: 600, descricao: "Ferramenta: modelo existe mas está sem unidade → registra o interesse do cliente.", auxiliarDe: "agente" },
  { id: "trava_fatos", nome: "Trava de fatos", categoria: "seguranca", x: col(15), y: 300, descricao: "Bloqueia produto que o estoque não confirmou, \"temos\" sem estoque, horário e endereço fora da base de conhecimento." },
  { id: "validador", nome: "Validador", categoria: "seguranca", x: col(16), y: 300, descricao: "Bloqueia preço, link, promessa, dado sensível e vazamento do prompt." },
  { id: "decide_transferir", nome: "Transferir para humano?", categoria: "roteamento", x: col(17), y: 300, descricao: "O agente pediu transferência, ou uma trava bloqueou a resposta?" },
  { id: "transferir", nome: "Transferir atendimento", categoria: "roteamento", x: col(18), y: 500, descricao: "Passa a conversa para HUMANO, sobe a prioridade, avisa a equipe com o resumo e abre o negócio no funil (CRM)." },
  { id: "memoria_salva", nome: "Memória: salva fatos e resumo", categoria: "memoria", x: col(18), y: 300, descricao: "Guarda o que a IA aprendeu do lead (nome, interesse, pagamento, troca, cidade) e o resumo do atendimento." },
  { id: "blocos", nome: "Quebra a resposta em blocos", categoria: "logica", x: col(19), y: 300, descricao: "A saudação (quando houver) vai sozinha no primeiro bloco; a resposta é dividida em mensagens curtas, como uma pessoa escreveria.", config: ["maxBlocos"] },
  { id: "loop", nome: "Um bloco por vez", categoria: "logica", x: col(20), y: 300, descricao: "Envia os blocos em ordem, um de cada vez." },
  { id: "intervalo", nome: "Intervalo entre mensagens", categoria: "envio", x: col(21), y: 140, descricao: "Pausa antes de cada bloco (maior para textos longos, até o dobro do valor).", config: ["intervaloSegundos"] },
  { id: "enviar", nome: "Envia mensagem", categoria: "envio", x: col(22), y: 140, descricao: "Envia pelo único caminho autorizado (permissão de envio + validador) e registra em Últimas respostas da IA. Se o WhatsApp recusar, tenta de novo 3 vezes (5 s, 20 s e 1 min).", config: ["citarMensagem"] },
  { id: "final", nome: "Atendimento registrado", categoria: "fim", x: col(21), y: 440, descricao: "Fim da execução." },
];

export const LIGACOES: Ligacao[] = [
  { de: "gatilho", para: "variaveis", ramo: "ok" },
  { de: "variaveis", para: "lead", ramo: "ok" },
  { de: "lead", para: "palavra_chave", ramo: "ok" },
  { de: "palavra_chave", para: "apagar_memoria", ramo: "limpar" },
  { de: "palavra_chave", para: "verifica_modo", ramo: "seguir" },
  { de: "apagar_memoria", para: "aviso_memoria", ramo: "ok" },
  { de: "verifica_modo", para: "ia_off", ramo: "humano" },
  { de: "verifica_modo", para: "tipo_msg", ramo: "ia" },
  { de: "tipo_msg", para: "buffer_guarda", ramo: "texto" },
  { de: "tipo_msg", para: "midia_audio", ramo: "audio" },
  { de: "tipo_msg", para: "midia_imagem", ramo: "imagem" },
  { de: "tipo_msg", para: "midia_documento", ramo: "documento" },
  { de: "tipo_msg", para: "midia_video", ramo: "video" },
  { de: "midia_audio", para: "buffer_guarda", ramo: "ok" },
  { de: "midia_imagem", para: "buffer_guarda", ramo: "ok" },
  { de: "midia_documento", para: "buffer_guarda", ramo: "ok" },
  { de: "midia_video", para: "buffer_guarda", ramo: "ok" },
  { de: "midia_audio", para: "buffer_guarda", ramo: "erro" },
  { de: "midia_imagem", para: "buffer_guarda", ramo: "erro" },
  { de: "midia_documento", para: "buffer_guarda", ramo: "erro" },
  { de: "buffer_guarda", para: "buffer_espera", ramo: "ok" },
  { de: "buffer_espera", para: "buffer_compara", ramo: "ok" },
  { de: "buffer_compara", para: "buffer_outra", ramo: "sim" },
  { de: "buffer_compara", para: "buffer_junta", ramo: "nao" },
  { de: "buffer_junta", para: "reconfere_modo", ramo: "ok" },
  { de: "reconfere_modo", para: "memoria_carrega", ramo: "ia" },
  { de: "reconfere_modo", para: "ia_off", ramo: "humano" },
  { de: "memoria_carrega", para: "travas_entrada", ramo: "ok" },
  { de: "travas_entrada", para: "agente", ramo: "ok" },
  { de: "travas_entrada", para: "decide_transferir", ramo: "bloqueada" },
  { de: "agente", para: "trava_fatos", ramo: "ok" },
  { de: "agente", para: "decide_transferir", ramo: "erro" },
  { de: "trava_fatos", para: "validador", ramo: "ok" },
  { de: "trava_fatos", para: "decide_transferir", ramo: "bloqueada" },
  { de: "validador", para: "decide_transferir", ramo: "ok" },
  { de: "validador", para: "decide_transferir", ramo: "reprovada" },
  { de: "decide_transferir", para: "transferir", ramo: "sim" },
  { de: "decide_transferir", para: "memoria_salva", ramo: "nao" },
  { de: "transferir", para: "memoria_salva", ramo: "ok" },
  { de: "memoria_salva", para: "blocos", ramo: "ok" },
  { de: "blocos", para: "loop", ramo: "ok" },
  { de: "blocos", para: "final", ramo: "vazio" },
  { de: "loop", para: "intervalo", ramo: "proximo" },
  { de: "loop", para: "final", ramo: "fim" },
  { de: "intervalo", para: "enviar", ramo: "ok" },
  { de: "enviar", para: "loop", ramo: "ok" },
  { de: "enviar", para: "final", ramo: "erro" },
  /* ligações dos auxiliares do agente (só desenho) */
  { de: "modelo", para: "agente", ramo: "modelo" },
  { de: "prompt", para: "agente", ramo: "prompt" },
  { de: "tool_estoque", para: "agente", ramo: "ferramenta" },
  { de: "tool_catalogo", para: "agente", ramo: "ferramenta" },
];

export const ROTULOS_RAMO: Record<string, string> = {
  limpar: "limpar",
  seguir: "seguir",
  humano: "HUMANO",
  ia: "I.A",
  texto: "texto",
  audio: "áudio",
  imagem: "imagem",
  documento: "documento",
  video: "vídeo",
  sim: "sim",
  nao: "não",
  bloqueada: "bloqueada",
  reprovada: "reprovada",
  erro: "erro",
  vazio: "nada a enviar",
  proximo: "próximo",
  fim: "fim",
};

export const noPorId = (id: string) => NOS.find((n) => n.id === id);

/* ---------------- registro de execução ---------------- */
export type StatusPasso = "ok" | "parou" | "erro";
export type PassoExecucao = {
  no: string;
  status: StatusPasso;
  /** ramo seguido na saída deste nó (define a ligação acesa na tela) */
  ramo?: string;
  /** frase curta para a lista (ex.: motivo da parada) */
  detalhe?: string;
  entrada?: unknown;
  saida?: unknown;
  inicio: string;
  ms: number;
  /** tentativas que falharam antes (e, se status "erro", todas falharam) */
  tentativas?: import("./falhas.ts").Tentativa[];
};
export type StatusExecucao = "rodando" | "sucesso" | "parou" | "erro";

export const ROTULOS_STATUS: Record<StatusExecucao, string> = { rodando: "Rodando", sucesso: "Concluída", parou: "Parou", erro: "Erro" };
