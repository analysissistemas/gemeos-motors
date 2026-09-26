/* ============================================================
   ESTOQUE COMPARTILHADO — a fonte única da verdade
   ============================================================
   Os DOIS arquivos leem daqui:
     · index.html   (você e a equipe)  — vê custo, lucro, margem
     · vitrine.html (o cliente)        — vê só o preço de venda

   Assim o preço nunca fica escrito dentro do site. Você ajusta na área do
   vendedor e a vitrine muda junto, sem ninguém editar código.

   DE ONDE VEIO ESTE CATÁLOGO
   Os modelos, os preços e a ficha técnica (motor, autonomia, bateria, peso,
   recarga) foram tirados do site gemeosmotors.com.br — são os dados REAIS da
   loja. A cor de cada moto é a cor da foto oficial, conferida uma a uma; onde
   a loja tiver outras cores, é só acrescentar na lista.

   O que é EXEMPLO e você troca pelo cadastro: a quantidade em estoque, o
   chassi, a quilometragem das seminovas e o custo de compra. O sistema sorteia
   um estoque de demonstração com semente fixa, para as duas telas mostrarem
   sempre a mesma coisa.

   COMO O PREÇO É GUARDADO
   O preço que você digita fica salvo no navegador (localStorage), por cima do
   valor calculado. Enquanto você não mexer, vale a sugestão do sistema; assim
   que você define um valor, ele manda.

   ⚠️ Limite de hoje: por ser protótipo sem servidor, o preço salvo vale
   NESTE computador e NESTE navegador. Quando o sistema virar de verdade
   (com banco de dados), essa mesma função passa a gravar no servidor e o
   preço vale para todo mundo — o resto do código não muda.
   ============================================================ */

/* gerador com semente fixa: a lista de motos de exemplo é sempre a mesma,
   nas duas telas — senão o cliente veria um estoque e você veria outro */
const _rnd = (s => () => (s = s*16807 % 2147483647) / 2147483647)(42);
const _ent  = (a,b) => Math.floor(_rnd()*(b-a+1))+a;
const _pick = a => a[Math.floor(_rnd()*a.length)];

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

/* ---------- MOTOS A COMBUSTÃO ----------
   A loja não vende só elétrica: o Instagram anuncia "compra, venda e repasse
   de veículos", e moto de gasolina é boa parte disso. São todas de repasse —
   entram usadas, com placa, ano e quilometragem de verdade.

   ⚠️ EXEMPLO. Estes modelos e valores são um ponto de partida para a tela não
   nascer vazia. O site da loja não lista essa linha, então NÃO existe preço
   oficial aqui: quem define é o cadastro, moto por moto. O valor de tabela
   abaixo é só a referência de onde o cálculo parte.

   ATENÇÃO, e isso não é detalhe: moto a combustão PRECISA de CNH, PAGA IPVA e
   PRECISA de emplacamento. O contrário de tudo que a vitrine promete na
   elétrica. Por isso `eletrico:false` — é ele que apaga aqueles selos. */
const CAT_MOTO_COMB = {
  "Honda CG 160 Fan": {
    var:["Única"], cor:["Preta","Vermelha","Branca"], base:14500,
    tipo:"Moto a combustão", eletrico:false, genero:"f",
    ficha:{motor:"162,7 cc", cambio:"5 marchas", combustivel:"Flex",
           partida:"Elétrica", consumo:"Cerca de 45 km/l", freio:"Disco / tambor"}
  },
  "Honda Biz 125": {
    var:["Única"], cor:["Vermelha","Branca","Preta"], base:13900,
    tipo:"Moto a combustão", eletrico:false, genero:"f",
    ficha:{motor:"124,9 cc", cambio:"4 marchas", combustivel:"Flex",
           partida:"Elétrica", consumo:"Cerca de 50 km/l", freio:"Disco / tambor"}
  },
  "Honda POP 110i": {
    var:["Única"], cor:["Vermelha","Preta"], base:10900,
    tipo:"Moto a combustão", eletrico:false, genero:"f",
    ficha:{motor:"109,1 cc", cambio:"4 marchas", combustivel:"Flex",
           partida:"Elétrica", consumo:"Cerca de 55 km/l", freio:"Tambor"}
  },
  "Yamaha Factor 150": {
    var:["Única"], cor:["Azul","Preta","Vermelha"], base:15900,
    tipo:"Moto a combustão", eletrico:false, genero:"f",
    ficha:{motor:"149,7 cc", cambio:"5 marchas", combustivel:"Flex",
           partida:"Elétrica", consumo:"Cerca de 42 km/l", freio:"Disco / tambor"}
  },
  "Honda Titan 160": {
    var:["Única"], cor:["Vermelha","Preta","Prata"], base:16500,
    tipo:"Moto a combustão", eletrico:false, genero:"f",
    ficha:{motor:"162,7 cc", cambio:"5 marchas", combustivel:"Flex",
           partida:"Elétrica", consumo:"Cerca de 43 km/l", freio:"Disco / disco"}
  }
};

/* ---------- CARROS ----------
   Também de repasse. Mesma regra: ⚠️ modelos e valores de EXEMPLO, o preço
   real sai do cadastro de cada carro, porque em carro usado o ano e o estado
   mandam mais que o modelo. Carro tambem precisa de CNH e paga IPVA. */
const CAT_CARRO = {
  "Fiat Uno": {
    var:["Única"], cor:["Branco","Prata","Vermelho","Preto"], base:32000,
    tipo:"Carro", eletrico:false, genero:"m",
    ficha:{motor:"1.0 Fire", cambio:"Manual, 5 marchas", combustivel:"Flex",
           portas:"4 portas", consumo:"Cerca de 12 km/l", direcao:"Mecânica"}
  },
  "Volkswagen Gol": {
    var:["Única"], cor:["Branco","Prata","Preto"], base:38000,
    tipo:"Carro", eletrico:false, genero:"m",
    ficha:{motor:"1.0 MPI", cambio:"Manual, 5 marchas", combustivel:"Flex",
           portas:"4 portas", consumo:"Cerca de 13 km/l", direcao:"Hidráulica"}
  },
  "Chevrolet Onix": {
    var:["Única"], cor:["Branco","Prata","Preto","Vermelho"], base:52000,
    tipo:"Carro", eletrico:false, genero:"m",
    ficha:{motor:"1.0 Turbo", cambio:"Manual, 6 marchas", combustivel:"Flex",
           portas:"4 portas", consumo:"Cerca de 14 km/l", direcao:"Elétrica"}
  },
  "Hyundai HB20": {
    var:["Única"], cor:["Branco","Prata","Preto"], base:49000,
    tipo:"Carro", eletrico:false, genero:"m",
    ficha:{motor:"1.0 Flex", cambio:"Manual, 5 marchas", combustivel:"Flex",
           portas:"4 portas", consumo:"Cerca de 13 km/l", direcao:"Elétrica"}
  },
  "Renault Kwid": {
    var:["Única"], cor:["Branco","Prata","Laranja"], base:41000,
    tipo:"Carro", eletrico:false, genero:"m",
    ficha:{motor:"1.0 SCe", cambio:"Manual, 5 marchas", combustivel:"Flex",
           portas:"4 portas", consumo:"Cerca de 15 km/l", direcao:"Elétrica"}
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

/* ---------- CONDIÇÃO E DESGASTE ----------
   A condição é guardada no MASCULINO e traduzida na hora de mostrar. Sem isso
   a tela escreve "moto seminovo" e "carro seminova" — erro de concordância na
   cara do cliente, numa loja que vende confiança. O gênero vem do catálogo:
   a moto é "ela", o triciclo e o carro são "ele". */
const COND = ["Zero km","Seminovo","Vitrine","Usado"];

/** Condição escrita do jeito certo para aquele produto. */
function condRotulo(cond, genero){
  if(genero !== "f") return cond;
  return {"Seminovo":"Seminova", "Usado":"Usada"}[cond] || cond;
}

/* Fator por condição. O de vitrine rodou pouco, mas rodou. O "usado" é o
   repasse: veículo com dono anterior e rodagem de verdade. */
const FATOR_COND = {"Zero km":1.00, "Vitrine":0.92, "Seminovo":0.82, "Usado":0.70};

/* Avarias de moto elétrica — o que a loja realmente encontra numa troca.
   O desconto é em reais, para o cliente entender de onde saiu o abatimento. */
const AVARIAS = [
  {k:"Risco na carenagem",        d: 250},
  {k:"Carenagem trincada",        d: 600},
  {k:"Bateria com autonomia baixa",d:1500},
  {k:"Pneu gasto",                d: 300},
  {k:"Farol quebrado",            d: 220},
  {k:"Retrovisor faltando",       d:  90},
  {k:"Freio precisando de ajuste",d: 180},
  {k:"Banco rasgado",             d: 200},
  {k:"Chave reserva faltando",    d: 120},
  {k:"Sinal de queda",            d: 800}
];

/* Veículo a combustão quebra em outros lugares: não tem bateria de lítio para
   viciar, mas tem óleo, embreagem, câmbio e motor. Lista separada para o
   cadastro não oferecer "bateria com autonomia baixa" num Gol 1.0. */
const AVARIAS_COMBUSTAO = [
  {k:"Risco na lataria",           d: 400},
  {k:"Amassado na lataria",        d: 900},
  {k:"Pneus carecas",              d: 800},
  {k:"Embreagem gasta",            d:1500},
  {k:"Câmbio com folga",           d:2000},
  {k:"Motor fumaçando",            d:3000},
  {k:"Ar-condicionado sem gelar",  d:1200},
  {k:"Farol ou lanterna quebrada", d: 300},
  {k:"Estofado rasgado",           d: 500},
  {k:"Revisão atrasada",           d: 600},
  {k:"IPVA em aberto",             d: 900},
  {k:"Documento com pendência",    d:1500}
];
/* o preço procura a avaria nas duas listas — a peça sabe qual é a dela */
const TODAS_AVARIAS = [...AVARIAS, ...AVARIAS_COMBUSTAO];

/** Lista de avarias que faz sentido oferecer para este produto. */
function avariasDe(p){
  return (p && p.eletrico === false) ? AVARIAS_COMBUSTAO : AVARIAS;
}

/* A quilometragem faz na moto o que a saúde da bateria fazia no celular:
   é o desgaste que o cliente pergunta antes de fechar. */
function fatorKm(km){
  if(km <=  500) return 1.00;
  if(km <= 2000) return 0.95;
  if(km <= 5000) return 0.90;
  if(km <=10000) return 0.84;
  return 0.76;
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
const _CATALOGOS = [CATALOGO, CAT_TRICICLO, CAT_MOTO_COMB, CAT_CARRO, CAT_ACES];

/** Info do modelo (base, cores, ficha, gênero) em qualquer catálogo. */
function _infoModelo(modelo){
  for(const c of _CATALOGOS) if(c[modelo]) return c[modelo];
  return {};
}
/** Ficha técnica de um modelo, venha ele de qual catálogo for. */
function fichaDe(modelo){ return _infoModelo(modelo).ficha || null; }

/* preço sugerido com cada desconto explicado — nada de número que cai do céu */
function precificar({modelo,cond,km,avarias}){
  const base = _infoModelo(modelo).base || 5000;
  const fc = FATOR_COND[cond] ?? 0.82;
  const fk = cond==="Zero km" ? 1 : fatorKm(km);
  const descAv = (avarias||[]).reduce((s,k)=>s+(TODAS_AVARIAS.find(a=>a.k===k)?.d||0),0);
  const bruto = base*fc*fk;
  const linhas = [
    {r:`Tabela da ${modelo}`, v:base},
    {r:`Condição: ${cond}`,   v:Math.round(base*fc-base), neg:fc<1}
  ];
  if(cond!=="Zero km") linhas.push({r:`${km.toLocaleString("pt-BR")} km rodados`, v:Math.round(base*fc*fk-base*fc), neg:fk<1});
  (avarias||[]).forEach(k=>linhas.push({r:k, v:-(TODAS_AVARIAS.find(a=>a.k===k)?.d||0), neg:true}));
  return {sugerido:Math.max(500,Math.round((bruto-descAv)/10)*10), linhas};
}

/* ============================================================
   AS MOTOS — cada uma é peça única
   ============================================================
   Diferente de acessório, moto tem CHASSI. Duas TANK AG11 zero km parecem
   iguais, mas a nota fiscal e a garantia são de uma delas especificamente —
   e na seminova ainda entra quilometragem e avaria. Por isso cada moto que
   entra na loja vira uma linha própria, nunca uma contagem por modelo.
   ============================================================ */
let proximoId = 1;

/* Placa no padrão Mercosul: 3 letras, 1 número, 1 letra, 2 números.
   Só veículo emplacado tem — a elétrica não tem placa, e é justamente esse
   o argumento de venda dela. */
const _LETRAS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
function _placa(){
  const L = () => _LETRAS[_ent(0,25)];
  return `${L()}${L()}${L()}${_ent(0,9)}${L()}${_ent(10,99)}`;
}

function _gerarVeiculos(catalogo, categoria){
  const out = [];
  Object.keys(catalogo).forEach(m=>{
    const info = catalogo[m];
    const eletrico = info.eletrico !== false;
    /* Modelo em reserva ainda NÃO está na loja: vira um card só, zero km,
       com a data de chegada. Gerar estoque para ele daria a contradição de
       uma moto "seminova, 3.491 km rodados" que ao mesmo tempo "chega na
       semana que vem" — e o cliente percebe. */
    /* 26/09/2026: só dado verdadeiro (pedido do dono). A quantidade de cada
       modelo não é conhecida aqui, então a vitrine mostra UM card por modelo
       real, com preço, cor e ficha da loja; a disponibilidade é no WhatsApp. */
    const qtd = 1;
    for(let i=0;i<qtd;i++){
      /* Veículo de repasse não é zero km nem de vitrine: ele chega usado, e a
         quilometragem é bem maior que a de uma elétrica de bairro. */
      /* 26/09/2026: a loja só vende elétrica NOVA (pedido do dono: "não temos
         motos seminovas"). Toda elétrica sai zero km. */
      const cond = info.reserva || eletrico ? "Zero km"
                                            : _pick(["Seminovo","Usado"]);
      const zero = cond==="Zero km";
      const km  = zero      ? 0
                : !eletrico ? _ent(12000, 95000)
                : cond==="Vitrine" ? _ent(20,400) : _ent(600,9000);
      const lista = eletrico ? AVARIAS : AVARIAS_COMBUSTAO;
      const avs = zero ? [] : (_rnd()>(eletrico?0.6:0.35) ? [_pick(lista).k] : []);
      const {sugerido} = precificar({modelo:m, cond, km, avarias:avs});
      out.push({
        id: proximoId++, categoria, modelo:m, tipo:info.tipo,
        eletrico, genero: info.genero || "f",
        arm:"Única", cor:_pick(info.cor), cond,
        km, avarias:avs,
        chassi:`9C2${_ent(100000,999999)}${_ent(10000,99999)}`,
        /* placa, ano e Renavam só existem em veículo emplacado */
        placa:   eletrico ? null : _placa(),
        /* ano-modelo e o de fabricacao ou o seguinte — nunca antes.
           Sorteando os dois soltos saia "2019/2015", que nao existe. */
        ano:     eletrico ? null : (()=>{ const f=_ent(2012,2023); return `${f}/${f+_ent(0,1)}`; })(),
        renavam: eletrico ? null : `${_ent(10000000000,99999999999)}`,
        ficha:info.ficha, video:info.video || null,
        reserva:!!info.reserva, disponivelEm:info.disponivelEm || null,
        /* SEM custo aqui: este arquivo é carregado pela vitrine, e quem abre o
           código-fonte do cliente não pode achar custo nem margem. A área da
           equipe tem a cópia própria dela, com custo. O _rnd() continua sendo
           chamado de propósito: tirar a chamada muda o sorteio de tudo que vem
           depois, e a vitrine passaria a mostrar outro estoque. */
        ...(_rnd(), {}),
        venda:sugerido,
        entrada:`${String(_ent(1,28)).padStart(2,"0")}/08/2026`,
        vendido:false,
        naVitrine:true            // desmarcado = fica só no seu estoque, cliente não vê
      });
    }
  });
  return out;
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
      entrada:"01/08/2026", vendido:false, naVitrine:true, porQuantidade:true
    });
  });
  return out;
}

const MOTOS      = _gerarVeiculos(CATALOGO,       "Motos elétricas");
const TRICICLOS  = _gerarVeiculos(CAT_TRICICLO,   "Triciclos");
/* 26/09/2026: moto a combustão e carro saíram da vitrine (pedido do dono).
   Os catálogos CAT_MOTO_COMB e CAT_CARRO ficam acima só para consulta. */
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
