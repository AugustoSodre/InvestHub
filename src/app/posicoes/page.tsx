import { connection } from "next/server";
import { listAccounts } from "@/features/accounts/accounts";
import { listAssets } from "@/features/catalog/catalog";
import { listPositions } from "@/features/ledger/ledger";
import { PositionsPage } from "@/features/ledger/positions-page";
import { currentUserId } from "@/shared/current-user";
import { todayIn } from "@/shared/dates";
import { appDb } from "@/shared/db/app-db";
import { TIME_ZONE } from "@/shared/i18n/config";

export default async function Page() {
  // Render per request: positions come from the ledger, not from build time.
  await connection();
  const db = appDb();
  const userId = currentUserId();
  const [positions, accounts, assets] = await Promise.all([
    listPositions(db, userId),
    listAccounts(db, userId),
    listAssets(db),
  ]);
  return (
    <PositionsPage
      positions={positions}
      accounts={accounts.map(({ id, name }) => ({ id, name }))}
      assets={assets.map(({ id, naturalKey, name }) => ({ id, naturalKey, name }))}
      today={todayIn(TIME_ZONE)}
    />
  );
}
