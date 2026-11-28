import { randomInt, randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { Client } from "pg";
import { SEEDED_USER_ID } from "../src/shared/current-user";
import { e2eDatabaseUrl } from "../test/e2e-database";

// The app's database is shared (locally `investhub_dev`), so this spec creates
// its own account and a made-up asset, and deletes only those (and their
// ledger events) afterwards. Positions of other assets may be on the page too.
test.describe.configure({ mode: "serial" });

const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const randomLetters = (n: number) =>
  Array.from({ length: n }, () => LETTERS[randomInt(LETTERS.length)]).join("");

const ACCOUNT = `XP e2e-${randomUUID().slice(0, 8)}`;
const TICKER = `Q${randomLetters(3)}3`;
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

async function eventCount(): Promise<number> {
  const [row] = await query<{ count: number }>(
    `SELECT count(*)::int AS count FROM ledger_events e
     JOIN assets a ON a.id = e.asset_id WHERE a.natural_key = $1`,
    [KEY],
  );
  return row?.count ?? 0;
}

test.beforeAll(async () => {
  await query(
    `INSERT INTO accounts (user_id, name, institution, country, currency)
     VALUES ($1, $2, 'XP Investimentos', 'BR', 'BRL')`,
    [SEEDED_USER_ID, ACCOUNT],
  );
  await query(
    `INSERT INTO assets (type, natural_key, name, currency, price_source)
     VALUES ('BR_STOCK', $1, $2, 'BRL', 'brapi')`,
    [KEY, TICKER],
  );
});

test.afterAll(async () => {
  await query(
    "DELETE FROM ledger_events WHERE asset_id IN (SELECT id FROM assets WHERE natural_key = $1)",
    [KEY],
  );
  await query("DELETE FROM assets WHERE natural_key = $1", [KEY]);
  await query("DELETE FROM accounts WHERE name = $1", [ACCOUNT]);
});

async function recordBuy(
  page: Page,
  fields: { date: string; quantity: string; unitPrice: string; fees: string },
) {
  await page.getByLabel("Conta").selectOption({ label: ACCOUNT });
  await page.getByLabel("Ativo").selectOption({ label: `${KEY} · ${TICKER}` });
  await page.getByLabel("Data da compra").fill(fields.date);
  await page.getByLabel("Quantidade").fill(fields.quantity);
  await page.getByLabel("Preço unitário").fill(fields.unitPrice);
  await page.getByLabel("Taxas").fill(fields.fees);
  await page.getByRole("button", { name: "Registrar compra" }).click();
}

const consolidatedRow = (page: Page) =>
  page.getByRole("region", { name: "Consolidado" }).getByRole("row", { name: new RegExp(KEY) });

test("records a buy and shows the position with its average price", async ({ page }) => {
  await page.goto("/posicoes");
  await expect(page.getByRole("heading", { level: 1, name: "Posições" })).toBeVisible();

  await recordBuy(page, { date: "2026-01-10", quantity: "100", unitPrice: "30,00", fees: "5,00" });

  await expect(page.getByRole("status")).toHaveText("Compra registrada.");
  await expect(consolidatedRow(page)).toContainText("100");
  await expect(consolidatedRow(page)).toContainText("R$ 30,05");
  await expect(consolidatedRow(page)).toContainText("R$ 3.005,00");
});

test("weights a second buy into the average price", async ({ page }) => {
  await page.goto("/posicoes");

  await recordBuy(page, { date: "2026-02-03", quantity: "50", unitPrice: "36,00", fees: "4,90" });

  await expect(consolidatedRow(page)).toContainText("150");
  await expect(consolidatedRow(page)).toContainText("R$ 32,07");
  await expect(consolidatedRow(page)).toContainText("R$ 4.809,90");
  await expect(
    page.getByRole("region", { name: ACCOUNT }).getByRole("row", { name: new RegExp(KEY) }),
  ).toContainText("R$ 32,07");
});

test("shows validation errors and saves nothing", async ({ page }) => {
  const before = await eventCount();
  await page.goto("/posicoes");

  await recordBuy(page, { date: "2099-01-01", quantity: "0", unitPrice: "-1", fees: "" });

  await expect(page.getByText("A data não pode estar no futuro.")).toBeVisible();
  await expect(page.getByText("Informe um valor maior que zero.")).toHaveCount(2);
  await expect(page.getByLabel("Quantidade")).toHaveAttribute("aria-invalid", "true");
  expect(await eventCount()).toBe(before);
});
