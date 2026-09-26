/* ============================================================
   CORES DAS MOTOS
   O hex aproximado de cada cor, para a bolinha do catálogo mostrar a cor de
   verdade em vez de um cinza genérico.

   `borda:true` marca as cores claras demais para aparecer sozinhas sobre fundo
   branco (Branca, Bege, Prata) — elas ganham um contorno, senão a bolinha
   some no card.

   As cores aqui saíram das fotos oficiais de cada modelo, conferidas uma a uma.
   Quando a loja receber uma moto em cor nova, acrescente aqui e no catálogo do
   estoque.js. O nome tem que ser EXATAMENTE igual nos dois lugares, senão a
   bolinha cai no cinza padrão.
   ============================================================ */
const CORES_MOTOS = {
  /* as cores que os modelos de hoje realmente têm */
  "Branca":     {hex:"#f4f5f7", borda:true},   // TANK AG11, T1, M6, DF17, TCN Basket
  "Cinza":      {hex:"#7c8085"},               // AG08, com detalhe laranja
  "Bege":       {hex:"#e8dfcb", borda:true},   // T3 Retrô
  "Vinho":      {hex:"#6d1f33"},               // MM3

  /* cores comuns em moto elétrica, prontas para quando a loja receber */
  "Preta":      {hex:"#1f2020"},
  "Preto":      {hex:"#1f2020"},               // acessório costuma vir no masculino
  "Vermelha":   {hex:"#b3122b"},
  "Azul":       {hex:"#1f4e79"},
  "Verde":      {hex:"#2c6e49"},
  "Amarela":    {hex:"#f2c518"},               // o amarelo da marca
  "Prata":      {hex:"#d7dade", borda:true},
  "Rosa":       {hex:"#e0a0b4"},
  "Laranja":    {hex:"#e2662a"},

  /* carro é "ele": as mesmas cores no masculino, senão a bolinha cai no cinza
     padrão por causa de uma letra. O nome aqui tem que bater EXATAMENTE com o
     do catálogo do estoque.js. */
  "Branco":     {hex:"#f4f5f7", borda:true},
  "Vermelho":   {hex:"#b3122b"},
  "Amarelo":    {hex:"#f2c518"},
  "Cinzento":   {hex:"#7c8085"}
};

function corHex(nome){ return (CORES_MOTOS[nome] || {hex:"#8e8e93"}).hex; }
function corPrecisaBorda(nome){ return !!(CORES_MOTOS[nome] || {}).borda; }
