# Liberações do `public/vitrine.html`

Saiu do CLAUDE.md em 26/09/2026. Cada item teve autorização expressa do dono; a trava voltou a valer depois de cada um.

Liberações anteriores, todas com autorização expressa do dono; a trava
voltou a valer depois de cada uma:
- 08/09/2026 — virada de celular para moto.
- 13/09/2026 — tirar o botão de condição do card, pular fotos que não
  existem, prévia do link/ícone, detalhes de card e topo.
- 14/09/2026 — acessórios reais do site oficial com foto e "Consultar
  preço", galeria "Clientes Gêmeos Motors", bloco "Quem somos" com a foto
  dos gêmeos, e tirar tudo de parcela e carnê.
- 26/09/2026 — só elétrica zero km (sem seminova, sem moto a combustão e sem
  carro nos textos), WhatsApp novo, `v=15`, prévia do link em
  gemeosmotors.com.br e cronômetro das promoções. Depois, só dado verdadeiro:
  um card por modelo real, sem aviso de chegada inventado, rodapé sem
  "exemplo", `v=16`.
- 26/09/2026 (de novo) — foto, nome e ficha técnica do card abrem o mesmo
  WhatsApp do botão "Quero essa moto" (no acessório, o do "Consultar
  disponibilidade"); a palavra "triciclo" sai dos textos (descrição do site,
  "Quem somos", rodapé e o link "Triciclos"), só fica "moto elétrica"; `v=17`.
- 26/09/2026 (mais uma) — tira toda menção a Carpina (título, prévia do link,
  selo do topo, "Quem somos", FAQ de entrega, rodapé) e cria a seção "Onde
  estamos" com o mapa da loja e botões para Google Maps, Waze e Mapas (iPhone).
- 26/09/2026 (cores) — a vitrine carrega do sistema (`/api/vitrine/cores`, via
  `public/cores-sistema.js`) as cores e a foto de cada cor de cada modelo; `v=18`.
- 26/09/2026 (catálogo) — o catálogo do site vem do sistema (`/api/vitrine/catalogo`,
  via `public/catalogo-sistema.js`): modelo sem estoque aparece, selo de
  disponibilidade, faixa "Lançamentos" logo depois do topo e janela de reserva
  (`/api/vitrine/reserva`); `v=19`. Se o sistema não responder, fica o estoque.js.
- 26/09/2026 (lançamentos) — faixa "Chegando na Gêmeos Motors" vira um lançamento grande por vez
  (foto grande, frase, ficha, preço, "Quero reservar") e carrossel automático de 5 s com setas,
  bolinhas e arrastar; favicon com 16/32/48 px e `?v=2` para o navegador trocar o ícone guardado.
- 27/09/2026 (localização) — mapa "Onde estamos" e botões Google Maps, Waze e Mapas (iPhone)
  usam a coordenada exata da loja (-7.566338250594923, -35.00642739571563), pedida pelo dono.
- 27/09/2026 (ficha) — chip "Peso" vira "Aguenta até" (o campo guarda a carga máxima, não o peso
  da moto) em `public/estoque.js`; scripts sobem para `?v=20` no `vitrine.html`. Autorizado pelo dono.
