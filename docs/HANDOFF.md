# Passagem de bastão — Gêmeos Motors (26/09/2026, fim do dia)

Leia primeiro o `CLAUDE.md` da raiz: é o combinado do projeto (onde está no ar,
travas, regras do dono, armadilhas). Este arquivo só diz **o que está no meio**.

## Onde está o código

- Branch principal: **`vitrine-html`** (conta GitHub `analysissistemas`, repo
  `gemeos-motors`). Tudo que está pronto está enviado; último commit o merge
  do catálogo (26/09) ou mais novo. `git pull` antes de mexer.
- Publicar = `git push` e o dono clica **Implantar** no EasyPanel (serviço
  `sistema` do projeto `gemeos-motors`). O modo automático desta máquina
  bloqueia disparar a implantação pela URL de deploy: peça ao dono.

## Tarefas abertas (em ordem)

### 1. Catálogo gerenciado no sistema + lançamentos + reservas — FEITO (26/09/2026, falta implantar)
Juntado na `vitrine-html` (branch `catalogo-sistema`). Aba **Estoque → Catálogo**,
tela **Reservas**, rotas `GET /api/vitrine/catalogo` e `POST /api/vitrine/reserva` no
contrato que o site já usa, migration com os 3 acessórios e tutoriais. Testado em banco
descartável (embedded-postgres UTF-8): e2e 20/20, lint e typecheck ok; lançamento aparece
em destaque, reserva grava cliente + negócio (origem `reserva_lancamento`) sem duplicar,
armadilha de robô dá 422, JSON sem custo nem estoque.
- **Conferir no ar depois de Implantar (com o dono):** catálogo igual, com os 3
  acessórios; marcar lançamento em Estoque → Catálogo faz aparecer em destaque (até
  60 s de cache); reserva pelo site aparece em Reservas e no Funil.
- **Pendência pequena:** o ajudante corrigiu uma contagem errada de reservas; o mesmo
  jeito de escrever a consulta existe nas consultas antigas de clientes e conversas.
  Vale conferir.
- Para testar de novo: banco descartável com `embedded-postgres`, banco **UTF-8**
  (`create database x with encoding 'UTF8' template template0 lc_collate 'C' lc_ctype 'C'`),
  `node scripts/migrar.mjs` e `SEED_ADMIN_SENHA=... node scripts/semear.mjs` com
  `DATABASE_URL` **e** `DATABASE_URL_UNPOOLED` apontando só para ele, `next build` +
  `next start`, `npm run test:e2e` com `E2E_URL` e `E2E_ADMIN_SENHA`. **Cuidado:** a
  limpeza dos testes (`tests/e2e/limpeza.ts`) usa `--env-file=.env.local` (banco
  antigo): deixe `DATABASE_URL` do banco descartável definido antes de rodar.

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
