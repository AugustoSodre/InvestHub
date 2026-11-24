import { setupServer } from "msw/node";

/**
 * The MSW server shared by every test file. It starts with no handlers: each
 * test registers the provider fixtures it needs with `server.use(...)`.
 */
export const server = setupServer();
