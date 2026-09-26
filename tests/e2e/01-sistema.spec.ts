import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { ADMIN, MARCA, RODADA, aviso, avisoErro, campo, celular, cpfValido, entrar, reais, semRolagemLateral } from "./ajuda";

/* ============================================================
   O dia de trabalho da loja, de ponta a ponta, na ordem real:
   equipe → cliente → estoque → funil → venda perdida → venda fechada
   → documento → assinatura pelo link → finalização → assistência
   → conversas → permissões por perfil → histórico → celular.
   Os passos dependem uns dos outros, então rodam em série.
   ============================================================ */
test.describe.configure({ mode: "serial" });

const estado = {
  vendedor: { nome: `${MARCA} Vendedor`, usuario: `e2e.v${RODADA.toLowerCase()}`, senha: "" },
  tecnico: { nome: `${MARCA} Tecnico`, usuario: `e2e.t${RODADA.toLowerCase()}`, senha: "" },
  cliente: { id: 0, nome: `${MARCA} Cliente`, cpf: cpfValido(), whatsapp: celular() },
  contato: { nome: `${MARCA} Contato`, whatsapp: celular() },
  veiculo: `${MARCA} Moto`,
  vendaId: 0,
  osId: 0,
  diagnosticoPerda: "",
};

let admin: BrowserContext;
let page: Page;

test.beforeAll(async ({ browser }) => {
  expect(ADMIN.senha, "defina E2E_ADMIN_SENHA com a senha do admin").not.toBe("");
  admin = await browser.newContext();
  page = await admin.newPage();
});
test.afterAll(async () => {
  await admin?.close();
});

async function contextoLogado(browser: Browser, usuario: string, senha: string, opcoes = {}) {
  const ctx = await browser.newContext(opcoes);
  const p = await ctx.newPage();
  await entrar(p, usuario, senha);
  return { ctx, p };
}

test("área da equipe exige login e o webhook real está desligado", async ({ request }) => {
  const r = await request.get("/sistema", { maxRedirects: 0 });
  expect([302, 303, 307, 308]).toContain(r.status());
  expect(r.headers()["location"]).toContain("/login");

  const pdf = await request.get("/api/documentos/venda/1", { maxRedirects: 0 });
  expect(pdf.status()).not.toBe(200);

  const webhook = await request.post("/api/webhooks/whatsapp", { data: { entry: [] } });
  expect(webhook.status()).toBe(503);
});

test("login recusa senha errada sem dizer qual campo errou", async ({ browser }) => {
  const ctx = await browser.newContext();
  const p = await ctx.newPage();
  await p.goto("/login");
  await p.getByLabel("Usuário", { exact: true }).fill(`e2e.ninguem${RODADA.toLowerCase()}`);
  await p.getByLabel("Senha", { exact: true }).fill("senha-errada-123");
  await p.getByRole("button", { name: "Entrar" }).click();
  await expect(p.getByRole("alert").filter({ hasText: /conferem/ })).toHaveText("Usuário ou senha não conferem.");
  await ctx.close();
});

test("admin entra e vê o painel de dados com filtro de período", async () => {
  await entrar(page, ADMIN.usuario, ADMIN.senha);
  await expect(page.getByRole("heading", { name: "Visão geral" })).toBeVisible();
  await expect(page.getByText("Dois olhos no seu negócio")).toHaveCount(0);
  await expect(page.getByText(/Kommo/i)).toHaveCount(0);
  await page.getByRole("link", { name: "7 dias", exact: true }).click();
  await expect(page).toHaveURL(/periodo=7d/);
  await expect(page.getByText(/Últimos 7 dias|7 dias/).first()).toBeVisible();
});

test("admin cria um vendedor e um técnico", async () => {
  for (const [papel, pessoa] of [["vendedor", estado.vendedor], ["tecnico", estado.tecnico]] as const) {
    await page.goto("/sistema/usuarios");
    await page.getByRole("button", { name: "Novo usuário" }).click();
    const d = page.getByRole("dialog", { name: "Novo usuário" });
    await campo(d, "Nome").fill(pessoa.nome);
    await campo(d, "Usuário (para entrar)").fill(pessoa.usuario);
    await campo(d, "Perfil").selectOption(papel);
    pessoa.senha = await campo(d, "Senha inicial").inputValue();
    expect(pessoa.senha.length).toBeGreaterThanOrEqual(10);
    await d.getByRole("button", { name: "Salvar" }).click();
    await expect(page.getByRole("dialog", { name: /Acesso criado para/ })).toBeVisible();
    await page.getByRole("button", { name: "Pronto" }).click();
    await expect(page.getByText(pessoa.nome)).toBeVisible();
  }
});

test("cadastro completo de cliente, edição, bloqueio de duplicado e perfil 360°", async () => {
  await page.goto("/sistema/clientes");
  await page.getByRole("button", { name: "Novo cliente" }).first().click();
  let d = page.getByRole("dialog", { name: "Novo cliente" });
  await campo(d, "Nome completo").fill(estado.cliente.nome);
  await campo(d, "CPF").fill(estado.cliente.cpf);
  await campo(d, "WhatsApp").fill(estado.cliente.whatsapp);
  await campo(d, "Cidade").fill("Goiana");
  await campo(d, "Estado").selectOption("PE");
  await campo(d, "Origem do cliente").selectOption({ index: 1 });
  await d.getByRole("button", { name: "Cadastrar cliente" }).click();
  await expect(page).toHaveURL(/\/sistema\/clientes\/\d+$/);
  estado.cliente.id = Number(page.url().split("/").pop());
  await expect(page.getByRole("heading", { name: estado.cliente.nome })).toBeVisible();

  /* mesmo WhatsApp em outro cadastro: bloqueado */
  await page.goto("/sistema/clientes");
  await page.getByRole("button", { name: "Novo cliente" }).first().click();
  d = page.getByRole("dialog", { name: "Novo cliente" });
  await campo(d, "Nome completo").fill(`${MARCA} Duplicado`);
  await campo(d, "WhatsApp").fill(estado.cliente.whatsapp);
  await d.getByRole("button", { name: "Cadastrar cliente" }).click();
  await expect(avisoErro(page)).toContainText("já está no cadastro");
  await d.getByRole("button", { name: "Cancelar" }).click();

  /* edição */
  await page.goto(`/sistema/clientes/${estado.cliente.id}`);
  await page.getByRole("button", { name: "Editar" }).click();
  d = page.getByRole("dialog", { name: "Editar cliente" });
  await campo(d, "E-mail").fill(`e2e.${RODADA.toLowerCase()}@exemplo.com`);
  await campo(d, "Bairro").fill("Centro");
  await d.getByRole("button", { name: "Salvar alterações" }).click();
  await expect(page.getByText(`e2e.${RODADA.toLowerCase()}@exemplo.com`)).toBeVisible();

  /* interação registrada aparece no atendimento */
  await page.getByRole("tab", { name: /Atendimento/ }).click();
  await page.getByRole("button", { name: "Registrar interação" }).click();
  d = page.getByRole("dialog", { name: "Registrar interação" });
  await campo(d, "O que foi conversado").fill(`Cliente ligou perguntando da T1 (${MARCA}).`);
  await d.getByRole("button", { name: "Registrar" }).click();
  await expect(page.getByText(`Cliente ligou perguntando da T1 (${MARCA}).`)).toBeVisible();

  await page.getByRole("tab", { name: "Histórico de alterações" }).click();
  await expect(page.getByText(/Editou|Atualizou|alter/i).first()).toBeVisible();
});

test("entrada de veículo no estoque", async () => {
  await page.goto("/sistema/estoque");
  await page.getByRole("button", { name: "Dar entrada em veículo" }).first().click();
  const d = page.getByRole("dialog", { name: "Dar entrada em veículo" });
  await campo(d, "Tipo").selectOption({ index: 0 });
  await campo(d, "Modelo").fill(estado.veiculo);
  await campo(d, "Cor").fill("Branca");
  await campo(d, "Chassi").fill(`E2E${RODADA}0001`);
  await campo(d, "Valor anunciado").fill(reais(12990));
  await expect(campo(d, "Valor anunciado")).toHaveValue(/12\.990,00/);
  await campo(d, "Custo (só administrador vê)").fill(reais(9000));
  await d.getByRole("button", { name: "Salvar" }).click();
  await expect(d).toBeHidden();
  await expect(page.getByText(estado.veiculo).first()).toBeVisible();
});

test("funil: cria negócio, arrasta de etapa e a mudança fica gravada", async () => {
  await page.goto(`/sistema/funil?novo=${estado.cliente.id}`);
  let d = page.getByRole("dialog", { name: "Novo negócio" });
  await expect(d.getByText(estado.cliente.nome)).toBeVisible();
  const veic = campo(d, "Veículo do estoque");
  await expect(veic.locator("option", { hasText: estado.veiculo })).toHaveCount(1);
  await veic.selectOption({ label: (await veic.locator("option", { hasText: estado.veiculo }).textContent())!.trim() });
  await campo(d, "Valor da proposta").fill(reais(12500));
  await d.getByRole("button", { name: "Criar negócio" }).click();
  await expect(aviso(page, /criado/i)).toBeVisible();
  await page.keyboard.press("Escape");

  const origem = page.getByRole("region", { name: "Chegou no WhatsApp" });
  const destino = page.getByRole("region", { name: "Proposta enviada" });
  const cartao = origem.locator("article", { hasText: estado.veiculo });
  await expect(cartao).toBeVisible();

  const a = (await cartao.boundingBox())!;
  const b = (await destino.boundingBox())!;
  await page.mouse.move(a.x + a.width / 2, a.y + 20);
  await page.mouse.down();
  await page.mouse.move(a.x + a.width / 2 + 10, a.y + 30, { steps: 4 });
  await page.mouse.move(b.x + b.width / 2, b.y + 140, { steps: 20 });
  await page.mouse.up();
  await expect(aviso(page, 'Movido para "Proposta enviada"')).toBeVisible();

  await page.reload();
  await expect(page.getByRole("region", { name: "Proposta enviada" }).locator("article", { hasText: estado.veiculo })).toBeVisible();

  /* segundo negócio do mesmo cliente, que vai ser perdido */
  await page.getByRole("button", { name: "Novo negócio" }).click();
  d = page.getByRole("dialog", { name: "Novo negócio" });
  await d.getByPlaceholder("Buscar por nome, telefone ou CPF").fill(estado.cliente.nome);
  await d.getByRole("button", { name: new RegExp(estado.cliente.nome) }).click();
  await campo(d, "Veículo de interesse").fill(`TANK AG11 azul (${MARCA})`);
  await campo(d, "Valor anunciado").fill(reais(11490));
  await d.getByRole("button", { name: "Criar negócio" }).click();
  await expect(page.getByRole("dialog", { name: estado.cliente.nome })).toBeVisible();
});

test("venda perdida exige motivo e a IA não inventa diagnóstico quando está fora", async () => {
  const gaveta = page.getByRole("dialog", { name: estado.cliente.nome });
  await gaveta.getByRole("button", { name: "Perdida" }).click();
  const d = page.getByRole("dialog", { name: "Venda perdida" });
  await d.getByRole("button", { name: "Encerrar e gerar diagnóstico" }).click();
  await expect(avisoErro(page)).toBeVisible();

  await d.getByRole("button", { name: "Preço" }).click();
  await campo(d, "Objeção principal do cliente").fill("Achou acima do orçamento");
  await campo(d, "Observações do consultor").fill("Cliente comparou com loja de Recife e pediu desconto que não foi possível (E2E).");
  await d.getByRole("button", { name: "Encerrar e gerar diagnóstico" }).click();
  const resultado = d.getByText(/diagnóstico não foi gerado|encerrado como/);
  await expect(resultado).toBeVisible({ timeout: 90_000 });
  estado.diagnosticoPerda = (await resultado.textContent()) ?? "";
  if (/não foi gerado/.test(estado.diagnosticoPerda)) {
    /* sem IA: a tela explica e não mostra diagnóstico nenhum */
    await expect(d.getByText(/IA|indisponível|cartão|crédito/i).first()).toBeVisible();
  }
  test.info().annotations.push({ type: "ia", description: estado.diagnosticoPerda });
  await d.getByRole("button", { name: "Concluir" }).click();
  await page.keyboard.press("Escape");
  await page.reload();
  await expect(page.getByRole("region", { name: "Venda perdida" }).locator("article", { hasText: `TANK AG11 azul (${MARCA})` })).toBeVisible();
});

test("fechar venda exige pagamentos somando o valor vendido", async () => {
  await page.getByRole("region", { name: "Proposta enviada" }).locator("article", { hasText: estado.veiculo }).click();
  const gaveta = page.getByRole("dialog", { name: estado.cliente.nome });
  await gaveta.getByRole("button", { name: "Fechada" }).click();
  const d = page.getByRole("dialog", { name: "Fechar venda" });
  await expect(campo(d, "Veículo vendido")).toBeVisible();
  await expect(campo(d, "Valor vendido")).toHaveValue(/12\.500,00/);

  const pagamentos = d.getByLabel("Valor do pagamento");
  await pagamentos.first().fill(reais(10000));
  await expect(d.getByRole("status")).toHaveText(/Faltam R\$\s?2\.500,00/);
  await d.getByRole("button", { name: "Registrar venda" }).click();
  await expect(avisoErro(page)).toBeVisible();

  await d.getByRole("button", { name: "Adicionar forma de pagamento" }).click();
  await expect(pagamentos.nth(1)).toHaveValue(/2\.500,00/);
  await d.getByLabel("Forma de pagamento").nth(1).selectOption("credito");
  await expect(d.getByRole("status")).toHaveText("Confere com o valor vendido");
  await d.getByRole("button", { name: "Registrar venda" }).click();
  await d.getByRole("link", { name: "Gerar documento e assinatura" }).click();
  await expect(page).toHaveURL(/\/sistema\/vendas\/\d+$/);
  estado.vendaId = Number(page.url().split("/").pop());
});

test("venda: revisão, PDF com código, assinatura pelo link e finalização", async ({ browser }) => {
  await expect(page.getByText("Tudo certo para gerar o documento.")).toBeVisible();
  await page.getByRole("button", { name: "Ir para o documento" }).click();
  await page.getByRole("button", { name: "Gerar documento" }).click();
  await expect(page.getByRole("button", { name: "Gerar link de assinatura" })).toBeVisible();

  const pdf = await page.request.get(`/api/documentos/venda/${estado.vendaId}`);
  expect(pdf.status()).toBe(200);
  expect(pdf.headers()["content-type"]).toContain("application/pdf");
  expect((await pdf.body()).subarray(0, 4).toString()).toBe("%PDF");

  await page.getByRole("button", { name: "Gerar link de assinatura" }).click();
  const link = await page.getByLabel("Link de assinatura").inputValue();
  expect(link).toMatch(/\/assinar\/[\w-]+$/);

  /* o cliente abre o link sem login nenhum */
  const publico = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const c = await publico.newPage();
  await c.goto(link);
  await expect(c.getByText("Termo de venda de veículo")).toBeVisible();
  await expect(c.getByText(/ICP-Brasil/).first()).toBeVisible();

  const desenhar = async () => {
    const quadro = c.getByLabel("Quadro de assinatura");
    await quadro.scrollIntoViewIfNeeded();
    const q = (await quadro.boundingBox())!;
    await c.mouse.move(q.x + 30, q.y + 100);
    await c.mouse.down();
    for (let i = 1; i <= 12; i++) await c.mouse.move(q.x + 30 + i * 20, q.y + 100 + (i % 2 ? -30 : 30));
    await c.mouse.up();
  };
  const outroCpf = cpfValido();
  await campo(c, "Seu CPF").fill(outroCpf === estado.cliente.cpf ? cpfValido() : outroCpf);
  await desenhar();
  await c.getByText("Li o documento e concordo").click();
  /* rolar depois de assinar não pode apagar a assinatura */
  await c.evaluate(() => window.dispatchEvent(new Event("resize")));
  await expect(c.getByRole("button", { name: "Assinar documento" })).toBeEnabled();
  await c.getByRole("button", { name: "Assinar documento" }).click();
  await expect(avisoErro(c)).toContainText(/CPF/);

  await campo(c, "Seu CPF").fill(estado.cliente.cpf);
  await c.getByRole("button", { name: "Assinar documento" }).click();
  await expect(c.getByRole("heading", { name: "Documento assinado" })).toBeVisible();
  await publico.close();

  await page.reload();
  await expect(page.getByText(/Documento assinado \(pelo link/)).toBeVisible();
  await page.getByRole("button", { name: "Finalizar venda" }).click();
  await expect(page.getByText(/Venda finalizada em/)).toBeVisible();

  const assinado = await page.request.get(`/api/documentos/venda/${estado.vendaId}`);
  expect(assinado.status()).toBe(200);
});

test("assistência: OS com status, peça, diagnóstico obrigatório e PDF", async () => {
  await page.goto(`/sistema/assistencia/nova?cliente=${estado.cliente.id}`);
  await expect(page.getByText(estado.cliente.nome)).toBeVisible();
  await campo(page, "Veículo").fill("T1 branca (E2E)");
  await campo(page, "Problema relatado pelo cliente").fill("Moto não liga depois da chuva (E2E).");
  await page.getByRole("button", { name: "Abrir OS" }).click();
  await expect(page).toHaveURL(/\/sistema\/assistencia\/\d+$/);
  estado.osId = Number(page.url().split("/").pop());

  await page.getByRole("button", { name: "Receber OS" }).click();
  await expect(aviso(page, "OS: Aguardando atendimento")).toBeVisible();
  await page.getByRole("button", { name: "Iniciar análise" }).click();
  await expect(aviso(page, "OS: Em análise")).toBeVisible();

  await campo(page, "Descrição").fill(`Controlador 60V (${MARCA})`);
  await campo(page, "Valor unitário").fill(reais(350));
  await page.getByRole("button", { name: "Lançar" }).click();
  await expect(page.getByRole("cell", { name: `Controlador 60V (${MARCA})` }).or(page.getByText(`Controlador 60V (${MARCA})`)).first()).toBeVisible();

  await page.getByRole("button", { name: "Finalizar", exact: true }).click();
  await expect(avisoErro(page)).toContainText("Para finalizar");

  await campo(page, "Diagnóstico técnico").fill("Conector do controlador oxidado (E2E).");
  await campo(page, "Solução aplicada").fill("Troca do controlador e vedação do conector.");
  await campo(page, "Resultado").selectOption("resolvido");
  await page.getByRole("button", { name: "Finalizar", exact: true }).click();
  await expect(aviso(page, "OS: Finalizada")).toBeVisible();

  const pdf = await page.request.get(`/api/documentos/os/${estado.osId}`);
  expect(pdf.status()).toBe(200);
  expect((await pdf.body()).subarray(0, 4).toString()).toBe("%PDF");

  await page.getByRole("button", { name: "Registrar entrega" }).click();
  await expect(aviso(page, "OS: Entregue")).toBeVisible();
});

test("conversas: cliente conhecido, resposta, nota interna e follow-up", async () => {
  await page.goto("/sistema/conversas");
  await expect(page.getByText("WhatsApp — Simulado")).toBeVisible();

  await page.getByRole("button", { name: "Simular mensagem de cliente" }).click();
  let d = page.getByRole("dialog", { name: "Simular mensagem de cliente" });
  await campo(d, "WhatsApp do cliente (com DDD)").fill(estado.cliente.whatsapp);
  await campo(d, "Mensagem").fill("Oi, ainda tem a T1 branca?");
  await d.getByRole("button", { name: "Receber mensagem" }).click();
  await expect(d).toBeHidden({ timeout: 60_000 });

  /* número já cadastrado: a conversa já chega com o nome do cliente */
  const chat = page.locator("header").filter({ hasText: estado.cliente.nome });
  await expect(chat).toBeVisible();
  await expect(page.getByText("Oi, ainda tem a T1 branca?").last()).toBeVisible();

  const caixa = page.getByRole("textbox", { name: "Mensagem" });
  await caixa.fill("/");
  await expect(page.getByRole("listbox", { name: "Respostas rápidas" })).toBeVisible();
  await caixa.fill(`Olá! Tem sim, pode vir ver (${MARCA}).`);
  await caixa.press("Enter");
  await expect(page.getByText(`Olá! Tem sim, pode vir ver (${MARCA}).`).last()).toBeVisible();
  await expect(page.getByText(/Atendimento humano iniciado por/).last()).toBeVisible();

  await page.getByRole("button", { name: "Escrever nota interna" }).click();
  await page.getByRole("textbox", { name: "Nota interna" }).fill(`Cliente prefere contato à tarde (${MARCA}).`);
  await page.getByRole("button", { name: "Salvar nota" }).click();
  await expect(page.getByText(`Cliente prefere contato à tarde (${MARCA}).`).last()).toBeVisible();
  await page.getByRole("button", { name: "Voltar para mensagem" }).click();

  /* o painel do cliente começa recolhido (pedido do dono): abre no ⓘ */
  await page.getByRole("button", { name: "Mostrar dados do cliente e negócio" }).click();
  await page.getByRole("button", { name: "Amanhã 10h" }).click();
  await page.getByRole("button", { name: "Agendar", exact: true }).click();
  await expect(aviso(page, /agendad/i)).toBeVisible();
  await page.getByRole("button", { name: "Concluir follow-up" }).click();
  await expect(aviso(page, /conclu/i)).toBeVisible();

  await page.getByLabel("Responsável", { exact: true }).first().selectOption({ label: estado.vendedor.nome });
  /* a troca de responsável fica escrita na própria conversa */
  await expect(page.getByText(new RegExp(`transferido para ${estado.vendedor.nome}|atribuída a ${estado.vendedor.nome}`)).last()).toBeVisible();
  /* status e responsável ficam só no painel lateral */
  await page.getByLabel("Status", { exact: true }).first().selectOption("aguardando_cliente");
  await expect(page.getByText(/Status: Aguardando cliente \(por /).last()).toBeVisible();

  /* contato novo: cadastra da conversa, cria negócio e muda a etapa sem sair do chat */
  await page.getByRole("button", { name: "Simular mensagem de cliente" }).click();
  d = page.getByRole("dialog", { name: "Simular mensagem de cliente" });
  await campo(d, "WhatsApp do cliente (com DDD)").fill(estado.contato.whatsapp);
  await campo(d, "Nome no perfil do WhatsApp (opcional)").fill(estado.contato.nome);
  await campo(d, "Mensagem").fill("Boa tarde, quero saber da TANK");
  await d.getByRole("button", { name: "Receber mensagem" }).click();
  await expect(d).toBeHidden({ timeout: 60_000 });
  await expect(page.getByText("Contato sem cadastro")).toBeVisible();

  await page.getByRole("button", { name: "Cadastrar cliente" }).click();
  const f = page.getByRole("dialog", { name: "Novo cliente" });
  await expect(campo(f, "WhatsApp")).not.toHaveValue("");
  if (!(await campo(f, "Nome completo").inputValue())) await campo(f, "Nome completo").fill(estado.contato.nome);
  await f.getByRole("button", { name: "Cadastrar cliente" }).click();
  await expect(f).toBeHidden();
  await expect(page.getByText("Contato sem cadastro")).toHaveCount(0);

  await campo(page, "Veículo de interesse").fill("TANK AG11 (E2E)");
  await page.getByRole("button", { name: "Criar negócio" }).click();
  const etapas = page.getByRole("group", { name: "Etapa do negócio" });
  await expect(etapas).toBeVisible();
  await etapas.getByRole("button", { name: "Proposta" }).click();
  await expect(etapas.getByRole("button", { name: "Proposta" })).toHaveAttribute("aria-pressed", "true");

  /* mesmo número escrito de outro jeito cai na mesma conversa */
  await page.getByRole("button", { name: "Simular mensagem de cliente" }).click();
  d = page.getByRole("dialog", { name: "Simular mensagem de cliente" });
  const n = estado.contato.whatsapp;
  await campo(d, "WhatsApp do cliente (com DDD)").fill(`+55 (${n.slice(0, 2)}) ${n.slice(2, 7)}-${n.slice(7)}`);
  await campo(d, "Mensagem").fill("Ainda está aí?");
  await d.getByRole("button", { name: "Receber mensagem" }).click();
  await expect(d).toBeHidden({ timeout: 60_000 });
  await page.getByPlaceholder("Nome, telefone, CPF, veículo ou nº do negócio").fill(estado.contato.nome);
  await expect(page.locator("ul li button", { hasText: estado.contato.nome })).toHaveCount(1);
});

test("vendedor não acessa área administrativa nem vê custo", async ({ browser }) => {
  const { ctx, p } = await contextoLogado(browser, estado.vendedor.usuario, estado.vendedor.senha);
  for (const rota of ["/sistema/usuarios", "/sistema/logs", "/sistema/configuracoes", "/sistema/financeiro"]) {
    await p.goto(rota);
    await expect(p.getByRole("heading", { name: "Você não tem acesso a esta área" }), rota).toBeVisible();
  }
  await p.goto("/sistema/estoque");
  await expect(p.getByRole("heading", { name: "Estoque" })).toBeVisible();
  await expect(p.getByText(/Custo parado|Custo \(só/)).toHaveCount(0);
  await expect(p.getByRole("navigation", { name: "Menu principal" }).getByRole("link", { name: "Usuários" })).toHaveCount(0);
  await p.goto("/sistema/funil");
  await expect(p.getByRole("heading", { name: "Funil de vendas" })).toBeVisible();
  await ctx.close();
});

test("técnico cai na assistência e não abre vendas nem documentos de venda", async ({ browser }) => {
  const { ctx, p } = await contextoLogado(browser, estado.tecnico.usuario, estado.tecnico.senha);
  await p.goto("/sistema");
  await expect(p).toHaveURL(/\/sistema\/assistencia/);
  for (const rota of ["/sistema/vendas", "/sistema/funil", "/sistema/usuarios"]) {
    await p.goto(rota);
    await expect(p.getByRole("heading", { name: "Você não tem acesso a esta área" }), rota).toBeVisible();
  }
  const pdf = await p.request.get(`/api/documentos/venda/${estado.vendaId}`);
  expect(pdf.status()).toBe(403);
  const os = await p.request.get(`/api/documentos/os/${estado.osId}`);
  expect(os.status()).toBe(200);
  await ctx.close();
});

test("histórico do sistema registra quem fez o quê", async () => {
  await page.goto("/sistema/logs");
  await expect(page.getByText(new RegExp(`${estado.cliente.nome}`)).first()).toBeVisible();
  await expect(page.getByText(/OS-\d+/).first()).toBeVisible();
});

test("painel conta a venda finalizada do período", async () => {
  await page.goto("/sistema?periodo=hoje");
  await expect(page.getByRole("heading", { name: "Visão geral" })).toBeVisible();
  await expect(page.getByText(/12\.500/).first()).toBeVisible();
});

test("celular: menu inferior, conversa em tela cheia e sem rolagem lateral", async ({ browser }) => {
  const { ctx, p } = await contextoLogado(browser, ADMIN.usuario, ADMIN.senha, { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  for (const rota of ["/sistema", "/sistema/clientes", `/sistema/clientes/${estado.cliente.id}`, "/sistema/funil", "/sistema/estoque", `/sistema/vendas/${estado.vendaId}`, "/sistema/assistencia", `/sistema/assistencia/${estado.osId}`, "/sistema/logs"]) {
    await p.goto(rota);
    await p.waitForLoadState("networkidle");
    await semRolagemLateral(p);
  }
  await expect(p.getByRole("navigation", { name: "Atalhos" })).toBeVisible();

  await p.goto("/sistema/conversas");
  const item = p.locator("ul li button", { hasText: estado.cliente.nome });
  await item.click();
  const voltar = p.getByRole("button", { name: "Voltar para a lista" });
  await expect(voltar).toBeVisible();
  await expect(p.getByRole("textbox", { name: "Mensagem" })).toBeVisible();
  await semRolagemLateral(p);
  await voltar.click();
  await expect(p.locator("ul li button", { hasText: estado.cliente.nome })).toBeVisible();
  await ctx.close();
});
