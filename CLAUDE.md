# Gêmeos Motors — notas do projeto

> Este arquivo é lido automaticamente pelo Claude Code ao abrir esta pasta.
> É o combinado do projeto. Mantenha atualizado quando algo mudar.

## O que mudou — leia primeiro

**08/09/2026:** este sistema **era** a "Gêmeos do iPhone", loja de celular. Os
donos passaram tudo para a **Gêmeos Motors**, a loja de moto elétrica deles em
Goiana. O sistema de celular está inteiro na branch `celulares-apple` (e as fotos
da Apple em `public/fotos/_apple/`, local, fora do Git). Se um dia voltarem ao
celular, é `git checkout celulares-apple`.

**14–15/09/2026:** o protótipo de arquivo único (`index.html` + `login.html`,
dados no navegador) virou **sistema de verdade** em Next.js, com banco de dados,
login, permissões, histórico, vendas com PDF e assinatura, assistência,
atendimento (WhatsApp simulado) e testes de ponta a ponta. O protótipo antigo
está em `_legado/` só para consulta. A vitrine continua sendo a página pronta
de sempre, agora em `public/vitrine.html`.

## Onde este projeto vive — leia antes de qualquer git

| | |
|---|---|
| Conta | **analysissistemas** (a empresa, não a conta pessoal) |
| Repositório | `analysissistemas/gemeos-motors` |
| Branch | **`vitrine-html`** |

O repositório se chamava `gemeos-do-iphone` e foi renomeado para `gemeos-motors`
em 20/09/2026, a pedido do dono (o nome antigo confundia no GitHub). O GitHub
redireciona o endereço antigo sozinho, então quem já tinha o projeto baixado
continua conseguindo dar `git push` — mas vale trocar o endereço:
`git remote set-url origin https://github.com/analysissistemas/gemeos-motors`.
A **pasta local** aqui ainda se chama `gemeos-do-iphone`; só o nome, nada
depende disso.

**A branch `main` do mesmo repositório é OUTRO sistema**, feito em Next.js +
Supabase pelo **Leo** (sócio do dono), com a IA de atendimento "Milton". Nunca
enviar nada para `main`, nunca fazer merge das duas. São duas abordagens
diferentes para a mesma loja, e a decisão de qual segue é dos sócios.

A branch local já se chama `vitrine-html` e rastreia a do GitHub, então
`git push` simples basta. **Combinado com o dono: commitar e enviar sempre,
sem precisar perguntar a cada vez.** O repositório é **público**: nunca
commitar `.env*`, senha ou token.

### No ar (Vercel)

| | |
|---|---|
| Endereço | **https://gemeos-motors.vercel.app** (abre a loja; equipe em `/login`) |
| Conta Vercel | `analysissistemas-3246`, projeto `gemeos-motors`, região `gru1` |
| Banco | Neon Postgres (free), criado pelo Marketplace da Vercel (`gemeos-motors-db`) |
| Como publicar | na pasta do projeto: `vercel deploy --prod` (a pasta já está ligada) |

**Não é ligado ao GitHub**: `git push` não atualiza o site.

> **26/09/2026 — saída da Vercel.** O dono decidiu levar o sistema para o VPS
> da Hostinger (EasyPanel, IP `2.25.240.204`), compilado pelo `Dockerfile` da
> raiz. Os testes são em **teste.gemeosmotors.com.br**; o domínio principal fica
> em manutenção (`MODO_MANUTENCAO=1`) até ser republicado. `SITE_URL` define o
> endereço do callback do WhatsApp. O botão "Chamar no WhatsApp" da tela de
> manutenção vai para **5511948709625**.

Variáveis no painel da Vercel: `DATABASE_URL` e afins (vêm da integração Neon),
`SESSION_SECRET` (assina o cookie de sessão). Opcionais: `IA_MODELO` (padrão
`anthropic/claude-sonnet-5`) e, para o WhatsApp real,
`MENSAGERIA_PROVEDOR=whatsapp_cloud` + `WHATSAPP_TOKEN`,
`WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_APP_SECRET`.
Localmente: `vercel env pull .env.local`.

O site antigo do celular, `gemeos-do-iphone.vercel.app`, **continua no ar** numa
conta da Vercel que não abre neste computador. Para tirá-lo do ar precisa de
quem tem essa conta.

### Acesso

O usuário `admin` foi criado pelo `npm run db:seed` com senha aleatória, mostrada
uma vez só no terminal e entregue ao dono — **não está em arquivo nenhum do
repositório**. Os usuários antigos do protótipo (`gemeo1`, `gemeo2`,
`gemeos123`) não existem mais. Perdeu a senha do admin: outro admin redefine em
Usuários; se não houver, gerar hash novo com `lib/auth/senha.ts` direto no banco.

## Trava: `vitrine.html` não se mexe sem autorização explícita

**Nunca editar `public/vitrine.html` por conta própria** — nem para "melhorar",
nem como efeito colateral de mexer em outra coisa. Antes de qualquer edição
nesse arquivo, pedir confirmação nomeando o arquivo e o que vai mudar, e
esperar um "sim" claro.

Se o pedido for sobre dado (estoque, preço, foto, categoria), o caminho é
mexer no `public/estoque.js` — o `vitrine.html` só lê o que os outros
produzem, quase nunca precisa mudar por dentro.

**Por quê:** numa sessão de 2026-08-16, o dono pediu reversão de código várias
vezes seguidas achando que `vitrine.html` tinha sido alterado, quando o arquivo
nunca mudou — o `git diff` provou isso repetidas vezes. Tratar como intocável
por padrão evita esse ciclo.

> Liberações anteriores, todas com autorização expressa do dono; a trava
> voltou a valer depois de cada uma:
> - 08/09/2026 — virada de celular para moto.
> - 13/09/2026 — tirar o botão de condição do card, pular fotos que não
>   existem, prévia do link/ícone, detalhes de card e topo.
> - 14/09/2026 — acessórios reais do site oficial com foto e "Consultar
>   preço", galeria "Clientes Gêmeos Motors", bloco "Quem somos" com a foto
>   dos gêmeos, e tirar tudo de parcela e carnê.
> - 26/09/2026 — só elétrica zero km (sem seminova, sem moto a combustão e sem
>   carro nos textos), WhatsApp novo, `v=15`, prévia do link em
>   gemeosmotors.com.br e cronômetro das promoções. Depois, só dado verdadeiro:
>   um card por modelo real, sem aviso de chegada inventado, rodapé sem
>   "exemplo", `v=16`.

## O dono

Se descreve como **leigo em programação**. Explicar em linguagem simples, sem
jargão, e dar recomendação em vez de cardápio de opções. Ele responde rápido e
manda vários pedidos seguidos — vale confirmar prioridade quando a fila cresce.
Pediu para **não perguntar a cada pequena decisão de design** e para **nunca
dizer que algo funciona sem ter testado**.

## A loja

**Gêmeos Motors**, em **Goiana e Carpina, Pernambuco**. Vende **moto elétrica**
e **triciclo elétrico**, faz **compra, venda e repasse de moto a combustão e de
carro**, vende acessórios e tem **assistência técnica própria**.

| | |
|---|---|
| Site oficial | gemeosmotors.com.br (React, feito no Hostinger Horizons) |
| WhatsApp | **5511948709625** — (11) 94870-9625 (desde 26/09/2026; antes (81) 99386-9767) |
| Instagram | @gemeosmotors_goiana |
| Logo | amarelo e preto, com os dois memojis: "#A MELHOR DA REGIÃO" |

O **site oficial e este sistema são coisas separadas**. Nas **motos elétricas**
os dois mostram os mesmos modelos e os mesmos preços — se um mudar, o outro
precisa mudar junto. Carro e moto a combustão existem **só aqui**.

## Como o sistema está montado

| Pasta | O quê |
|---|---|
| `public/vitrine.html` + `public/*.js` | A loja do cliente (estática). `/` serve a vitrine (`/vitrine` redireciona para `/`) |
| `app/login`, `app/sistema/*` | Telas da equipe (Next.js App Router, componentes de servidor + ações de servidor) |
| `app/assinar/[token]` | Página pública de assinatura do cliente |
| `app/api/*` | PDFs, contadores do menu, sincronização do chat, webhook do WhatsApp |
| `lib/db/schema.ts` + `drizzle/` | Tabelas (22) e migrações |
| `lib/auth/` | Senha (scrypt), sessão (cookie `gm_sessao`, 2 h sem renovar, assinado), `exigirPermissao`/`autorizar` |
| `lib/dominio.ts` | Perfis e permissões (`PERMISSOES`), etapas, motivos de perda, status |
| `lib/servicos/` | Regras de negócio: negócios, vendas, OS |
| `lib/mensageria/` | Atendimento: provedor simulado, provedor WhatsApp Cloud (preparado), triagem |
| `lib/ia/` | Única porta para a IA; prompts que proíbem inventar dado |
| `lib/pdf/` | Documento de venda e de OS |
| `lib/logs.ts` | Histórico: toda ação importante grava quem, o quê e quando |
| `tests/e2e/` | Testes de ponta a ponta (Playwright no Chrome) |

**Perfis:** `admin` (tudo, inclusive custo, lucro, financeiro, histórico,
usuários e configurações), `vendedor` (atendimento, funil, clientes, vendas,
estoque sem custo, assistência) e `tecnico` (assistência, clientes, estoque
sem custo; cai direto na assistência). A checagem é feita no servidor, em cada
página, ação e rota de API — esconder botão não é segurança.

## Decisões de produto já tomadas

- **Sem parcelas e sem pagamento pendente, em lugar nenhum** (pedido do dono em
  14/09/2026): nem na vitrine, nem na venda, nem no financeiro. Formas de
  pagamento: Pix, dinheiro, crédito, débito, transferência, financiamento
  (é o banco que paga a loja), veículo na troca e outro. Uma venda pode dividir
  entre várias formas, e **a soma precisa bater com o valor vendido** — o
  sistema não deixa fechar de outro jeito.
- **Nenhum número fictício na tela.** Campo vazio fica vazio ("—"), nunca zero.
  Dados de demonstração do atendimento levam `demo=true`, selo "Simulado", ficam
  fora das métricas e somem com "Limpar demonstração".
- **A IA não inventa.** Diagnóstico de perda, triagem e apoio da OS usam só o que
  está registrado e listam o que faltou. Sem IA disponível, o fluxo segue e a
  tela diz por quê.
- **Assinatura não finge validade jurídica.** É registro de aceite eletrônico
  (nome, CPF igual ao do cadastro, desenho, data, hora, IP, código do documento).
  O texto diz que não é ICP-Brasil. Mudar dados da venda depois do documento
  gerado anula documento e assinatura.
- **Venda só é finalizada** com pagamentos batendo, documento gerado e assinado.
- **"Sincronizar Kommo" foi removido** — não existe integração com o Kommo.
- **Cada veículo é peça única** (chassi, quilometragem, avarias, e placa e ano
  quando é emplacado), nunca contagem por modelo. **Acessórios são por
  quantidade.**
- **`eletrico:false` separa as duas realidades** na vitrine. Moto elétrica não tem
  placa, Renavam nem ano-modelo e não precisa de CNH. Moto a combustão e carro
  têm tudo isso.
- **Condição é guardada no masculino e traduzida na hora de mostrar**
  (`condRotulo`), senão a tela escreve "moto seminovo".
- **Veículo de repasse não é "zero km" nem "de vitrine"**: chega usado.
- **O card da vitrine não tem botão de condição.** Cada card é uma moto só; a
  condição fica no selo da foto. Não reintroduzir sem recalcular preço e mensagem.
- **Acessório sem preço publicado mostra "Consultar preço"** e a mensagem do
  WhatsApp pergunta o valor. O site oficial não publica preço de acessório;
  inventar seria o site mentindo.
- **A quilometragem faz o papel que a saúde da bateria fazia no celular.**
- **Os três "não" são o argumento principal** (não precisa de CNH, não paga
  emplacamento, não paga IPVA) e **valem SÓ para a linha elétrica**. Carro e moto
  a combustão mostram "Documentação em dia". Essa linha não se apaga.
- **Sem emoji na vitrine nem na mensagem do WhatsApp da vitrine** — chegou como
  "?" no celular do cliente. No site ficam ícones SVG; na mensagem, o negrito do
  WhatsApp (`*texto*`). (O chat interno da equipe tem emoji: foi pedido.)
- **A ficha técnica fica no card**, não atrás de um clique.
- **Foto só aparece no produto que ela realmente mostra.** Sem foto, o card
  desenha um contorno de moto.
- **A cor de cada modelo é a cor da foto.** Outras cores: acrescentar em
  `estoque.js` **e** em `cores-motos.js`, com o nome igual nos dois.
- **Vídeo do hero: "a tropa chegou"**, o vídeo da própria loja.

## Só dado verdadeiro (desde 26/09/2026)

Pedido do dono: **nada de dado fictício**. A vitrine mostra um card por modelo
real (os 7 elétricos e o triciclo MM3, todos zero km), com preço de tabela, cor
e ficha técnica da loja, e os 3 acessórios reais. Não existe mais estoque
sorteado, chassi, placa, quilometragem, avaria nem data de chegada inventados
no `public/estoque.js`, nem catálogo de moto a combustão ou carro. A
disponibilidade o cliente confirma no WhatsApp. Não reintroduzir exemplo.

A vitrine **ainda não lê o banco**; quando ler, o estoque passa a ser o do
sistema da equipe.

## Testes

`npm run test:e2e` roda 19 testes no Chrome (sistema inteiro + vitrine) contra
`E2E_URL` (padrão `http://localhost:3100`), com `E2E_ADMIN_SENHA` definida.
Tudo que os testes criam leva a marca **"E2E"** (clientes, veículos, usuários
`e2e.*`) e é apagado no fim por `scripts/limpar-e2e.mjs`, que não toca em
nada sem essa marca. `E2E_MANTER=1` deixa os dados para olhar. Os logins do
admin feitos pelos testes ficam no histórico — é o registro verdadeiro.

Antes de publicar: `npm run lint`, `npm run typecheck`, `npm run build` e os
testes. Rodados em 15/09/2026: 19/19 no build local e 19/19 no site no ar.

## Armadilhas que já custaram tempo

- **zod 4 e campo opcional.** `z.union([..., z.undefined()])` **não** torna a
  chave opcional: se o formulário não manda o campo, dá "expected nonoptional"
  e o cadastro falha sem campo destacado. Use `.optional()` fora da união. E
  ponha `z.null()` e `z.literal("")` **antes** do `z.coerce.number()`: coerção
  transforma `null` e `""` em **0**, e aí preço vazio vira R$ 0 e km vazio vira
  0 km. Aconteceu de verdade e os testes pegaram.
- **Parâmetro de endereço que abre diálogo** (`?novo=`, `?negocio=` no funil):
  limpar logo ao abrir a página. Limpar ao fechar o diálogo remontava a tela e
  perdia o estado; não limpar reabria o formulário ao recarregar.
- **Quadro de assinatura no celular:** rolar a página dispara `resize` sem mudar
  a largura. Redimensionar o canvas aí apagava a assinatura já feita.
- **`next dev` escreve um bloco no fim deste arquivo** (regras do Next.js). É
  esperado; commitar junto.
- **Rodar `next build` com o `next dev` ligado** estraga o servidor de
  desenvolvimento (mesma pasta `.next`). Parar o dev antes — e conferir se o
  processo `node` morreu mesmo.
- **Cache do navegador na vitrine.** Os scripts são chamados com `?v=N` em
  `public/vitrine.html`. **Suba esse número sempre que mexer em `estoque.js`,
  `cores-motos.js` ou `fotos-disponiveis.js`.** Hoje está em `v=16`.
- **`public/estoque.js` é público.** Nunca pôr custo, lucro ou margem nele. O
  teste da vitrine confere que não existe `custo:` no arquivo.
- **Prévia do link no WhatsApp usa endereço completo** nas tags `og:` do
  `vitrine.html` (`https://gemeos-motors.vercel.app/...`). Mudou o domínio,
  troque lá.
- **`.vercelignore` decide o que sobe.** Notas, scripts, testes, pastas com `_`,
  fotos da Apple, vídeos do iPhone e os PNG/JPG originais ficam de fora. Arquivo
  novo que o site precise e que caia numa dessas regras não aparece no ar.
- **`sem_acento` em Python ≠ `semAcento` em JavaScript** (o `isalnum()` do Python
  aceita "ª"). O `baixar_fotos_motos.py` usa a mesma regra do `estoque.js`.
- **Só o `.webp` vai para o GitHub.** Depois de acrescentar foto em
  `public/fotos/`, rodar `python otimizar_fotos.py` **e**
  `python gerar_lista_fotos.py`.
- **IA pelo AI Gateway da Vercel** exige cartão cadastrado na conta, mesmo no
  crédito grátis. Sem isso a resposta é "requires a valid credit card" e o
  sistema mostra "A IA ainda não está ativada".

## Como mexer

```
npm run dev                      # sistema em http://localhost:3000
npm run db:generate              # depois de mudar lib/db/schema.ts
npm run db:migrate               # aplica no banco do .env.local
python baixar_fotos_motos.py     # baixa a foto oficial de cada moto do site da loja
python otimizar_fotos.py         # gera o .webp (obrigatório após baixar)
python gerar_lista_fotos.py      # atualiza public/fotos-disponiveis.js (obrigatório)
```

## O que falta (em ordem de impacto)

1. **Cadastrar o cartão no AI Gateway da Vercel** — liga diagnóstico de perda,
   triagem do atendimento e apoio da OS. O código já está pronto.
2. **WhatsApp real** — conta WhatsApp Business na Meta, credenciais nas
   variáveis da Vercel e o webhook `/api/webhooks/whatsapp` cadastrado no app da
   Meta. Mídia recebida ainda precisa ser baixada e guardada (Vercel Blob).
3. **Vitrine lendo o estoque do banco** — hoje ela mostra o exemplo do
   `estoque.js`; o sistema da equipe já tem o estoque de verdade.
4. **Mídia do chat simulado** fica gravada dentro do banco (limite de 2 MB);
   com o WhatsApp real, passar para armazenamento de arquivos.
5. **Upload de foto do veículo pelo sistema** — principalmente seminovas.
6. Atualização em tempo real no chat (hoje consulta a cada 3 s com a tela aberta).
7. Tirar do ar o `gemeos-do-iphone.vercel.app` (precisa da outra conta).

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
