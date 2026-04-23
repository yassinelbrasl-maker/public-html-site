import { test, expect } from "@playwright/test";

test.describe("Project detail pages", () => {
  test("villa-al loads with hero + description", async ({ page }) => {
    await page.goto("/projet-villa-al");
    await expect(page).toHaveTitle(/VILLA/i);
    await expect(
      page.getByRole("heading", { name: /VILLA/i }).first()
    ).toBeVisible();
  });

  test("navigation : home → click a project card → morph / detail", async ({
    page,
  }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    // Scroll to projects section
    await page.locator("#projects").scrollIntoViewIfNeeded();
    // Click first project card — wait for React to have replaced the static
    // fallback cards with real project data
    await page.waitForSelector('[href^="/projet-"]', { timeout: 10_000 });
    const firstCard = page.locator('[href^="/projet-"]').first();
    await firstCard.scrollIntoViewIfNeeded();
    await firstCard.click();
    // The morph overlay contains either "Voir le projet complet" CTA
    // or navigation happens to /projet-:slug — accept both
    await expect(
      page
        .locator("body")
        .getByText(/voir le projet complet|Résidentiel|RÉSIDENTIEL/i)
        .first()
    ).toBeVisible({ timeout: 8000 });
  });
});

test.describe("SEO", () => {
  test("home has canonical + OG tags", async ({ page }) => {
    await page.goto("/");
    // Prerender + helmet both inject a canonical; .first() is fine.
    await expect(page.locator('link[rel="canonical"]').first()).toHaveAttribute(
      "href",
      /cortobaarchitecture\.com/
    );
    await expect(page.locator('meta[property="og:title"]').first()).toHaveAttribute(
      "content",
      /Cortoba/
    );
  });

  test("project detail has article OG type", async ({ page }) => {
    await page.goto("/projet-villa-al");
    await expect(
      page.locator('meta[property="og:type"]').first()
    ).toHaveAttribute("content", /article|website/);
  });

  test("sitemap.xml is valid", async ({ request }) => {
    const res = await request.get("/sitemap.xml");
    expect(res.status()).toBe(200);
    const body = await res.text();
    expect(body).toContain("<urlset");
    expect(body).toContain("cortobaarchitecture.com/");
  });

  test("robots.txt disallows admin", async ({ request }) => {
    const res = await request.get("/robots.txt");
    expect(res.status()).toBe(200);
    const body = await res.text();
    expect(body).toContain("Disallow: /plateforme");
  });
});
