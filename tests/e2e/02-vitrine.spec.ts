import { expect, test } from "@playwright/test";
import { semRolagemLateral } from "./ajuda";

/* a loja que o cliente vê: sem parcela, acessórios reais, fotos da loja */
test("vitrine abre sem parcela nem carnê, com acessórios e clientes reais", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/$/);
  const html = await page.content();
  expect(html).not.toMatch(/18x|carnê|parcel/i);
  /* custo não pode chegar ao cliente nem como dado no código-fonte */
  const estoque = await (await page.request.get("/estoque.js")).text();
  expect(estoque).not.toMatch(/custo\s*:/);
  expect(html).not.toMatch(/custo\s*:/);

  for (const nome of ["Capacete TOMATE Azul", "Capacete TOMATE Branco", "Baú 28 litros"]) {
    const card = page.locator("article.prod", { hasText: nome });
    await expect(card).toBeVisible();
    await expect(card.locator(".preco")).toHaveText("Consultar preço");
    await card.scrollIntoViewIfNeeded();
    await expect.poll(() => card.locator("img").first().evaluate((i: HTMLImageElement) => i.complete && i.naturalWidth > 0)).toBe(true);
  }
  await page.locator("#quem-somos").scrollIntoViewIfNeeded();
  await expect(page.getByRole("heading", { name: "Quem atende é a gente mesmo." })).toBeVisible();
  await page.locator("#clientes").scrollIntoViewIfNeeded();
  await expect(page.locator(".galeria img")).toHaveCount(5);
  await expect(page.getByText("Quais as formas de pagamento?")).toBeVisible();
});

/* muito cliente toca na foto: foto, nome e ficha abrem o mesmo WhatsApp do botão.
   E desde 26/09/2026 o MM3 é moto elétrica e a palavra "triciclo" saiu do site. */
test("foto, nome e ficha do card abrem o mesmo WhatsApp do botão; sem triciclo", async ({ page }) => {
  await page.addInitScript(() => {
    const w = window as unknown as { __zap: string[]; open: (u?: string | URL) => null };
    w.__zap = [];
    w.open = (u) => { w.__zap.push(String(u)); return null; };
  });
  await page.goto("/");
  const abertos = () => page.evaluate(() => (window as unknown as { __zap: string[] }).__zap.splice(0));

  expect(await page.locator("body").innerText()).not.toMatch(/tricicl/i);
  const html = await page.content();
  expect(html).not.toMatch(/tricicl/i);
  const motos = page.locator("#cat-motos-eletricas");
  await expect(motos.locator("article.prod", { hasText: "MM3" })).toBeVisible();

  for (const nome of ["TANK AG11", "MM3", "Baú 28 litros"]) {
    const card = page.locator("article.prod").filter({ has: page.locator(".prod-nome", { hasText: nome }) });
    await card.scrollIntoViewIfNeeded();
    await card.locator(".btn-consultar").click();
    const [doBotao] = await abertos();
    expect(doBotao).toContain("https://wa.me/");
    expect(decodeURIComponent(doBotao)).toContain(`*${nome}*`);
    const alvos = [card.locator(".prod-foto"), card.locator(".prod-nome a")];
    if (await card.locator(".ficha").count()) alvos.push(card.locator(".ficha .ficha-i").first());
    for (const alvo of alvos) {
      await alvo.click();
      expect(await abertos()).toEqual([doBotao]);
    }
    /* pelo teclado: Enter no nome */
    await card.locator(".prod-nome a").focus();
    await page.keyboard.press("Enter");
    expect(await abertos()).toEqual([doBotao]);
  }
  await expect(page).toHaveURL(/\/$/);   // o link do nome não pulou para "#"
});

test("vitrine no celular não rola para o lado", async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  await page.goto("/vitrine");
  await page.waitForLoadState("networkidle");
  await semRolagemLateral(page);
  await ctx.close();
});
