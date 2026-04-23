import { test, expect } from "@playwright/test";

test.describe("Home page", () => {
  test("loads and shows hero", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/Cortoba Architecture Studio/);
    await expect(
      page.getByRole("heading", { name: /Cortoba Architecture Studio/i })
    ).toBeVisible();
  });

  test("has working CTAs", async ({ page }) => {
    await page.goto("/");
    const projectsCta = page.getByRole("link", { name: /voir nos projets/i });
    const configCta = page.getByRole("link", {
      name: /configurateur de projet/i,
    });
    await expect(projectsCta).toBeVisible();
    await expect(configCta).toBeVisible();
  });

  test("language switcher works (FR → EN)", async ({ page }) => {
    await page.goto("/");
    // Wait for React to hydrate
    await page.waitForLoadState("networkidle");
    await page.getByRole("button", { name: "EN" }).click();
    // Subtitle in English
    await expect(
      page.getByText(/Projects that tell the story of place/i)
    ).toBeVisible({ timeout: 5000 });
  });

  test("language switcher RTL (FR → AR)", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await page.getByRole("button", { name: "AR" }).click();
    // html dir should flip to rtl
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl", {
      timeout: 5000,
    });
  });
});
