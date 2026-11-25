// Values of the Postgres enums in schema.ts. Kept free of drizzle imports so
// client components can use them without pulling the schema into the bundle.

export const COUNTRIES = ["BR", "US", "GLOBAL"] as const;
export type Country = (typeof COUNTRIES)[number];

export const CURRENCIES = ["BRL", "USD"] as const;
export type Currency = (typeof CURRENCIES)[number];
