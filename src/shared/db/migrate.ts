import { fileURLToPath } from "node:url";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { createDb } from "./client";

export const MIGRATIONS_FOLDER = fileURLToPath(new URL("./migrations", import.meta.url));

/** Applies pending Drizzle migrations, then closes its connection. */
export async function runMigrations(connectionString: string): Promise<void> {
  const { db, close } = createDb(connectionString);
  try {
    await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
  } finally {
    await close();
  }
}
