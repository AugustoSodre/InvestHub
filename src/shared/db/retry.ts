import { setTimeout as sleep } from "node:timers/promises";

/**
 * Error codes and messages Postgres and node-postgres produce while the server
 * is still starting. On a fresh volume the official image runs an init server,
 * stops it and starts the real one, so early connections get refused, cut off
 * or told the database is starting up.
 */
const TRANSIENT_CODES = new Set([
  "ECONNREFUSED",
  "ECONNRESET",
  "57P03", // cannot_connect_now: the database system is starting up
  "57P01", // admin_shutdown: the init server stopping
]);
const TRANSIENT_MESSAGES = [/Connection terminated unexpectedly/i];

/** True when the error, or any error it wraps, means "Postgres isn't ready yet". */
export function isTransientConnectionError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;

  const code = (error as { code?: unknown }).code;
  if (typeof code === "string" && TRANSIENT_CODES.has(code)) return true;
  if (TRANSIENT_MESSAGES.some((pattern) => pattern.test(error.message))) return true;

  if (error instanceof AggregateError && error.errors.some(isTransientConnectionError)) return true;
  return isTransientConnectionError(error.cause);
}

type RetryOptions = {
  timeoutMs?: number;
  delayMs?: number;
  onRetry?: (error: unknown) => void;
};

/**
 * Runs `run`, retrying while the database is still starting up. Permanent
 * errors fail at once; transient ones fail once `timeoutMs` has passed.
 */
export async function retryWhileDatabaseStarts<T>(
  run: () => Promise<T>,
  { timeoutMs = 30_000, delayMs = 500, onRetry }: RetryOptions = {},
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try {
      return await run();
    } catch (error) {
      if (!isTransientConnectionError(error) || Date.now() + delayMs > deadline) throw error;
      onRetry?.(error);
      await sleep(delayMs);
    }
  }
}
