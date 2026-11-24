// Entry point for `pnpm db:migrate`.
import { runMigrations } from "./migrate";
import { databaseUrl } from "./url";

const url = databaseUrl();
await runMigrations(url);
console.log(`Migrations applied to ${new URL(url).host}${new URL(url).pathname}`);
