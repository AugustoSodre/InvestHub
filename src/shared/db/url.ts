/**
 * Matches the `db` service in compose.yaml, so a fresh clone works without a
 * `.env`. Set DATABASE_URL to point anywhere else.
 */
export const LOCAL_DATABASE_URL = "postgres://investhub:investhub@127.0.0.1:55432/investhub";

export function databaseUrl(env: NodeJS.ProcessEnv = process.env): string {
  return env.DATABASE_URL || LOCAL_DATABASE_URL;
}
