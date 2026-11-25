// Validation for new accounts. No database imports, so the client form can use
// the same constants and types without bundling drizzle.
import { z } from "zod";
import { COUNTRIES, CURRENCIES } from "@/shared/db/enums";

export const ACCOUNT_TEXT_MAX_LENGTH = 100;

/** Error codes, not messages: the UI turns each into PT-BR text through i18n. */
export type AccountFieldErrorCode = "required" | "tooLong" | "invalid" | "duplicate";

const requiredText = z
  .string({ error: "required" })
  .trim()
  .min(1, { error: "required" })
  .max(ACCOUNT_TEXT_MAX_LENGTH, { error: "tooLong" });

const accountInput = z.object({
  name: requiredText,
  institution: requiredText,
  country: z.enum(COUNTRIES, { error: "invalid" }),
  currency: z.enum(CURRENCIES, { error: "invalid" }),
});

export type AccountInput = z.infer<typeof accountInput>;
export type AccountField = keyof AccountInput;

/** Every form field, derived from the schema so a new field only needs adding there. */
export const ACCOUNT_FIELDS: readonly AccountField[] = accountInput.keyof().options;
export type AccountFieldErrors = Partial<Record<AccountField, AccountFieldErrorCode>>;

export type ParsedAccountInput =
  { ok: true; data: AccountInput } | { ok: false; fieldErrors: AccountFieldErrors };

/** Parses untrusted input (e.g. form fields): trims text, checks enums, reports one error per field. */
export function parseAccountInput(input: unknown): ParsedAccountInput {
  const parsed = accountInput.safeParse(input);
  if (parsed.success) return { ok: true, data: parsed.data };

  const fieldErrors: AccountFieldErrors = {};
  for (const issue of parsed.error.issues) {
    const field = issue.path[0] as AccountField;
    // Keep the first error per field; the schema only emits AccountFieldErrorCode messages.
    fieldErrors[field] ??= issue.message as AccountFieldErrorCode;
  }
  return { ok: false, fieldErrors };
}
