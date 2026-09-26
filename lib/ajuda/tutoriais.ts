/* ============================================================
   TUTORIAIS DO SISTEMA (menu "Ajuda")
   Passo a passo por escrito, com imagem de exemplo, para quem esquecer como
   faz. Linguagem simples: a equipe não é de informática.

   Tutorial novo = acrescentar um item em TUTORIAIS.
   Imagem = public/tutoriais/<slug>-<nn>.webp (ex.: vendas-01.webp). Se a
   imagem ainda não existir, a tela simplesmente não mostra a figura.
   `permissao` é a mesma do menu: o tutorial só aparece para quem usa a tela.
   ============================================================ */
import { pode, type Papel, type Permissao } from "@/lib/dominio";

export type PassoTutorial = { texto: string; imagem?: string; legenda?: string };
export type Tutorial = {
  slug: string;
  titulo: string;
  area: AreaTutorial;
  /** null = todo mundo que entra no sistema */
  permissao: Permissao | null;
  /** onde fica a tela (para o botão "Abrir a tela") */
  tela?: string;
  resumo: string;
  passos: PassoTutorial[];
  /** regras da loja que não podem ser esquecidas */
  regras?: string[];
  dicas?: string[];
  errosComuns?: { problema: string; solucao: string }[];
};

export const AREAS = ["Primeiros passos", "Atendimento e vendas", "Cadastros", "Pós-venda", "Gestão"] as const;
export type AreaTutorial = (typeof AREAS)[number];

const img = (slug: string, n: number) => `/tutoriais/${slug}-${String(n).padStart(2, "0")}.webp`;

export const TUTORIAIS: Tutorial[] = [
  /* ---------------- PRIMEIROS PASSOS ---------------- */
  {
    slug: "login",
    titulo: "Entrar no sistema e trocar a senha",
    area: "Primeiros passos",
    permissao: null,
    tela: "/sistema/conta",
    resumo: "Como entrar, por quanto tempo fica aberto e como trocar a sua senha.",
    passos: [
      { texto: "No site da loja, desça até o fim da página e toque em \"Área do vendedor\". Ou abra direto o endereço do sistema terminado em /login.", imagem: img("login", 1), legenda: "Tela de entrada da equipe" },
      { texto: "Digite o seu usuário e a sua senha e toque em \"Entrar\"." },
      { texto: "O sistema abre na tela certa para o seu perfil. O técnico cai direto na Assistência." },
      { texto: "Para trocar a senha: toque no seu nome, no rodapé do menu, e abra \"Minha conta\". Em \"Trocar senha\", digite a senha atual, a nova duas vezes e toque em \"Salvar nova senha\".", imagem: img("login", 2), legenda: "Minha conta, com a troca de senha" },
    ],
    regras: [
      "A sessão dura 2 horas. Depois disso o sistema pede para entrar de novo, mesmo que você esteja usando.",
      "Cada pessoa usa o próprio usuário. Tudo o que você faz fica registrado com o seu nome no histórico.",
    ],
    errosComuns: [
      { problema: "Aparece \"Muitas tentativas. Aguarde 15 minutos\".", solucao: "Foram 5 senhas erradas seguidas. Espere 15 minutos e tente com calma. Se esqueceu a senha, peça a um administrador para criar uma nova em Usuários." },
      { problema: "Estava usando e voltou para a tela de entrada.", solucao: "Passaram as 2 horas da sessão. É só entrar de novo; nada do que foi salvo se perde." },
    ],
  },
  {
    slug: "visao-geral",
    titulo: "Visão geral: os números da loja",
    area: "Primeiros passos",
    permissao: "painel.ver",
    tela: "/sistema",
    resumo: "Como ler o painel de abertura: vendas, funil, perdas e o que precisa de atenção.",
    passos: [
      { texto: "Toque em \"Visão geral\" no menu. É a primeira tela depois de entrar.", imagem: img("visao-geral", 1), legenda: "Painel com os números do período" },
      { texto: "No alto, escolha o período: hoje, 7 dias, 30 dias, o mês ou \"Datas personalizadas\" (escolha o início e o fim e toque em \"Aplicar\")." },
      { texto: "Veja \"Precisa de atenção\": follow-ups atrasados, mensagens sem resposta e negócios parados. Toque no item para ir direto a ele.", imagem: img("visao-geral", 2), legenda: "Quadro \"Precisa de atenção\"" },
      { texto: "Toque em \"Ver mais números\" para ver vendas por consultor, origem dos clientes, motivos de perda e os veículos mais vendidos." },
    ],
    regras: ["Campo sem informação aparece como \"—\", nunca como zero. Número zero significa que realmente não houve nada."],
  },

  /* ---------------- ATENDIMENTO E VENDAS ---------------- */
  {
    slug: "conversas",
    titulo: "Atendimento: responder o cliente no WhatsApp",
    area: "Atendimento e vendas",
    permissao: "conversas.ver",
    tela: "/sistema/conversas",
    resumo: "Lista de conversas, responder, mandar foto, áudio, nota interna e ligar a conversa ao cliente.",
    passos: [
      { texto: "Toque em \"Atendimento\" no menu. À esquerda ficam as conversas; o número no menu mostra quantas estão sem ler.", imagem: img("conversas", 1), legenda: "As três colunas: conversas, chat e dados do cliente" },
      { texto: "Toque numa conversa para abrir. Se ela estiver \"Sem responsável\", toque em \"Assumir\" para ficar com o atendimento." },
      { texto: "Escreva no campo de baixo e envie. Para respostas prontas, digite / ou toque no botão de respostas rápidas. Para mandar foto ou PDF, use o clipe. Para áudio, toque no microfone, fale e toque em enviar (ou \"Cancelar\").", imagem: img("conversas", 2), legenda: "Campo de mensagem com respostas rápidas, anexo e áudio" },
      { texto: "Para anotar algo que só a equipe vê, use a \"Nota interna\". O cliente não recebe." },
      { texto: "Na coluna da direita: se aparecer \"Contato sem cadastro\", toque em \"Cadastrar cliente\" (ou ligue a um cliente que já existe). Ali você também cria o negócio no funil e agenda o follow-up.", imagem: img("conversas", 3), legenda: "Dados do cliente, negócio e próximo follow-up" },
      { texto: "Mude o status da conversa no alto do chat (Em atendimento, Aguardando cliente, Resolvida…) para a equipe saber em que pé está." },
    ],
    regras: [
      "Não é permitido prometer parcela, carnê ou \"a receber\": a loja não trabalha com isso.",
      "Moto elétrica: não precisa de CNH, não paga emplacamento nem IPVA. Isso vale só para a linha elétrica.",
    ],
    dicas: [
      "O sistema não deixa cadastrar o mesmo telefone duas vezes: se o cliente já existe, ligue a conversa a ele.",
      "Conversas com o selo \"Simulado\" são de demonstração: não saem para o WhatsApp de verdade.",
    ],
  },
  {
    slug: "funil",
    titulo: "Funil de vendas: acompanhar cada negociação",
    area: "Atendimento e vendas",
    permissao: "funil.ver",
    tela: "/sistema/funil",
    resumo: "Criar negócio, mudar de etapa, fechar ou perder a venda.",
    passos: [
      { texto: "Toque em \"Funil de vendas\". Cada coluna é uma etapa: Chegou no WhatsApp, Proposta enviada, Negociando / troca, Venda fechada e Venda perdida.", imagem: img("funil", 1), legenda: "Quadro do funil por etapa" },
      { texto: "Para criar, toque em \"Novo negócio\": escolha o cliente, o veículo de interesse, o valor anunciado e, se tiver, o valor da proposta e o veículo da troca. Salve." },
      { texto: "Para mudar de etapa no computador, arraste o cartão para outra coluna. No celular, toque no negócio e troque a \"Etapa\".", imagem: img("funil", 2), legenda: "Janela do negócio com a etapa" },
      { texto: "Levar para \"Venda fechada\" abre a janela \"Fechar venda\": escolha o veículo, confira o valor vendido e toque em \"Registrar venda\". Depois continue na tela da venda.", imagem: img("funil", 3), legenda: "Janela Fechar venda" },
      { texto: "Levar para \"Venda perdida\" pede o motivo, a objeção do cliente e as suas observações. A IA lê o atendimento e faz o diagnóstico da perda (se estiver ligada)." },
    ],
    regras: [
      "Registrar a venda no funil não finaliza a venda: ela só é finalizada depois do documento gerado e assinado pelo cliente.",
      "Todo negócio perdido precisa de motivo. É isso que mostra onde a loja está perdendo cliente.",
    ],
    dicas: ["Use \"Meus negócios\" para ver só os seus e a busca para achar pelo nome do cliente ou pelo veículo."],
  },
  {
    slug: "follow-ups",
    titulo: "Follow-ups: retornar para o cliente no dia certo",
    area: "Atendimento e vendas",
    permissao: "conversas.ver",
    tela: "/sistema/follow-ups",
    resumo: "Agendar, concluir e aprovar os retornos combinados com o cliente.",
    passos: [
      { texto: "Agende pela conversa: na coluna da direita, em \"Próximo follow-up\", escolha data e hora, escreva o que retomar e toque em \"Agendar\"." },
      { texto: "Abra \"Follow-ups\" no menu para ver os atrasados, os de hoje e os próximos. Use \"Meus\" ou \"Toda a equipe\".", imagem: img("follow-ups", 1), legenda: "Lista de follow-ups pendentes" },
      { texto: "Depois de falar com o cliente, toque em \"Concluir\". Se não vai mais acontecer, \"Cancelar\". O botão \"Conversa\" abre o chat daquele cliente." },
      { texto: "Os marcados \"Voltou ao estoque\" são clientes que pediram um modelo sem unidade. Eles \"Precisam de aprovação\": confira antes de avisar o cliente.", imagem: img("follow-ups", 2), legenda: "Follow-up de modelo que voltou ao estoque" },
    ],
    regras: ["O sistema nunca manda mensagem comercial sozinho. Quem decide avisar o cliente é uma pessoa da equipe."],
  },
  {
    slug: "ligacoes",
    titulo: "Ligações: clientes que pediram para receber ligação",
    area: "Atendimento e vendas",
    permissao: "conversas.ver",
    tela: "/sistema/ligacoes",
    resumo: "Ligar, registrar o resultado e reagendar.",
    passos: [
      { texto: "Quando um cliente escreve algo como \"pode me ligar amanhã de manhã?\", o pedido aparece em \"Ligações\" no menu.", imagem: img("ligacoes", 1), legenda: "Pedidos de ligação pendentes" },
      { texto: "Toque em \"Ligar\" para fazer a ligação pelo celular." },
      { texto: "Depois, toque em \"Concluir\": escolha o resultado, a duração, escreva o que foi conversado e a próxima ação. Toque em \"Salvar\". Fica no histórico do cliente.", imagem: img("ligacoes", 2), legenda: "Janela Registrar ligação" },
      { texto: "Não conseguiu falar? Toque em \"Reagendar\" e escolha a nova data e hora." },
    ],
    regras: ["Ligue só no horário de atendimento: das 8h às 18h, de segunda a sábado. Pedido feito fora do horário aparece marcado."],
  },
  {
    slug: "vendas",
    titulo: "Vendas: do cliente até a finalização",
    area: "Atendimento e vendas",
    permissao: "vendas.ver",
    tela: "/sistema/vendas",
    resumo: "Os 10 passos da venda: cliente, veículo, valores, pagamento, documento, assinatura e finalização.",
    passos: [
      { texto: "A venda nasce quando o negócio vai para \"Venda fechada\" no funil. Para cliente de balcão, abra \"Vendas\" e toque em \"Nova venda\".", imagem: img("vendas", 1), legenda: "Lista de vendas com os números do período" },
      { texto: "Passos 1 a 4: confira o cliente (o CPF é obrigatório para o documento), escolha o veículo, preencha o valor anunciado e o valor vendido e escreva as condições (ex.: garantia, entrega). Toque em \"Salvar e continuar\" a cada passo." },
      { texto: "Passo 5, Forma de pagamento: acrescente cada forma (PIX, dinheiro, cartão, transferência, financiamento, veículo na troca, outro) com o valor. A soma precisa bater com o valor vendido.", imagem: img("vendas", 2), legenda: "Pagamento dividido em duas formas somando o valor vendido" },
      { texto: "Passo 6, Documentação: marque o que foi conferido e entregue. Passo 7, Revisão: o sistema mostra o que falta. Quando aparecer \"Tudo certo para gerar o documento\", toque em \"Ir para o documento\"." },
      { texto: "Passo 8: toque em \"Gerar documento\". Ele ganha um código único. Use \"Visualizar PDF\" para conferir.", imagem: img("vendas", 3), legenda: "Documento de venda gerado, com o código" },
      { texto: "Passo 9: o cliente assina, pelo link ou no papel (veja o tutorial Assinatura). Passo 10: toque em \"Finalizar venda\". O veículo sai do estoque.", imagem: img("vendas", 4), legenda: "Finalização com as três conferências marcadas" },
    ],
    regras: [
      "Sem parcelas e sem pagamento pendente: a loja não trabalha com carnê nem \"a receber\". Financiamento é o banco que paga a loja.",
      "A soma das formas de pagamento tem que ser igual ao valor vendido, senão o sistema não deixa seguir.",
      "Só dá para finalizar com o documento gerado e assinado.",
      "Mudou valor, veículo ou pagamento depois de gerar o documento? O documento e a assinatura deixam de valer e é preciso gerar de novo.",
      "Cancelar venda é só para administrador. O veículo volta para o estoque e fica registrado no histórico.",
    ],
    errosComuns: [
      { problema: "O botão \"Gerar documento\" não funciona.", solucao: "Leia a linha \"Antes, complete\": normalmente falta o CPF do cliente ou os pagamentos não somam o valor vendido." },
      { problema: "Apareceu \"o documento anterior deixou de valer\".", solucao: "Algum dado da venda mudou. Gere o documento de novo e peça a assinatura outra vez." },
    ],
  },
  {
    slug: "assinatura",
    titulo: "Assinatura do cliente: pelo link ou no papel",
    area: "Atendimento e vendas",
    permissao: "vendas.editar",
    tela: "/sistema/vendas",
    resumo: "Como o cliente assina o documento de venda no celular dele, ou no papel na loja.",
    passos: [
      { texto: "Na venda, com o documento já gerado, vá ao passo \"9. Assinatura\"." },
      { texto: "Pelo link: toque em \"Gerar link de assinatura\" e mande para o cliente pelo WhatsApp ou copie o link. A tela avisa sozinha quando ele assinar.", imagem: img("assinatura", 1), legenda: "Passo 9 com o link de assinatura" },
      { texto: "No celular do cliente: ele confere o documento, digita o nome completo e o CPF (igual ao do cadastro), desenha a assinatura com o dedo, marca \"Li o documento e concordo\" e confirma.", imagem: img("assinatura", 2), legenda: "O que o cliente vê para assinar" },
      { texto: "No papel: imprima o PDF, o cliente assina na loja, e você escreve o \"Nome de quem assinou\" e toca em \"Confirmar assinatura no papel\". Guarde a via assinada." },
    ],
    regras: [
      "Não é assinatura digital ICP-Brasil: é um registro de aceite eletrônico (nome, CPF, desenho, data, hora e código do documento).",
      "O CPF digitado pelo cliente precisa ser o mesmo do cadastro.",
    ],
    errosComuns: [
      { problema: "O cliente diz que o link não abre ou expirou.", solucao: "Gere um link novo no passo 9 e mande de novo." },
    ],
  },

  /* ---------------- CADASTROS ---------------- */
  {
    slug: "clientes",
    titulo: "Clientes: cadastrar e consultar a ficha",
    area: "Cadastros",
    permissao: "clientes.ver",
    tela: "/sistema/clientes",
    resumo: "Cadastro, busca e a ficha completa com negócios, compras, conversas e assistências.",
    passos: [
      { texto: "Abra \"Clientes\". Busque por nome, telefone, CPF, e-mail ou cidade e toque em \"Buscar\".", imagem: img("clientes", 1), legenda: "Lista de clientes com a busca" },
      { texto: "Para cadastrar, toque em \"Novo cliente\". Preencha os campos com *, principalmente o WhatsApp: é por ele que o sistema reconhece o cliente quando manda mensagem.", imagem: img("clientes", 2), legenda: "Formulário de cliente" },
      { texto: "Toque no nome para abrir a ficha: negócios, compras, assistências, conversas, follow-ups e histórico. Use \"Editar\" para corrigir dados." },
      { texto: "Falou com o cliente fora do sistema (ligação, visita)? Na ficha, toque em \"Registrar interação\" e escreva o que foi conversado.", imagem: img("clientes", 3), legenda: "Ficha do cliente" },
    ],
    regras: ["O sistema não aceita dois clientes com o mesmo telefone nem com o mesmo CPF."],
  },
  {
    slug: "estoque",
    titulo: "Estoque: dar entrada e controlar os veículos",
    area: "Cadastros",
    permissao: "estoque.ver",
    tela: "/sistema/estoque",
    resumo: "Cada veículo é cadastrado sozinho, com chassi e condição próprios.",
    passos: [
      { texto: "Abra \"Estoque\". No alto aparecem os disponíveis, os vendidos nos últimos 30 dias e o que pede atenção.", imagem: img("estoque", 1), legenda: "Tela do estoque" },
      { texto: "Toque em \"Dar entrada em veículo\". Escolha o modelo do catálogo, a cor, a condição, o chassi, o valor anunciado, a loja e a data de entrada. Toque em \"Salvar\".", imagem: img("estoque", 2), legenda: "Formulário de entrada de veículo" },
      { texto: "Para mudar a situação (Disponível, Reservado, Fora de venda), abra o veículo, troque a \"Situação\" e salve." },
      { texto: "Na aba \"Entradas e saídas\" você vê o que entrou e o que saiu por venda finalizada." },
    ],
    regras: [
      "Cada veículo é uma peça única: duas motos iguais são dois cadastros, cada uma com o seu chassi.",
      "Moto e triciclo elétricos não têm placa, Renavam nem ano-modelo.",
      "O custo só o administrador vê.",
      "Quando um modelo volta a ficar disponível, o sistema cria follow-ups para quem estava esperando por ele.",
    ],
  },
  {
    slug: "promocoes",
    titulo: "Promoções por tempo limitado",
    area: "Cadastros",
    permissao: "estoque.editar",
    tela: "/sistema/promocoes",
    resumo: "Preço promocional com início e fim. Quando acaba, volta ao preço normal sozinho.",
    passos: [
      { texto: "Abra \"Promoções\" no menu.", imagem: img("promocoes", 1), legenda: "Tela de promoções" },
      { texto: "Escolha o modelo, digite o preço promocional, quando começa e quando termina. Toque em \"Criar promoção\"." },
      { texto: "No site, o card do modelo mostra o preço antigo riscado, o preço da promoção e a contagem regressiva até o fim.", imagem: img("promocoes", 2), legenda: "Card do site com a contagem regressiva" },
      { texto: "Para terminar antes da hora, toque em \"Encerrar agora\"." },
    ],
    regras: [
      "O preço da promoção tem que ser menor que o preço normal.",
      "Não dá para ter duas promoções ao mesmo tempo no mesmo modelo.",
    ],
  },

  /* ---------------- PÓS-VENDA ---------------- */
  {
    slug: "assistencia",
    titulo: "Assistência técnica e garantia (OS)",
    area: "Pós-venda",
    permissao: "os.ver",
    tela: "/sistema/assistencia",
    resumo: "Abrir a ordem de serviço, registrar diagnóstico, peças e entregar ao cliente.",
    passos: [
      { texto: "Abra \"Assistência / garantia\" e toque em \"Abrir OS\".", imagem: img("assistencia", 1), legenda: "Lista de ordens de serviço" },
      { texto: "Escolha o cliente, se é Assistência ou Garantia, o veículo e onde foi recebida. Em \"Problema relatado\", escreva nas palavras do cliente. Anote o estado em que chegou (chave, carregador…). Toque em \"Abrir OS\".", imagem: img("assistencia", 2), legenda: "Formulário para abrir a OS" },
      { texto: "Na OS, avance o andamento (Em análise, Em execução, Aguardando peça, Finalizada, Entregue) e preencha diagnóstico, solução e serviços. Toque em \"Salvar\"." },
      { texto: "Em \"Peças e serviços\", lance cada item com quantidade e valor. Use \"Visualizar PDF\" ou \"Imprimir\" para o documento da OS.", imagem: img("assistencia", 3), legenda: "OS com peças e documento" },
    ],
    regras: ["Fica registrado quem abriu, quem recebeu, quem atendeu e quem finalizou cada OS."],
  },

  /* ---------------- GESTÃO ---------------- */
  {
    slug: "financeiro",
    titulo: "Financeiro: o que entrou",
    area: "Gestão",
    permissao: "financeiro.ver",
    tela: "/sistema/financeiro",
    resumo: "Entradas das vendas finalizadas e das OS entregues, por forma de pagamento.",
    passos: [
      { texto: "Abra \"Financeiro\" e escolha o período: 7 dias, 30 dias ou o mês.", imagem: img("financeiro", 1), legenda: "Resumo do financeiro" },
      { texto: "Veja a entrada total, o lucro bruto nas vendas e quanto entrou por cada forma de pagamento." },
      { texto: "Na lista \"Vendas finalizadas\", cada venda mostra valor, custo e lucro.", imagem: img("financeiro", 2), legenda: "Vendas finalizadas com custo e lucro" },
    ],
    regras: [
      "Só entram vendas finalizadas e OS entregues.",
      "Não existe contas a receber nem parcela: a loja não trabalha com isso.",
    ],
  },
  {
    slug: "usuarios",
    titulo: "Usuários: quem entra no sistema",
    area: "Gestão",
    permissao: "usuarios.gerenciar",
    tela: "/sistema/usuarios",
    resumo: "Criar acesso, escolher o perfil, trocar senha e desativar.",
    passos: [
      { texto: "Abra \"Usuários\" e toque em \"Novo usuário\".", imagem: img("usuarios", 1), legenda: "Lista de usuários" },
      { texto: "Preencha nome, usuário (o que a pessoa digita para entrar), e-mail, perfil e a senha inicial. Salve e passe a senha para a pessoa trocar no primeiro acesso.", imagem: img("usuarios", 2), legenda: "Formulário de novo usuário" },
      { texto: "Alguém esqueceu a senha? Toque em \"Senha\" ao lado do nome e crie uma nova." },
      { texto: "Saiu da loja? Toque em \"Desativar\". A pessoa não entra mais e o histórico dela continua guardado." },
    ],
    regras: [
      "Administrador: vê tudo, inclusive custo, lucro, financeiro, histórico, usuários e configurações.",
      "Consultor de vendas: atendimento, funil, clientes, vendas, estoque sem custo e assistência.",
      "Técnico: assistência, clientes e estoque sem custo.",
    ],
  },
  {
    slug: "configuracoes",
    titulo: "Configurações: dados da empresa e respostas rápidas",
    area: "Gestão",
    permissao: "config.gerenciar",
    tela: "/sistema/configuracoes",
    resumo: "Dados que saem nos PDFs, respostas rápidas do chat e o WhatsApp oficial.",
    passos: [
      { texto: "Abra \"Configurações\". Em \"Dados da empresa\", confira nome fantasia, razão social, CNPJ, WhatsApp, endereço e as condições padrão da venda e da OS: tudo isso sai nos PDFs. Toque em \"Salvar dados da empresa\".", imagem: img("configuracoes", 1), legenda: "Dados da empresa" },
      { texto: "Em \"Respostas rápidas do atendimento\", toque em \"Nova resposta\": escolha um atalho (ex.: saudacao), um título e a mensagem. No chat, é só digitar / e o atalho.", imagem: img("configuracoes", 2), legenda: "Respostas rápidas" },
      { texto: "O WhatsApp oficial da Meta também é configurado aqui: credenciais, teste de conexão e o endereço do webhook. Só mexa nisso com quem cuida do sistema.", imagem: img("configuracoes", 3), legenda: "WhatsApp — API Oficial" },
    ],
    regras: ["\"Limpar demonstração\" apaga só os dados marcados como Simulado. Dados reais não são tocados."],
  },
  {
    slug: "ia",
    titulo: "Inteligência artificial: ensinar e controlar",
    area: "Gestão",
    permissao: "config.gerenciar",
    tela: "/sistema/ia",
    resumo: "Texto por setor, base de conhecimento, publicar e a chave geral que liga e desliga a IA.",
    passos: [
      { texto: "Abra \"Inteligência artificial\". Na aba \"Prompt por setor\", escolha um setor (Identidade, Tom de voz, Regras e proibições, Produtos, Pagamento, Quando passar para o vendedor, Respostas-modelo).", imagem: img("ia", 1), legenda: "Prompt por setor" },
      { texto: "Edite o texto, escreva uma nota do que mudou e toque em \"Salvar rascunho\". Nada muda para o cliente até você tocar em \"Publicar\". O \"Histórico\" permite voltar a uma versão antiga." },
      { texto: "Na \"Base de conhecimento\", toque em \"Novo item\" e cadastre informações da loja: endereço, horário, formas de pagamento.", imagem: img("ia", 2), legenda: "Base de conhecimento" },
      { texto: "Na aba \"Controle\", a chave geral liga e desliga a IA na hora. Use \"Testar o validador\" para ver se uma resposta seria aprovada, sem mandar nada a ninguém.", imagem: img("ia", 3), legenda: "Chave geral e validador" },
    ],
    regras: [
      "A IA só usa o que está registrado no sistema. Se falta informação, ela diz que falta; não inventa.",
      "Toda resposta passa pelo validador antes de sair. Resposta com parcela, preço inventado ou dado pessoal é bloqueada.",
    ],
  },
  {
    slug: "cameras",
    titulo: "Câmeras",
    area: "Gestão",
    permissao: "cameras.ver",
    tela: "/sistema/cameras",
    resumo: "Onde as câmeras da loja vão aparecer.",
    passos: [
      { texto: "Abra \"Câmeras\" no menu. Hoje nenhuma câmera está conectada: as três posições aparecem como \"Câmera não conectada\".", imagem: img("cameras", 1), legenda: "As três posições de câmera" },
      { texto: "Quando as câmeras forem instaladas e ligadas ao sistema, a imagem de cada uma aparece na sua posição." },
    ],
  },
  {
    slug: "historico",
    titulo: "Histórico do sistema: quem fez o quê",
    area: "Gestão",
    permissao: "logs.ver",
    tela: "/sistema/logs",
    resumo: "Consultar todas as ações importantes, com pessoa, data e hora.",
    passos: [
      { texto: "Abra \"Histórico do sistema\".", imagem: img("historico", 1), legenda: "Histórico com filtros" },
      { texto: "Filtre pelo tipo de ação, pela pessoa, pelo período ou busque uma palavra na descrição. Toque em \"Filtrar\"." },
      { texto: "Cada linha mostra quem fez, o quê e quando: entradas, vendas, cancelamentos, trocas de senha, tentativas de acesso." },
    ],
    regras: ["O histórico não pode ser apagado nem editado. É o registro verdadeiro do que aconteceu."],
  },
];

export function tutorialPorSlug(slug: string) {
  return TUTORIAIS.find((t) => t.slug === slug) ?? null;
}

/** Só os tutoriais das telas que o perfil usa. */
export function tutoriaisPara(papel: Papel) {
  return TUTORIAIS.filter((t) => t.permissao === null || pode(papel, t.permissao));
}
