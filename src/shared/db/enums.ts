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
