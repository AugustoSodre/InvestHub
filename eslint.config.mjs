import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import prettier from "eslint-config-prettier/flat";
import hardRules from "./tooling/eslint-hard-rules.mjs";

const CODE_EXTENSIONS = "{ts,tsx,mts,cts,js,jsx,mjs,cjs}";
const CODE_FILES = `**/*.${CODE_EXTENSIONS}`;
const SRC_CODE_FILES = `src/**/*.${CODE_EXTENSIONS}`;

// The one list of modules feature domain code may not import (ADR 0007). A
// trailing "/*" also blocks every subpath, at any depth.
const NEXT_ONLY_MODULES = ["next", "next/*", "next-intl/server", "server-only", "client-only"];

const NEXT_FREE_MESSAGE = `Domain code in src/features must stay Next-free (ADR 0007). Only actions.ts and .tsx UI files may import ${NEXT_ONLY_MODULES.join(", ")}.`;

const STATIC_NEXT_IMPORTS = {
  paths: NEXT_ONLY_MODULES.filter((name) => !name.endsWith("/*")).map((name) => ({
    name,
    message: NEXT_FREE_MESSAGE,
  })),
  patterns: [
    { group: NEXT_ONLY_MODULES.filter((name) => name.endsWith("/*")), message: NEXT_FREE_MESSAGE },
    // src/shared/env.ts is server-only; domain functions take config as arguments instead.
    {
      group: ["**/shared/env", "**/shared/env.ts"],
      message:
        "Domain code in src/features takes config as arguments. Read it with serverEnv() in actions.ts or a worker job and pass it in.",
    },
  ],
};

// esquery regexes can't contain a literal "/", so it is written as /.
const moduleRegex = (name) =>
  name
    .replace(/[.+?^${}()|[\]\\]/g, "\\$&")
    .replace(/\/\*$/, "/.+")
    .replaceAll("/", "\\u002F");

const DYNAMIC_NEXT_IMPORT = {
  selector: `ImportExpression[source.value=/^(${NEXT_ONLY_MODULES.map(moduleRegex).join("|")})$/]`,
  message: NEXT_FREE_MESSAGE,
};

// pg-boss evaluates cron in UTC unless `tz` is set; schedule() always sets it.
// Lint has no types, so this matches by name: `.schedule(` on a receiver named
// *boss (boss, pgBoss, worker.boss, this.boss). Keep pg-boss instances named
// that way; `bond.schedule()` and other domain methods stay allowed.
const DIRECT_SCHEDULE = {
  selector:
    "CallExpression[callee.type='MemberExpression'][callee.property.name='schedule']:matches([callee.object.name=/boss$/i], [callee.object.property.name=/boss$/i])",
  message:
    "Create schedules with schedule() from src/worker/schedule.ts, which sets tz: 'America/Sao_Paulo'.",
};

// Where process.env may be read: the validated, server-only env module, and
// tool configs at the repo root. Test harness code may pass the environment on
// to child processes.
const PROCESS_ENV_ALLOWED = [
  "src/shared/env.ts",
  "drizzle.config.ts",
  "playwright.config.ts",
  "vitest.config.ts",
  "test/**",
];

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  prettier,
  // CLAUDE.md hard rules (see tooling/eslint-hard-rules.mjs).
  { plugins: { "hard-rules": hardRules } },
  {
    files: [CODE_FILES],
    ignores: PROCESS_ENV_ALLOWED,
    rules: { "hard-rules/no-process-env": "error" },
  },
  {
    files: [SRC_CODE_FILES],
    // toChartNumber() there is the one sanctioned Decimal-to-number conversion.
    ignores: ["src/shared/decimal.ts"],
    rules: { "hard-rules/no-number-parsing": "error" },
  },
  {
    files: [SRC_CODE_FILES],
    rules: { "hard-rules/no-next-public": "error" },
  },
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
      "no-restricted-imports": ["error", STATIC_NEXT_IMPORTS],
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
