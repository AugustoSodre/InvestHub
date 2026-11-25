import { createDb, type Database } from "./client";
import { databaseUrl } from "./url";

// Dev hot reload re-evaluates modules; keeping the pool on globalThis stops
// every reload from opening a new one.
const globalForDb = globalThis as typeof globalThis & { investhubDb?: Database };

/** The web app's shared database handle, opened on first use from DATABASE_URL. */
export function appDb(): Database {
  globalForDb.investhubDb ??= createDb(databaseUrl()).db;
  return globalForDb.investhubDb;
}
