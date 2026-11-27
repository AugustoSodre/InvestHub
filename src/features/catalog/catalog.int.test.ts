import { afterEach, describe, expect, it } from "vitest";
import { createBrapiClient } from "@/integrations/brapi/brapi";
import {
  brapiListFromFixtures,
  brapiListMissingToken,
  brapiListRateLimited,
  brapiListServerError,
} from "@/integrations/brapi/fixtures/handlers";
import { assets } from "@/shared/db/schema";
import { testDb } from "../../../test/db";
import { server } from "../../../test/msw/server";
import { ASSET_NAME_MAX_LENGTH } from "./asset-input";
import { addAsset, listAssets, searchAssets } from "./catalog";

const db = testDb();
const PETROBRAS = "PETROLEO BRASILEIRO S.A. PETROBRAS";
const PATRIA_LOG = "PÁTRIA LOG - FUNDO DE INVESTIMENTO IMOBILIÁRIO - RESPONSABILIDADE LIMITADA";

/** A client with a token, so results are not flagged as needing one. */
const brapi = () => createBrapiClient({ token: "test-token" });

async function storedAssets() {
  return db.select().from(assets);
}

afterEach(async () => {
  await db.delete(assets);
});

describe("searchAssets", () => {
  it("finds PETR4 as a BR stock keyed PETR4@B3, in BRL, priced by brapi", async () => {
    server.use(brapiListFromFixtures);

    const result = await searchAssets(brapi(), "PETR4");

    expect(result).toEqual({
      ok: true,
      tokenMissing: false,
      candidates: [
        {
          ticker: "PETR4",
          name: PETROBRAS,
          type: "BR_STOCK",
          naturalKey: "PETR4@B3",
          currency: "BRL",
          priceSource: "brapi",
        },
      ],
    });
  });

  it("leaves out fractional-market tickers (PETR4F is PETR4)", async () => {
    server.use(brapiListFromFixtures);

    const result = await searchAssets(brapi(), "PETR4");

    expect(result.ok && result.candidates.map((c) => c.ticker)).toEqual(["PETR4"]);
  });

  it("trims and upper-cases the query", async () => {
    server.use(brapiListFromFixtures);

    const result = await searchAssets(brapi(), "  petr4 ");

    expect(result.ok && result.candidates.map((c) => c.naturalKey)).toEqual(["PETR4@B3"]);
  });

  it("rejects a blank query without calling brapi", async () => {
    // No handler registered: a request would fail the test.
    expect(await searchAssets(brapi(), "   ")).toEqual({
      ok: false,
      fieldErrors: { query: "required" },
    });
  });

  it("pre-fills a ticker ending in 11 that brapi reports as a FII with type FII", async () => {
    server.use(brapiListFromFixtures);

    const result = await searchAssets(brapi(), "HGLG11");

    expect(result).toMatchObject({
      ok: true,
      candidates: [{ ticker: "HGLG11", name: PATRIA_LOG, type: "FII", naturalKey: "HGLG11@B3" }],
    });
  });

  it.each([
    ["rate-limited (HTTP 429)", brapiListRateLimited, "rateLimited"],
    ["down (HTTP 500)", brapiListServerError, "unavailable"],
  ] as const)("reports brapi %s as %s", async (_label, handler, error) => {
    server.use(handler);

    expect(await searchAssets(brapi(), "PETR4")).toEqual({ ok: false, error });
  });

  it("reports a missing token when brapi rejects the call for it", async () => {
    server.use(brapiListMissingToken);

    const result = await searchAssets(createBrapiClient({}), "HGLG11");

    expect(result).toEqual({ ok: false, error: "tokenMissing" });
  });

  it("flags results that need a token when none is configured", async () => {
    server.use(brapiListFromFixtures);
    const noToken = createBrapiClient({});

    expect(await searchAssets(noToken, "HGLG11")).toMatchObject({ ok: true, tokenMissing: true });
    // PETR4 is one of brapi's free test tickers.
    expect(await searchAssets(noToken, "PETR4")).toMatchObject({ ok: true, tokenMissing: false });
  });
});

describe("addAsset", () => {
  it("adds a searched PETR4 as BR_STOCK PETR4@B3, BRL, brapi", async () => {
    server.use(brapiListFromFixtures);
    const search = await searchAssets(brapi(), "PETR4");
    const candidate = search.ok ? search.candidates[0] : undefined;

    const result = await addAsset(db, candidate);

    const expected = {
      type: "BR_STOCK",
      naturalKey: "PETR4@B3",
      name: PETROBRAS,
      currency: "BRL",
      priceSource: "brapi",
    };
    expect(result).toEqual({ ok: true, created: true, asset: expect.objectContaining(expected) });
    const rows = await storedAssets();
    expect(rows).toEqual([expect.objectContaining(expected)]);
    expect(rows[0]?.createdAt).toBeInstanceOf(Date);
  });

  it("reuses the existing asset when PETR4@B3 is added again", async () => {
    const first = await addAsset(db, { type: "BR_STOCK", ticker: "PETR4", name: PETROBRAS });

    const second = await addAsset(db, { type: "BR_STOCK", ticker: "petr4@b3", name: "Outro" });

    expect(first).toMatchObject({ ok: true, created: true });
    expect(second).toMatchObject({ ok: true, created: false });
    expect(second.ok && first.ok && second.asset.id).toBe(first.ok && first.asset.id);
    expect(await storedAssets()).toEqual([expect.objectContaining({ name: PETROBRAS })]);
  });

  it("reuses the existing asset when the same ticker is added concurrently", async () => {
    const input = { type: "BR_STOCK", ticker: "PETR4", name: PETROBRAS };

    const results = await Promise.all([addAsset(db, input), addAsset(db, input)]);

    expect(results.map((r) => r.ok && r.created).sort()).toEqual([false, true]);
    expect(await storedAssets()).toHaveLength(1);
  });

  it("refuses HGLG11@B3 as BR_STOCK when it is already in the catalog as FII", async () => {
    const first = await addAsset(db, { type: "FII", ticker: "HGLG11" });

    const second = await addAsset(db, { type: "BR_STOCK", ticker: "HGLG11" });

    expect(first).toMatchObject({ ok: true, created: true });
    expect(second).toEqual({
      ok: false,
      fieldErrors: { type: "typeConflict" },
      conflict: { naturalKey: "HGLG11@B3", type: "FII" },
    });
    expect(await storedAssets()).toEqual([
      expect.objectContaining({ type: "FII", naturalKey: "HGLG11@B3" }),
    ]);
  });

  it("keeps one asset per natural key when two types are added concurrently", async () => {
    const results = await Promise.all([
      addAsset(db, { type: "FII", ticker: "HGLG11" }),
      addAsset(db, { type: "BR_STOCK", ticker: "HGLG11" }),
    ]);

    const created = results.filter((r) => r.ok && r.created);
    const conflicts = results.filter((r) => !r.ok && r.fieldErrors.type === "typeConflict");
    expect(created).toHaveLength(1);
    expect(conflicts).toHaveLength(1);
    const rows = await storedAssets();
    expect(rows).toHaveLength(1);
    expect(conflicts[0]).toMatchObject({ conflict: { type: rows[0]?.type } });
  });

  it("stores HGLG11 with the type overridden from FII to BR_STOCK", async () => {
    server.use(brapiListFromFixtures);
    const search = await searchAssets(brapi(), "HGLG11");
    const candidate = search.ok ? search.candidates[0] : undefined;
    expect(candidate?.type).toBe("FII");

    const result = await addAsset(db, { ...candidate, type: "BR_STOCK" });

    expect(result).toMatchObject({
      ok: true,
      asset: { type: "BR_STOCK", naturalKey: "HGLG11@B3" },
    });
    expect(await storedAssets()).toEqual([
      expect.objectContaining({ type: "BR_STOCK", naturalKey: "HGLG11@B3", name: PATRIA_LOG }),
    ]);
  });

  it("stores an overridden price source", async () => {
    const result = await addAsset(db, { type: "BR_STOCK", ticker: "PETR4", priceSource: "yahoo" });

    expect(result).toMatchObject({ ok: true, asset: { priceSource: "yahoo" } });
  });

  it("adds an asset manually with type and ticker while brapi is rate-limited", async () => {
    server.use(brapiListRateLimited);
    expect(await searchAssets(brapi(), "HGLG11")).toEqual({ ok: false, error: "rateLimited" });

    const result = await addAsset(db, {
      type: "FII",
      ticker: " hglg11 ",
      name: "",
      priceSource: "",
    });

    // Without a name from brapi, the ticker stands in; the price source defaults from the type.
    expect(result).toMatchObject({
      ok: true,
      created: true,
      asset: {
        type: "FII",
        naturalKey: "HGLG11@B3",
        name: "HGLG11",
        currency: "BRL",
        priceSource: "brapi",
      },
    });
  });

  it.each([
    ["an empty ticker", { type: "BR_STOCK", ticker: "  " }, { ticker: "required" }],
    ["a malformed ticker", { type: "BR_STOCK", ticker: "PETRO" }, { ticker: "invalid" }],
    ["an unknown type", { type: "STOCK", ticker: "PETR4" }, { type: "invalid" }],
    [
      "a type this slice cannot key yet",
      { type: "US_STOCK", ticker: "PETR4" },
      { type: "invalid" },
    ],
    [
      "an unknown price source",
      { type: "BR_STOCK", ticker: "PETR4", priceSource: "bloomberg" },
      { priceSource: "invalid" },
    ],
    [
      "a name over the limit",
      { type: "BR_STOCK", ticker: "PETR4", name: "x".repeat(ASSET_NAME_MAX_LENGTH + 1) },
      { name: "tooLong" },
    ],
    [
      "a name that is not text",
      { type: "BR_STOCK", ticker: "PETR4", name: 42 },
      { name: "invalid" },
    ],
    ["a ticker that is not text", { type: "BR_STOCK", ticker: 42 }, { ticker: "invalid" }],
    ["missing fields", {}, { type: "invalid", ticker: "required" }],
    ["no input at all", undefined, { type: "invalid", ticker: "required" }],
  ])("rejects %s and saves nothing", async (_label, input, fieldErrors) => {
    expect(await addAsset(db, input)).toEqual({ ok: false, fieldErrors });
    expect(await storedAssets()).toHaveLength(0);
  });
});

describe("listAssets", () => {
  it("lists nothing when the catalog is empty", async () => {
    expect(await listAssets(db)).toEqual([]);
  });

  it("lists assets sorted by natural key", async () => {
    await addAsset(db, { type: "FII", ticker: "HGLG11" });
    await addAsset(db, { type: "BR_STOCK", ticker: "VALE3" });
    await addAsset(db, { type: "BR_STOCK", ticker: "PETR4" });

    expect((await listAssets(db)).map((a) => a.naturalKey)).toEqual([
      "HGLG11@B3",
      "PETR4@B3",
      "VALE3@B3",
    ]);
  });
});
