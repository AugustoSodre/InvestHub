import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { afterAll, inject } from "vitest";
import { closeTestDb, setTestDatabaseUrl } from "../db";

// Runs before each integration test file: clone the migrated template into a
// database only this file uses, so files can run in parallel without sharing data.
const adminUrl = inject("pgAdminUrl");
const template = inject("pgTemplateDatabase");
const database = `test_${randomUUID().replaceAll("-", "")}`;

async function admin<T>(run: (client: Client) => Promise<T>): Promise<T> {
  const client = new Client({ connectionString: adminUrl });
  await client.connect();
  try {
    return await run(client);
  } finally {
    await client.end();
  }
}

await admin((c) => c.query(`CREATE DATABASE ${database} TEMPLATE ${template}`));

const url = new URL(adminUrl);
url.pathname = `/${database}`;
setTestDatabaseUrl(url.toString());

afterAll(async () => {
  await closeTestDb();
  setTestDatabaseUrl(undefined);
  // FORCE ends connections a test left open (e.g. a worker that was not stopped).
  await admin((c) => c.query(`DROP DATABASE IF EXISTS ${database} WITH (FORCE)`));
});
