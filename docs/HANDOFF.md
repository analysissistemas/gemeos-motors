# Passagem de bastão — Gêmeos Motors (26/09/2026, fim do dia)

Leia primeiro o `CLAUDE.md` da raiz: é o combinado do projeto (onde está no ar,
travas, regras do dono, armadilhas). Este arquivo só diz **o que está no meio**.

## Onde está o código

- Branch principal: **`vitrine-html`** (conta GitHub `analysissistemas`, repo
  `gemeos-motors`). Tudo que está pronto está enviado; último commit `d3094ee`
  ou mais novo. `git pull` antes de mexer.
- Trabalho **incompleto** em outra branch: **`wip-catalogo-sistema`** (commit
  `df9448b`, feito em cima de `09e6303`). Ver tarefa 1.
- Publicar = `git push` e o dono clica **Implantar** no EasyPanel (serviço
  `sistema` do projeto `gemeos-motors`). O modo automático desta máquina
  bloqueia disparar a implantação pela URL de deploy: peça ao dono.

## Tarefas abertas (em ordem)

### 1. Catálogo gerenciado no sistema + lançamentos + reservas (lado do SISTEMA) — EM ANDAMENTO
Pedido do dono: adicionar modelo ao catálogo do site **mesmo sem estoque**; trocar a
**foto principal** e editar a **ficha técnica** (motor, autonomia, velocidade,
bateria, pneu, peso, recarga) em **Estoque → Catálogo**; marcar **lançamento** para
aparecer em destaque no site e o pessoal **reservar**. Selos escolhidos pelo dono:
"Pronta entrega", "Sob encomenda", "Consulte disponibilidade". Reserva = formulário
(nome, WhatsApp, cor) que grava no sistema e depois abre o WhatsApp.

- **O lado do SITE já está pronto e testado** na `vitrine-html` (`public/vitrine.html`
  v=19 + `public/catalogo-sistema.js`). Ele chama as duas rotas abaixo; sem elas, o
  site continua com o `estoque.js` (não quebra).
- A branch `wip-catalogo-sistema` tem o começo do lado do sistema: schema,
  `lib/servicos/catalogo.ts`, `app/sistema/estoque/acoes-catalogo.ts`, mudanças em
  dominio/negocios/logs. **Falta:** o componente da aba Catálogo (lista + "Novo
  modelo" + diálogo com foto principal, ficha em 7 campos que carregam os valores
  atuais, mostrar no site, disponibilidade, lançamento + frase curta, ordem, e o
  diálogo de cores que já existe), a tela `app/sistema/reservas` (menu perto de
  Test drives; status nova/contatada/confirmada/cancelada; botão que abre a
  conversa no sistema via `abrirConversaComNumero`), as rotas públicas, tutorial em
  `lib/ajuda/tutoriais.ts`, a migration e a verificação. Revise o que está na WIP
  antes de aproveitar — foi interrompida no meio.
- **Contrato que o site já usa (não mudar):**
  - `GET /api/vitrine/catalogo` (sem login; cache 60 s; 503 no erro) →
    `{ modelos: [{ id, nome, tipo: "moto_eletrica"|"moto_combustao"|"carro"|"acessorio", marca, preco: number|null, ficha: {motor,autonomia,...}|null (só as chaves preenchidas), descricao, foto: "/api/vitrine/foto/..."|null, cores: [{nome,hex,foto}], disponibilidade: "pronta_entrega"|"sob_encomenda"|"consultar", lancamento: bool, lancamentoTexto, reservas: number, ordem }] }`
    — só `ativo && mostrarNoSite`, ordem `ordem, nome`. Nunca custo nem estoque.
  - `POST /api/vitrine/reserva` (sem login) body `{ modeloId, nome, whatsapp, cor?, site }`
    (`site` é armadilha para robô: tem que vir vazio). Valida com zod, só modelo com
    `lancamento=true`; limite por IP (ex.: 5/hora, 20/dia, igual ao login com
    `ipConfiavel`); acha ou cria o cliente pelo telefone (`variantesTelefone`/
    `normalizarTelefone` de `lib/mensageria/servico.ts`), cria negócio no funil com
    origem `reserva_lancamento`, grava em `reservas_lancamento`, não duplica a mesma
    reserva. Resposta `{ ok: true, mensagem, whatsapp }` (texto do WhatsApp sem
    emoji; negrito com `*` pode) ou `{ ok: false, erro }` 422/429/503.
- **Migration:** os 3 acessórios de `public/estoque.js` (`CAT_ACES`: "Capacete TOMATE
  Azul", "Capacete TOMATE Branco", "Baú 28 litros", com a descrição de lá, preço
  nulo, tipo `acessorio`) precisam entrar na tabela `modelos` — senão, quando a API
  responder, **os acessórios somem do site** (o site esconde o que a API não lista).
- Testar: banco descartável com `embedded-postgres` numa pasta temporária, banco
  **UTF-8** (`create database x with encoding 'UTF8' template template0 lc_collate 'C' lc_ctype 'C'`;
  o padrão do Windows é WIN1252 e quebra emoji), `node scripts/migrar.mjs` e
  `SEED_ADMIN_SENHA=... node scripts/semear.mjs` com `DATABASE_URL` apontando só
  para ele (**nunca** o `.env.local`, que aponta para o banco antigo), `next build` +
  `next start`, testes com Playwright (`chromium.launch({ channel: "chrome" })`).
  Rodar `npm run test:e2e` com `E2E_URL` e `E2E_ADMIN_SENHA`: estava 20/20.

### 2. Modelos de mensagem aprovados pela Meta (templates) — NÃO COMEÇADO
Sem isso a loja não consegue escrever primeiro para contato novo nem para cliente
calado há mais de 24 h (erro 131047, já traduzido em `lib/mensageria/provedores.ts`).
Precisa: listar os templates aprovados da WABA, escolher e enviar com variáveis, e
um jeito de o botão "Conversar" do contato compartilhado usar isso.

### 3. Conferir no ar depois da próxima implantação (com o dono)
- Configurações → API Oficial: token do usuário do sistema **chatsystem** + App
  Secret colados e "Testar conexão" ok (o Chrome tinha sobrescrito o token antes).
- Mandar texto e áudio para um cliente: chegou como mensagem de voz? Risquinhos
  mudam sem F5? Resposta do cliente aparece sem F5?
- Logo do login/sistema abrindo (corrigido em `09e6303`, falta implantar).
- Pino do mapa "Onde estamos" no lugar certo da loja.

## Já feito hoje (para não refazer)
Trava por senha em Configurações e IA; token da Meta protegido; chat com responder,
reagir, apagar para mim, apagada pelo cliente, cartão de contato, localização,
vídeo, figurinha, sem F5; áudio como mensagem de voz; fotos de perfil; test drive;
cores com foto por cor; vitrine sem triciclo e sem Carpina, mapa "Onde estamos",
clique no card = "Quero essa moto"; limpeza das vendas e veículos fictícios (JÁ
RODADA no servidor, com cópia em `/data/backup/`); script `scripts/espaco.mjs` e
regras de disco no CLAUDE.md.

## Como o dono quer ser tratado
Leigo em programação: português simples, recomendação em vez de cardápio, nunca
dizer que funciona sem testar, economizar tokens (leituras pontuais, poucos prints,
poucos agentes). `public/vitrine.html` só se mexe com "sim" explícito dele — as
mudanças acima (v=19) já foram autorizadas.
