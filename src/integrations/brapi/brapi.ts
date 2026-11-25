// brapi.dev adapter (ADR 0004). Server-side only: the token comes in as an
// argument from the caller, which reads it with serverEnv().
import { z } from "zod";

export const BRAPI_BASE_URL = "https://brapi.dev";

/** Results per search; the list endpoint pages, and a ticker search needs one page. */
const SEARCH_LIMIT = 10;

/** A hung request would hold the one-at-a-time queue, so every call gets a deadline. */
const REQUEST_TIMEOUT_MS = 10_000;

/** Tickers brapi serves without a token. Everything else (FIIs, ETFs, BDRs, most stocks) needs one. */
const SANDBOX_TICKERS: ReadonlySet<string> = new Set(["PETR4", "VALE3", "MGLU3", "ITUB4"]);

/** One B3 ticker as brapi's list endpoint describes it. */
export type BrapiTicker = {
  ticker: string;
  name: string;
  /** brapi's `type`: "stock" | "fund" | "bdr". */
  type: string;
  /** brapi's `subType`: "stock" | "unit" | "fii" | "etf" | "bdr" | ... Tells FIIs from ETFs. */
  subType: string | null;
};

export type BrapiError = "tokenMissing" | "tokenInvalid" | "rateLimited" | "unavailable";

export type BrapiSearchResult =
  { ok: true; results: BrapiTicker[] } | { ok: false; error: BrapiError };

export interface BrapiClient {
  /** Whether a token was configured. */
  readonly hasToken: boolean;
  /** Searches B3 tickers by text. Never throws: failures come back as error codes. */
  searchTickers(query: string): Promise<BrapiSearchResult>;
}

export type BrapiClientOptions = {
  token?: string;
  baseUrl?: string;
};

const listResponse = z.object({
  stocks: z.array(
    z.object({
      stock: z.string(),
      name: z.string().nullish(),
      type: z.string(),
      subType: z.string().nullish(),
    }),
  ),
});

const errorBody = z.object({ code: z.string() });

export function createBrapiClient({
  token,
  baseUrl = BRAPI_BASE_URL,
}: BrapiClientOptions): BrapiClient {
  const hasToken = Boolean(token);

  async function get(path: string, params: Record<string, string>) {
    const url = new URL(path, baseUrl);
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
    // Bearer header only: a `?token=` query parameter would end up in logs.
    const headers: HeadersInit = token ? { Authorization: `Bearer ${token}` } : {};
    return oneAtATime(() =>
      fetch(url, { headers, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) }).then(
        async (response) => ({ response, body: await readJson(response) }),
      ),
    );
  }

  async function searchTickers(query: string): Promise<BrapiSearchResult> {
    let reply: Awaited<ReturnType<typeof get>>;
    try {
      reply = await get("/api/quote/list", { search: query, limit: String(SEARCH_LIMIT) });
    } catch {
      return { ok: false, error: "unavailable" };
    }

    const { response, body } = reply;
    if (!response.ok) return { ok: false, error: errorFor(response.status, body, hasToken) };

    const parsed = listResponse.safeParse(body);
    if (!parsed.success) return { ok: false, error: "unavailable" };
    return {
      ok: true,
      results: parsed.data.stocks.map((stock) => ({
        ticker: stock.stock,
        name: stock.name ?? stock.stock,
        type: stock.type,
        subType: stock.subType ?? null,
      })),
    };
  }

  return { hasToken, searchTickers };
}

/** Whether brapi needs a token to serve this ticker. */
export function requiresToken(ticker: string): boolean {
  return !SANDBOX_TICKERS.has(ticker);
}

function errorFor(status: number, body: unknown, hasToken: boolean): BrapiError {
  if (status === 429) return "rateLimited";
  if (status === 401) {
    const code = errorBody.safeParse(body).data?.code;
    if (code === "MISSING_TOKEN") return "tokenMissing";
    if (code === "INVALID_TOKEN") return "tokenInvalid";
    return hasToken ? "tokenInvalid" : "tokenMissing";
  }
  return "unavailable";
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return undefined;
  }
}

// The free plan allows one request at a time, account-wide (a second parallel
// call gets HTTP 429). Every brapi call in this process goes through this chain.
let queue: Promise<unknown> = Promise.resolve();

function oneAtATime<T>(task: () => Promise<T>): Promise<T> {
  const run = queue.then(task);
  // The next task waits for this one to settle, whether it succeeded or not.
  queue = run.catch(() => undefined);
  return run;
}
