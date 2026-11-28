import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import { createAccount, type Account } from "@/features/accounts/accounts";
import { addAsset, type Asset } from "@/features/catalog/catalog";
import { SEEDED_USER_ID } from "@/shared/current-user";
import { toDecimal } from "@/shared/decimal";
import { accounts, assets, ledgerEvents, users } from "@/shared/db/schema";
import { testDb } from "../../../test/db";
import { listPositions, recordBuy, type AssetPosition } from "./ledger";

const db = testDb();
const userId = SEEDED_USER_ID;
const OTHER_USER_ID = "00000000-0000-0000-0000-0000000000ff";

/** Fixed "today", so the future-date rule doesn't depend on the clock. */
const TODAY = "2026-06-30";
const options = { today: TODAY };

afterEach(async () => {
  await db.delete(ledgerEvents);
  await db.delete(accounts);
  await db.delete(assets);
  await db.delete(users).where(eq(users.id, OTHER_USER_ID));
});

async function account(name: string, owner = userId): Promise<Account> {
  const result = await createAccount(db, owner, {
    name,
    institution: `${name} Investimentos`,
    country: "BR",
    currency: "BRL",
  });
  if (!result.ok) throw new Error(`Could not create account ${name}.`);
  return result.account;
}

async function asset(ticker: string): Promise<Asset> {
  const result = await addAsset(db, { type: "BR_STOCK", ticker });
  if (!result.ok) throw new Error(`Could not add asset ${ticker}.`);
  return result.asset;
}

/** A valid buy form for the account and asset, with overrides. */
function buyInput(
  accountRow: Account,
  assetRow: Asset,
  fields: Partial<Record<string, string>> = {},
) {
  return {
    accountId: accountRow.id,
    assetId: assetRow.id,
    date: "2026-01-10",
    quantity: "100",
    unitPrice: "30.00",
    fees: "5.00",
    ...fields,
  };
}

/** Decimals as plain strings, so a failure shows the exact digits. */
function plain(position: AssetPosition) {
  return {
    asset: position.asset.naturalKey,
    quantity: position.quantity.toFixed(),
    totalCost: position.totalCost.toFixed(),
    averagePrice: position.averagePrice?.toFixed() ?? null,
  };
}

async function storedEvents() {
  return db.select().from(ledgerEvents);
}

describe("recordBuy", () => {
  it("records a buy and derives the position: 100 @ 30.00 + 5.00 fees averages 30.05", async () => {
    const xp = await account("XP");
    const petr4 = await asset("PETR4");

    const result = await recordBuy(db, userId, buyInput(xp, petr4), options);

    expect(result).toEqual({ ok: true, event: expect.objectContaining({ type: "BUY" }) });
    const rows = await storedEvents();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      userId,
      accountId: xp.id,
      assetId: petr4.id,
      type: "BUY",
      status: "CONFIRMED",
      date: "2026-01-10",
      currency: "BRL",
      notes: null,
    });
    expect(toDecimal(rows[0]!.quantity).toFixed()).toBe("100");
    expect(toDecimal(rows[0]!.unitPrice).toFixed()).toBe("30");
    expect(toDecimal(rows[0]!.fees).toFixed()).toBe("5");

    const { consolidated } = await listPositions(db, userId);
    expect(consolidated.map(plain)).toEqual([
      { asset: "PETR4@B3", quantity: "100", totalCost: "3005", averagePrice: "30.05" },
    ]);
  });

  it("weights a second buy into the average: + 50 @ 36.00 + 4.90 fees averages 32.066", async () => {
    const xp = await account("XP");
    const petr4 = await asset("PETR4");
    await recordBuy(db, userId, buyInput(xp, petr4), options);

    const result = await recordBuy(
      db,
      userId,
      buyInput(xp, petr4, { date: "2026-02-03", quantity: "50", unitPrice: "36.00", fees: "4.90" }),
      options,
    );

    expect(result.ok).toBe(true);
    const { consolidated, byAccount } = await listPositions(db, userId);
    const expected = {
      asset: "PETR4@B3",
      quantity: "150",
      totalCost: "4809.9",
      averagePrice: "32.066",
    };
    expect(consolidated.map(plain)).toEqual([expected]);
    expect(byAccount.map((group) => group.positions.map(plain))).toEqual([[expected]]);
  });

  it("stores a crypto-like quantity exactly and reads it back without float rounding", async () => {
    const xp = await account("XP");
    const petr4 = await asset("PETR4");

    const result = await recordBuy(
      db,
      userId,
      buyInput(xp, petr4, { quantity: "0.00012345", unitPrice: "350000", fees: "0" }),
      options,
    );

    expect(result.ok).toBe(true);
    const [row] = await storedEvents();
    // numeric(36,18) pads the fraction; the value is exact.
    expect(row?.quantity).toBe("0.000123450000000000");
    const { consolidated } = await listPositions(db, userId);
    expect(consolidated[0]?.quantity.toFixed()).toBe("0.00012345");
    expect(consolidated[0]?.totalCost.toFixed()).toBe("43.2075");
  });

  it("keeps all 18 decimal places of a quantity", async () => {
    const xp = await account("XP");
    const petr4 = await asset("PETR4");

    await recordBuy(db, userId, buyInput(xp, petr4, { quantity: "0.123456789012345678" }), options);

    const { consolidated } = await listPositions(db, userId);
    expect(consolidated[0]?.quantity.toFixed()).toBe("0.123456789012345678");
  });

  it("accepts a comma as the decimal separator", async () => {
    const xp = await account("XP");
    const petr4 = await asset("PETR4");

    const result = await recordBuy(
      db,
      userId,
      buyInput(xp, petr4, { unitPrice: "30,05", fees: "0,5" }),
      options,
    );

    expect(result.ok).toBe(true);
    const [row] = await storedEvents();
    expect(toDecimal(row!.unitPrice).toFixed()).toBe("30.05");
    expect(toDecimal(row!.fees).toFixed()).toBe("0.5");
  });

  it("treats blank fees as zero", async () => {
    const xp = await account("XP");
    const petr4 = await asset("PETR4");

    const result = await recordBuy(db, userId, buyInput(xp, petr4, { fees: "  " }), options);

    expect(result.ok).toBe(true);
    const [row] = await storedEvents();
    expect(toDecimal(row!.fees).isZero()).toBe(true);
  });

  it("accepts today's date", async () => {
    const xp = await account("XP");
    const petr4 = await asset("PETR4");

    const result = await recordBuy(db, userId, buyInput(xp, petr4, { date: TODAY }), options);

    expect(result.ok).toBe(true);
  });

  it("stores the asset's currency on the event", async () => {
    const xp = await account("XP");
    const petr4 = await asset("PETR4");

    await recordBuy(db, userId, buyInput(xp, petr4), options);

    expect((await storedEvents())[0]?.currency).toBe(petr4.currency);
  });

  describe("validation: nothing is saved", () => {
    it("rejects a quantity of zero", async () => {
      const xp = await account("XP");
      const petr4 = await asset("PETR4");

      const result = await recordBuy(db, userId, buyInput(xp, petr4, { quantity: "0" }), options);

      expect(result).toEqual({ ok: false, fieldErrors: { quantity: "notPositive" } });
      expect(await storedEvents()).toHaveLength(0);
    });

    it("rejects a negative price", async () => {
      const xp = await account("XP");
      const petr4 = await asset("PETR4");

      const result = await recordBuy(
        db,
        userId,
        buyInput(xp, petr4, { unitPrice: "-30.00" }),
        options,
      );

      expect(result).toEqual({ ok: false, fieldErrors: { unitPrice: "notPositive" } });
      expect(await storedEvents()).toHaveLength(0);
    });

    it("rejects a future date", async () => {
      const xp = await account("XP");
      const petr4 = await asset("PETR4");

      const result = await recordBuy(
        db,
        userId,
        buyInput(xp, petr4, { date: "2026-07-01" }),
        options,
      );

      expect(result).toEqual({ ok: false, fieldErrors: { date: "future" } });
      expect(await storedEvents()).toHaveLength(0);
    });

    it("reports every invalid field at once", async () => {
      const xp = await account("XP");
      const petr4 = await asset("PETR4");

      const result = await recordBuy(
        db,
        userId,
        buyInput(xp, petr4, {
          date: "2027-01-01",
          quantity: "0",
          unitPrice: "-1",
          fees: "-0.01",
        }),
        options,
      );

      expect(result).toEqual({
        ok: false,
        fieldErrors: {
          date: "future",
          quantity: "notPositive",
          unitPrice: "notPositive",
          fees: "negative",
        },
      });
      expect(await storedEvents()).toHaveLength(0);
    });

    it("rejects a price of zero", async () => {
      const xp = await account("XP");
      const petr4 = await asset("PETR4");

      const result = await recordBuy(db, userId, buyInput(xp, petr4, { unitPrice: "0" }), options);

      expect(result).toEqual({ ok: false, fieldErrors: { unitPrice: "notPositive" } });
    });

    it("treats missing fields as required, not crashes", async () => {
      const result = await recordBuy(db, userId, {}, options);

      expect(result).toEqual({
        ok: false,
        fieldErrors: {
          accountId: "required",
          assetId: "required",
          date: "required",
          quantity: "required",
          unitPrice: "required",
        },
      });
    });

    it("treats blank fields as required", async () => {
      const result = await recordBuy(
        db,
        userId,
        { accountId: "", assetId: "", date: "", quantity: " ", unitPrice: "", fees: "" },
        options,
      );

      expect(result).toEqual({
        ok: false,
        fieldErrors: {
          accountId: "required",
          assetId: "required",
          date: "required",
          quantity: "required",
          unitPrice: "required",
        },
      });
    });

    it("rejects numbers that are not plain decimals", async () => {
      const xp = await account("XP");
      const petr4 = await asset("PETR4");

      const result = await recordBuy(
        db,
        userId,
        buyInput(xp, petr4, { quantity: "1e3", unitPrice: "1.000,50", fees: "abc" }),
        options,
      );

      expect(result).toEqual({
        ok: false,
        fieldErrors: { quantity: "invalid", unitPrice: "invalid", fees: "invalid" },
      });
    });

    it("rejects more decimal places or integer digits than numeric(36,18) holds", async () => {
      const xp = await account("XP");
      const petr4 = await asset("PETR4");

      const result = await recordBuy(
        db,
        userId,
        buyInput(xp, petr4, {
          quantity: "0.1234567890123456789",
          unitPrice: "1000000000000000000",
        }),
        options,
      );

      expect(result).toEqual({
        ok: false,
        fieldErrors: { quantity: "tooPrecise", unitPrice: "tooLarge" },
      });
    });

    it("rejects dates that do not exist or are not ISO dates", async () => {
      const xp = await account("XP");
      const petr4 = await asset("PETR4");

      const impossible = await recordBuy(
        db,
        userId,
        buyInput(xp, petr4, { date: "2026-02-30" }),
        options,
      );
      const malformed = await recordBuy(
        db,
        userId,
        buyInput(xp, petr4, { date: "10/01/2026" }),
        options,
      );

      expect(impossible).toEqual({ ok: false, fieldErrors: { date: "invalid" } });
      expect(malformed).toEqual({ ok: false, fieldErrors: { date: "invalid" } });
    });

    it("rejects an account or asset that does not exist", async () => {
      const xp = await account("XP");
      const petr4 = await asset("PETR4");
      const missing = "11111111-1111-4111-8111-111111111111";

      const result = await recordBuy(
        db,
        userId,
        buyInput(xp, petr4, { accountId: missing, assetId: missing }),
        options,
      );

      expect(result).toEqual({
        ok: false,
        fieldErrors: { accountId: "notFound", assetId: "notFound" },
      });
      expect(await storedEvents()).toHaveLength(0);
    });

    it("rejects ids that are not UUIDs", async () => {
      const result = await recordBuy(
        db,
        userId,
        { accountId: "xp", assetId: "PETR4", date: "2026-01-10", quantity: "1", unitPrice: "1" },
        options,
      );

      expect(result).toEqual({
        ok: false,
        fieldErrors: { accountId: "invalid", assetId: "invalid" },
      });
    });

    it("rejects another user's account", async () => {
      await db.insert(users).values({ id: OTHER_USER_ID });
      const theirs = await account("Theirs", OTHER_USER_ID);
      const petr4 = await asset("PETR4");

      const result = await recordBuy(db, userId, buyInput(theirs, petr4), options);

      expect(result).toEqual({ ok: false, fieldErrors: { accountId: "notFound" } });
      expect(await storedEvents()).toHaveLength(0);
    });
  });
});

describe("listPositions", () => {
  it("is empty when nothing was recorded", async () => {
    expect(await listPositions(db, userId)).toEqual({ consolidated: [], byAccount: [] });
  });

  it("sums the same asset across accounts in the consolidated view and keeps accounts apart", async () => {
    const xp = await account("XP");
    const rico = await account("Rico");
    const petr4 = await asset("PETR4");
    await recordBuy(db, userId, buyInput(xp, petr4), options);
    await recordBuy(
      db,
      userId,
      buyInput(rico, petr4, { quantity: "50", unitPrice: "36.00", fees: "4.90" }),
      options,
    );

    const { consolidated, byAccount } = await listPositions(db, userId);

    expect(consolidated.map(plain)).toEqual([
      { asset: "PETR4@B3", quantity: "150", totalCost: "4809.9", averagePrice: "32.066" },
    ]);
    // Accounts sorted by name: Rico before XP.
    expect(
      byAccount.map((group) => ({
        account: group.account.name,
        positions: group.positions.map(plain),
      })),
    ).toEqual([
      {
        account: "Rico",
        positions: [
          { asset: "PETR4@B3", quantity: "50", totalCost: "1804.9", averagePrice: "36.098" },
        ],
      },
      {
        account: "XP",
        positions: [
          { asset: "PETR4@B3", quantity: "100", totalCost: "3005", averagePrice: "30.05" },
        ],
      },
    ]);
  });

  it("lists each asset once per account, sorted by natural key", async () => {
    const xp = await account("XP");
    const vale3 = await asset("VALE3");
    const petr4 = await asset("PETR4");
    await recordBuy(db, userId, buyInput(xp, vale3, { quantity: "10", fees: "0" }), options);
    await recordBuy(db, userId, buyInput(xp, petr4), options);

    const { consolidated, byAccount } = await listPositions(db, userId);

    expect(consolidated.map((p) => p.asset.naturalKey)).toEqual(["PETR4@B3", "VALE3@B3"]);
    expect(byAccount[0]?.positions.map((p) => p.asset.naturalKey)).toEqual([
      "PETR4@B3",
      "VALE3@B3",
    ]);
    expect(consolidated[0]?.asset).toMatchObject({ name: "PETR4", currency: "BRL" });
  });

  it("leaves out pending events", async () => {
    const xp = await account("XP");
    const petr4 = await asset("PETR4");
    await recordBuy(db, userId, buyInput(xp, petr4), options);
    await db.insert(ledgerEvents).values({
      userId,
      accountId: xp.id,
      assetId: petr4.id,
      type: "BUY",
      status: "PENDING",
      date: "2026-03-01",
      quantity: "10",
      unitPrice: "1",
      fees: "0",
      currency: "BRL",
    });

    const { consolidated } = await listPositions(db, userId);

    expect(consolidated.map(plain)).toEqual([
      { asset: "PETR4@B3", quantity: "100", totalCost: "3005", averagePrice: "30.05" },
    ]);
  });

  it("lists only the given user's positions", async () => {
    await db.insert(users).values({ id: OTHER_USER_ID });
    const theirs = await account("Theirs", OTHER_USER_ID);
    const petr4 = await asset("PETR4");
    await recordBuy(db, OTHER_USER_ID, buyInput(theirs, petr4), options);

    expect(await listPositions(db, userId)).toEqual({ consolidated: [], byAccount: [] });
    expect((await listPositions(db, OTHER_USER_ID)).consolidated).toHaveLength(1);
  });
});
