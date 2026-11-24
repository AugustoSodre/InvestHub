import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

/** The database handle domain functions take as an argument. */
export type Database = NodePgDatabase<typeof schema>;

export type DbHandle = {
  db: Database;
  close: () => Promise<void>;
};

/** Opens a pooled connection. The caller owns it and must `close()` it. */
export function createDb(connectionString: string): DbHandle {
  const pool = new Pool({ connectionString });
  return {
    db: drizzle(pool, { schema }),
    close: () => pool.end(),
  };
}
