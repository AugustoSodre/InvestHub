import { and, asc, eq } from "drizzle-orm";
import type { Database } from "@/shared/db/client";
import type { Currency } from "@/shared/db/enums";
import { accounts, assets, ledgerEvents } from "@/shared/db/schema";
import { toDbNumeric, toDecimal } from "@/shared/decimal";
import { parseBuyInput, type BuyFieldErrors } from "./buy-input";
import { combinePositions, computePosition, type Position, type PositionEvent } from "./positions";

export type LedgerEvent = typeof ledgerEvents.$inferSelect;

export type RecordBuyResult =
  { ok: true; event: LedgerEvent } | { ok: false; fieldErrors: BuyFieldErrors };

/** A position with the asset it holds. Amounts are in `asset.currency`. */
export type AssetPosition = Position & {
  asset: { id: string; naturalKey: string; name: string; currency: Currency };
};

export type AccountPositions = {
  account: { id: string; name: string };
  positions: AssetPosition[];
};

export type Positions = {
  /** Each asset once, summed across accounts. */
  consolidated: AssetPosition[];
  /** Each account with its own positions; accounts holding nothing are left out. */
  byAccount: AccountPositions[];
};

/**
 * Validates an untrusted buy (e.g. form fields) and records it in the ledger
 * as a confirmed event in the asset's currency. The account must be the
 * user's; the asset must be in the catalog. `today` (YYYY-MM-DD, in the user's
 * time zone) is the latest allowed trade date. Returns field error codes
 * instead of throwing when the input is invalid; nothing is saved then.
 */
export async function recordBuy(
  db: Database,
  userId: string,
  input: unknown,
  { today }: { today: string },
): Promise<RecordBuyResult> {
  const parsed = parseBuyInput(input, { today });
  if (!parsed.ok) return parsed;
  const { accountId, assetId, date, quantity, unitPrice, fees } = parsed.data;

  const [[account], [asset]] = await Promise.all([
    db
      .select({ id: accounts.id })
      .from(accounts)
      .where(and(eq(accounts.id, accountId), eq(accounts.userId, userId))),
    db.select({ currency: assets.currency }).from(assets).where(eq(assets.id, assetId)),
  ]);
  if (!account || !asset) {
    return {
      ok: false,
      fieldErrors: {
        ...(account ? {} : { accountId: "notFound" }),
        ...(asset ? {} : { assetId: "notFound" }),
      },
    };
  }

  const [event] = await db
    .insert(ledgerEvents)
    .values({
      userId,
      accountId,
      assetId,
      type: "BUY",
      status: "CONFIRMED",
      date,
      quantity: toDbNumeric(quantity),
      unitPrice: toDbNumeric(unitPrice),
      fees: toDbNumeric(fees),
      currency: asset.currency,
    })
    .returning();
  if (!event) throw new Error("Insert into ledger_events returned no row.");
  return { ok: true, event };
}

/**
 * The user's positions, derived from their ledger events through
 * computePosition: per account (accounts by name) and consolidated across
 * accounts, assets by natural key. Pending events don't count.
 */
export async function listPositions(db: Database, userId: string): Promise<Positions> {
  const rows = await db
    .select({
      accountId: accounts.id,
      accountName: accounts.name,
      assetId: assets.id,
      naturalKey: assets.naturalKey,
      assetName: assets.name,
      assetCurrency: assets.currency,
      type: ledgerEvents.type,
      status: ledgerEvents.status,
      quantity: ledgerEvents.quantity,
      unitPrice: ledgerEvents.unitPrice,
      fees: ledgerEvents.fees,
    })
    .from(ledgerEvents)
    .innerJoin(accounts, eq(ledgerEvents.accountId, accounts.id))
    .innerJoin(assets, eq(ledgerEvents.assetId, assets.id))
    .where(and(eq(ledgerEvents.userId, userId), eq(ledgerEvents.status, "CONFIRMED")))
    // computePosition applies events in order, so the ledger's order is the trade date's.
    .orderBy(asc(ledgerEvents.date), asc(ledgerEvents.createdAt), asc(ledgerEvents.id));

  type Row = (typeof rows)[number];
  const byKey = new Map<string, { row: Row; events: PositionEvent[] }>();
  for (const row of rows) {
    const key = `${row.accountId}/${row.assetId}`;
    const group = byKey.get(key) ?? { row, events: [] };
    group.events.push({
      type: row.type,
      status: row.status,
      quantity: toDecimal(row.quantity),
      unitPrice: toDecimal(row.unitPrice),
      fees: toDecimal(row.fees),
    });
    byKey.set(key, group);
  }

  const accountPositions = [...byKey.values()]
    .map(({ row, events }) => ({
      account: { id: row.accountId, name: row.accountName },
      position: {
        asset: {
          id: row.assetId,
          naturalKey: row.naturalKey,
          name: row.assetName,
          currency: row.assetCurrency,
        },
        ...computePosition(events),
      },
    }))
    // Sells (S04) can bring a position back to zero; nothing held, nothing to show.
    .filter(({ position }) => !position.quantity.isZero());

  const byAccount = new Map<string, AccountPositions>();
  const byAsset = new Map<string, AssetPosition[]>();
  for (const { account, position } of accountPositions) {
    const group = byAccount.get(account.id) ?? { account, positions: [] };
    group.positions.push(position);
    byAccount.set(account.id, group);
    byAsset.set(position.asset.id, [...(byAsset.get(position.asset.id) ?? []), position]);
  }

  const consolidated = [...byAsset.values()].map((positions) => ({
    asset: positions[0]!.asset,
    ...combinePositions(positions),
  }));

  return {
    consolidated: consolidated.sort(byNaturalKey),
    byAccount: [...byAccount.values()]
      .map((group) => ({ ...group, positions: group.positions.sort(byNaturalKey) }))
      .sort((a, b) => compareText(a.account.name, b.account.name)),
  };
}

function byNaturalKey(a: AssetPosition, b: AssetPosition): number {
  return compareText(a.asset.naturalKey, b.asset.naturalKey);
}

/** Case-insensitive, like the accounts list. */
function compareText(a: string, b: string): number {
  return a.localeCompare(b, "pt-BR", { sensitivity: "base" });
}
