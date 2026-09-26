# Gêmeos Motors — loja e sistema da equipe

Sistema da **Gêmeos Motors** (Goiana e Carpina, Pernambuco): venda de **motos
e triciclos elétricos**, **compra, venda e repasse de moto a combustão e de
carro**, acessórios e assistência técnica própria.

**No ar (teste):** https://teste.gemeosmotors.com.br — abre a loja; a equipe
entra em `/login`. Roda no VPS da Hostinger, pelo EasyPanel (sem Vercel).

**Código:** https://github.com/analysissistemas/gemeos-motors, branch
`vitrine-html` (a branch `main` é outro sistema, do Leo — não misture as duas).

> **Antes era a Gêmeos do iPhone.** Em 08/09/2026 os donos passaram o sistema
> para a loja de moto elétrica. O sistema de celular está guardado inteiro na
> branch `celulares-apple` — nada foi perdido.

## Os dois lados

| Parte | Quem usa | Onde |
|---|---|---|
| **Loja (vitrine)** | Cliente | `/` — `public/vitrine.html` |
| **Sistema da equipe** | Admin, vendedor, técnico | `/sistema` — pastas `app/`, `components/`, `lib/` |

A vitrine continua sendo uma página pronta, que lê o estoque de exemplo de
`public/estoque.js`. O sistema da equipe é de verdade: login, banco de dados,
permissões por perfil e histórico de tudo que cada pessoa fez.

## O que o sistema faz

| Tela | Para quê |
|---|---|
| **Visão geral** | Números do período (hoje, 7 dias, 30 dias, mês ou datas escolhidas), funil, perdas por motivo e o que pede atenção |
| **Atendimento (Conversas)** | Conversas do WhatsApp em três colunas: lista, chat e dados do cliente/negócio. **Hoje o WhatsApp é simulado** (ver abaixo) |
| **Funil de vendas** | Quadro colorido por etapa; arrastar muda a etapa e fica gravado. Fechar e perder a venda abrem o fluxo próprio |
| **Follow-ups** | Retornos agendados: atrasados, hoje e próximos dias |
| **Clientes** | Cadastro completo, edição e ficha 360° (negócios, vendas, conversas, OS, histórico de alterações). Não deixa cadastrar o mesmo telefone duas vezes |
| **Estoque** | Cada veículo é uma peça única (chassi, km, condição). Custo só o admin vê |
| **Vendas** | Passo a passo de 10 etapas, documento em PDF com código único, assinatura pelo link ou no papel, finalização |
| **Assistência / garantia** | Ordem de serviço do recebimento à entrega, com quem recebeu, quem atendeu e quem finalizou; peças, diagnóstico, PDF |
| **Financeiro** | Entradas das vendas finalizadas e das OS entregues, por forma de pagamento (só admin). **Sem parcelas e sem contas a receber** — a loja não trabalha com isso |
| **Histórico do sistema** | Quem fez o quê e quando (só admin) |
| **Usuários / Configurações** | Perfis de acesso, dados da empresa que saem nos PDFs, respostas rápidas do chat |

### Venda perdida e IA

Ao perder uma venda, o consultor informa motivo e observações e a IA lê o
histórico para diagnosticar a perda. **A IA só usa o que está registrado** —
quando falta informação, ela diz que falta. Enquanto a IA estiver desligada ou sem
provedor, a tela avisa isso com clareza e o negócio é encerrado do mesmo jeito.

### Assinatura

O cliente abre o link no celular, confere o documento, confirma nome e CPF
(precisa ser o do cadastro) e assina com o dedo. Fica registrado data, hora,
IP e o código do documento. **Não é assinatura digital ICP-Brasil** — é um
registro de aceite eletrônico. Existe também a opção de assinar no papel.

### WhatsApp simulado

O atendimento foi feito como um sistema próprio (não é o Chatwoot embutido).
Por enquanto **nenhuma mensagem sai para o WhatsApp de verdade**: a tela mostra
"WhatsApp — Simulado" e tem um botão para simular a mensagem de um cliente.
Tudo o resto funciona de verdade: identificar o cliente pelo telefone, não lidas,
responder, notas internas, transferir, follow-up, criar negócio e mudar etapa
de dentro do chat. A ligação com a API oficial da Meta já está estruturada
(`lib/mensageria/`, `/api/webhooks/whatsapp`) e só precisa das credenciais.

## Para quem vai programar

```
npm install
# crie .env.local com DATABASE_URL e SESSION_SECRET (nunca vai para o Git)
npm run db:migrate                  # cria/atualiza as tabelas nesse banco
npm run dev                         # http://localhost:3000
```

| Comando | O que faz |
|---|---|
| `npm run build` | Compila como vai para o ar |
| `npm run lint` / `npm run typecheck` | Confere o código |
| `npm run db:generate` / `npm run db:migrate` | Cria e aplica mudanças no banco (Drizzle) |
| `npm run db:seed` | Dados iniciais (usuário admin, lojas, modelos). Não apaga nada |
| `npm run test:e2e` | Testes de ponta a ponta no Chrome (ver abaixo) |
| `npm run test:limpar` | Apaga só o que os testes criaram (marca "E2E") |
| `node scripts/copiar-banco.mjs` | Cópia única Neon → Postgres do EasyPanel (ver CLAUDE.md) |
| `node scripts/copiar-midia.mjs` | Cópia única Vercel Blob → `/data/midia` (ver CLAUDE.md) |

**Tecnologia:** Next.js 16 (App Router), React 19, Tailwind 4, Drizzle ORM com
PostgreSQL (driver `pg`; no VPS, o serviço "banco" do EasyPanel), login próprio
com sessão assinada, PDFs com `@react-pdf/renderer`, mídia do chat em disco
(`/data/midia`), IA pelo AI SDK (o diagnóstico ainda usa o AI Gateway da Vercel
e precisa trocar de provedor antes de ligar).

### Testes de ponta a ponta

Rodam no Chrome instalado, contra o site e o banco configurados:

```
npm run dev -- -p 3100
E2E_ADMIN_SENHA=... npm run test:e2e
# ou contra o site no ar:
E2E_URL=https://teste.gemeosmotors.com.br E2E_ADMIN_SENHA=... npm run test:e2e
```

Cobrem o dia de trabalho inteiro: login, usuários, cliente, estoque, funil,
venda perdida, venda fechada com pagamentos, PDF, assinatura pelo link,
finalização, OS, conversas, permissões de vendedor e técnico, histórico,
celular e a vitrine. Tudo que criam leva a marca "E2E" e é apagado no fim.

### Publicar

Envie para a branch `vitrine-html` no GitHub e clique em **Implantar** no
serviço **sistema** do EasyPanel (`http://2.25.240.204:3000`). A imagem é
montada pelo `Dockerfile`; ao subir, o container confere o volume `/data`,
aplica as migrations pendentes e liga o servidor. As variáveis ficam na aba
Ambiente do serviço (lista no CLAUDE.md).

### Scripts de fotos (Python)

`baixar_fotos_motos.py`, `otimizar_fotos.py` e `gerar_lista_fotos.py` cuidam
das fotos em `public/fotos/`. Precisam de Python e `pip install pillow`. O
site em si não precisa de Python.
