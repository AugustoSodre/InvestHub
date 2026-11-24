import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { Client } from "pg";
import type { TestProject } from "vitest/node";
import { runMigrations } from "@/shared/db/migrate";

/** Keep in sync with the `db` service image in compose.yaml. */
const POSTGRES_IMAGE = "postgres:18-alpine";

const TEMPLATE_DATABASE = "investhub_template";

declare module "vitest" {
  export interface ProvidedContext {
    /** Superuser URL of the container's maintenance database, used to create and drop per-file databases. */
    pgAdminUrl: string;
    /** Name of the migrated database every test file clones. */
    pgTemplateDatabase: string;
  }
}

let container: StartedPostgreSqlContainer | undefined;

/**
 * Runs once per Vitest run: starts one Postgres container and migrates a
 * template database. Test files clone it (see test-database.ts).
 */
export async function setup(project: TestProject) {
  container = await new PostgreSqlContainer(POSTGRES_IMAGE).start();
  const adminUrl = container.getConnectionUri();

  const admin = new Client({ connectionString: adminUrl });
  await admin.connect();
  try {
    await admin.query(`CREATE DATABASE ${TEMPLATE_DATABASE}`);
  } finally {
    await admin.end();
  }

  const templateUrl = new URL(adminUrl);
  templateUrl.pathname = `/${TEMPLATE_DATABASE}`;
  // runMigrations closes its connection, which CREATE DATABASE ... TEMPLATE requires.
  await runMigrations(templateUrl.toString());

  project.provide("pgAdminUrl", adminUrl);
  project.provide("pgTemplateDatabase", TEMPLATE_DATABASE);
}

export async function teardown() {
  await container?.stop();
}
