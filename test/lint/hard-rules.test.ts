import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";

// CLAUDE.md hard rules that lint enforces. This runs the real project ESLint config.
const eslint = new ESLint({ cwd: process.cwd() });

async function ruleErrors(ruleId: string, filePath: string, code: string) {
  const [result] = await eslint.lintText(code, { filePath });
  return (result?.messages ?? []).filter((m) => m.ruleId === ruleId && m.severity === 2);
}

describe("process.env is read only in src/shared/env.ts and root tool configs", () => {
  const RULE = "hard-rules/no-process-env";

  it.each([
    "export const token = process.env.BRAPI_TOKEN;\n",
    'export const token = process.env["BRAPI_TOKEN"];\n',
    "export const all = process.env;\n",
    "const { BRAPI_TOKEN } = process.env;\nexport const token = BRAPI_TOKEN;\n",
    "const { env } = process;\nexport const token = env.BRAPI_TOKEN;\n",
    "export const token = globalThis.process.env.BRAPI_TOKEN;\n",
    'import { env } from "node:process";\nexport const token = env.BRAPI_TOKEN;\n',
    'import process from "process";\nexport const token = process.env.BRAPI_TOKEN;\n',
    "const p = process;\nexport const token = p.env.BRAPI_TOKEN;\n",
    'export const token = require("process").env.BRAPI_TOKEN;\n',
    'const { env } = require("node:process");\nexport const token = env.BRAPI_TOKEN;\n',
    'export const mod = import("node:process");\n',
  ])("flags a feature file reading the environment: %s", async (code) => {
    expect(await ruleErrors(RULE, "src/features/catalog/brapi.ts", code)).not.toHaveLength(0);
  });

  it.each([
    "src/worker/index.ts",
    "src/shared/db/url.ts",
    "src/app/page.tsx",
    "src/integrations/brapi/client.ts",
    "e2e/smoke.spec.ts",
  ])("flags process.env in %s", async (filePath) => {
    const errors = await ruleErrors(RULE, filePath, "export const t = process.env.BRAPI_TOKEN;\n");
    expect(errors).toHaveLength(1);
  });

  it.each(["src/shared/env.ts", "drizzle.config.ts", "playwright.config.ts", "vitest.config.ts"])(
    "allows process.env in %s",
    async (filePath) => {
      const errors = await ruleErrors(RULE, filePath, "export const t = process.env.CI;\n");
      expect(errors).toHaveLength(0);
    },
  );

  it("allows other process members", async () => {
    const errors = await ruleErrors(
      RULE,
      "src/worker/index.ts",
      'process.on("SIGINT", () => process.exit(0));\nexport const cwd = process.cwd();\n',
    );
    expect(errors).toHaveLength(0);
  });
});

describe("feature domain code gets config as arguments", () => {
  it("blocks importing src/shared/env from a domain file", async () => {
    const errors = await ruleErrors(
      "no-restricted-imports",
      "src/features/catalog/quotes.ts",
      'import { serverEnv } from "@/shared/env";\nexport const e = serverEnv;\n',
    );
    expect(errors).toHaveLength(1);
  });

  it("blocks a dynamic import of src/shared/env from a domain file", async () => {
    const errors = await ruleErrors(
      "no-restricted-syntax",
      "src/features/catalog/quotes.ts",
      'export const load = () => import("@/shared/env");\n',
    );
    expect(errors).toHaveLength(1);
  });

  it("allows it in actions.ts", async () => {
    const errors = await ruleErrors(
      "no-restricted-imports",
      "src/features/catalog/actions.ts",
      'import { serverEnv } from "@/shared/env";\nexport const e = serverEnv;\n',
    );
    expect(errors).toHaveLength(0);
  });
});

describe("no float parsing in src/: money goes through Decimal", () => {
  const RULE = "hard-rules/no-number-parsing";

  it.each([
    'export const p = parseFloat("1.5");\n',
    'export const p = parseInt("15", 10);\n',
    'export const p = Number("1.5");\n',
    'export const p = new Number("1.5");\n',
    'export const p = Number.parseFloat("1.5");\n',
    'export const p = Number.parseInt("15", 10);\n',
    'export const p = ["1.5"].map(parseFloat);\n',
    'export const p = ["1.5"].map(Number);\n',
    'import { Decimal } from "@/shared/decimal";\nexport const p = new Decimal("1.5").toNumber();\n',
    'export const p = globalThis.Number("1.5");\n',
    'export const p = globalThis["Number"]("1.5");\n',
    'export const p = window.parseInt("15", 10);\n',
    'export const p = globalThis.parseFloat("1.5");\n',
    'const N = Number;\nexport const p = N("1.5");\n',
    'const { parseFloat: pf } = Number;\nexport const p = pf("1.5");\n',
    'export const p = +"1.5";\n',
    "declare const s: string;\nexport const p = +s;\n",
    'import { z } from "zod";\nexport const p = z.coerce.number();\n',
  ])("flags %s", async (code) => {
    const errors = await ruleErrors(RULE, "src/features/valuation/price.ts", code);
    expect(errors).toHaveLength(1);
  });

  it("flags it in test files under src/ too", async () => {
    const errors = await ruleErrors(RULE, "src/worker/worker.int.test.ts", "Number(x);\n");
    expect(errors).toHaveLength(1);
  });

  it("allows toChartNumber and harmless Number members", async () => {
    const errors = await ruleErrors(
      RULE,
      "src/features/performance/chart-data.ts",
      [
        'import { Decimal, toChartNumber } from "@/shared/decimal";',
        'export const y = toChartNumber(new Decimal("1234.56"));',
        "export const ok = Number.isFinite(y) && y < Number.MAX_SAFE_INTEGER;",
        "export const one = +1;",
        "",
      ].join("\n"),
    );
    expect(errors).toHaveLength(0);
  });

  it("allows a local function that happens to be called parseInt", async () => {
    const errors = await ruleErrors(
      RULE,
      "src/features/valuation/price.ts",
      'const parseInt = (s: string) => s;\nexport const p = parseInt("1");\n',
    );
    expect(errors).toHaveLength(0);
  });

  it("allows the conversion inside src/shared/decimal.ts", async () => {
    const errors = await ruleErrors(
      RULE,
      "src/shared/decimal.ts",
      "export const toChartNumber = (d: { toNumber(): number }) => d.toNumber();\n",
    );
    expect(errors).toHaveLength(0);
  });

  it("does not apply outside src/", async () => {
    const errors = await ruleErrors(RULE, "test/db.ts", 'export const p = Number("1");\n');
    expect(errors).toHaveLength(0);
  });
});

describe("no NEXT_PUBLIC_ variables in src/", () => {
  const RULE = "hard-rules/no-next-public";

  it.each([
    "export const k = process.env.NEXT_PUBLIC_BRAPI_TOKEN;\n",
    'export const k = "NEXT_PUBLIC_BRAPI_TOKEN";\n',
    "export const k = `${'x'}NEXT_PUBLIC_KEY`;\n",
    "export const NEXT_PUBLIC_KEY = 1;\n",
  ])("flags %s", async (code) => {
    const errors = await ruleErrors(RULE, "src/app/page.tsx", code);
    expect(errors).toHaveLength(1);
  });

  it("allows the words in a comment", async () => {
    const errors = await ruleErrors(
      RULE,
      "src/shared/env.ts",
      "// Never use NEXT_PUBLIC_ variables.\nexport const x = 1;\n",
    );
    expect(errors).toHaveLength(0);
  });
});
