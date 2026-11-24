import { describe, expect, it } from "vitest";
import { isTransientConnectionError, retryWhileDatabaseStarts } from "./retry";

function withCode(code: string, message = "boom") {
  return Object.assign(new Error(message), { code });
}

describe("isTransientConnectionError", () => {
  it.each([
    ["ECONNREFUSED", withCode("ECONNREFUSED")],
    ["ECONNRESET", withCode("ECONNRESET")],
    ["57P03 cannot_connect_now", withCode("57P03", "the database system is starting up")],
    [
      "57P01 admin_shutdown",
      withCode("57P01", "terminating connection due to administrator command"),
    ],
    ["a terminated connection", new Error("Connection terminated unexpectedly")],
    [
      "a cause wrapped by Drizzle",
      new Error("Failed query", { cause: new Error("Connection terminated unexpectedly") }),
    ],
    ["an AggregateError of refused addresses", new AggregateError([withCode("ECONNREFUSED")])],
  ])("treats %s as transient", (_label, error) => {
    expect(isTransientConnectionError(error)).toBe(true);
  });

  it.each([
    ["a syntax error", withCode("42601", "syntax error")],
    ["bad credentials", withCode("28P01", "password authentication failed")],
    ["a plain error", new Error("nope")],
    ["a non-error", "Connection terminated unexpectedly"],
  ])("treats %s as permanent", (_label, error) => {
    expect(isTransientConnectionError(error)).toBe(false);
  });
});

describe("retryWhileDatabaseStarts", () => {
  it("retries transient failures until the call succeeds", async () => {
    let calls = 0;
    const result = await retryWhileDatabaseStarts(
      async () => {
        calls += 1;
        if (calls < 3) throw withCode("ECONNREFUSED");
        return "migrated";
      },
      { timeoutMs: 1_000, delayMs: 1 },
    );

    expect(result).toBe("migrated");
    expect(calls).toBe(3);
  });

  it("fails at once on a permanent error", async () => {
    let calls = 0;
    const run = retryWhileDatabaseStarts(
      async () => {
        calls += 1;
        throw withCode("42601", "syntax error");
      },
      { timeoutMs: 1_000, delayMs: 1 },
    );

    await expect(run).rejects.toThrow("syntax error");
    expect(calls).toBe(1);
  });

  it("gives up with the last error once the timeout has passed", async () => {
    let calls = 0;
    const run = retryWhileDatabaseStarts(
      async () => {
        calls += 1;
        throw new Error("Connection terminated unexpectedly");
      },
      { timeoutMs: 50, delayMs: 10 },
    );

    await expect(run).rejects.toThrow("Connection terminated unexpectedly");
    expect(calls).toBeGreaterThan(1);
  });
});
