import { describe, expect, it } from "vitest";
import { Decimal } from "@/shared/decimal";
import { formatMoney, formatQuantity } from "./format";

// Intl puts a no-break space between the symbol and the amount.
const nbsp = (text: string) => text.replaceAll(" ", " ");

describe("formatMoney", () => {
  it("shows BRL with two decimals, PT-BR separators", () => {
    expect(formatMoney(new Decimal("4809.9"), "BRL")).toBe(nbsp("R$ 4.809,90"));
  });

  it("rounds half up to cents for display only", () => {
    expect(formatMoney(new Decimal("32.066"), "BRL")).toBe(nbsp("R$ 32,07"));
    // 1.005 is 1.00499… as a float; formatting the decimal string keeps it exact.
    expect(formatMoney(new Decimal("1.005"), "BRL")).toBe(nbsp("R$ 1,01"));
  });

  it("formats amounts beyond float precision exactly", () => {
    expect(formatMoney(new Decimal("123456789012345678.995"), "BRL")).toBe(
      nbsp("R$ 123.456.789.012.345.679,00"),
    );
  });

  it("shows USD with its own symbol", () => {
    expect(formatMoney(new Decimal("10"), "USD")).toBe(nbsp("US$ 10,00"));
  });
});

describe("formatQuantity", () => {
  it("shows whole quantities without decimals", () => {
    expect(formatQuantity(new Decimal("1500"))).toBe("1.500");
  });

  it("shows every decimal place a crypto quantity has", () => {
    expect(formatQuantity(new Decimal("0.00012345"))).toBe("0,00012345");
    expect(formatQuantity(new Decimal("0.123456789012345678"))).toBe("0,123456789012345678");
  });
});
