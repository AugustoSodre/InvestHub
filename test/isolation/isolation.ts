import { setTimeout as sleep } from "node:timers/promises";
import { sql } from "drizzle-orm";
import { expect } from "vitest";
import { testDb } from "../db";

/**
 * Shared body of the two isolation probes. Both files create the same table and
 * insert their own marker. The table is deliberately never dropped: whatever the
 * order the files run in, a shared database would make the second CREATE TABLE
 * fail or show one file the other's row. The per-file database itself is
 * dropped after the file (test/setup/test-database.ts). The pause keeps both
 * files' data in place while the other runs in parallel.
 */
export async function assertOnlyOwnRowsVisible(marker: string) {
  const db = testDb();
  await db.execute(sql`create table isolation_probe (marker text not null)`);
  await db.execute(sql`insert into isolation_probe (marker) values (${marker})`);

  await sleep(1_000);

  const { rows } = await db.execute<{ marker: string }>(sql`select marker from isolation_probe`);
  expect(rows.map((r) => r.marker)).toEqual([marker]);
}
