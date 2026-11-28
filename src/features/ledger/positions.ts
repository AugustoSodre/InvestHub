// Position math: the single place a position is derived from ledger events.
// Pure (no database), so the ledger queries, the worker and later slices
// (sells, import, splits, snapshots, TWR) all reuse it.
import { Decimal } from "@/shared/decimal";
import type { LedgerEventStatus, LedgerEventType } from "@/shared/db/enums";

/** The fields of a ledger event that move a position. */
export type PositionEvent = {
  type: LedgerEventType;
  status: LedgerEventStatus;
  quantity: Decimal;
  unitPrice: Decimal;
  fees: Decimal;
};

/**
 * A derived holding, in the asset's own currency. `totalCost` includes fees.
 * `averagePrice` (preço médio) is `totalCost / quantity`, unrounded; null when
 * nothing is held.
 */
export type Position = {
  quantity: Decimal;
  totalCost: Decimal;
  averagePrice: Decimal | null;
};

/**
 * Derives a position from one asset's events in one account, applied in the
 * given order (callers sort by date). Pending events are skipped. A buy adds
 * its quantity, and its quantity × price plus fees to the cost (B3 preço médio
 * convention).
 */
export function computePosition(events: readonly PositionEvent[]): Position {
  let quantity = new Decimal(0);
  let totalCost = new Decimal(0);

  for (const event of events) {
    if (event.status !== "CONFIRMED") continue;
    switch (event.type) {
      case "BUY":
        quantity = quantity.plus(event.quantity);
        totalCost = totalCost.plus(event.quantity.times(event.unitPrice)).plus(event.fees);
        break;
      default:
        // Skipping an event would show a wrong position; fail loudly until its slice lands.
        throw new Error(`computePosition cannot apply ${event.type} events yet.`);
    }
  }

  return position(quantity, totalCost);
}

/**
 * Combines one asset's positions across accounts: quantities and costs are
 * summed, and the average price is total cost ÷ total quantity.
 */
export function combinePositions(positions: readonly Position[]): Position {
  let quantity = new Decimal(0);
  let totalCost = new Decimal(0);
  for (const p of positions) {
    quantity = quantity.plus(p.quantity);
    totalCost = totalCost.plus(p.totalCost);
  }
  return position(quantity, totalCost);
}

function position(quantity: Decimal, totalCost: Decimal): Position {
  return {
    quantity,
    totalCost,
    averagePrice: quantity.isZero() ? null : totalCost.dividedBy(quantity),
  };
}
