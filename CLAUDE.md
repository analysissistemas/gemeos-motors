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

### No ar (Hostinger — EasyPanel)

Desde 26/09/2026 o dono decidiu: **nada depende mais da Vercel**. O sistema
roda só no VPS da Hostinger, com o EasyPanel.

| | |
|---|---|
| Teste | **https://teste.gemeosmotors.com.br** (loja em `/`, equipe em `/login`) |
| Domínio principal | **gemeosmotors.com.br** e **www** — no VPS desde 26/09/2026, em manutenção (`MODO_MANUTENCAO=1`, só `teste` liberado) até o dono liberar |
| VPS | `srv2001302.hstgr.cloud`, IP `2.25.240.204`; EasyPanel em `http://2.25.240.204:3000` |
| Projeto no EasyPanel | `gemeos-motors`: serviço **sistema** (este código) e serviço **banco** (PostgreSQL 18, base `gemeos`, endereço interno `gemeos-motors_banco:5432`, sem SSL) |
| Mídia do chat | volume montado em **`/data`** no serviço sistema (`MIDIA_DIR=/data/midia`) |
| DNS | na Hostinger (`dns-parking.com`): A `@` e A `teste` → `2.25.240.204`; CNAME `www` → `gemeosmotors.com.br` |
| Como publicar | enviar para o GitHub e clicar em **Implantar** no serviço sistema (o EasyPanel puxa a branch `vitrine-html` e compila pelo `Dockerfile`) |

O container, ao subir (`scripts/iniciar.mjs`): confere se `/data/midia` aceita
gravação (se não, para com mensagem clara), aplica as migrations pendentes no
banco de `DATABASE_URL` (banco novo e vazio ganha as tabelas sozinho) e liga o
servidor.

**Variáveis** (aba Ambiente do serviço sistema): `DATABASE_URL` (o endereço
interno do serviço banco), `SESSION_SECRET` (32+ caracteres; assina o cookie de
sessão e cifra as credenciais do WhatsApp salvas no banco — trocar obriga a
digitar de novo as credenciais em Configurações), `SITE_URL`
(`gemeosmotors.com.br`; é o endereço do callback do WhatsApp),
`MIDIA_DIR` (já vem `/data/midia` na imagem). Opcionais: `OPENAI_API_KEY`,
`IA_MODELO`, `MODO_MANUTENCAO=1` + `MANUTENCAO_LIBERADOS`, e as `WHATSAPP_*`
de reserva. Localmente: `.env.local` na pasta (nunca no Git).

### Credenciais do WhatsApp — para NUNCA precisar digitar de novo

Token permanente e App Secret da Meta são salvos em Configurações → API
Oficial, cifrados no banco com a chave que sai do `SESSION_SECRET`. Ficam
guardados para sempre (o banco está em volume do EasyPanel), desde que:

1. **O `SESSION_SECRET` do EasyPanel nunca mude.** Mudou, as credenciais salvas
   deixam de abrir, o sistema cai para o modo simulado sem avisar o cliente, e
   é preciso digitar tudo de novo. Foi o que aconteceu em 26/09/2026 na saída
   da Vercel.
2. **O token seja de Usuário do sistema (System User) da Meta**, que não vence.
   Token temporário do painel de desenvolvedor vence em 24 h.
3. **Ninguém rode de novo `copiar-banco.mjs` com `FORCAR=1`**: ele esvazia o
   banco do VPS antes de copiar.

**Não use campo `type="password"` para token ou segredo.** O Chrome ignora
`autoComplete="off"` e põe ali a senha salva do site; o Salvar gravou a senha do
login no lugar do token da Meta em 26/09/2026 (envio passou a dar "Authentication
Error"). Os campos da API Oficial são texto mascarado, e token novo só é gravado
se a Meta aceitar. O token em uso é do usuário do sistema **chatsystem** (empresa
Milton Neto, app `gemeos-motors-api` 2603611416754210, o que está "ao vivo").

**Configurações e Inteligência artificial pedem a senha A CADA ENTRADA** (`lib/auth/desbloqueio.ts`,
pedido do dono por segurança): cada área tem seu cookie assinado (`gm_config`, `gm_ia`);
sair da tela (menu, Voltar, F5, fechar a aba) tranca por beacon em `/api/config/trancar`
(ação de servidor disparada no meio da troca de tela volta sem Set-Cookie: não usar), e o
cookie vence em 15 min mesmo com a tela aberta. Toda ação confere no servidor
(`autorizarConfig(area)`). 5 senhas erradas em 15 min trancam.

Callback cadastrado na Meta: `https://gemeosmotors.com.br/api/webhooks/whatsapp`
(o webhook passa pela manutenção).

**Saída da Vercel — cópia única dos dados: JÁ FEITA em 26/09/2026** (32 tabelas e
10 arquivos do chat, com `scripts/copiar-banco.mjs` e `scripts/copiar-midia.mjs`). **Não repetir.**

> **IA:** `lib/ia/cliente.ts` fala direto com a OpenAI quando `OPENAI_API_KEY` está no
> Ambiente do EasyPanel (modelo `IA_MODELO`, padrão `gpt-4.1-mini`). Sem a chave, cairia no AI
> Gateway da Vercel, que não é mais usado. Depois da chave: ligar em Inteligência artificial → Controle.

O site antigo do celular, `gemeos-do-iphone.vercel.app`, **continua no ar** numa
conta da Vercel que não abre neste computador. Para tirá-lo do ar precisa de
quem tem essa conta.

### Espaço em disco do VPS — conferir sempre

Em 26/09/2026: **11,7 GB usados de 95,8 GB (12%)**, com a **Limpeza Diária do
Docker ligada** (EasyPanel → Configurações → Geral). Com ela, as imagens velhas
de cada implantação somem sozinhas; o que cresce de verdade é a **mídia do chat**
(`/data/midia`: áudio, foto, vídeo, documento, fotos de perfil e do catálogo) e o
banco. Regras para qualquer sessão que mexer no sistema:

1. **Nunca desligar a Limpeza Diária do Docker.** Sem ela, cada implantação
   deixa ~1 GB para trás e o disco enche em poucos meses.
2. Antes de uma leva grande de mudanças, e uma vez por mês, rodar no console do
   serviço sistema `node scripts/espaco.mjs` (só lê; mostra mídia por tipo e por
   mês, cópias de segurança e tamanho do banco) e anotar aqui o número do card
   Disco do painel. Passou de **70%**, avisar o dono antes de qualquer coisa.
3. Cópias de segurança em `/data/backup` (ex.: da limpeza de vendas) não se
   apagam sozinhas: `MANTER_BACKUPS=5 node scripts/espaco.mjs` deixa só as 5
   mais novas.
4. Foto nova (perfil, catálogo) é reduzida no navegador antes de subir; não
   guardar arquivo original grande no servidor. A mídia do chat é compactada sozinha
   (`lib/mensageria/compactar.ts`: foto JPEG até 1600 px, vídeo 720p em segundo plano);
   a antiga, com `APLICAR=1 node scripts/compactar-midia.mjs` no console. Mídia do cliente não se apaga
   por conta própria: é registro do atendimento.
5. Nada de arquivo gravado fora de `/data` (some a cada implantação e ainda
   ocupa a camada do container).

Previsão com a limpeza ligada: a mídia de WhatsApp de uma loja desse porte fica
na casa de 1 a 3 GB por mês (vídeo é o que mais pesa), então os ~84 GB livres
duram **anos**. Refazer a conta com os números do `espaco.mjs` depois do
primeiro mês de uso real.

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

> Liberações anteriores (todas com autorização expressa do dono; a trava voltou a
> valer depois de cada uma): ver `docs/vitrine-liberacoes.md`.

## O dono

Se descreve como **leigo em programação**. Explicar em linguagem simples, sem
jargão, e dar recomendação em vez de cardápio de opções. Ele responde rápido e
manda vários pedidos seguidos — vale confirmar prioridade quando a fila cresce.
Pediu para **não perguntar a cada pequena decisão de design** e para **nunca
dizer que algo funciona sem ter testado**.

## A loja

**Gêmeos Motors**, em **Goiana, Pernambuco** — **Rodovia Margem da PE-75, nº
1418**. É a **única loja física** (Carpina não existe mais, desde 26/09/2026);
a loja **entrega em toda a região**. Vende **moto elétrica** (o MM3, de três
rodas, é tratado como moto elétrica: não existe mais o tipo "triciclo"), faz
**compra, venda e repasse de moto a combustão e de carro**, vende acessórios e
tem **assistência técnica própria**.

| | |
|---|---|
| Site oficial | gemeosmotors.com.br — desde 26/09/2026 é este sistema (antes era um site do Hostinger Horizons) |
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
| `app/sistema/ajuda` + `lib/ajuda/` | Tutoriais (menu Ajuda → Tutoriais), por perfil. Tutorial novo = acrescentar em `lib/ajuda/tutoriais.ts`; imagem em `public/tutoriais/<slug>-<nn>.webp` (sem a imagem, a figura some) |

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
- **Veículo de teste** (`veiculos.teste`, só admin marca, selo "Teste · IA"): serve para testar a
  IA. Fica fora do estoque real, do painel, das movimentações, dos avisos a interessados e da venda
  (bloqueada no servidor); no funil, só o admin vê ("[TESTE]"). A IA só o enxerga em conversa simulada.
- **Simulador do Atendimento** (ícone de frasco na lista): com o WhatsApp real ligado, só admin usa.
  Conversa simulada (`conversas.demo`) NUNCA sai para o WhatsApp: `obterProvedor({ demo })` devolve o
  simulado no envio da equipe, na reação e na resposta da IA (`lib/ia/envio.ts`). Número de cliente
  real é recusado (juntaria a simulação à conversa de verdade).
- **Desligar a IA** exige digitar `DESLIGAR` (maiúsculas), conferido no servidor (`acaoSalvarControle`).
- **A IA só oferece moto com unidade Disponível no estoque** (02/10/2026). Moto do catálogo sem
  unidade só aparece se o cliente perguntar por ela (diz que não tem agora e anota o interesse).
- **A IA manda a foto e o vídeo da moto** (02/10/2026): foto da cor que está no estoque e o vídeo do
  catálogo (Estoque → Catálogo → editar modelo → Vídeo, MP4 até 10 MB), depois do texto, na 1ª vez
  que a moto aparece na conversa ou quando o cliente pede (`lib/ia/midia-tipos.ts`). Nunca link.
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
real (as 8 motos elétricas, com o MM3, todas zero km), com preço de tabela, cor
e ficha técnica da loja, e os 3 acessórios reais. Não existe mais estoque
sorteado, chassi, placa, quilometragem, avaria nem data de chegada inventados
no `public/estoque.js`, nem catálogo de moto a combustão ou carro. A
disponibilidade o cliente confirma no WhatsApp. Não reintroduzir exemplo.

Desde 26/09/2026 o **catálogo** da vitrine vem do sistema (Estoque → Catálogo,
via `/api/vitrine/catalogo`); se a rota falhar, o site cai no `estoque.js`. O
estoque (quantidade) continua fora do site.

## Testes

`npm run test:e2e` roda 20 testes no Chrome (sistema inteiro + vitrine) contra
`E2E_URL` (padrão `http://localhost:3100`), com `E2E_ADMIN_SENHA` definida.
Tudo que os testes criam leva a marca **"E2E"** (clientes, veículos, usuários
`e2e.*`) e é apagado no fim por `scripts/limpar-e2e.mjs`, que não toca em
nada sem essa marca. `E2E_MANTER=1` deixa os dados para olhar. Os logins do
admin feitos pelos testes ficam no histórico — é o registro verdadeiro.

Antes de publicar: `npm run lint`, `npm run typecheck`, `npm run build` e os
testes. Rodados em 26/09/2026: 20/20 em banco descartável. A limpeza dos testes usa
`--env-file=.env.local`: defina antes o `DATABASE_URL` do banco de teste.

## Armadilhas que já custaram tempo

- **Áudio para o WhatsApp é convertido para OGG/Opus com ffmpeg no servidor**
  (`lib/mensageria/transcodificar.ts`; o `Dockerfile` instala o ffmpeg). O MP4
  fragmentado que o Chrome grava é aceito pela Meta (volta 200 e id), mas não é
  entregue ao cliente: a mensagem fica com um risquinho só. O arquivo guardado
  no chat continua o original. Teste local: `FFMPEG_BIN=<caminho> node --test
  tests/unit/transcodificar.test.ts`.
- **Áudio vai como mensagem de voz** (`voice: true`): o cliente vê a foto da loja
  com microfone. O ícone de play só aparece até 512 KB (32 kbps dá uns 2 minutos).
- **Falha de entrega vem pelo webhook** (status `failed`): o motivo da Meta
  (`error_data.details`) aparece na mensagem como "Não enviada: …". Sem o
  webhook apontado para o servidor e o App Secret salvo, não chega status
  nenhum (nem entregue, nem lida).
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
  `cores-motos.js` ou `fotos-disponiveis.js`.** Hoje está em `v=22`. **Desde 26/09/2026 os scripts
  com `?v=` ficam guardados no navegador por 1 ano (`next.config.ts`): esquecer de subir
  o `v` = cliente preso na versão velha.** Fotos, vídeo e tutoriais: 1 dia de cache.
- **`public/estoque.js` é público.** Nunca pôr custo, lucro ou margem nele. O
  teste da vitrine confere que não existe `custo:` no arquivo.
- **Prévia do link no WhatsApp usa endereço completo** nas tags `og:` do
  `vitrine.html` (`https://gemeosmotors.com.br/...`). Mudou o domínio,
  troque lá.
- **`.dockerignore` decide o que entra na imagem.** Notas em Python, testes,
  pastas com `_` na raiz, vídeos do iPhone e os PNG/JPG originais ficam de fora
  (os `scripts/*.mjs` entram: migrations e cópias). Arquivo novo que o site
  precise e que caia numa dessas regras não aparece no ar.
- **Mídia do chat só sobrevive no volume `/data`.** Qualquer arquivo gravado fora
  dele some na próxima implantação. Sem o volume, o container nem sobe (de
  propósito).
- **O banco novo vem vazio de tabelas e se monta sozinho** ao subir o container
  (migrations no `scripts/iniciar.mjs`). Migration nova: `npm run db:generate`,
  commit, Implantar — não precisa rodar nada no servidor.
- **IP do visitante** vem do cabeçalho `x-real-ip`, que o proxy do EasyPanel
  (Traefik) preenche. Rodando sem proxy, fica vazio.
- **`sem_acento` em Python ≠ `semAcento` em JavaScript** (o `isalnum()` do Python
  aceita "ª"). O `baixar_fotos_motos.py` usa a mesma regra do `estoque.js`.
- **Só o `.webp` vai para o GitHub.** Depois de acrescentar foto em
  `public/fotos/`, rodar `python otimizar_fotos.py` **e**
  `python gerar_lista_fotos.py`.
- **IA sem chave da OpenAI** cai no AI Gateway da Vercel (sem conta ativa): a tela diz "sem credencial". Pôr `OPENAI_API_KEY` no EasyPanel.

## Como mexer

```
npm run dev                      # sistema em http://localhost:3000
npm run db:generate              # depois de mudar lib/db/schema.ts
npm run db:migrate               # aplica no banco do .env.local (no VPS é automático)
python baixar_fotos_motos.py     # baixa a foto oficial de cada moto do site da loja
python otimizar_fotos.py         # gera o .webp (obrigatório após baixar)
python gerar_lista_fotos.py      # atualiza public/fotos-disponiveis.js (obrigatório)
```

## O que falta (em ordem de impacto)

1. **Desligar Vercel, Neon e Blob** — as cópias já foram feitas (26/09/2026).
2. **Ligar a IA** — já fala com a OpenAI; falta a `OPENAI_API_KEY` no EasyPanel e ligar no Controle.
3. **WhatsApp real** — credenciais da Meta em Configurações e o webhook
   `https://<SITE_URL>/api/webhooks/whatsapp` cadastrado no app da Meta.
4. **Vitrine lendo a quantidade em estoque do banco** — o catálogo já vem do
   sistema (26/09/2026); a quantidade ainda não aparece no site.
5. **Upload de foto do veículo pelo sistema.**
6. Atualização em tempo real no chat (hoje consulta a cada 3 s com a tela aberta).
7. Tirar do ar o `gemeos-do-iphone.vercel.app` (precisa da outra conta).

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
