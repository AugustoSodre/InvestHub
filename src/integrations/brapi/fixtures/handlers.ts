// MSW handlers that replay brapi fixtures. Test-only: nothing in the app imports this.
//
// Recorded live on 2026-11-24 with one-off curl calls, no token, trimmed to the
// fields the adapter reads:
// - list-petr4.json, list-hglg11.json: GET /api/quote/list?search=<q>&limit=10.
//   The list endpoint answered without a token.
// - missing-token.json: GET /api/quote/HGLG11 without a token (HTTP 401). The
//   list endpoint does not require a token today, so the body comes from the
//   quote endpoint; brapi uses the same error shape on every endpoint.
// - invalid-token.json: GET /api/quote/HGLG11 with a made-up Bearer token (HTTP 401).
//
// RATE_LIMITED_BODY below is synthesized, not recorded: brapi documents HTTP 429
// with a Retry-After header but gives no example body, and we do not hammer the
// API to provoke one. The adapter only reads the status code.
import { http, HttpResponse } from "msw";
import { BRAPI_BASE_URL } from "../brapi";
import hglg11 from "./list-hglg11.json";
import invalidToken from "./invalid-token.json";
import missingToken from "./missing-token.json";
import petr4 from "./list-petr4.json";

export const BRAPI_LIST_URL = `${BRAPI_BASE_URL}/api/quote/list`;

/** Synthesized (see the note above). */
export const RATE_LIMITED_BODY = {
  error: true,
  message: "Too many requests",
  code: "RATE_LIMITED",
};

const LIST_FIXTURES: Record<string, unknown> = { PETR4: petr4, HGLG11: hglg11 };

/** Search answered from the recorded fixtures; an unknown query finds nothing. */
export const brapiListFromFixtures = http.get(BRAPI_LIST_URL, ({ request }) => {
  const search = new URL(request.url).searchParams.get("search") ?? "";
  return HttpResponse.json(LIST_FIXTURES[search] ?? { stocks: [] });
});

export const brapiListRateLimited = http.get(BRAPI_LIST_URL, () =>
  HttpResponse.json(RATE_LIMITED_BODY, { status: 429, headers: { "Retry-After": "60" } }),
);

export const brapiListServerError = http.get(
  BRAPI_LIST_URL,
  () => new HttpResponse("Internal Server Error", { status: 500 }),
);

export const brapiListMissingToken = http.get(BRAPI_LIST_URL, () =>
  HttpResponse.json(missingToken, { status: 401 }),
);

export const brapiListInvalidToken = http.get(BRAPI_LIST_URL, () =>
  HttpResponse.json(invalidToken, { status: 401 }),
);
