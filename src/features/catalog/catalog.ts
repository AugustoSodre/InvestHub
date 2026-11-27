import { asc, eq } from "drizzle-orm";
import { requiresToken, type BrapiClient, type BrapiError } from "@/integrations/brapi/brapi";
import type { Database } from "@/shared/db/client";
import type { AssetType } from "@/shared/db/enums";
import { assets } from "@/shared/db/schema";
import {
  B3_TICKER,
  b3Asset,
  parseAssetInput,
  parseSearchInput,
  type AddableAssetType,
  type AssetCandidate,
  type AssetFieldErrors,
  type DefaultedField,
  type SearchFieldErrors,
} from "./asset-input";

export type { AssetCandidate } from "./asset-input";

export type Asset = typeof assets.$inferSelect;

export type SearchAssetsResult =
  | {
      ok: true;
      /** Search results the user can add as is, or after overriding type and price source. */
      candidates: AssetCandidate[];
      /** No token is configured and brapi needs one for what was searched or found. */
      tokenMissing: boolean;
    }
  | { ok: false; error: BrapiError }
  | { ok: false; fieldErrors: SearchFieldErrors };

export type AddAssetResult =
  | {
      ok: true;
      asset: Asset;
      created: boolean;
      /**
       * Given fields that differ from the asset already stored, which was kept
       * as is. Empty when the asset was created, or the given fields match.
       */
      ignored: DefaultedField[];
    }
  | {
      ok: false;
      fieldErrors: AssetFieldErrors;
      /** Set with the "typeConflict" error: the natural key is already stored under this type. */
      conflict?: { naturalKey: string; type: AssetType };
    };

/**
 * Validates an untrusted query, searches B3 tickers on brapi and turns each
 * match into a catalog candidate, with the type pre-filled from brapi's
 * sub-type. Fractional-market tickers (PETR4F) are left out: they trade the
 * same asset as PETR4.
 */
export async function searchAssets(
  brapi: BrapiClient,
  input: unknown,
): Promise<SearchAssetsResult> {
  const parsed = parseSearchInput(input);
  if (!parsed.ok) return parsed;
  const { query } = parsed;

  const result = await brapi.searchTickers(query);
  if (!result.ok) return result;

  const candidates = result.results
    .filter((match) => B3_TICKER.test(match.ticker))
    .map((match) =>
      b3Asset(typeFromBrapi(match.subType ?? match.type), match.ticker, { name: match.name }),
    );

  // The query counts too: a search that found nothing (or only filtered-out
  // tickers) for a non-sandbox ticker still needs the explanation.
  const needsToken = [query, ...candidates.map((c) => c.ticker)].some(requiresToken);
  return { ok: true, candidates, tokenMissing: !brapi.hasToken && needsToken };
}

/**
 * brapi tells FIIs from ETFs (both end in 11) by sub-type. Everything else,
 * including fund sub-types the catalog has no type for yet (fi-infra, fi-agro,
 * fip, fidc), falls back to BR_STOCK; the user can override it before adding.
 */
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
 * asset to the catalog. A natural key identifies one instrument: if it is
 * already stored with the same type, that asset is returned unchanged
 * (`created: false`, with any given name or price source that differs listed
 * in `ignored`); under another type, nothing is added and a
 * "typeConflict" error names the stored type.
 */
export async function addAsset(db: Database, input: unknown): Promise<AddAssetResult> {
  const parsed = parseAssetInput(input);
  if (!parsed.ok) return parsed;
  const { type, naturalKey, name, currency, priceSource } = parsed.data;

  // The unique index, not a pre-check, decides: it also holds under concurrent adds.
  const [inserted] = await db
    .insert(assets)
    .values({ type, naturalKey, name, currency, priceSource })
    .onConflictDoNothing({ target: assets.naturalKey })
    .returning();
  if (inserted) return { ok: true, asset: inserted, created: true, ignored: [] };

  const [existing] = await db.select().from(assets).where(eq(assets.naturalKey, naturalKey));
  if (!existing) throw new Error(`Asset ${naturalKey} conflicted but was not found.`);
  if (existing.type !== type) {
    return {
      ok: false,
      fieldErrors: { type: "typeConflict" },
      conflict: { naturalKey, type: existing.type },
    };
  }
  // No editing yet: the stored values stay, and the caller learns which given ones did not apply.
  const ignored = DEFAULTED_FIELDS.filter(
    (field) => parsed.given[field] !== undefined && parsed.given[field] !== existing[field],
  );
  return { ok: true, asset: existing, created: false, ignored };
}

const DEFAULTED_FIELDS: readonly DefaultedField[] = ["name", "priceSource"];

/** Every asset in the catalog, sorted by natural key. */
export async function listAssets(db: Database): Promise<Asset[]> {
  return db.select().from(assets).orderBy(asc(assets.naturalKey));
}
