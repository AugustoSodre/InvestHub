import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import { SEEDED_USER_ID } from "@/shared/current-user";
import { accounts, users } from "@/shared/db/schema";
import { testDb } from "../../../test/db";
import { createAccount, listAccounts } from "./accounts";

const db = testDb();
const userId = SEEDED_USER_ID;

const XP = { name: "XP", institution: "XP Investimentos", country: "BR", currency: "BRL" };
const AVENUE = { name: "Avenue", institution: "Avenue Securities", country: "US", currency: "USD" };

async function storedAccounts() {
  return db.select().from(accounts);
}

const OTHER_USER_ID = "00000000-0000-0000-0000-0000000000ff";

afterEach(async () => {
  await db.delete(accounts);
  await db.delete(users).where(eq(users.id, OTHER_USER_ID));
});

describe("accounts", () => {
  it("lists no accounts when none exist, so the page shows its empty state", async () => {
    expect(await listAccounts(db, userId)).toEqual([]);
  });

  it("saves a valid account and lists it", async () => {
    const result = await createAccount(db, userId, XP);

    expect(result).toEqual({
      ok: true,
      account: expect.objectContaining({ ...XP, userId }),
    });
    const rows = await storedAccounts();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ ...XP, userId });
    expect(rows[0]?.createdAt).toBeInstanceOf(Date);

    const listed = await listAccounts(db, userId);
    expect(listed).toEqual([expect.objectContaining({ ...XP })]);
  });

  it("trims surrounding whitespace from text fields", async () => {
    const result = await createAccount(db, userId, {
      ...XP,
      name: "  XP  ",
      institution: " XP Investimentos ",
    });

    expect(result.ok).toBe(true);
    expect(await storedAccounts()).toEqual([expect.objectContaining({ name: "XP" })]);
    expect((await storedAccounts())[0]?.institution).toBe("XP Investimentos");
  });

  it("rejects a second account with the same name and saves nothing", async () => {
    await createAccount(db, userId, XP);

    const result = await createAccount(db, userId, { ...XP, institution: "Outra" });

    expect(result).toEqual({ ok: false, fieldErrors: { name: "duplicate" } });
    expect(await storedAccounts()).toHaveLength(1);
  });

  it("treats account names as duplicates regardless of case and whitespace", async () => {
    await createAccount(db, userId, XP);

    const result = await createAccount(db, userId, { ...XP, name: " xp " });

    expect(result).toEqual({ ok: false, fieldErrors: { name: "duplicate" } });
    expect(await storedAccounts()).toHaveLength(1);
  });

  it("lets another user have an account with the same name", async () => {
    await db.insert(users).values({ id: OTHER_USER_ID });
    await createAccount(db, userId, XP);

    const result = await createAccount(db, OTHER_USER_ID, XP);

    expect(result.ok).toBe(true);
    expect(await listAccounts(db, userId)).toHaveLength(1);
    expect(await listAccounts(db, OTHER_USER_ID)).toHaveLength(1);
  });

  it("returns a field error for an empty name and saves nothing", async () => {
    const result = await createAccount(db, userId, { ...XP, name: "   " });

    expect(result).toEqual({ ok: false, fieldErrors: { name: "required" } });
    expect(await storedAccounts()).toHaveLength(0);
  });

  it("returns a field error for an unsupported currency and saves nothing", async () => {
    const result = await createAccount(db, userId, { ...XP, currency: "EUR" });

    expect(result).toEqual({ ok: false, fieldErrors: { currency: "invalid" } });
    expect(await storedAccounts()).toHaveLength(0);
  });

  it("returns one field error per invalid field", async () => {
    const result = await createAccount(db, userId, {
      name: "",
      institution: "",
      country: "AR",
      currency: "EUR",
    });

    expect(result).toEqual({
      ok: false,
      fieldErrors: {
        name: "required",
        institution: "required",
        country: "invalid",
        currency: "invalid",
      },
    });
    expect(await storedAccounts()).toHaveLength(0);
  });

  it("treats missing fields as errors, not crashes", async () => {
    const result = await createAccount(db, userId, {});

    expect(result).toEqual({
      ok: false,
      fieldErrors: {
        name: "required",
        institution: "required",
        country: "invalid",
        currency: "invalid",
      },
    });
  });

  it("rejects names longer than the limit", async () => {
    const result = await createAccount(db, userId, { ...XP, name: "x".repeat(101) });

    expect(result).toEqual({ ok: false, fieldErrors: { name: "tooLong" } });
  });

  it("lists each account with its currency", async () => {
    await createAccount(db, userId, XP);
    await createAccount(db, userId, AVENUE);

    const listed = await listAccounts(db, userId);

    expect(listed.map(({ name, currency }) => ({ name, currency }))).toEqual([
      { name: "Avenue", currency: "USD" },
      { name: "XP", currency: "BRL" },
    ]);
  });

  it("lists only the given user's accounts", async () => {
    await db.insert(users).values({ id: OTHER_USER_ID });
    await createAccount(db, OTHER_USER_ID, AVENUE);
    await createAccount(db, userId, XP);

    expect((await listAccounts(db, userId)).map((a) => a.name)).toEqual(["XP"]);
  });
});
