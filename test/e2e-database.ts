import { databaseUrl } from "../src/shared/db/url";

/**
 * The database the app under Playwright uses, so e2e specs can set up and clean
 * up their own rows. The web server inherits Playwright's environment, so this
 * resolves DATABASE_URL the same way the app does (local `investhub_dev` when
 * unset). Specs cannot import src/shared/env.ts: `server-only` throws outside
 * the react-server condition.
 */
export function e2eDatabaseUrl(): string {
  return databaseUrl(process.env);
}
