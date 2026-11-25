import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { Client } from "pg";
import { SEEDED_USER_ID } from "../src/shared/current-user";
import { databaseUrl } from "../src/shared/db/url";

// The app's database may be a developer's real local one, so this spec only
// deletes the accounts it created and skips the empty state when others exist.
test.describe.configure({ mode: "serial" });

const suffix = randomUUID().slice(0, 8);
const XP = `XP e2e-${suffix}`;
const AVENUE = `Avenue e2e-${suffix}`;

async function query<T extends object>(text: string, values: unknown[] = []): Promise<T[]> {
  const client = new Client({ connectionString: databaseUrl() });
  await client.connect();
  try {
    return (await client.query<T>(text, values)).rows;
  } finally {
    await client.end();
  }
}

test.afterAll(async () => {
  await query("DELETE FROM accounts WHERE name = ANY($1)", [[XP, AVENUE]]);
});

test("shows an empty state when there are no accounts", async ({ page }) => {
  const [row] = await query<{ count: number }>(
    "SELECT count(*)::int AS count FROM accounts WHERE user_id = $1",
    [SEEDED_USER_ID],
  );
  test.skip((row?.count ?? 0) > 0, "The database already has accounts.");

  await page.goto("/contas");

  await expect(page.getByRole("heading", { level: 1, name: "Contas" })).toBeVisible();
  await expect(page.getByText("Nenhuma conta cadastrada")).toBeVisible();
});

test("creates accounts and lists them with their currency", async ({ page }) => {
  await page.goto("/contas");

  await page.getByLabel("Nome").fill(XP);
  await page.getByLabel("Instituição").fill("XP Investimentos");
  await page.getByLabel("País").selectOption("BR");
  await page.getByLabel("Moeda").selectOption("BRL");
  await page.getByRole("button", { name: "Adicionar conta" }).click();

  await expect(page.getByRole("status")).toHaveText("Conta adicionada.");
  await expect(page.getByRole("row", { name: new RegExp(XP) })).toContainText("BRL");
  await expect(page.getByLabel("Nome")).toHaveValue("");

  await page.getByLabel("Nome").fill(AVENUE);
  await page.getByLabel("Instituição").fill("Avenue Securities");
  await page.getByLabel("País").selectOption("US");
  await page.getByLabel("Moeda").selectOption("USD");
  await page.getByRole("button", { name: "Adicionar conta" }).click();

  await expect(page.getByRole("row", { name: new RegExp(AVENUE) })).toContainText("USD");
  await expect(page.getByRole("row", { name: new RegExp(XP) })).toContainText("BRL");
});

test("rejects a duplicate account name", async ({ page }) => {
  await page.goto("/contas");

  await page.getByLabel("Nome").fill(XP.toLowerCase());
  await page.getByLabel("Instituição").fill("Outra corretora");
  await page.getByRole("button", { name: "Adicionar conta" }).click();

  await expect(page.getByText("Conta já existe.")).toBeVisible();
  await expect(page.getByLabel("Nome")).toHaveValue(XP.toLowerCase());
  await expect(page.getByRole("row", { name: new RegExp(XP, "i") })).toHaveCount(1);
});

test("shows field-level errors for empty fields", async ({ page }) => {
  await page.goto("/contas");

  await page.getByRole("button", { name: "Adicionar conta" }).click();

  await expect(page.getByLabel("Nome")).toHaveAttribute("aria-invalid", "true");
  await expect(page.getByLabel("Instituição")).toHaveAttribute("aria-invalid", "true");
  await expect(page.getByText("Campo obrigatório.")).toHaveCount(2);
});
