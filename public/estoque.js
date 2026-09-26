/* ============================================================
   CATÁLOGO DA VITRINE — só dado verdadeiro
   ============================================================
   Lido pela vitrine.html (o cliente). Modelos, preços de tabela, cores e ficha
   técnica são os da loja (site gemeosmotors.com.br). Desde 26/09/2026, a pedido
   do dono, NADA aqui é de exemplo: sem estoque sorteado, sem chassi, placa ou
   quilometragem inventados, sem data de chegada inventada. Cada modelo vira um
   card; a disponibilidade o cliente confirma no WhatsApp.

   Este arquivo é PÚBLICO: nunca pôr custo, lucro ou margem nele.
   ============================================================ */

/* ---------- CATÁLOGO: as motos que a loja realmente vende ----------
   base  = preço de tabela da loja (o mesmo do site)
   cor   = a cor da foto oficial. Acrescente na lista as outras que a loja tiver.
   ficha = o que o cliente pergunta antes de qualquer outra coisa.
   video = id do vídeo no YouTube, quando a loja gravou um daquele modelo. */
/* eletrico:true é o que libera os selos "sem CNH" e "sem IPVA" na vitrine.
   genero define se a tela escreve "seminova" ou "seminovo". */
const GENERO = {moto:"f", triciclo:"m", carro:"m", acessorio:"m"};

const CATALOGO = {
  "TANK AG11": {
    var:["Única"], cor:["Branca"], base:11990, tipo:"Moto elétrica", video:"iHcO_WgTwPA",
    ficha:{motor:"1000W", autonomia:"50 a 55 km", velocidade:"32 km/h",
           bateria:"Lítio 60V 32Ah", pneu:"—", peso:"180 kg", recarga:"4h a 8h"}
  },
  "T1": {
    var:["Única"], cor:["Branca"], base:12000, tipo:"Moto elétrica",
    ficha:{motor:"1000W", autonomia:"Até 70 km", velocidade:"32 km/h",
           bateria:"Lítio 64V 30Ah", pneu:"Dianteiro 90-90-11 / Traseiro 90-90-10",
           peso:"180 kg", recarga:"6h a 7h"}
  },
  "M6": {
    var:["Única"], cor:["Branca"], base:10990, tipo:"Moto elétrica", video:"iQ2w_krngD4",
    ficha:{motor:"1000W", autonomia:"Até 70 km", velocidade:"32 km/h",
           bateria:"Lítio 60V 32Ah", pneu:"Dianteiro 90-80-12 / Traseiro 3.0-10",
           peso:"180 kg", recarga:"6h a 8h"}
  },
  "T3 RETRÔ": {
    var:["Única"], cor:["Bege"], base:9990, tipo:"Moto elétrica",
    ficha:{motor:"1000W", autonomia:"60 a 70 km", velocidade:"32 km/h",
           bateria:"Lítio 64V 30Ah", pneu:"Dianteiro 3.0-10 / Traseiro 3.0-10",
           peso:"180 kg", recarga:"6h a 7h"}
  },
  "AG08": {
    var:["Única"], cor:["Cinza"], base:8990, tipo:"Moto elétrica", video:"K7oJ2bk08lo",
    ficha:{motor:"1000W", autonomia:"40 a 45 km", velocidade:"32 km/h",
           bateria:"Lítio 60V 24Ah", pneu:"—", peso:"200 kg", recarga:"4h a 8h"}
  },
  "DF17": {
    var:["Única"], cor:["Branca"], base:7190, tipo:"Moto elétrica",
    ficha:{motor:"1000W", autonomia:"40 a 50 km", velocidade:"32 km/h",
           bateria:"Lítio 48V 20Ah", pneu:"2.75-10", peso:"150 kg", recarga:"4h a 6h"}
  },
  "TCN BASKET": {
    var:["Única"], cor:["Branca"], base:5200, tipo:"Moto elétrica",
    ficha:{motor:"500W", autonomia:"Até 40 km", velocidade:"—",
           bateria:"Chumbo-ácido selada 48V 12Ah", pneu:"—", peso:"150 kg", recarga:"—"}
  }
};

/* O triciclo tem seção própria: quem procura triciclo não está procurando
   moto, e vice-versa. Mesma ficha técnica, mesma regra de preço. */
const CAT_TRICICLO = {
  "MM3": {
    var:["Única"], cor:["Vinho"], base:10500, tipo:"Triciclo elétrico",
    ficha:{motor:"1000W", autonomia:"45 a 55 km", velocidade:"32 km/h",
           bateria:"Lítio 60V 24Ah", pneu:"300/10", peso:"180 kg", recarga:"6h a 8h"}
  }
};

/* ---------- ACESSÓRIOS ----------
   Os que a loja mostra no site oficial (gemeosmotors.com.br), com a foto de lá.
   O site não publica preço de acessório: base null e o card mostra
   "Consultar preço" — inventar valor seria o site mentindo para o cliente.
   Entram por QUANTIDADE: não têm chassi nem quilometragem. */
const CAT_ACES = {
  "Capacete TOMATE Azul":   {var:["Única"], cor:["Azul"],   base:null, desc:"Modelo esportivo ventilado com ajuste lateral"},
  "Capacete TOMATE Branco": {var:["Única"], cor:["Branco"], base:null, desc:"Modelo aberto com viseira e detalhe laranja"},
  "Baú 28 litros":          {var:["Única"], cor:["Preto"],  base:null, desc:"Base universal Pro Tork, ideal para bagagem no dia a dia"}
};

/* ---------- CONDIÇÃO ----------
   Guardada no MASCULINO e traduzida na hora de mostrar ("moto seminova"). Hoje
   a loja só vende zero km, mas a regra fica para quando entrar outra condição. */
/** Condição escrita do jeito certo para aquele produto. */
function condRotulo(cond, genero){
  if(genero !== "f") return cond;
  return {"Seminovo":"Seminova", "Usado":"Usada"}[cond] || cond;
}

/* ---------- COMO A FICHA É ESCRITA NA TELA ----------
   Cada linha tem a ficha dela: a elétrica fala de autonomia e recarga, a de
   gasolina fala de câmbio e consumo, o carro fala de portas e direção. Em vez
   de a tela conhecer os campos de cada tipo, ela percorre o que a ficha tiver
   e usa este mapa para escrever. Acrescentar um campo novo é acrescentar uma
   linha aqui — nenhuma tela muda.

   `destaque` marca o que vai em negrito: o número que o cliente compara. */
const FICHA_ROTULO = {
  /* `depois` vai atrás do valor e o valor sai em negrito: "**1000W** motor".
     `antes` vai na frente e o valor sai normal: "Bateria Lítio 60V 32Ah".
     O negrito é para o número que o cliente compara entre um modelo e outro. */
  motor:      {depois:"motor"},
  autonomia:  {depois:"de autonomia"},
  velocidade: {depois:""},
  consumo:    {depois:""},
  portas:     {depois:""},
  bateria:    {antes:"Bateria"},
  recarga:    {antes:"Recarga"},
  pneu:       {antes:"Pneu"},
  peso:       {antes:"Peso"},
  cambio:     {antes:"Câmbio"},
  combustivel:{antes:"Combustível"},
  partida:    {antes:"Partida"},
  freio:      {antes:"Freio"},
  direcao:    {antes:"Direção"}
};

/** A ficha vira uma lista pronta de pedacinhos para a tela desenhar.
 *  Campo vazio ou com "—" fica de fora: chip sem informação só ocupa espaço. */
function fichaEmPedacos(ficha){
  if(!ficha) return [];
  return Object.keys(ficha)
    .filter(k => FICHA_ROTULO[k] && ficha[k] && ficha[k] !== "—" && ficha[k] !== "-")
    .map(k => ({
      valor: ficha[k],
      antes: FICHA_ROTULO[k].antes || "",
      depois: FICHA_ROTULO[k].depois || "",
      destaque: FICHA_ROTULO[k].antes === undefined   // sem `antes` = valor em negrito
    }));
}

/** Todos os catálogos na ordem de procura — um lugar só para acrescentar linha. */
const _CATALOGOS = [CATALOGO, CAT_TRICICLO, CAT_ACES];

/** Info do modelo (base, cores, ficha, gênero) em qualquer catálogo. */
function _infoModelo(modelo){
  for(const c of _CATALOGOS) if(c[modelo]) return c[modelo];
  return {};
}
/** Ficha técnica de um modelo, venha ele de qual catálogo for. */
function fichaDe(modelo){ return _infoModelo(modelo).ficha || null; }

/* ============================================================
   OS CARDS — um por modelo real
   ============================================================ */
let proximoId = 1;

function _gerarVeiculos(catalogo, categoria){
  return Object.keys(catalogo).map(m=>{
    const info = catalogo[m];
    return {
      id: proximoId++, categoria, modelo:m, tipo:info.tipo,
      eletrico: info.eletrico !== false, genero: info.genero || "f",
      arm:info.var[0], cor:info.cor[0], cond:"Zero km",
      km:0, avarias:[], chassi:"", placa:null, ano:null, renavam:null,
      ficha:info.ficha, video:info.video || null,
      reserva:false, disponivelEm:null,
      venda:info.base, entrada:null, vendido:false, naVitrine:true
    };
  });
}

/* por quantidade — sem chassi e sem quilometragem */
function _gerarQuantidade(catalogo, categoria){
  const out = [];
  Object.keys(catalogo).forEach(m=>{
    const info = catalogo[m];
    out.push({
      id: proximoId++, categoria, modelo:m, tipo:"Acessório",
      eletrico:true, genero:"m",
      arm:info.var[0], cor:info.cor[0],
      cond:"Zero km", km:null, avarias:[], chassi:"", ficha:null, video:null,
      reserva:false, disponivelEm:null,
      /* disponibilidade confirmada no WhatsApp: o card aparece sempre */
      qtd:1, venda:info.base, descricao:info.desc || null,
      entrada:null, vendido:false, naVitrine:true, porQuantidade:true
    });
  });
  return out;
}

const MOTOS      = _gerarVeiculos(CATALOGO,       "Motos elétricas");
const TRICICLOS  = _gerarVeiculos(CAT_TRICICLO,   "Triciclos");
const ACESSORIOS = _gerarQuantidade(CAT_ACES,     "Acessórios");

/* tudo o que a loja vende, numa lista só */
const PRODUTOS = [...MOTOS, ...TRICICLOS, ...ACESSORIOS];

/* as seções do catálogo, na ordem em que aparecem para o cliente */
const CATEGORIAS = [
  {nome:"Motos elétricas",   titulo:"Motos elétricas",   sub:"Sem CNH, sem emplacamento e sem IPVA. Você carrega na tomada de casa.", catalogo:CATALOGO,      campoVar:"var"},
  {nome:"Triciclos",         titulo:"Triciclos",         sub:"Três rodas, mais estabilidade e assento para dois.",                    catalogo:CAT_TRICICLO,  campoVar:"var"},
  {nome:"Acessórios",        titulo:"Acessórios",        sub:"Capacetes e baú para o dia a dia. Consulte cor e disponibilidade no WhatsApp.", catalogo:CAT_ACES,      campoVar:"var"}
];

/* opções (versão) e cores de qualquer produto, seja de que linha for */
function opcoesDe(p){
  const c = (CATEGORIAS.find(x=>x.nome===p.categoria)||{}).catalogo || {};
  const info = c[p.modelo] || {};
  return {vars: info.var || [p.arm], cores: info.cor || [p.cor]};
}

/* ============================================================
   PREÇOS QUE VOCÊ AJUSTA
   ============================================================ */
const _CHAVE_PRECOS  = "gemeos-precos";
const _CHAVE_VITRINE = "gemeos-vitrine";

function _ler(chave){
  try{ return JSON.parse(localStorage.getItem(chave) || "{}"); }catch(e){ return {}; }
}
function _gravar(chave, obj){
  try{ localStorage.setItem(chave, JSON.stringify(obj)); return true; }catch(e){ return false; }
}

/** Preço que vale hoje: o seu, se você definiu; senão o calculado. */
function precoDe(ap){
  const p = _ler(_CHAVE_PRECOS)[ap.id];
  return (typeof p === "number" && p > 0) ? p : (ap.venda ?? null);
}
/** Define o preço de venda. Passar null volta para a sugestão do sistema. */
function definirPreco(id, valor){
  const m = _ler(_CHAVE_PRECOS);
  if(valor === null || valor === undefined || valor === "") delete m[id];
  else m[id] = Number(valor);
  return _gravar(_CHAVE_PRECOS, m);
}
/** True se essa moto está com preço definido por você (e não pelo cálculo). */
function precoManual(id){ return typeof _ler(_CHAVE_PRECOS)[id] === "number"; }

/* ============================================================
   FOTO TIRADA NA LOJA
   ============================================================
   É a foto DAQUELA moto, não a genérica do modelo. Ganha de qualquer foto de
   fábrica — e para seminova vale ainda mais: o cliente vê a moto que vai
   receber, com a marca de uso que ela realmente tem.

   ⚠️ Limite de hoje: a foto fica guardada no navegador desta máquina
   (localStorage, teto de ~5 MB). Por isso ela é reduzida antes de salvar.
   Quando o sistema tiver servidor, só aquelas funções mudam.

   ONDE ESTÁ O CÓDIGO: em foto-produto.js, não aqui. De lá vêm fotoManual,
   definirFotoManual, resumoFotosManuais e fotoDoProduto(p).
   ============================================================ */

/** Aparece na vitrine do cliente? */
function naVitrine(ap){
  const v = _ler(_CHAVE_VITRINE)[ap.id];
  return v === undefined ? ap.naVitrine : !!v;
}
function definirVitrine(id, mostrar){
  const m = _ler(_CHAVE_VITRINE);
  m[id] = !!mostrar;
  return _gravar(_CHAVE_VITRINE, m);
}

/* o que o CLIENTE pode ver: em estoque e liberado para a vitrine.
   Produto por quantidade só aparece se ainda houver peça. */
function paraVitrine(categoria){
  return PRODUTOS.filter(p =>
    !p.vendido && naVitrine(p) &&
    (!p.porQuantidade || p.qtd > 0) &&
    (!categoria || p.categoria === categoria));
}

/* nome de arquivo previsível da foto:
   "TANK AG11" -> fotos/motos/tank-ag11.webp
   Sem acento e sem espaço, para funcionar em qualquer servidor. */
function semAcento(s){
  // ̀-ͯ = a faixa dos acentos que o NFD separa da letra. Escrito em
  // código, e não com os caracteres soltos, porque acento solto num arquivo
  // salvo em outra codificação vira lixo e a função pararia de limpar nada.
  return s.normalize("NFD").replace(/[̀-ͯ]/g,"").toLowerCase()
          .replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"");
}

/* ============================================================
   FOTOS DOS PRODUTOS
   ============================================================
   As fotos das motos são as oficiais do site da própria loja
   (gemeosmotors.com.br), baixadas em alta e convertidas para .webp.

   REGRA QUE NÃO SE QUEBRA: cada foto só é usada no produto que ela realmente
   mostra. Nada de pôr foto da T1 num anúncio da M6 só para preencher — a loja
   vende confiança e o cliente percebe. Modelo sem foto mostra o contorno
   desenhado, que é honesto.

   Para acrescentar: fotografe a moto e salve em fotos/motos/ com o nome do
   modelo sem acento e com hífen (ex.: fotos/motos/t3-retro.jpg). Aparece
   sozinho, sem mexer em código. Para uma cor específica:
   fotos/motos/t3-retro-vermelha.jpg
   ============================================================ */
const FOTOS = {
  "TANK AG11":  "fotos/motos/tank-ag11.webp",
  "T1":         "fotos/motos/t1.webp",
  "M6":         "fotos/motos/m6.webp",
  "T3 RETRÔ":   "fotos/motos/t3-retro.webp",
  "AG08":       "fotos/motos/ag08.webp",
  "DF17":       "fotos/motos/df17.webp",
  "TCN BASKET": "fotos/motos/tcn-basket.webp",
  "MM3":        "fotos/motos/mm3.webp",
  /* acessórios: fotos do site oficial da loja */
  "Capacete TOMATE Azul":   "fotos/acessorios/capacete-tomate-azul.webp",
  "Capacete TOMATE Branco": "fotos/acessorios/capacete-tomate-branco.webp",
  "Baú 28 litros":          "fotos/acessorios/bau-28-litros-pro-tork.webp"
};

/** Foto do produto, na ordem: mapa explícito (modelo+cor), mapa por modelo,
 *  e por fim o arquivo por convenção de nome — desde que ele realmente exista
 *  (conferido em FOTOS_EXISTENTES, gerado por gerar_lista_fotos.py).
 *  Devolve null quando não há foto, e aí a tela desenha o contorno. */
function fotoDe(modelo, cor){
  const direto = FOTOS[`${modelo}|${cor}`] || FOTOS[modelo];
  if(direto) return direto;
  if(typeof FOTOS_EXISTENTES !== "undefined"){
    for(const caminho of fotosPorNome(modelo, cor)){
      if(FOTOS_EXISTENTES.has(caminho.replace("fotos/",""))) return caminho;
    }
  }
  return null;
}
/** Caminhos por convenção de nome, na ordem em que devem ser tentados.
 *  .webp primeiro: mesma imagem, cerca de 10x menor. No celular, na rede da
 *  rua, é a diferença entre a loja abrir rápido e o cliente desistir. O
 *  .png/.jpg fica como reserva para foto acrescentada à mão que ainda não
 *  passou pelo otimizar_fotos.py. */
function fotosPorNome(modelo, cor){
  const m = semAcento(modelo);
  const lista = [];
  if(cor){
    const c = semAcento(cor);
    lista.push(`fotos/motos/${m}-${c}.webp`, `fotos/motos/${m}-${c}.png`, `fotos/motos/${m}-${c}.jpg`);
  }
  lista.push(`fotos/motos/${m}.webp`, `fotos/motos/${m}.png`, `fotos/motos/${m}.jpg`,
             `fotos/${m}.webp`,       `fotos/${m}.png`,       `fotos/${m}.jpg`);
  return lista;
}
