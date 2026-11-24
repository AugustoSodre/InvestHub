import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";

// ADR 0007: domain files in src/features must not import next/*, server-only,
// client-only or next-intl/server, statically or dynamically. Only actions.ts
// and .tsx UI files may. This runs the real project ESLint config.
const eslint = new ESLint({ cwd: process.cwd() });

const NEXT_FREE_RULES = new Set(["no-restricted-imports", "no-restricted-syntax"]);

async function nextFreeErrors(filePath: string, code: string) {
  const [result] = await eslint.lintText(code, { filePath });
  return (result?.messages ?? []).filter(
    (m) => m.ruleId !== null && NEXT_FREE_RULES.has(m.ruleId) && /ADR 0007/.test(m.message),
  );
}

const NEXT_CACHE_IMPORT =
  'import { revalidatePath } from "next/cache";\nexport const x = revalidatePath;\n';

describe("Next-free feature modules", () => {
  it("blocks next/cache in a domain file", async () => {
    const errors = await nextFreeErrors("src/features/ledger/positions.ts", NEXT_CACHE_IMPORT);
    expect(errors).toHaveLength(1);
    expect(errors[0]?.severity).toBe(2);
  });

  it("blocks next/cache in a nested domain folder", async () => {
    const errors = await nextFreeErrors("src/features/ledger/domain/deep/x.ts", NEXT_CACHE_IMPORT);
    expect(errors).toHaveLength(1);
  });

  it("blocks the bare next package and server-only in a domain file", async () => {
    const errors = await nextFreeErrors(
      "src/features/ledger/queries.ts",
      'import "server-only";\nimport type { NextConfig } from "next";\nexport type C = NextConfig;\n',
    );
    expect(errors).toHaveLength(2);
  });

  it("blocks client-only and next-intl/server in a domain file", async () => {
    const errors = await nextFreeErrors(
      "src/features/ledger/labels.ts",
      'import "client-only";\nimport { getTranslations } from "next-intl/server";\nexport const t = getTranslations;\n',
    );
    expect(errors).toHaveLength(2);
  });

  it.each(["next", "next/cache", "server-only", "client-only", "next-intl/server"])(
    "blocks a dynamic import of %s in a domain file",
    async (specifier) => {
      const errors = await nextFreeErrors(
        "src/features/ledger/positions.ts",
        `export async function load() {\n  return import("${specifier}");\n}\n`,
      );
      expect(errors).toHaveLength(1);
    },
  );

  it("allows next/cache, statically and dynamically, in actions.ts", async () => {
    const errors = await nextFreeErrors(
      "src/features/ledger/actions.ts",
      `${NEXT_CACHE_IMPORT}export const load = () => import("next/cache");\n`,
    );
    expect(errors).toHaveLength(0);
  });

  it("allows next/* in .tsx UI files", async () => {
    const errors = await nextFreeErrors(
      "src/features/ledger/positions-table.tsx",
      'import Link from "next/link";\nexport const L = Link;\n',
    );
    expect(errors).toHaveLength(0);
  });

  it("does not restrict next/* outside src/features", async () => {
    const errors = await nextFreeErrors("src/app/example/page.ts", NEXT_CACHE_IMPORT);
    expect(errors).toHaveLength(0);
  });
});
