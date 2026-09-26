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

test("vitrine no celular não rola para o lado", async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  await page.goto("/vitrine");
  await page.waitForLoadState("networkidle");
  await semRolagemLateral(page);
  await ctx.close();
});
