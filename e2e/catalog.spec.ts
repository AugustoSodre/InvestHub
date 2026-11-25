import { randomInt } from "node:crypto";
import { expect, test } from "@playwright/test";
import { Client } from "pg";
import { e2eDatabaseUrl } from "../test/e2e-database";

// Manual add only: the dev server cannot use MSW, and e2e never calls brapi.
// The search and its error states are covered by the catalog's integration and
// render tests. The app's database is shared (locally `investhub_dev`), so this
// spec only deletes the assets it created and skips the empty state when others
// exist.
test.describe.configure({ mode: "serial" });

const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const randomLetters = (n: number) =>
  Array.from({ length: n }, () => LETTERS[randomInt(LETTERS.length)]).join("");

// A made-up B3-shaped ticker, so runs don't collide with real assets or each other.
const TICKER = `Q${randomLetters(3)}11`;
const KEY = `${TICKER}@B3`;

async function query<T extends object>(text: string, values: unknown[] = []): Promise<T[]> {
  const client = new Client({ connectionString: e2eDatabaseUrl() });
  await client.connect();
  try {
    return (await client.query<T>(text, values)).rows;
  } finally {
    await client.end();
  }
}

test.afterAll(async () => {
  await query("DELETE FROM assets WHERE natural_key = $1", [KEY]);
});

test("shows an empty state when the catalog is empty", async ({ page }) => {
  const [row] = await query<{ count: number }>("SELECT count(*)::int AS count FROM assets");
  test.skip((row?.count ?? 0) > 0, "The database already has assets.");

  await page.goto("/ativos");

  await expect(page.getByRole("heading", { level: 1, name: "Ativos" })).toBeVisible();
  await expect(page.getByText("Nenhum ativo no catálogo")).toBeVisible();
});

test("adds an asset manually with type and ticker", async ({ page }) => {
  await page.goto("/ativos");

  await page.getByLabel("Ticker", { exact: true }).fill(TICKER.toLowerCase());
  await page.getByLabel("Tipo").selectOption("FII");
  await page.getByRole("button", { name: "Adicionar ativo" }).click();

  await expect(page.getByRole("status")).toHaveText(`${KEY} adicionado ao catálogo.`);
  const row = page.getByRole("row", { name: new RegExp(KEY) });
  await expect(row).toContainText("FII");
  await expect(row).toContainText("BRL");
  await expect(row).toContainText("brapi");
});

test("reuses the existing asset when the same key is added again", async ({ page }) => {
  await page.goto("/ativos");

  await page.getByLabel("Ticker", { exact: true }).fill(KEY);
  await page.getByLabel("Tipo").selectOption("FII");
  await page.getByRole("button", { name: "Adicionar ativo" }).click();

  await expect(page.getByRole("status")).toHaveText(`${KEY} já estava no catálogo.`);
  await expect(page.getByRole("row", { name: new RegExp(KEY) })).toHaveCount(1);
});

test("shows a field error for a ticker that is not B3-shaped", async ({ page }) => {
  await page.goto("/ativos");

  await page.getByLabel("Ticker", { exact: true }).fill("PETRO");
  await page.getByRole("button", { name: "Adicionar ativo" }).click();

  await expect(page.getByLabel("Ticker", { exact: true })).toHaveAttribute("aria-invalid", "true");
  await expect(page.getByText("Use um ticker da B3, como PETR4 ou HGLG11.")).toBeVisible();
});
