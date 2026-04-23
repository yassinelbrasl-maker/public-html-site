import { test, expect } from "@playwright/test";

test.describe("Configurateur", () => {
  test("intro banner loads", async ({ page }) => {
    await page.goto("/configurateur");
    await expect(
      page.getByRole("heading", { name: /Configurateur/i })
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /démarrer/i })
    ).toBeVisible();
  });

  test("intro → step 1 → validation blocks empty name", async ({ page }) => {
    await page.goto("/configurateur");
    await page.getByRole("button", { name: /démarrer/i }).click();

    await expect(
      page.getByText(/Comment s'appelle votre projet/i)
    ).toBeVisible();

    // Click Commencer without filling the name — validation should fire
    await page.getByRole("button", { name: /commencer/i }).click();
    await expect(
      page.getByText(/Veuillez donner un nom à votre projet/i)
    ).toBeVisible({ timeout: 3000 });
  });

  test("step 1 → step 2 with valid name", async ({ page }) => {
    await page.goto("/configurateur");
    await page.getByRole("button", { name: /démarrer/i }).click();

    await page.getByPlaceholder(/Villa Djerba/i).fill("Test E2E Villa");
    await page.getByRole("button", { name: /commencer/i }).click();

    // Now on step 2 — should see Missions heading
    await expect(page.getByText(/Missions/).first()).toBeVisible({
      timeout: 5000,
    });
  });
});
