import { afterAll, afterEach, beforeAll } from "vitest";
import { server } from "../msw/server";

// Tests never reach real external APIs. A request without a handler errors.
// MSW 3 renamed `onUnhandledRequest` to `onUnhandledFrame`; same behaviour.
beforeAll(() => server.listen({ onUnhandledFrame: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
