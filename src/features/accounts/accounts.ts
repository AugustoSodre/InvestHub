import { asc, eq, sql } from "drizzle-orm";
import type { Database } from "@/shared/db/client";
import { accounts } from "@/shared/db/schema";
import { parseAccountInput, type AccountFieldErrors } from "./account-input";

export type Account = typeof accounts.$inferSelect;

export type CreateAccountResult =
  { ok: true; account: Account } | { ok: false; fieldErrors: AccountFieldErrors };

/** Name of the unique index on (user_id, lower(name)) in schema.ts. */
const UNIQUE_NAME_INDEX = "accounts_user_id_name_key";

/**
 * Validates untrusted input (e.g. form fields) and saves a new account for the
 * user. Names are trimmed and unique per user, ignoring case. Returns field
 * error codes instead of throwing when the input is invalid.
 */
export async function createAccount(
  db: Database,
  userId: string,
  input: unknown,
): Promise<CreateAccountResult> {
  const parsed = parseAccountInput(input);
  if (!parsed.ok) return parsed;

  try {
    const [account] = await db
      .insert(accounts)
      .values({ ...parsed.data, userId })
      .returning();
    if (!account) throw new Error("Insert into accounts returned no row.");
    return { ok: true, account };
  } catch (error) {
    // The unique index, not a pre-check, decides: it also holds under concurrent submits.
    if (isUniqueViolation(error, UNIQUE_NAME_INDEX)) {
      return { ok: false, fieldErrors: { name: "duplicate" } };
    }
    throw error;
  }
}

/** The user's accounts, sorted by name (ignoring case). */
export async function listAccounts(db: Database, userId: string): Promise<Account[]> {
  return db
    .select()
    .from(accounts)
    .where(eq(accounts.userId, userId))
    .orderBy(asc(sql`lower(${accounts.name})`), asc(accounts.createdAt));
}

/** Postgres unique_violation (23505) on the given constraint. Drizzle wraps driver errors in `cause`. */
function isUniqueViolation(error: unknown, constraint: string): boolean {
  for (let e: unknown = error; e instanceof Error; e = e.cause) {
    if ("code" in e && e.code === "23505" && "constraint" in e && e.constraint === constraint) {
      return true;
    }
  }
  return false;
}
