import { test, expect } from "@playwright/test";

test.describe("Home page", () => {
  test("loads and shows hero", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/Cortoba Architecture Studio/);
    await expect(
      page.getByRole("heading", { name: /Cortoba Architecture Studio/i }).first()
    ).toBeVisible();
  });

  test("has working CTAs", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("domcontentloaded");
    const projectsCta = page.locator('a[href="#projects"]').first();
    const configCta = page.locator('a[href="/configurateur"]').first();
    await expect(projectsCta).toBeVisible({ timeout: 8000 });
    await expect(configCta).toBeVisible({ timeout: 8000 });
  });

  test("language switcher works (FR → EN)", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("domcontentloaded");
    await page.locator('header button:has-text("EN")').first().click();
    await expect(page.locator("html")).toHaveAttribute("lang", "en", {
      timeout: 5000,
    });
  });

  test("language switcher RTL (FR → AR)", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("domcontentloaded");
    await page.locator('header button:has-text("AR")').first().click();
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl", {
      timeout: 5000,
    });
  });
});
