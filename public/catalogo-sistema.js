/* ============================================================
   CATÁLOGO QUE VEM DO SISTEMA DA EQUIPE
   ------------------------------------------------------------
   O estoque.js continua sendo a lista de reserva: a página abre com ele na
   hora. Quando /api/vitrine/catalogo responde, o que a equipe cadastrou em
   Estoque → Catálogo vale por cima dele:
     - modelo novo aparece mesmo sem nenhuma unidade no estoque;
     - preço, ficha técnica, descrição e foto principal são os do sistema;
     - modelo com "Mostrar no site" desligado some do site;
     - disponibilidade (pronta entrega / sob encomenda / consulte) e
       lançamento (com reserva) vêm junto.
   Se o sistema não responder em 3 s, nada muda: fica o estoque.js.
   Nunca vem custo nem quantidade em estoque — a API não entrega isso.
   ============================================================ */
(function(){
  const TEMPO_LIMITE = 3000;
  const DISPONIBILIDADES = {pronta_entrega:"Pronta entrega", sob_encomenda:"Sob encomenda", consultar:"Consulte disponibilidade"};
  const TIPOS = {moto_eletrica:"Moto elétrica", moto_combustao:"Moto a combustão", carro:"Carro", acessorio:"Acessório"};
  let promessa = null;
  const fotoPrincipal = {};   // modelo -> foto principal cadastrada no sistema

  /* só aceita o que tem cara de dado da loja: nome curto, foto do próprio site */
  const texto = (v, max) => typeof v === "string" && v.trim() && v.length <= max ? v.trim() : null;
  const fotoValida = v => typeof v === "string" && /^\/api\/vitrine\/foto\/[\w.-]+$/.test(v) ? v : null;
  function limpar(m){
    const nome = texto(m && m.nome, 80);
    if(!nome || !Number.isInteger(m.id)) return null;
    const ficha = {};
    if(m.ficha && typeof m.ficha === "object")
      for(const [k, v] of Object.entries(m.ficha)){ const t = texto(v, 60); if(t && /^[a-z]+$/.test(k)) ficha[k] = t; }
    return {
      id: m.id, nome,
      tipo: TIPOS[m.tipo] ? m.tipo : "moto_eletrica",
      preco: typeof m.preco === "number" && m.preco > 0 ? m.preco : null,
      ficha: Object.keys(ficha).length ? ficha : null,
      descricao: texto(m.descricao, 300),
      foto: fotoValida(m.foto),
      cores: Array.isArray(m.cores) ? m.cores.map(c => texto(c && c.nome, 40)).filter(Boolean) : [],
      disponibilidade: DISPONIBILIDADES[m.disponibilidade] ? m.disponibilidade : "consultar",
      lancamento: m.lancamento === true,
      lancamentoTexto: texto(m.lancamentoTexto, 80),
      reservas: Number.isInteger(m.reservas) && m.reservas > 0 ? m.reservas : 0,
      ordem: Number.isInteger(m.ordem) ? m.ordem : 0
    };
  }

  /** Busca o catálogo uma vez. Resolve com a lista (já conferida) ou null — nunca falha. */
  window.carregarCatalogoDoSistema = function(){
    if(promessa) return promessa;
    const ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
    const t = setTimeout(() => ctrl && ctrl.abort(), TEMPO_LIMITE);
    promessa = fetch("/api/vitrine/catalogo", {cache:"no-store", signal: ctrl ? ctrl.signal : undefined})
      .then(r => r.ok ? r.json() : null)
      .then(d => d && Array.isArray(d.modelos) ? d.modelos.map(limpar).filter(Boolean) : null)
      .catch(() => null)
      .finally(() => clearTimeout(t));
    return promessa;
  };

  /* a foto principal do sistema entra depois da foto da cor (cores-sistema.js)
     e antes da foto de fábrica do estoque.js */
  const fotoDeAntes = window.fotoDe;
  window.fotoDe = function(modelo, cor){
    const daCor = typeof window.fotoDaCor === "function" ? window.fotoDaCor(modelo, cor) : null;
    if(daCor) return daCor;
    if(fotoPrincipal[modelo]) return fotoPrincipal[modelo];
    return fotoDeAntes ? fotoDeAntes(modelo, cor) : null;
  };

  /** Rótulo do selo de disponibilidade de um produto (ou null). */
  window.rotuloDisponibilidade = p => p && p.disponibilidade ? DISPONIBILIDADES[p.disponibilidade] || null : null;

  /** Produtos marcados como lançamento, na ordem da equipe. */
  window.lancamentosDoSite = () => PRODUTOS.filter(p => p.lancamento && naVitrine(p));

  /**
   * Aplica o catálogo do sistema sobre CATALOGO, CAT_ACES e PRODUTOS (do estoque.js).
   * Devolve true se algo mudou. Lista vazia ou inválida não mexe em nada.
   */
  window.aplicarCatalogoDoSistema = function(lista){
    if(!Array.isArray(lista) || !lista.length) return false;
    const noSite = new Set(lista.map(m => m.nome));
    /* sai do site o que a equipe desligou (ou não cadastrou) */
    for(let i = PRODUTOS.length - 1; i >= 0; i--) if(!noSite.has(PRODUTOS[i].modelo)) PRODUTOS.splice(i, 1);

    let proximo = PRODUTOS.reduce((m, p) => Math.max(m, p.id), 0) + 1;
    for(const m of lista){
      const aces = m.tipo === "acessorio";
      const catalogo = aces ? CAT_ACES : CATALOGO;
      const novo = !catalogo[m.nome];
      const info = catalogo[m.nome] || (catalogo[m.nome] = {var:["Única"], cor:[""], base:null});
      info.base = m.preco;
      if(m.ficha) info.ficha = m.ficha; else delete info.ficha;
      if(m.descricao) info.desc = m.descricao;
      /* só o modelo novo troca a lista de cores: o do estoque.js guarda as cores
         que a foto de fábrica mostra, e o cores-sistema.js usa isso para nunca
         pôr a foto de uma cor no lugar de outra */
      if(novo && m.cores.length) info.cor = m.cores;
      if(!aces) info.tipo = TIPOS[m.tipo];
      if(m.foto) fotoPrincipal[m.nome] = m.foto; else delete fotoPrincipal[m.nome];

      let p = PRODUTOS.find(x => x.modelo === m.nome);
      if(!p){
        p = aces ? {
          id: proximo++, categoria:"Acessórios", modelo:m.nome, tipo:"Acessório", eletrico:true, genero:"m",
          arm:"Única", cor:info.cor[0], cond:"Zero km", km:null, avarias:[], chassi:"", ficha:null, video:null,
          reserva:false, disponivelEm:null, qtd:1, venda:m.preco, descricao:m.descricao,
          entrada:null, vendido:false, naVitrine:true, porQuantidade:true
        } : {
          id: proximo++, categoria:"Motos elétricas", modelo:m.nome, tipo:TIPOS[m.tipo],
          eletrico: m.tipo === "moto_eletrica", genero:"f",
          arm:"Única", cor:info.cor[0], cond:"Zero km", km:0, avarias:[], chassi:"", placa:null, ano:null, renavam:null,
          ficha:m.ficha, video:null, reserva:false, disponivelEm:null,
          venda:m.preco, entrada:null, vendido:false, naVitrine:true
        };
        PRODUTOS.push(p);
      }
      p.venda = m.preco;
      p.ficha = aces ? null : m.ficha;
      if(aces) p.descricao = m.descricao;
      if(m.cores.length && !m.cores.includes(p.cor)) p.cor = m.cores[0];
      p.modeloId = m.id;
      p.disponibilidade = m.disponibilidade;
      p.lancamento = m.lancamento;
      p.lancamentoTexto = m.lancamentoTexto;
      p.reservas = m.reservas;
      p.ordem = m.ordem;
    }
    /* a ordem da equipe manda; empate fica como estava */
    const pos = new Map(PRODUTOS.map((p, i) => [p.id, i]));
    PRODUTOS.sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0) || pos.get(a.id) - pos.get(b.id));
    return true;
  };
})();
