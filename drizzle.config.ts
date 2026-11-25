import { defineConfig } from "drizzle-kit";
import { databaseUrl } from "./src/shared/db/url";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/shared/db/schema.ts",
  out: "./src/shared/db/migrations",
  dbCredentials: { url: databaseUrl(process.env) },
});
