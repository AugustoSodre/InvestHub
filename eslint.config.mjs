import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import prettier from "eslint-config-prettier/flat";

const NEXT_FREE_MESSAGE =
  "Domain code in src/features must stay Next-free (ADR 0007). Only actions.ts and .tsx UI files may import next/* or server-only.";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  prettier,
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
            { name: "server-only", message: NEXT_FREE_MESSAGE },
          ],
          patterns: [{ group: ["next/*"], message: NEXT_FREE_MESSAGE }],
        },
      ],
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
