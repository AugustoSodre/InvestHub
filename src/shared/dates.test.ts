import { describe, expect, it } from "vitest";
import { todayIn } from "./dates";

describe("todayIn", () => {
  it("gives the calendar day in the time zone as YYYY-MM-DD", () => {
    expect(todayIn("America/Sao_Paulo", new Date("2026-01-10T15:00:00Z"))).toBe("2026-01-10");
  });

  it("is still the previous day in São Paulo late in the evening, when UTC has moved on", () => {
    // 22:30 in São Paulo (UTC-3) is 01:30 UTC the next day.
    expect(todayIn("America/Sao_Paulo", new Date("2026-01-11T01:30:00Z"))).toBe("2026-01-10");
  });
});
