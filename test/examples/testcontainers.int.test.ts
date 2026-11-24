import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import journal from "@/shared/db/migrations/meta/_journal.json";
import { testDb } from "../db";

// Example: a real, throwaway Postgres from Testcontainers with migrations applied.
describe("Testcontainers Postgres", () => {
  it("connects to a per-file database cloned from the migrated template", async () => {
    const { rows } = await testDb().execute<{ name: string }>(
      sql`select current_database() as name`,
    );
    expect(rows[0]?.name).toMatch(/^test_/);
  });

  it("has every Drizzle migration applied", async () => {
    const { rows } = await testDb().execute<{ hash: string }>(
      sql`select hash from drizzle.__drizzle_migrations order by created_at`,
    );
    expect(rows).toHaveLength(journal.entries.length);
    expect(journal.entries.length).toBeGreaterThanOrEqual(1);
  });
});
