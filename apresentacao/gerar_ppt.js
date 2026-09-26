/* ============================================================
   Gera a apresentação em PowerPoint (.pptx)
   Rodar:  node gerar_ppt.js
   ============================================================ */
const pptxgen = require("pptxgenjs");
const path = require("path");

const AQUI = __dirname;
const img = n => path.join(AQUI, n);

/* ---------- PALETA ----------
   Preto e branco da marca + o verde do WhatsApp como único acento.
   O verde não é enfeite: o WhatsApp é o canal de venda da loja, então a cor
   marca exatamente as ações que geram dinheiro. */
const PRETO   = "0B0B0C";
const CARVAO  = "16161A";
const CLARO   = "F5F5F7";
const PAPEL   = "FFFFFF";
const TINTA   = "101828";
const CINZA   = "A1A1A6";
const CINZA_C = "5B6472";
const VERDE   = "25D366";
const BORDA_E = "2A2A30";
const BORDA_C = "E2E6EE";

const pres = new pptxgen();
pres.layout = "LAYOUT_WIDE";          // 13.3 x 7.5 — definir ANTES de criar slides
pres.author = "Analysis Sistemas";
pres.company = "Gêmeos do iPhone";
pres.title = "Sistema da loja — Gêmeos do iPhone";

const L = 0.7;                         // margem esquerda padrão
const W = 11.9;                        // largura útil

/* rodapé repetido — objeto novo a cada chamada, pptxgenjs altera o que recebe */
function rodape(s, n, escuro = true) {
  s.addText("Gêmeos do iPhone", {
    x: L, y: 6.95, w: 5, h: 0.3, fontSize: 9, margin: 0,
    color: escuro ? "4A4A52" : "98A2B3", fontFace: "Calibri"
  });
  s.addText(String(n), {
    x: 12.0, y: 6.95, w: 0.6, h: 0.3, fontSize: 9, align: "right", margin: 0,
    color: escuro ? "4A4A52" : "98A2B3", fontFace: "Calibri"
  });
}

/* etiqueta pequena acima do título */
function etiqueta(s, txt, escuro = true) {
  s.addText(txt.toUpperCase(), {
    x: L, y: 0.55, w: 6, h: 0.3, fontSize: 10, bold: true, charSpacing: 2.2, margin: 0,
    color: escuro ? CINZA : CINZA_C, fontFace: "Calibri"
  });
}

function titulo(s, txt, escuro = true, y = 0.92) {
  s.addText(txt, {
    x: L, y, w: 11.0, h: 0.85, fontSize: 34, bold: true, margin: 0,
    color: escuro ? CLARO : TINTA, fontFace: "Cambria"
  });
}

function linhaFina(s, txt, escuro = true, y = 1.78, w = 7.4) {
  s.addText(txt, {
    x: L, y, w, h: 0.7, fontSize: 13, margin: 0, lineSpacing: 20,
    color: escuro ? CINZA : CINZA_C, fontFace: "Calibri"
  });
}

/* bloco numerado — o motivo visual que se repete em todo o deck */
function bloco(s, n, tit, txt, x, y, w, escuro = true) {
  s.addShape(pres.ShapeType.ellipse, {
    x, y, w: 0.34, h: 0.34,
    fill: { color: escuro ? CLARO : TINTA },
    line: { color: escuro ? CLARO : TINTA, width: 0 }
  });
  s.addText(String(n), {
    x, y, w: 0.34, h: 0.34, fontSize: 12, bold: true, align: "center", valign: "middle",
    margin: 0, color: escuro ? PRETO : PAPEL, fontFace: "Calibri"
  });
  s.addText(tit, {
    x: x + 0.48, y: y - 0.02, w: w - 0.48, h: 0.28, fontSize: 13, bold: true, margin: 0,
    color: escuro ? CLARO : TINTA, fontFace: "Calibri"
  });
  s.addText(txt, {
    x: x + 0.48, y: y + 0.26, w: w - 0.48, h: 0.62, fontSize: 11, margin: 0, lineSpacing: 15,
    color: escuro ? CINZA : CINZA_C, fontFace: "Calibri"
  });
}

/* moldura da captura de tela */
function tela(s, arquivo, x, y, w, h) {
  s.addShape(pres.ShapeType.roundRect, {
    x: x - 0.05, y: y - 0.05, w: w + 0.1, h: h + 0.1, rectRadius: 0.06,
    fill: { color: CARVAO }, line: { color: BORDA_E, width: 1 },
    shadow: { type: "outer", blur: 14, offset: 4, angle: 90, color: "000000", opacity: 0.45 }
  });
  s.addImage({ path: img(arquivo), x, y, w, h });
}

/* ============================================================ 1. CAPA */
let s = pres.addSlide();
s.background = { color: PRETO };
s.addShape(pres.ShapeType.ellipse, {
  x: 2.6, y: -2.4, w: 8.1, h: 8.1,
  fill: { color: "FFFFFF", transparency: 94 }, line: { width: 0 }
});
s.addImage({ path: img("logo.png"), x: 5.15, y: 1.35, w: 3.0, h: 0.98 });
s.addText("O sistema da loja,", {
  x: 0.9, y: 2.7, w: 11.5, h: 0.75, fontSize: 44, bold: true, align: "center",
  margin: 0, color: CLARO, fontFace: "Cambria"
});
s.addText("de ponta a ponta.", {
  x: 0.9, y: 3.45, w: 11.5, h: 0.75, fontSize: 44, bold: true, align: "center",
  margin: 0, color: "8E8E93", fontFace: "Cambria"
});
s.addText("Da vitrine que o cliente vê ao controle que só a equipe enxerga.\nEstoque, vendas, assistência técnica e caixa em um lugar só.", {
  x: 2.4, y: 4.42, w: 8.5, h: 0.8, fontSize: 14, align: "center", margin: 0, lineSpacing: 22,
  color: CINZA, fontFace: "Calibri"
});
s.addShape(pres.ShapeType.roundRect, {
  x: 4.75, y: 5.45, w: 3.8, h: 0.42, rectRadius: 0.21,
  fill: { color: PRETO }, line: { color: "3A3A42", width: 1 }
});
s.addText("GOIANA — PERNAMBUCO", {
  x: 4.75, y: 5.45, w: 3.8, h: 0.42, fontSize: 9.5, align: "center", valign: "middle",
  margin: 0, charSpacing: 1.6, color: CINZA, fontFace: "Calibri"
});
s.addText("Apresentação · 15 de agosto de 2026", {
  x: 0.9, y: 6.6, w: 11.5, h: 0.3, fontSize: 10, align: "center", margin: 0,
  color: "4A4A52", fontFace: "Calibri"
});
s.addNotes("Abrir dizendo: o sistema tem dois lados. O que o cliente vê e o que só a equipe vê. Eles se alimentam do mesmo cadastro.");

/* ============================================================ 2. DOIS LADOS */
s = pres.addSlide();
s.background = { color: PRETO };
etiqueta(s, "Como funciona");
titulo(s, "Dois lados, um cadastro só.");
linhaFina(s, "Você dá entrada no aparelho uma vez. Ele aparece na loja para o cliente e no controle para a equipe — sem digitar nada duas vezes.", true, 1.8, 11.0);

const lados = [
  { x: L, quem: "O CLIENTE VÊ", nome: "A loja", cor: VERDE, itens: [
      "Foto do aparelho, que troca ao escolher a cor",
      "Memória, condição e saúde da bateria",
      "Avarias declaradas abertamente",
      "Preço e parcela em até 18x",
      "Botão que abre o WhatsApp com a mensagem pronta"
    ], nao: "Não vê: quanto você pagou, sua margem, nem o lucro." },
  { x: 6.85, quem: "A EQUIPE VÊ", nome: "O sistema", cor: CLARO, itens: [
      "Custo, preço de venda, margem e lucro por peça",
      "IMEI, bateria e avarias de cada aparelho",
      "Funil de vendas com cada negócio em aberto",
      "Ordens de serviço da assistência técnica",
      "Caixa: recebido, a receber e parcelas atrasadas"
    ], nao: "Protegido por login, com acesso separado por pessoa." }
];
lados.forEach(l => {
  s.addShape(pres.ShapeType.roundRect, {
    x: l.x, y: 2.62, w: 5.75, h: 3.95, rectRadius: 0.05,
    fill: { color: CARVAO }, line: { color: BORDA_E, width: 1 }
  });
  s.addText(l.quem, {
    x: l.x + 0.4, y: 2.92, w: 4.9, h: 0.25, fontSize: 9.5, bold: true, charSpacing: 1.8,
    margin: 0, color: l.cor, fontFace: "Calibri"
  });
  s.addText(l.nome, {
    x: l.x + 0.4, y: 3.2, w: 4.9, h: 0.45, fontSize: 22, bold: true, margin: 0,
    color: CLARO, fontFace: "Cambria"
  });
  s.addText(l.itens.map((t, i) => ({
    text: t, options: { bullet: true, breakLine: i < l.itens.length - 1 }
  })), {
    x: l.x + 0.4, y: 3.78, w: 4.95, h: 1.85, fontSize: 11.5, margin: 0,
    paraSpaceAfter: 7, color: CINZA, fontFace: "Calibri"
  });
  s.addText(l.nao, {
    x: l.x + 0.4, y: 5.85, w: 4.95, h: 0.5, fontSize: 10.5, margin: 0, italic: true,
    color: "76767E", fontFace: "Calibri"
  });
});
rodape(s, 2);
s.addNotes("Ponto forte de venda: o custo e o lucro não existem dentro do arquivo do cliente. Não é só esconder na tela.");

/* ============================================================ 3. A LOJA */
s = pres.addSlide();
s.background = { color: PRETO };
etiqueta(s, "Parte do cliente");
titulo(s, "A loja aberta 24 horas.");
linhaFina(s, "O cliente entra pelo link, vê o estoque real e chama no WhatsApp já sabendo o que quer.", true, 1.8, 11.0);
tela(s, "01-loja-topo.jpg", L, 2.55, 7.3, 3.64);
[
  [1, "Identidade da loja", "Logo, cores e a frase da casa: \"Pra tudo tem solução\"."],
  [2, "Vídeo de fundo", "Abre com movimento, como as grandes lojas de tecnologia."],
  [3, "Funciona no celular", "A maioria dos clientes vai abrir pelo telefone."],
  [4, "WhatsApp sempre à mão", "Botão fixo na tela, em qualquer página."]
].forEach((b, i) => bloco(s, b[0], b[1], b[2], 8.35, 2.6 + i * 1.03, 4.25));
rodape(s, 3);

/* ============================================================ 4. CATÁLOGO */
s = pres.addSlide();
s.background = { color: PAPEL };
etiqueta(s, "Parte do cliente", false);
titulo(s, "Catálogo que responde sozinho.", false);
linhaFina(s, "Seis categorias — iPhone, iPad, Apple Watch, MacBook, acessórios e motos elétricas — com busca por modelo, cor ou memória.", false, 1.8, 11.0);
s.addShape(pres.ShapeType.roundRect, {
  x: L - 0.05, y: 2.5, w: 7.4, h: 3.74, rectRadius: 0.06,
  fill: { color: "F4F6FA" }, line: { color: BORDA_C, width: 1 },
  shadow: { type: "outer", blur: 12, offset: 3, angle: 90, color: "101828", opacity: 0.16 }
});
s.addImage({ path: img("02-catalogo.jpg"), x: L, y: 2.55, w: 7.3, h: 3.64 });
[
  [1, "Escolhe a cor, a foto muda", "Cores reais de cada geração, com a foto oficial do aparelho."],
  [2, "Bateria e avarias à mostra", "O que os outros escondem, aqui está escrito no anúncio."],
  [3, "Preço e parcela na hora", "Valor à vista e em 18x, sem o cliente precisar perguntar."],
  [4, "Mensagem pronta", "Chega com modelo, cor, memória, bateria e preço."]
].forEach((b, i) => bloco(s, b[0], b[1], b[2], 8.35, 2.6 + i * 1.03, 4.25, false));
rodape(s, 4, false);

/* ============================================================ 5. ESTOQUE */
s = pres.addSlide();
s.background = { color: PRETO };
etiqueta(s, "Parte da equipe");
titulo(s, "Cada aparelho é uma peça única.");
linhaFina(s, "Bateria e avaria são daquele aparelho, não do modelo. Por isso o controle é peça por peça, com IMEI — nunca por quantidade.", true, 1.8, 11.0);
tela(s, "03-estoque.jpg", L, 2.55, 7.3, 3.64);
[
  [1, "Lucro por aparelho", "Custo, venda e lucro lado a lado, na mesma linha."],
  [2, "Preço sugerido", "Calculado pela condição, bateria e avarias — mostrando a conta."],
  [3, "Filtros que importam", "Com avaria, bateria baixa, lacrado, seminovo, vitrine."],
  [4, "Cadastro em segundos", "Escolhido o modelo, ele oferece só as memórias e cores que existem."]
].forEach((b, i) => bloco(s, b[0], b[1], b[2], 8.35, 2.6 + i * 1.03, 4.25));
rodape(s, 5);
s.addNotes("Explicar por que peça única: um iPhone 13 com 87% de bateria e outro com 100% não valem o mesmo. Contar por quantidade esconde isso.");

/* ============================================================ 6. FUNIL */
s = pres.addSlide();
s.background = { color: PAPEL };
etiqueta(s, "Parte da equipe", false);
titulo(s, "Nenhuma venda esquecida.", false);
linhaFina(s, "Cada conversa vira um cartão, da primeira mensagem até o fechamento — e dá para ver quanto dinheiro está em jogo agora.", false, 1.8, 11.0);
s.addShape(pres.ShapeType.roundRect, {
  x: L - 0.05, y: 2.5, w: 7.4, h: 3.74, rectRadius: 0.06,
  fill: { color: "F4F6FA" }, line: { color: BORDA_C, width: 1 },
  shadow: { type: "outer", blur: 12, offset: 3, angle: 90, color: "101828", opacity: 0.16 }
});
s.addImage({ path: img("04-funil.jpg"), x: L, y: 2.55, w: 7.3, h: 3.64 });
[
  [1, "Cinco etapas", "Chegou no WhatsApp, qualificado, proposta, troca, fechada."],
  [2, "Conversão por etapa", "Mostra onde o cliente desiste, para atacar o ponto certo."],
  [3, "Valor em jogo", "Quanto está parado no funil, em reais, agora."],
  [4, "Alerta de parado", "Negócio sem resposta há mais de 7 dias aparece na Visão Geral."]
].forEach((b, i) => bloco(s, b[0], b[1], b[2], 8.35, 2.6 + i * 1.03, 4.25, false));
rodape(s, 6, false);

/* ============================================================ 7. ASSISTÊNCIA */
s = pres.addSlide();
s.background = { color: PRETO };
etiqueta(s, "Parte da equipe");
titulo(s, "A bancada sob controle.");
linhaFina(s, "Toda ordem de serviço, da entrada até a entrega, com prazo e técnico responsável — e a nota do cliente sai pronta para imprimir.", true, 1.8, 11.0);
tela(s, "05-assistencia.jpg", L, 2.55, 7.3, 3.64);
[
  [1, "Seis etapas", "Recebido, orçamento, aprovado, bancada, aguardando peça, pronto."],
  [2, "Aparelho parado aparece", "Quem está esperando peça, e há quantos dias."],
  [3, "Nota com garantia", "Defeito, valor, prazo de garantia e as duas assinaturas."],
  [4, "Quanto vai entrar", "Soma dos orçamentos aprovados que ainda serão recebidos."]
].forEach((b, i) => bloco(s, b[0], b[1], b[2], 8.35, 2.6 + i * 1.03, 4.25));
rodape(s, 7);

/* ============================================================ 8. NÚMEROS */
s = pres.addSlide();
s.background = { color: PAPEL };
etiqueta(s, "Onde estamos", false);
titulo(s, "O que já está de pé.", false);
linhaFina(s, "Tudo abaixo funciona hoje e pode ser aberto agora, no celular de qualquer pessoa da equipe.", false, 1.8, 11.0);
[
  ["8", "telas prontas", "entre a loja e o sistema"],
  ["6", "categorias", "no catálogo do cliente"],
  ["78", "fotos oficiais", "de produto, uma por cor"]
].forEach((n, i) => {
  const x = L + i * 3.95;
  s.addShape(pres.ShapeType.roundRect, {
    x, y: 2.75, w: 3.6, h: 1.85, rectRadius: 0.05,
    fill: { color: "F4F6FA" }, line: { color: BORDA_C, width: 1 }
  });
  s.addText(n[0], {
    x: x + 0.35, y: 2.95, w: 2.9, h: 0.85, fontSize: 46, bold: true, margin: 0,
    color: TINTA, fontFace: "Cambria"
  });
  s.addText(n[1], {
    x: x + 0.35, y: 3.82, w: 2.9, h: 0.28, fontSize: 13, bold: true, margin: 0,
    color: TINTA, fontFace: "Calibri"
  });
  s.addText(n[2], {
    x: x + 0.35, y: 4.09, w: 2.9, h: 0.3, fontSize: 11, margin: 0,
    color: CINZA_C, fontFace: "Calibri"
  });
});
s.addShape(pres.ShapeType.roundRect, {
  x: L, y: 4.95, w: 11.85, h: 1.35, rectRadius: 0.05,
  fill: { color: "0B0B0C" }, line: { width: 0 }
});
s.addText("A vantagem que nenhum concorrente da região tem", {
  x: L + 0.45, y: 5.18, w: 11, h: 0.32, fontSize: 14, bold: true, margin: 0,
  color: VERDE, fontFace: "Calibri"
});
s.addText("Loja de seminovo vive de confiança. O sistema publica a saúde da bateria e as avarias de cada aparelho no anúncio — o cliente vê o estado real antes de perguntar. Quem esconde não consegue competir com isso.", {
  x: L + 0.45, y: 5.5, w: 10.9, h: 0.6, fontSize: 11.5, margin: 0, lineSpacing: 16,
  color: CINZA, fontFace: "Calibri"
});
rodape(s, 8, false);

/* ============================================================ 9. PRÓXIMOS PASSOS */
s = pres.addSlide();
s.background = { color: PRETO };
etiqueta(s, "O caminho");
titulo(s, "Próximos passos.");
linhaFina(s, "Em ordem de impacto: cada um destrava o seguinte.", true, 1.8, 11.0);
[
  ["Foto pelo celular, no cadastro", "Fotografar o aparelho na entrada resolve todo modelo sem foto oficial — e mostra ao cliente a peça real que ele vai receber."],
  ["Guardar os dados de verdade", "Hoje o cadastro vive no navegador de cada máquina. Com servidor, passa a valer para toda a equipe ao mesmo tempo."],
  ["Endereço próprio na internet", "Um gemeosdoiphone.com.br no lugar do link interno, para o cliente chegar de qualquer lugar."],
  ["Integração com o WhatsApp", "Conectar ao atendimento para o cliente sair da loja direto na conversa, já identificado."]
].forEach((p, i) => {
  const y = 2.6 + i * 1.08;
  s.addShape(pres.ShapeType.roundRect, {
    x: L, y, w: 11.85, h: 0.92, rectRadius: 0.05,
    fill: { color: CARVAO }, line: { color: BORDA_E, width: 1 }
  });
  s.addShape(pres.ShapeType.ellipse, {
    x: L + 0.35, y: y + 0.28, w: 0.36, h: 0.36,
    fill: { color: VERDE }, line: { width: 0 }
  });
  s.addText(String(i + 1), {
    x: L + 0.35, y: y + 0.28, w: 0.36, h: 0.36, fontSize: 13, bold: true,
    align: "center", valign: "middle", margin: 0, color: "05381A", fontFace: "Calibri"
  });
  s.addText(p[0], {
    x: L + 0.9, y: y + 0.16, w: 10.6, h: 0.3, fontSize: 14, bold: true, margin: 0,
    color: CLARO, fontFace: "Calibri"
  });
  s.addText(p[1], {
    x: L + 0.9, y: y + 0.46, w: 10.6, h: 0.36, fontSize: 11, margin: 0,
    color: CINZA, fontFace: "Calibri"
  });
});
rodape(s, 9);
s.addNotes("Fechar no item 1: é o que resolve o problema das fotos de vez e não depende de ninguém de fora.");

pres.writeFile({ fileName: path.join(AQUI, "Gemeos-do-iPhone-Sistema.pptx") })
  .then(f => console.log("gerado: " + f));
