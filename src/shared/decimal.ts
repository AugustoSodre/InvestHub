import DecimalJs from "decimal.js";

/**
 * Decimal for money, prices, quantities, rates and FX. Never use `number` for
 * these (see CLAUDE.md). 40 significant digits hold any numeric(36,18) value
 * exactly. Round explicitly (e.g. `toDecimalPlaces`) where a rule says so.
 */
export const Decimal = DecimalJs.clone({
  precision: 40,
  rounding: DecimalJs.ROUND_HALF_UP,
  toExpNeg: -40,
  toExpPos: 40,
});
export type Decimal = InstanceType<typeof Decimal>;

/** Optional sign, digits with an optional fraction, optional exponent. */
const PLAIN_DECIMAL = /^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i;

/**
 * Wraps a string from the database driver, a form or a provider in a Decimal.
 * Takes strings only, so a float can't sneak in. Throws on anything that is
 * not a finite decimal number.
 */
export function toDecimal(raw: string): Decimal {
  const trimmed = raw.trim();
  // decimal.js also parses hex, binary, octal, NaN and Infinity; money values never use them.
  const value = PLAIN_DECIMAL.test(trimmed) ? new Decimal(trimmed) : undefined;
  // isFinite catches exponents beyond decimal.js's range, which overflow to Infinity.
  if (!value?.isFinite()) {
    throw new Error(`Invalid decimal: ${JSON.stringify(raw)}`);
  }
  return value;
}

/** Formats a Decimal for a Postgres `numeric` column: plain digits, never exponent notation. */
export function toDbNumeric(value: Decimal): string {
  return value.toFixed();
}
