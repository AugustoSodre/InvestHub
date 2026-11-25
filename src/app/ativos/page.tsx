import { connection } from "next/server";
import { listAssets } from "@/features/catalog/catalog";
import { CatalogPage } from "@/features/catalog/catalog-page";
import { appDb } from "@/shared/db/app-db";

export default async function Page() {
  // Render per request: the list comes from the database, not from build time.
  await connection();
  const assets = await listAssets(appDb());
  return <CatalogPage assets={assets} />;
}
