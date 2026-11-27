// Validation and defaults for catalog assets. No database imports, so the
// client form can use the same constants and types without bundling drizzle.
import { z } from "zod";
import { PRICE_SOURCES, type AssetType, type Currency, type PriceSource } from "@/shared/db/enums";

export const ASSET_NAME_MAX_LENGTH = 200;

/** Longest ticker search sent to brapi; tickers are 5–6 characters, names a few words. */
export const SEARCH_QUERY_MAX_LENGTH = 50;

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

/** The currency an asset of this type trades in, and its price source unless overridden. */
export function assetDefaults(type: AddableAssetType): {
  currency: Currency;
  priceSource: PriceSource;
} {
  return DEFAULTS[type];
}

/** B3 ticker: four letters or digits, then one or two digits (PETR4, HGLG11, B3SA3, AAPL34). */
export const B3_TICKER = /^[A-Z0-9]{4}\d{1,2}$/;

const B3_SUFFIX = "@B3";

/** An asset's stored values. */
export type AssetValues = {
  type: AddableAssetType;
  naturalKey: string;
  name: string;
  currency: Currency;
  priceSource: PriceSource;
};

/** Stored values plus the ticker they came from: a search result, or validated form input. */
export type AssetCandidate = AssetValues & { ticker: string };

/**
 * The one place a B3 ticker becomes a catalog asset: keyed `TICKER@B3`, named
 * after the ticker unless a name is given, with the type's currency and price source.
 */
export function b3Asset(
  type: AddableAssetType,
  ticker: string,
  { name, priceSource }: { name?: string; priceSource?: PriceSource } = {},
): AssetCandidate {
  const defaults = assetDefaults(type);
  return {
    ticker,
    type,
    naturalKey: `${ticker}${B3_SUFFIX}`,
    name: name ?? ticker,
    currency: defaults.currency,
    priceSource: priceSource ?? defaults.priceSource,
  };
}

/**
 * Error codes, not messages: the UI turns each into PT-BR text through i18n.
 * "typeConflict" comes from the catalog, not the schema: the natural key is
 * already stored under another type.
 */
export type AssetFieldErrorCode = "required" | "tooLong" | "invalid" | "typeConflict";
const ERROR_CODES: readonly string[] = [
  "required",
  "tooLong",
  "invalid",
  "typeConflict",
] satisfies readonly AssetFieldErrorCode[];

/** A text field: missing is "required", anything other than a string is "invalid". */
const text = () =>
  z.string({ error: (issue) => (issue.input === undefined ? "required" : "invalid") });

/** Empty form fields count as "not given", so defaults apply. */
const blankAsUnset = (value: unknown) =>
  typeof value === "string" && value.trim() === "" ? undefined : value;

const assetInput = z.object({
  type: z.enum(ADDABLE_ASSET_TYPES, { error: "invalid" }),
  // Accepts the ticker or the natural key ("petr4", "PETR4@B3"), in any case.
  ticker: text()
    .trim()
    .toUpperCase()
    .transform((value) => (value.endsWith(B3_SUFFIX) ? value.slice(0, -B3_SUFFIX.length) : value))
    .pipe(z.string().min(1, { error: "required" }).regex(B3_TICKER, { error: "invalid" })),
  name: z.preprocess(
    blankAsUnset,
    z
      .string({ error: "invalid" })
      .trim()
      .max(ASSET_NAME_MAX_LENGTH, { error: "tooLong" })
      .optional(),
  ),
  priceSource: z.preprocess(blankAsUnset, z.enum(PRICE_SOURCES, { error: "invalid" }).optional()),
});

const searchInput = z.object({
  query: text()
    .trim()
    .toUpperCase()
    .min(1, { error: "required" })
    .max(SEARCH_QUERY_MAX_LENGTH, { error: "tooLong" }),
});

export type AssetField = keyof z.input<typeof assetInput>;

/** Every form field, derived from the schema so a new field only needs adding there. */
export const ASSET_FIELDS: readonly AssetField[] = assetInput.keyof().options;
export type AssetFieldErrors = Partial<Record<AssetField, AssetFieldErrorCode>>;
export type SearchFieldErrors = { query: AssetFieldErrorCode };

/** Fields with a default: left blank, the default applies; given, they can differ from a stored asset. */
export type DefaultedField = "name" | "priceSource";

export type ParsedAssetInput =
  | {
      ok: true;
      data: AssetCandidate;
      /** The defaulted fields the input actually gave, parsed; blank ones are left out. */
      given: Partial<Pick<AssetValues, DefaultedField>>;
    }
  | { ok: false; fieldErrors: AssetFieldErrors };

export type ParsedSearchInput =
  { ok: true; query: string } | { ok: false; fieldErrors: SearchFieldErrors };

/**
 * Parses untrusted input (form fields or a search candidate): normalizes the
 * ticker into a natural key, defaults the name to the ticker and the price
 * source to the type's, and reports one error per field.
 */
export function parseAssetInput(input: unknown): ParsedAssetInput {
  const parsed = assetInput.safeParse(asObject(input));
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrorsOf(parsed.error) };

  const { type, ticker, name, priceSource } = parsed.data;
  const given = {
    ...(name === undefined ? {} : { name }),
    ...(priceSource === undefined ? {} : { priceSource }),
  };
  return { ok: true, data: b3Asset(type, ticker, given), given };
}

/** Parses an untrusted ticker search: trimmed, upper-cased, not blank, not too long. */
export function parseSearchInput(query: unknown): ParsedSearchInput {
  const parsed = searchInput.safeParse({ query });
  if (!parsed.success) {
    return { ok: false, fieldErrors: { query: fieldErrorsOf(parsed.error).query ?? "invalid" } };
  }
  return { ok: true, query: parsed.data.query };
}

function asObject(input: unknown): object {
  return typeof input === "object" && input !== null ? input : {};
}

/** First error code per field. Every schema above sets codes, never zod's English messages. */
function fieldErrorsOf(error: z.ZodError): Partial<Record<string, AssetFieldErrorCode>> {
  const fieldErrors: Partial<Record<string, AssetFieldErrorCode>> = {};
  for (const issue of error.issues) {
    const field = String(issue.path[0]);
    // A message that is not a code would be English text in the PT-BR UI.
    fieldErrors[field] ??= ERROR_CODES.includes(issue.message)
      ? (issue.message as AssetFieldErrorCode)
      : "invalid";
  }
  return fieldErrors;
}
