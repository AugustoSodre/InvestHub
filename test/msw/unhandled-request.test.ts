import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// A request with no MSW handler must error instead of reaching the network.
// A real local server stands in for "the network": if MSW let the request
// through, it would answer 200 and count the hit.
describe("unhandled outbound requests", () => {
  let realServer: http.Server;
  let realUrl: string;
  let hits = 0;

  beforeAll(async () => {
    realServer = http.createServer((_req, res) => {
      hits += 1;
      res.end("reached the real network");
    });
    await new Promise<void>((resolve) => realServer.listen(0, "127.0.0.1", resolve));
    const { port } = realServer.address() as AddressInfo;
    realUrl = `http://127.0.0.1:${port}/quote`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => realServer.close(() => resolve()));
  });

  it("rejects a fetch that no handler matches", async () => {
    const error = await fetch(realUrl).then(
      () => undefined,
      (e: unknown) => e,
    );

    expect(error).toBeInstanceOf(Error);
    expect(String((error as Error).cause)).toMatch(/\[MSW\].*"error" strategy/);
    expect(hits).toBe(0);
  });

  // Covers HTTP clients built on node:http (axios, got, ...). MSW patches the
  // module object, so call it as `http.request`, the way those libraries do.
  it("rejects a node:http request that no handler matches", async () => {
    const outcome = new Promise<number | undefined>((resolve, reject) => {
      const req = http.request(realUrl, (res) => {
        res.resume();
        res.on("end", () => resolve(res.statusCode));
      });
      req.on("error", reject);
      req.end();
    });

    await expect(outcome).rejects.toThrow(/\[MSW\]/);
    expect(hits).toBe(0);
  });
});
