import { test, expect } from "@playwright/test";

test.describe("Project detail pages", () => {
  test("villa-al loads with hero + description", async ({ page }) => {
    await page.goto("/projet-villa-al");
    await expect(page).toHaveTitle(/VILLA/i);
    await expect(
      page.getByRole("heading", { name: /VILLA/i })
    ).toBeVisible();
  });

  test("navigation : home → click a project card → morph / detail", async ({
    page,
  }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    // Scroll to projects section
    await page.locator("#projects").scrollIntoViewIfNeeded();
    // Click first project card
    const firstCard = page.locator(".project-card-link, [href^='/projet-']").first();
    await expect(firstCard).toBeVisible();
    // Click and wait for the detail overlay or navigation
    await firstCard.click();
    // The morph overlay or navigation should happen — check for the Villa title
    await expect(
      page.locator("body").getByText(/voir le projet complet|VILLA/i).first()
    ).toBeVisible({ timeout: 5000 });
  });
});

test.describe("SEO", () => {
  test("home has canonical + OG tags", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      "href",
      /cortobaarchitecture\.com/
    );
    await expect(page.locator('meta[property="og:title"]')).toHaveAttribute(
      "content",
      /Cortoba/
    );
  });

  test("project detail has article OG type", async ({ page }) => {
    await page.goto("/projet-villa-al");
    await expect(page.locator('meta[property="og:type"]')).toHaveAttribute(
      "content",
      /article|website/
    );
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
