// Values of the Postgres enums in schema.ts. Kept free of drizzle imports so
// client components can use them without pulling the schema into the bundle.

export const COUNTRIES = ["BR", "US", "GLOBAL"] as const;
export type Country = (typeof COUNTRIES)[number];

export const CURRENCIES = ["BRL", "USD"] as const;
export type Currency = (typeof CURRENCIES)[number];

/** Every asset type the catalog knows (glossary: Asset). Later slices add search for each. */
export const ASSET_TYPES = [
  "BR_STOCK",
  "FII",
  "BDR",
  "BR_ETF",
  "US_STOCK",
  "US_ETF",
  "CRYPTO",
  "INVESTMENT_FUND",
  "TESOURO",
  "CDB",
  "LCI",
  "LCA",
  "LC",
  "CRI",
  "CRA",
] as const;
export type AssetType = (typeof ASSET_TYPES)[number];

/**
 * Every ledger event type (glossary: Ledger event), declared up front so later
 * slices don't need an enum migration. Only BUY can be recorded so far.
 */
export const LEDGER_EVENT_TYPES = [
  "BUY",
  "SELL",
  "DIVIDEND",
  "JCP",
  "SPLIT",
  "BONUS",
  "FEE",
] as const;
export type LedgerEventType = (typeof LEDGER_EVENT_TYPES)[number];

/** PENDING events are worker suggestions, not part of the ledger until the user confirms them. */
export const LEDGER_EVENT_STATUSES = ["CONFIRMED", "PENDING"] as const;
export type LedgerEventStatus = (typeof LEDGER_EVENT_STATUSES)[number];

/** Where an asset's price comes from. `calculator` is the fixed-income accrual, not a feed. */
export const PRICE_SOURCES = [
  "brapi",
  "yahoo",
  "finnhub",
  "coingecko",
  "cvm",
  "tesouro-transparente",
  "calculator",
] as const;
export type PriceSource = (typeof PRICE_SOURCES)[number];
