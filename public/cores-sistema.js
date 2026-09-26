/* ============================================================
   CORES DO SISTEMA — a vitrine lendo as cores cadastradas pela equipe
   ------------------------------------------------------------
   No sistema (Estoque > Catálogo e cores), cada modelo ganha as cores que a
   loja tem, cada uma com a foto da moto naquela cor. Este arquivo busca isso
   em /api/vitrine/cores (público, sem login) para o cliente tocar na bolinha e
   ver a moto na cor escolhida.

   Regra de ouro: NADA aqui pode quebrar a vitrine. Sistema fora do ar, lento
   (mais de 3 s), resposta estranha ou modelo sem cor cadastrada: tudo volta
   null e a vitrine fica exatamente como era (cores do estoque.js e
   cores-motos.js, fotos de fotos/motos/).

   O que fica disponível para a vitrine.html:
     carregarCoresDoSistema()      -> Promise do mapa {modelo: [{nome, hex, foto}]} ou null
     coresDoModelo(modelo)         -> [{nome, hex, foto}] ou null
     fotoDaCor(modelo, cor)        -> endereço da foto daquela cor ou null
     hexDaCor(cor, modelo?)        -> "#6d1f33" ou null
     aplicarCoresDoSistema(produtos, escolha) -> troca opcoesDe/fotoDe/corHex/
                                     corPrecisaBorda para usar o sistema primeiro
                                     e acerta a cor inicial de cada card; devolve
                                     true se mudou alguma coisa (aí é redesenhar)

   Os nomes de modelo casam sem acento, sem maiúscula e sem espaço sobrando
   ("T3 RETRÔ" = "t3 retro"), igual às promoções.
   ============================================================ */
(function(){
  "use strict";
  var ENDERECO = "/api/vitrine/cores";
  var ESPERA_MS = 3000;
  var mapa = null;          // chave normalizada -> [{nome, hex, foto}]
  var promessa = null;

  function chave(s){
    return (s == null ? "" : String(s)).normalize("NFD").replace(/[̀-ͯ]/g, "")
      .toLowerCase().replace(/\s+/g, " ").trim();
  }
  /* o nome entra no HTML do card: só aceita o que o sistema aceita no cadastro */
  var NOME_OK = /^[\p{L}\p{N} .,()/+-]{1,40}$/u;
  var HEX_OK = /^#[0-9a-f]{6}$/i;
  var FOTO_OK = /^\/api\/vitrine\/foto\/modelo-\d+-[a-f0-9]{32}\.(webp|png|jpg)$/;

  /** Confere cada item e monta o mapa. Item fora do formato fica de fora. */
  function montar(modelos){
    if(!modelos || typeof modelos !== "object") return null;
    var out = {}, algum = false;
    Object.keys(modelos).forEach(function(m){
      var lista = Array.isArray(modelos[m]) ? modelos[m] : [];
      var boas = lista.filter(function(c){
        return c && typeof c.nome === "string" && NOME_OK.test(c.nome) &&
               typeof c.hex === "string" && HEX_OK.test(c.hex);
      }).map(function(c){
        return {nome:c.nome, hex:c.hex.toLowerCase(),
                foto:(typeof c.foto === "string" && FOTO_OK.test(c.foto)) ? c.foto : null};
      });
      if(boas.length){ out[chave(m)] = boas; algum = true; }
    });
    return algum ? out : null;
  }

  /** Busca uma vez só (chamar de novo devolve a mesma resposta). Nunca rejeita. */
  function carregarCoresDoSistema(){
    if(promessa) return promessa;
    promessa = new Promise(function(fim){
      var feito = false;
      function acabar(v){ if(!feito){ feito = true; fim(v); } }
      var ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
      var t = setTimeout(function(){ if(ctrl) ctrl.abort(); acabar(null); }, ESPERA_MS);
      try{
        fetch(ENDERECO, ctrl ? {signal:ctrl.signal} : {})
          .then(function(r){ return r.ok ? r.json() : null; })
          .then(function(d){
            clearTimeout(t);
            mapa = montar(d && d.modelos);
            if(!mapa) return acabar(null);
            /* devolve com os nomes de modelo como vieram, para quem quiser listar */
            var bruto = {};
            Object.keys(d.modelos).forEach(function(m){ if(mapa[chave(m)]) bruto[m] = mapa[chave(m)]; });
            acabar(bruto);
          })
          .catch(function(){ clearTimeout(t); acabar(null); });
      }catch(e){ clearTimeout(t); acabar(null); }
    });
    return promessa;
  }

  function coresDoModelo(modelo){
    return (mapa && mapa[chave(modelo)]) || null;
  }
  function corDoModelo(modelo, cor){
    var l = coresDoModelo(modelo), k = chave(cor);
    if(!l) return null;
    for(var i = 0; i < l.length; i++) if(chave(l[i].nome) === k) return l[i];
    return null;
  }
  function fotoDaCor(modelo, cor){
    var c = corDoModelo(modelo, cor);
    return c ? c.foto : null;
  }
  /** Tom da cor: do modelo, se informado; senão, o primeiro modelo que tiver essa cor. */
  function hexDaCor(cor, modelo){
    if(modelo){ var c = corDoModelo(modelo, cor); if(c) return c.hex; }
    if(!mapa) return null;
    var k = chave(cor);
    for(var m in mapa) for(var i = 0; i < mapa[m].length; i++)
      if(chave(mapa[m][i].nome) === k) return mapa[m][i].hex;
    return null;
  }
  function clara(hex){
    var r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16);
    return 0.299*r + 0.587*g + 0.114*b > 200;
  }

  /** Liga as cores do sistema na vitrine, por cima das funções que ela já usa.
   *  Chamar DEPOIS de carregarCoresDoSistema() resolver com um mapa. */
  function aplicarCoresDoSistema(produtos, escolha){
    try{
      if(!mapa) return false;
      var origOpcoes = window.opcoesDe, origFoto = window.fotoDe,
          origHex = window.corHex, origBorda = window.corPrecisaBorda;
      if(typeof origOpcoes !== "function" || typeof origFoto !== "function") return false;

      /* cores do card: as do sistema, na ordem da equipe */
      window.opcoesDe = function(p){
        var o = origOpcoes(p), l = p && !p.porQuantidade ? coresDoModelo(p.modelo) : null;
        return l ? {vars:o.vars, cores:l.map(function(c){ return c.nome; })} : o;
      };
      /* foto: a da cor no sistema; sem ela, a foto antiga só se aquela cor for a
         que a foto antiga mostra (a do estoque.js) — nunca moto de outra cor */
      window.fotoDe = function(modelo, cor){
        var f = fotoDaCor(modelo, cor);
        if(f) return f;
        if(!coresDoModelo(modelo)) return origFoto(modelo, cor);
        var info = typeof _infoModelo === "function" ? _infoModelo(modelo) : {};
        var antigas = (info.cor || []).map(chave);
        if(antigas.indexOf(chave(cor)) >= 0) return origFoto(modelo, cor);
        if(typeof FOTOS !== "undefined" && FOTOS[modelo + "|" + cor]) return FOTOS[modelo + "|" + cor];
        return null;
      };
      if(typeof origHex === "function")
        window.corHex = function(nome){ return hexDaCor(nome) || origHex(nome); };
      if(typeof origBorda === "function")
        window.corPrecisaBorda = function(nome){ var h = hexDaCor(nome); return h ? clara(h) : origBorda(nome); };

      /* cor que abre no card = a primeira da lista do sistema. A escolha que o
         cliente já fez (se houver) só muda se não existir mais. */
      var mudou = false;
      (produtos || []).forEach(function(p){
        var l = p && !p.porQuantidade ? coresDoModelo(p.modelo) : null;
        if(!l) return;
        var antiga = p.cor, nomes = l.map(function(c){ return chave(c.nome); });
        p.cor = l[0].nome;
        var e = escolha && escolha[p.id];
        if(e && (chave(e.cor) === chave(antiga) || nomes.indexOf(chave(e.cor)) < 0)) e.cor = p.cor;
        mudou = true;
      });
      return mudou;
    }catch(e){
      return false;
    }
  }

  window.carregarCoresDoSistema = carregarCoresDoSistema;
  window.coresDoModelo = coresDoModelo;
  window.fotoDaCor = fotoDaCor;
  window.hexDaCor = hexDaCor;
  window.aplicarCoresDoSistema = aplicarCoresDoSistema;
})();
