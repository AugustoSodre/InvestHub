import { describe, expect, it } from "vitest";
import { databaseUrl, LOCAL_DATABASE_URL } from "./url";

describe("databaseUrl", () => {
  it("uses DATABASE_URL when it is set", () => {
    const url = "postgres://user:pass@db.example:5432/app";
    expect(databaseUrl({ DATABASE_URL: url, NODE_ENV: "production" })).toBe(url);
  });

  it("falls back to the compose dev database, never the real-data one", () => {
    expect(new URL(LOCAL_DATABASE_URL).pathname).toBe("/investhub_dev");
  });

  it("falls back to the local compose database outside production", () => {
    expect(databaseUrl({})).toBe(LOCAL_DATABASE_URL);
    expect(databaseUrl({ NODE_ENV: "development" })).toBe(LOCAL_DATABASE_URL);
    expect(databaseUrl({ NODE_ENV: "test", DATABASE_URL: "" })).toBe(LOCAL_DATABASE_URL);
  });

  it("throws in production when DATABASE_URL is missing or empty", () => {
    expect(() => databaseUrl({ NODE_ENV: "production" })).toThrow(/DATABASE_URL/);
    expect(() => databaseUrl({ NODE_ENV: "production", DATABASE_URL: "" })).toThrow(/DATABASE_URL/);
  });
});
