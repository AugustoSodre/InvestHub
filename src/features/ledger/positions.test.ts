import { describe, expect, it } from "vitest";
import { Decimal } from "@/shared/decimal";
import { combinePositions, computePosition, type PositionEvent } from "./positions";

const buy = (quantity: string, unitPrice: string, fees = "0"): PositionEvent => ({
  type: "BUY",
  status: "CONFIRMED",
  quantity: new Decimal(quantity),
  unitPrice: new Decimal(unitPrice),
  fees: new Decimal(fees),
});

/** Decimals as plain strings, so a failure shows the exact digits. */
function plain(position: ReturnType<typeof computePosition>) {
  return {
    quantity: position.quantity.toFixed(),
    totalCost: position.totalCost.toFixed(),
    averagePrice: position.averagePrice?.toFixed() ?? null,
  };
}

describe("computePosition", () => {
  it("is empty with no events", () => {
    expect(plain(computePosition([]))).toEqual({
      quantity: "0",
      totalCost: "0",
      averagePrice: null,
    });
  });

  it("adds fees to the cost of a buy (B3 preço médio)", () => {
    expect(plain(computePosition([buy("100", "30.00", "5.00")]))).toEqual({
      quantity: "100",
      totalCost: "3005",
      averagePrice: "30.05",
    });
  });

  it("weights the average price by quantity across buys", () => {
    const position = computePosition([buy("100", "30.00", "5.00"), buy("50", "36.00", "4.90")]);

    expect(plain(position)).toEqual({
      quantity: "150",
      totalCost: "4809.9",
      averagePrice: "32.066",
    });
  });

  it("keeps the average price unrounded", () => {
    const position = computePosition([buy("3", "10", "0")]);
    const third = computePosition([buy("3", "10", "1")]);

    expect(position.averagePrice?.toFixed()).toBe("10");
    // 31 / 3 at decimal.js precision, not rounded to cents.
    expect(third.averagePrice?.toFixed()).toBe("10.33333333333333333333333333333333333333");
  });

  it("keeps crypto-sized quantities exact", () => {
    const position = computePosition([buy("0.00012345", "350000", "0"), buy("0.00000001", "1")]);

    expect(position.quantity.toFixed()).toBe("0.00012346");
    expect(position.totalCost.toFixed()).toBe("43.20750001");
  });

  it("ignores pending events: they are not part of the ledger until confirmed", () => {
    const pending: PositionEvent = { ...buy("10", "20"), status: "PENDING" };

    expect(plain(computePosition([buy("100", "30.00", "5.00"), pending]))).toEqual({
      quantity: "100",
      totalCost: "3005",
      averagePrice: "30.05",
    });
  });

  it("refuses event types it cannot apply yet instead of showing a wrong position", () => {
    const sell: PositionEvent = { ...buy("10", "40"), type: "SELL" };

    expect(() => computePosition([buy("100", "30"), sell])).toThrow(/SELL/);
  });
});

describe("combinePositions", () => {
  it("sums quantities and costs and divides cost by quantity", () => {
    const xp = computePosition([buy("100", "30.00", "5.00")]);
    const rico = computePosition([buy("50", "36.00", "4.90")]);

    expect(plain(combinePositions([xp, rico]))).toEqual({
      quantity: "150",
      totalCost: "4809.9",
      averagePrice: "32.066",
    });
  });

  it("is empty with nothing to combine", () => {
    expect(plain(combinePositions([]))).toEqual({
      quantity: "0",
      totalCost: "0",
      averagePrice: null,
    });
  });
});
