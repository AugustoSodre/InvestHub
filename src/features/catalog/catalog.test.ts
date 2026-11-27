import { describe, expect, it } from "vitest";
import type { BrapiClient, BrapiTicker } from "@/integrations/brapi/brapi";
import { SEARCH_QUERY_MAX_LENGTH } from "./asset-input";
import { searchAssets } from "./catalog";

/** A brapi client that answers every search with the given tickers, and records the queries. */
function stubBrapi(results: BrapiTicker[], { hasToken = true } = {}) {
  const queries: string[] = [];
  const client: BrapiClient = {
    hasToken,
    async searchTickers(query) {
      queries.push(query);
      return { ok: true, results };
    },
  };
  return { client, queries };
}

const ticker = (stock: string, type: string, subType: string | null): BrapiTicker => ({
  ticker: stock,
  name: stock,
  type,
  subType,
});

describe("searchAssets input", () => {
  it.each([
    ["a blank query", "   ", "required"],
    ["no query", undefined, "required"],
    ["a non-string query", 42, "invalid"],
    ["a query over the limit", "X".repeat(SEARCH_QUERY_MAX_LENGTH + 1), "tooLong"],
  ])("rejects %s without calling brapi", async (_label, query, code) => {
    const { client, queries } = stubBrapi([]);

    expect(await searchAssets(client, query)).toEqual({
      ok: false,
      fieldErrors: { query: code },
    });
    expect(queries).toEqual([]);
  });

  it("sends brapi the trimmed, upper-cased query", async () => {
    const { client, queries } = stubBrapi([]);

    await searchAssets(client, "  hglg11 ");

    expect(queries).toEqual(["HGLG11"]);
  });
});

describe("searchAssets type from brapi", () => {
  it.each([
    ["stock", "stock", "BR_STOCK"],
    ["stock", "unit", "BR_STOCK"],
    ["fund", "fii", "FII"],
    ["fund", "etf", "BR_ETF"],
    ["bdr", "bdr", "BDR"],
    ["bdr", null, "BDR"],
    // Other fund sub-types have no catalog type yet: they fall back to BR_STOCK
    // on purpose, and the user can override the type before adding.
    ["fund", "fi-infra", "BR_STOCK"],
    ["fund", "fi-agro", "BR_STOCK"],
    ["fund", "fip", "BR_STOCK"],
    ["fund", "fidc", "BR_STOCK"],
    ["fund", null, "BR_STOCK"],
  ])("maps type %s / subType %s to %s", async (type, subType, expected) => {
    const { client } = stubBrapi([ticker("ABCD11", type, subType)]);

    const result = await searchAssets(client, "ABCD11");

    expect(result).toMatchObject({ ok: true, candidates: [{ type: expected }] });
  });
});

describe("searchAssets token flag", () => {
  it("flags a non-sandbox query without a token even when nothing matched", async () => {
    const { client } = stubBrapi([], { hasToken: false });

    expect(await searchAssets(client, "HGLG11")).toEqual({
      ok: true,
      candidates: [],
      tokenMissing: true,
    });
  });

  it("flags a non-sandbox query whose only matches were filtered out", async () => {
    const { client } = stubBrapi([ticker("HGLG11F", "fund", "fii")], { hasToken: false });

    expect(await searchAssets(client, "HGLG11")).toEqual({
      ok: true,
      candidates: [],
      tokenMissing: true,
    });
  });

  it("does not flag a sandbox ticker searched without a token", async () => {
    const { client } = stubBrapi([ticker("VALE3", "stock", "stock")], { hasToken: false });

    expect(await searchAssets(client, "vale3")).toMatchObject({ tokenMissing: false });
  });

  it("does not flag a partial query whose only matches are sandbox tickers", async () => {
    const { client } = stubBrapi([ticker("PETR4", "stock", "stock")], { hasToken: false });

    expect(await searchAssets(client, "petrobras")).toMatchObject({ tokenMissing: false });
  });

  it("flags a partial query with a match that needs a token", async () => {
    const { client } = stubBrapi(
      [ticker("PETR4", "stock", "stock"), ticker("PETR3", "stock", "stock")],
      { hasToken: false },
    );

    expect(await searchAssets(client, "PETR")).toMatchObject({ tokenMissing: true });
  });

  it("never flags when a token is configured", async () => {
    const { client } = stubBrapi([], { hasToken: true });
    const { client: withMatch } = stubBrapi([ticker("HGLG11", "fund", "fii")], { hasToken: true });

    expect(await searchAssets(client, "HGLG11")).toMatchObject({ tokenMissing: false });
    expect(await searchAssets(withMatch, "HGLG")).toMatchObject({ tokenMissing: false });
  });
});
