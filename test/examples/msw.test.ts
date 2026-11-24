import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { server } from "../msw/server";
import quoteFixture from "../fixtures/example-quote.json";

// Example: replay a recorded provider response instead of calling the real API.
describe("MSW fixture replay", () => {
  it("intercepts an outbound HTTP call and answers with the fixture", async () => {
    server.use(
      http.get("https://provider.example.test/quote/:ticker", ({ params }) =>
        params.ticker === "PETR4"
          ? HttpResponse.json(quoteFixture)
          : new HttpResponse(null, { status: 404 }),
      ),
    );

    const response = await fetch("https://provider.example.test/quote/PETR4");

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ symbol: "PETR4", price: "37.45", currency: "BRL" });
  });
});
