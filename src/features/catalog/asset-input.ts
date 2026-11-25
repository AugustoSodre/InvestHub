// Validation and defaults for new catalog assets. No database imports, so the
// client form can use the same constants and types without bundling drizzle.
import { z } from "zod";
import { PRICE_SOURCES, type AssetType, type Currency, type PriceSource } from "@/shared/db/enums";

export const ASSET_NAME_MAX_LENGTH = 200;

/**
 * Asset types the catalog can add so far: B3-listed, keyed `TICKER@B3`. Later
 * slices add US, crypto, funds and fixed income here, with their defaults below.
 */
export const ADDABLE_ASSET_TYPES = [
  "BR_STOCK",
  "FII",
  "BDR",
  "BR_ETF",
] as const satisfies readonly AssetType[];
export type AddableAssetType = (typeof ADDABLE_ASSET_TYPES)[number];

const DEFAULTS: Record<AddableAssetType, { currency: Currency; priceSource: PriceSource }> = {
  BR_STOCK: { currency: "BRL", priceSource: "brapi" },
  FII: { currency: "BRL", priceSource: "brapi" },
  BDR: { currency: "BRL", priceSource: "brapi" },
  BR_ETF: { currency: "BRL", priceSource: "brapi" },
};

export function defaultCurrency(type: AddableAssetType): Currency {
  return DEFAULTS[type].currency;
}

export function defaultPriceSource(type: AddableAssetType): PriceSource {
  return DEFAULTS[type].priceSource;
}

/** B3 ticker: four letters or digits, then one or two digits (PETR4, HGLG11, B3SA3, AAPL34). */
export const B3_TICKER = /^[A-Z0-9]{4}\d{1,2}$/;

const B3_SUFFIX = "@B3";

export function b3NaturalKey(ticker: string): string {
  return `${ticker}${B3_SUFFIX}`;
}

/** Error codes, not messages: the UI turns each into PT-BR text through i18n. */
export type AssetFieldErrorCode = "required" | "tooLong" | "invalid";

/** Empty form fields count as "not given", so defaults apply. */
const blankAsUnset = (value: unknown) =>
  typeof value === "string" && value.trim() === "" ? undefined : value;

const assetInput = z.object({
  type: z.enum(ADDABLE_ASSET_TYPES, { error: "invalid" }),
  // Accepts the ticker or the natural key ("petr4", "PETR4@B3"), in any case.
  ticker: z
    .string({ error: "required" })
    .trim()
    .toUpperCase()
    .transform((value) => (value.endsWith(B3_SUFFIX) ? value.slice(0, -B3_SUFFIX.length) : value))
    .pipe(z.string().min(1, { error: "required" }).regex(B3_TICKER, { error: "invalid" })),
  name: z.preprocess(
    blankAsUnset,
    z.string().trim().max(ASSET_NAME_MAX_LENGTH, { error: "tooLong" }).optional(),
  ),
  priceSource: z.preprocess(blankAsUnset, z.enum(PRICE_SOURCES, { error: "invalid" }).optional()),
});

export type AssetField = keyof z.input<typeof assetInput>;

/** Every form field, derived from the schema so a new field only needs adding there. */
export const ASSET_FIELDS: readonly AssetField[] = assetInput.keyof().options;
export type AssetFieldErrors = Partial<Record<AssetField, AssetFieldErrorCode>>;

/** A validated asset, ready to store. */
export type AssetValues = {
  type: AddableAssetType;
  naturalKey: string;
  name: string;
  currency: Currency;
  priceSource: PriceSource;
};

export type ParsedAssetInput =
  { ok: true; data: AssetValues } | { ok: false; fieldErrors: AssetFieldErrors };

/**
 * Parses untrusted input (form fields or a search candidate): normalizes the
 * ticker into a natural key, defaults the name to the ticker and the currency
 * and price source to the type's, and reports one error per field.
 */
export function parseAssetInput(input: unknown): ParsedAssetInput {
  const parsed = assetInput.safeParse(typeof input === "object" && input !== null ? input : {});
  if (!parsed.success) {
    const fieldErrors: AssetFieldErrors = {};
    for (const issue of parsed.error.issues) {
      const field = issue.path[0] as AssetField;
      // Keep the first error per field; the schema only emits AssetFieldErrorCode messages.
      fieldErrors[field] ??= issue.message as AssetFieldErrorCode;
    }
    return { ok: false, fieldErrors };
  }

  const { type, ticker, name, priceSource } = parsed.data;
  return {
    ok: true,
    data: {
      type,
      naturalKey: b3NaturalKey(ticker),
      name: name ?? ticker,
      currency: defaultCurrency(type),
      priceSource: priceSource ?? defaultPriceSource(type),
    },
  };
}
