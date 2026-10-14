import { expect, test } from "@playwright/test";

// Test de fumée réel (vrai build de prod, vrai navigateur) — la page publique /fr, sans session.
// Squelette e2e (voir playwright.config.ts) : pose les fondations, ne couvre pas encore les
// parcours authentifiés de frontendAnalyse.md §8 (demanderaient un backend/LLM factice).
test("la landing /fr se charge et affiche son contenu principal", async ({ page }) => {
  const response = await page.goto("/fr");
  expect(response?.ok()).toBe(true);

  await expect(page.locator("main")).toBeVisible();
  await expect(page.locator("h1").first()).toBeVisible();
  await expect(page).toHaveTitle(/.+/);
});

test("la langue /en se charge aussi", async ({ page }) => {
  const response = await page.goto("/en");
  expect(response?.ok()).toBe(true);
  await expect(page.locator("main")).toBeVisible();
});
