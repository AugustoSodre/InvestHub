import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import prettier from "eslint-config-prettier/flat";

const CODE_FILES = "**/*.{ts,tsx,mts,cts,js,jsx,mjs,cjs}";

const NEXT_FREE_MESSAGE =
  "Domain code in src/features must stay Next-free (ADR 0007). Only actions.ts and .tsx UI files may import next/*, next-intl/server, server-only or client-only.";

// pg-boss evaluates cron in UTC unless `tz` is set; schedule() always sets it.
const DIRECT_SCHEDULE = {
  selector: "CallExpression[callee.type='MemberExpression'][callee.property.name='schedule']",
  message:
    "Create schedules with schedule() from src/worker/schedule.ts, which sets tz: 'America/Sao_Paulo'.",
};

const DYNAMIC_NEXT_IMPORT = {
  selector:
    "ImportExpression[source.value=/^(next(\\u002F.*)?|server-only|client-only|next-intl\\u002Fserver)$/]",
  message: NEXT_FREE_MESSAGE,
};

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  prettier,
  {
    files: [CODE_FILES],
    ignores: ["src/worker/schedule.ts"],
    rules: {
      "no-restricted-syntax": ["error", DIRECT_SCHEDULE],
    },
  },
  {
    // ADR 0007: feature modules keep a Next-free core so the worker and Vitest
    // can call domain functions outside a request.
    files: ["src/features/**/*.{ts,mts,cts,js,mjs,cjs,jsx}"],
    ignores: ["src/features/**/actions.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            { name: "next", message: NEXT_FREE_MESSAGE },
            { name: "next-intl/server", message: NEXT_FREE_MESSAGE },
            { name: "server-only", message: NEXT_FREE_MESSAGE },
            { name: "client-only", message: NEXT_FREE_MESSAGE },
          ],
          patterns: [{ group: ["next/*"], message: NEXT_FREE_MESSAGE }],
        },
      ],
      // Flat config replaces a rule's options per file, so repeat DIRECT_SCHEDULE here.
      "no-restricted-syntax": ["error", DIRECT_SCHEDULE, DYNAMIC_NEXT_IMPORT],
    },
  },
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "playwright-report/**",
    "test-results/**",
  ]),
]);

export default eslintConfig;
