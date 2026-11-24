import { expect, test } from "@playwright/test";

test("home page renders in PT-BR", async ({ page }) => {
  await page.goto("/");

  await expect(page.locator("html")).toHaveAttribute("lang", "pt-BR");
  await expect(page.getByRole("heading", { level: 1, name: "InvestHub" })).toBeVisible();
  await expect(page.getByText(/em uma única carteira, em reais/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Começar" })).toBeVisible();
});
