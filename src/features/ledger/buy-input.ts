// Validation for recording a buy. No database imports, so the client form can
// use the same field names and types without bundling drizzle.
import { z } from "zod";
import { toDecimal, type Decimal } from "@/shared/decimal";

/** numeric(36,18): at most 18 digits after the point and 18 before it. */
export const MAX_DECIMAL_PLACES = 18;
const MAX_INTEGER_DIGITS = 18;

/**
 * Error codes, not messages: the UI turns each into PT-BR text through i18n.
 * "notFound" comes from the ledger, not the schema: the account (of this user)
 * or the asset does not exist.
 */
export type BuyFieldErrorCode =
  | "required"
  | "invalid"
  | "notFound"
  | "notPositive"
  | "negative"
  | "future"
  | "tooPrecise"
  | "tooLarge";
const ERROR_CODES: readonly string[] = [
  "required",
  "invalid",
  "notFound",
  "notPositive",
  "negative",
  "future",
  "tooPrecise",
  "tooLarge",
] satisfies readonly BuyFieldErrorCode[];

/** Digits with one optional decimal point or comma, and an optional sign. No grouping, no exponent. */
const DECIMAL_INPUT = /^[+-]?(\d+([.,]\d*)?|[.,]\d+)$/;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** A text field: missing or blank is "required", anything other than a string is "invalid". */
const text = () =>
  z
    .string({ error: (issue) => (issue.input === undefined ? "required" : "invalid") })
    .trim()
    .min(1, { error: "required" });

/** Empty form fields count as "not given", so the default applies. */
const blankAs = (fallback: string) => (value: unknown) =>
  value === undefined || (typeof value === "string" && value.trim() === "") ? fallback : value;

/**
 * A decimal typed by the user ("30.05" or "30,05") parsed into a Decimal, with
 * no float in between. `positive` rejects zero too; otherwise zero is allowed.
 */
const decimal = (sign: "positive" | "nonNegative") =>
  text().transform((raw, ctx): Decimal => {
    const fail = (message: BuyFieldErrorCode) => {
      ctx.addIssue({ code: "custom", message });
      return z.NEVER;
    };
    if (!DECIMAL_INPUT.test(raw)) return fail("invalid");
    const value = toDecimal(raw.replace(",", "."));
    if (sign === "positive" ? value.lte(0) : value.lt(0)) {
      return fail(sign === "positive" ? "notPositive" : "negative");
    }
    if (value.decimalPlaces() > MAX_DECIMAL_PLACES) return fail("tooPrecise");
    if (value.truncated().toFixed().length > MAX_INTEGER_DIGITS) return fail("tooLarge");
    return value;
  });

/** A calendar day as YYYY-MM-DD that exists (no 2026-02-30). */
const isoDate = text()
  .regex(ISO_DATE, { error: "invalid" })
  .refine(
    (value) => {
      const parsed = new Date(`${value}T00:00:00Z`);
      return !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(value);
    },
    { error: "invalid" },
  );

const id = text().pipe(z.guid({ error: "invalid" }));

const buyInput = (today: string) =>
  z.object({
    accountId: id,
    assetId: id,
    // ISO dates compare correctly as strings.
    date: isoDate.refine((value) => value <= today, { error: "future" }),
    quantity: decimal("positive"),
    unitPrice: decimal("positive"),
    fees: z.preprocess(blankAs("0"), decimal("nonNegative")),
  });

export type BuyInput = z.output<ReturnType<typeof buyInput>>;
export type BuyField = keyof BuyInput;

/** Every form field, in form order. */
export const BUY_FIELDS: readonly BuyField[] = buyInput("").keyof().options;
export type BuyFieldErrors = Partial<Record<BuyField, BuyFieldErrorCode>>;

export type ParsedBuyInput =
  { ok: true; data: BuyInput } | { ok: false; fieldErrors: BuyFieldErrors };

/**
 * Parses an untrusted buy (e.g. form fields) and reports one error per field.
 * `today` (YYYY-MM-DD, in the user's time zone) is the latest allowed date.
 */
export function parseBuyInput(input: unknown, { today }: { today: string }): ParsedBuyInput {
  const parsed = buyInput(today).safeParse(asObject(input));
  if (parsed.success) return { ok: true, data: parsed.data };

  const fieldErrors: BuyFieldErrors = {};
  for (const issue of parsed.error.issues) {
    const field = String(issue.path[0]) as BuyField;
    // A message that is not a code would be English text in the PT-BR UI.
    fieldErrors[field] ??= ERROR_CODES.includes(issue.message)
      ? (issue.message as BuyFieldErrorCode)
      : "invalid";
  }
  return { ok: false, fieldErrors };
}

function asObject(input: unknown): object {
  return typeof input === "object" && input !== null ? input : {};
}
