import { describe, expect, it } from "vitest";
import { Decimal, toDbNumeric, toDecimal } from "./decimal";

describe("decimal helpers", () => {
  it("adds without floating-point error", () => {
    expect(toDecimal("0.1").plus(toDecimal("0.2")).equals(toDecimal("0.3"))).toBe(true);
    expect(toDecimal("0.1").plus("0.2").toString()).toBe("0.3");
  });

  it("keeps a numeric(36,18) quantity exact through a round trip", () => {
    const quantity = "123456789012345678.123456789012345678";
    expect(toDbNumeric(toDecimal(quantity))).toBe(quantity);
  });

  it("multiplies price by quantity exactly", () => {
    const total = toDecimal("37.45").times(toDecimal("0.00012345"));
    expect(total.toString()).toBe("0.0046232025");
  });

  it("accepts driver strings with surrounding whitespace and signs", () => {
    expect(toDecimal(" -12.50 ").toString()).toBe("-12.5");
  });

  it.each(["", "abc", "1,5", "NaN", "Infinity", "-Infinity"])(
    "rejects %j at the boundary",
    (raw) => {
      expect(() => toDecimal(raw)).toThrow(/invalid decimal/i);
    },
  );

  it("never writes exponent notation to the database", () => {
    expect(toDbNumeric(toDecimal("0.000000000000000001"))).toBe("0.000000000000000001");
    expect(toDbNumeric(toDecimal("1e21"))).toBe("1000000000000000000000");
  });

  it("exports a Decimal constructor that is configured for money", () => {
    expect(Decimal.precision).toBeGreaterThanOrEqual(40);
    expect(new Decimal("2").dividedBy(3).toSignificantDigits(5).toString()).toBe("0.66667");
  });
});
