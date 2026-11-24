/**
 * Matches the `investhub_dev` database that compose.yaml creates, so a fresh
 * clone works without a `.env` and never touches real data by accident. Point
 * DATABASE_URL at the `investhub` database for real use.
 */
export const LOCAL_DATABASE_URL = "postgres://investhub:investhub@127.0.0.1:55432/investhub_dev";

/**
 * Outside production, a missing DATABASE_URL falls back to the local compose
 * dev database. In production it throws, so a deploy that forgot the variable
 * fails at startup instead of quietly connecting to localhost. Run the worker
 * and migrations with NODE_ENV=production in deployed environments.
 */
export function databaseUrl(env: { DATABASE_URL?: string; NODE_ENV?: string }): string {
  if (env.DATABASE_URL) return env.DATABASE_URL;
  if (env.NODE_ENV === "production") {
    throw new Error("DATABASE_URL is not set. It is required when NODE_ENV=production.");
  }
  return LOCAL_DATABASE_URL;
}
