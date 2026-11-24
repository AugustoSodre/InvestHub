// The only module that reads process.env (enforced by lint). `server-only`
// makes importing it from a client component a build error, so keys never
// reach the browser. The worker and CLI scripts run Node with
// `--conditions=react-server`, which resolves `server-only` to an empty module.
import "server-only";
import { parseEnv, type ServerEnv } from "./env-schema";

export type { ServerEnv } from "./env-schema";

let cached: ServerEnv | undefined;

/**
 * Validated server configuration, parsed on first call (not at import, so
 * `next build` does not need runtime secrets). Throws on invalid values.
 * Feature domain code never calls this: it takes the values it needs as arguments.
 */
export function serverEnv(): ServerEnv {
  cached ??= parseEnv(process.env);
  return cached;
}
