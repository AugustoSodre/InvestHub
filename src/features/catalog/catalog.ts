import { and, asc, eq } from "drizzle-orm";
import { requiresToken, type BrapiClient, type BrapiError } from "@/integrations/brapi/brapi";
import type { Database } from "@/shared/db/client";
import type { Currency, PriceSource } from "@/shared/db/enums";
import { assets } from "@/shared/db/schema";
import {
  B3_TICKER,
  b3NaturalKey,
  defaultCurrency,
  defaultPriceSource,
  parseAssetInput,
  type AddableAssetType,
  type AssetFieldErrors,
} from "./asset-input";

export type Asset = typeof assets.$inferSelect;

/** A search result the user can add as is, or after overriding its type and price source. */
export type AssetCandidate = {
  ticker: string;
  name: string;
  type: AddableAssetType;
  naturalKey: string;
  currency: Currency;
  priceSource: PriceSource;
};

export type SearchAssetsResult =
  | {
      ok: true;
      candidates: AssetCandidate[];
      /** No token is configured and brapi needs one for some of these tickers. */
      tokenMissing: boolean;
    }
  | { ok: false; error: BrapiError };

export type AddAssetResult =
  { ok: true; asset: Asset; created: boolean } | { ok: false; fieldErrors: AssetFieldErrors };

/**
 * Searches B3 tickers on brapi and turns each match into a catalog candidate,
 * with the type pre-filled from brapi's sub-type. Fractional-market tickers
 * (PETR4F) are left out: they trade the same asset as PETR4.
 */
export async function searchAssets(brapi: BrapiClient, query: string): Promise<SearchAssetsResult> {
  const normalized = query.trim().toUpperCase();
  if (normalized === "") return { ok: true, candidates: [], tokenMissing: false };

  const result = await brapi.searchTickers(normalized);
  if (!result.ok) return result;

  const candidates = result.results
    .filter((match) => B3_TICKER.test(match.ticker))
    .map((match): AssetCandidate => {
      const type = typeFromBrapi(match.subType ?? match.type);
      return {
        ticker: match.ticker,
        name: match.name,
        type,
        naturalKey: b3NaturalKey(match.ticker),
        currency: defaultCurrency(type),
        priceSource: defaultPriceSource(type),
      };
    });

  return {
    ok: true,
    candidates,
    tokenMissing: !brapi.hasToken && candidates.some((c) => requiresToken(c.ticker)),
  };
}

/** brapi tells FIIs from ETFs (both end in 11) by sub-type. Anything else is a stock. */
function typeFromBrapi(subType: string): AddableAssetType {
  switch (subType) {
    case "fii":
      return "FII";
    case "etf":
      return "BR_ETF";
    case "bdr":
      return "BDR";
    default:
      return "BR_STOCK";
  }
}

/**
 * Validates untrusted input (form fields or a search candidate) and adds the
 * asset to the catalog. If an asset with the same type and natural key exists,
 * it is returned unchanged (`created: false`) instead of a duplicate.
 */
export async function addAsset(db: Database, input: unknown): Promise<AddAssetResult> {
  const parsed = parseAssetInput(input);
  if (!parsed.ok) return parsed;
  const values = parsed.data;

  // The unique index, not a pre-check, decides: it also holds under concurrent adds.
  const [inserted] = await db
    .insert(assets)
    .values(values)
    .onConflictDoNothing({ target: [assets.type, assets.naturalKey] })
    .returning();
  if (inserted) return { ok: true, asset: inserted, created: true };

  const [existing] = await db
    .select()
    .from(assets)
    .where(and(eq(assets.type, values.type), eq(assets.naturalKey, values.naturalKey)));
  if (!existing) throw new Error(`Asset ${values.naturalKey} conflicted but was not found.`);
  return { ok: true, asset: existing, created: false };
}

/** Every asset in the catalog, sorted by natural key. */
export async function listAssets(db: Database): Promise<Asset[]> {
  return db.select().from(assets).orderBy(asc(assets.naturalKey), asc(assets.type));
}
