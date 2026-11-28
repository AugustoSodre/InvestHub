// Display formatting for Decimal values. Intl formats a numeric string as an
// exact decimal, so nothing passes through a float on the way to the screen.
import type { Currency } from "@/shared/db/enums";
import type { Decimal } from "@/shared/decimal";
import { DEFAULT_LOCALE } from "./config";

/** Intl's numeric-string input: digits only, never exponent notation. */
type NumericString = `${number}`;
const numeric = (value: Decimal) => value.toFixed() as NumericString;

const moneyFormats = new Map<Currency, Intl.NumberFormat>();

/** A money amount in its currency, rounded half up to cents for display (R$ 32,07). */
export function formatMoney(value: Decimal, currency: Currency): string {
  let format = moneyFormats.get(currency);
  if (!format) {
    format = new Intl.NumberFormat(DEFAULT_LOCALE, {
      style: "currency",
      currency,
      roundingMode: "halfExpand",
    });
    moneyFormats.set(currency, format);
  }
  return format.format(numeric(value));
}

const quantityFormat = new Intl.NumberFormat(DEFAULT_LOCALE, {
  maximumFractionDigits: 18,
});

/** A quantity with every decimal place it has, up to numeric(36,18)'s 18 (0,00012345). */
export function formatQuantity(value: Decimal): string {
  return quantityFormat.format(numeric(value));
}
