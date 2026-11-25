import { http, HttpResponse, delay } from "msw";
import { describe, expect, it } from "vitest";
import { server } from "../../../test/msw/server";
import { createBrapiClient, requiresToken } from "./brapi";
import {
  BRAPI_LIST_URL,
  brapiListFromFixtures,
  brapiListInvalidToken,
  brapiListMissingToken,
  brapiListRateLimited,
  brapiListServerError,
} from "./fixtures/handlers";

describe("brapi searchTickers", () => {
  it("parses the recorded list response into tickers", async () => {
    server.use(brapiListFromFixtures);

    const result = await createBrapiClient({}).searchTickers("PETR4");

    expect(result).toEqual({
      ok: true,
      results: [
        {
          ticker: "PETR4",
          name: "PETROLEO BRASILEIRO S.A. PETROBRAS",
          type: "stock",
          subType: "stock",
        },
        {
          ticker: "PETR4F",
          name: "PETROLEO BRASILEIRO S.A. PETROBRAS",
          type: "stock",
          subType: "stock",
        },
      ],
    });
  });

  it("reports the FII sub-type for HGLG11", async () => {
    server.use(brapiListFromFixtures);

    const result = await createBrapiClient({}).searchTickers("HGLG11");

    expect(result).toMatchObject({ ok: true, results: [{ ticker: "HGLG11", subType: "fii" }] });
  });

  it("sends the query and a result limit", async () => {
    let url: URL | undefined;
    server.use(
      http.get(BRAPI_LIST_URL, ({ request }) => {
        url = new URL(request.url);
        return HttpResponse.json({ stocks: [] });
      }),
    );

    await createBrapiClient({}).searchTickers("PETR4");

    expect(url?.searchParams.get("search")).toBe("PETR4");
    expect(url?.searchParams.get("limit")).toBe("10");
  });

  it("sends the token as a Bearer header, never in the URL", async () => {
    let authorization: string | null = null;
    let url = "";
    server.use(
      http.get(BRAPI_LIST_URL, ({ request }) => {
        authorization = request.headers.get("authorization");
        url = request.url;
        return HttpResponse.json({ stocks: [] });
      }),
    );

    await createBrapiClient({ token: "test-token" }).searchTickers("PETR4");

    expect(authorization).toBe("Bearer test-token");
    expect(url).not.toContain("test-token");
  });

  it("sends no Authorization header without a token", async () => {
    let authorization: string | null = "unset";
    server.use(
      http.get(BRAPI_LIST_URL, ({ request }) => {
        authorization = request.headers.get("authorization");
        return HttpResponse.json({ stocks: [] });
      }),
    );

    await createBrapiClient({ token: undefined }).searchTickers("PETR4");

    expect(authorization).toBeNull();
  });

  it.each([
    ["HTTP 429", brapiListRateLimited, "rateLimited"],
    ["HTTP 500", brapiListServerError, "unavailable"],
    ["401 MISSING_TOKEN", brapiListMissingToken, "tokenMissing"],
    ["401 INVALID_TOKEN", brapiListInvalidToken, "tokenInvalid"],
  ] as const)("maps %s to %s", async (_label, handler, error) => {
    server.use(handler);

    expect(await createBrapiClient({}).searchTickers("HGLG11")).toEqual({ ok: false, error });
  });

  it("treats an unexpected body as unavailable", async () => {
    server.use(http.get(BRAPI_LIST_URL, () => HttpResponse.json({ unexpected: true })));

    expect(await createBrapiClient({}).searchTickers("PETR4")).toEqual({
      ok: false,
      error: "unavailable",
    });
  });

  it("treats a network failure as unavailable", async () => {
    server.use(http.get(BRAPI_LIST_URL, () => HttpResponse.error()));

    expect(await createBrapiClient({}).searchTickers("PETR4")).toEqual({
      ok: false,
      error: "unavailable",
    });
  });

  it("sends one request at a time, even across clients", async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const order: string[] = [];
    server.use(
      http.get(BRAPI_LIST_URL, async ({ request }) => {
        const search = new URL(request.url).searchParams.get("search") ?? "";
        inFlight += 1;
        maxInFlight = Math.max(maxInFlight, inFlight);
        order.push(`start ${search}`);
        await delay(20);
        order.push(`end ${search}`);
        inFlight -= 1;
        return search === "FAIL"
          ? new HttpResponse(null, { status: 500 })
          : HttpResponse.json({ stocks: [] });
      }),
    );

    const results = await Promise.all([
      createBrapiClient({}).searchTickers("FAIL"),
      createBrapiClient({}).searchTickers("PETR4"),
      createBrapiClient({}).searchTickers("HGLG11"),
    ]);

    expect(maxInFlight).toBe(1);
    expect(order).toEqual([
      "start FAIL",
      "end FAIL",
      "start PETR4",
      "end PETR4",
      "start HGLG11",
      "end HGLG11",
    ]);
    // A failed request does not block the ones queued behind it.
    expect(results.map((r) => r.ok)).toEqual([false, true, true]);
  });
});

describe("requiresToken", () => {
  it("is false only for brapi's free test tickers", () => {
    expect(["PETR4", "VALE3", "MGLU3", "ITUB4"].map(requiresToken)).toEqual([
      false,
      false,
      false,
      false,
    ]);
    expect(requiresToken("HGLG11")).toBe(true);
  });
});
