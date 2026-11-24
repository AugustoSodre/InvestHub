// Entry point for `pnpm db:migrate`.
import { runMigrations } from "./migrate";
import { retryWhileDatabaseStarts } from "./retry";
import { databaseUrl } from "./url";

const url = databaseUrl();
const target = `${new URL(url).host}${new URL(url).pathname}`;

// Right after `docker compose up -d` Postgres may still be initialising its
// volume; wait for it instead of failing. Migrations run in a transaction, so
// a retry after a dropped connection starts clean.
await retryWhileDatabaseStarts(() => runMigrations(url), {
  onRetry: () => console.log(`Waiting for Postgres at ${target}...`),
});
console.log(`Migrations applied to ${target}`);
