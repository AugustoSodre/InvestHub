import { createDb, type Database, type DbHandle } from "@/shared/db/client";

/**
 * Per-file test database. `test/setup/test-database.ts` creates it from the
 * migrated template before the test file runs and drops it afterwards.
 */
let url: string | undefined;
let handle: DbHandle | undefined;

export function setTestDatabaseUrl(value: string | undefined) {
  url = value;
}

/** Connection string of this test file's own database. */
export function testDatabaseUrl(): string {
  if (!url) {
    throw new Error("No test database: testDatabaseUrl() only works in *.int.test.ts files.");
  }
  return url;
}

/** Drizzle handle on this test file's own database. */
export function testDb(): Database {
  handle ??= createDb(testDatabaseUrl());
  return handle.db;
}

export async function closeTestDb() {
  await handle?.close();
  handle = undefined;
}
