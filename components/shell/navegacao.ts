import type { Permissao } from "@/lib/dominio";

export type ItemMenu = {
  href: string;
  rotulo: string;
  icone: string;
  permissao: Permissao;
  contador?: "conversas" | "followups" | "os" | "ligacoes";
};

export const SECOES_MENU: { titulo: string; itens: ItemMenu[] }[] = [
  {
    titulo: "Operação",
    itens: [
      { href: "/sistema", rotulo: "Visão geral", icone: "painel", permissao: "painel.ver" },
      { href: "/sistema/conversas", rotulo: "Atendimento", icone: "conversas", permissao: "conversas.ver", contador: "conversas" },
      { href: "/sistema/funil", rotulo: "Funil de vendas", icone: "funil", permissao: "funil.ver" },
      { href: "/sistema/ligacoes", rotulo: "Ligações", icone: "ligacoes", permissao: "conversas.ver", contador: "ligacoes" },
      { href: "/sistema/follow-ups", rotulo: "Follow-ups", icone: "followups", permissao: "conversas.ver", contador: "followups" },
    ],
  },
  {
    titulo: "Cadastros",
    itens: [
      { href: "/sistema/clientes", rotulo: "Clientes", icone: "clientes", permissao: "clientes.ver" },
      { href: "/sistema/estoque", rotulo: "Estoque", icone: "estoque", permissao: "estoque.ver" },
    ],
  },
  {
    titulo: "Vendas e serviços",
    itens: [
      { href: "/sistema/vendas", rotulo: "Vendas", icone: "vendas", permissao: "vendas.ver" },
      { href: "/sistema/assistencia", rotulo: "Assistência / garantia", icone: "assistencia", permissao: "os.ver", contador: "os" },
    ],
  },
  {
    titulo: "Gestão",
    itens: [
      { href: "/sistema/financeiro", rotulo: "Financeiro", icone: "financeiro", permissao: "financeiro.ver" },
      { href: "/sistema/logs", rotulo: "Histórico do sistema", icone: "logs", permissao: "logs.ver" },
      { href: "/sistema/cameras", rotulo: "Câmeras", icone: "cameras", permissao: "cameras.ver" },
      { href: "/sistema/ia", rotulo: "Inteligência artificial", icone: "ia", permissao: "config.gerenciar" },
      { href: "/sistema/usuarios", rotulo: "Usuários", icone: "usuarios", permissao: "usuarios.gerenciar" },
      { href: "/sistema/configuracoes", rotulo: "Configurações", icone: "config", permissao: "config.gerenciar" },
    ],
  },
];
