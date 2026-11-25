import { connection } from "next/server";
import { listAccounts } from "@/features/accounts/accounts";
import { AccountsPage } from "@/features/accounts/accounts-page";
import { currentUserId } from "@/shared/current-user";
import { appDb } from "@/shared/db/app-db";

export default async function Page() {
  // Render per request: the list comes from the database, not from build time.
  await connection();
  const accounts = await listAccounts(appDb(), currentUserId());
  return <AccountsPage accounts={accounts} />;
}
