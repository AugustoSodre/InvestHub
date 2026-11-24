import { setTimeout as sleep } from "node:timers/promises";
import { sql } from "drizzle-orm";
import { expect } from "vitest";
import { testDb } from "../db";

/**
 * Shared body of the two isolation probes. Both files create the same table and
 * insert their own marker. In a shared database the second CREATE TABLE would
 * fail, or one file would see the other's row. The pause keeps both files'
 * data in place while the other runs in parallel.
 */
export async function assertOnlyOwnRowsVisible(marker: string) {
  const db = testDb();
  await db.execute(sql`create table isolation_probe (marker text not null)`);
  try {
    await db.execute(sql`insert into isolation_probe (marker) values (${marker})`);

    await sleep(1_000);

    const { rows } = await db.execute<{ marker: string }>(sql`select marker from isolation_probe`);
    expect(rows.map((r) => r.marker)).toEqual([marker]);
  } finally {
    await db.execute(sql`drop table isolation_probe`);
  }
}
