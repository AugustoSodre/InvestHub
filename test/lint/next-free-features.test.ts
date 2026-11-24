import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";

// ADR 0007: domain files in src/features must not import next/* or server-only.
// Only actions.ts and .tsx UI files may. This runs the real project ESLint config.
const eslint = new ESLint({ cwd: process.cwd() });

async function restrictedImportErrors(filePath: string, code: string) {
  const [result] = await eslint.lintText(code, { filePath });
  return (result?.messages ?? []).filter((m) => m.ruleId === "no-restricted-imports");
}

describe("Next-free feature modules", () => {
  it("blocks next/cache in a domain file", async () => {
    const errors = await restrictedImportErrors(
      "src/features/ledger/positions.ts",
      'import { revalidatePath } from "next/cache";\nexport const x = revalidatePath;\n',
    );
    expect(errors).toHaveLength(1);
    expect(errors[0]?.severity).toBe(2);
  });

  it("blocks the bare next package and server-only in a domain file", async () => {
    const errors = await restrictedImportErrors(
      "src/features/ledger/queries.ts",
      'import "server-only";\nimport type { NextConfig } from "next";\nexport type C = NextConfig;\n',
    );
    expect(errors).toHaveLength(2);
  });

  it("allows next/cache in actions.ts", async () => {
    const errors = await restrictedImportErrors(
      "src/features/ledger/actions.ts",
      'import { revalidatePath } from "next/cache";\nexport const x = revalidatePath;\n',
    );
    expect(errors).toHaveLength(0);
  });

  it("allows next/* in .tsx UI files", async () => {
    const errors = await restrictedImportErrors(
      "src/features/ledger/positions-table.tsx",
      'import Link from "next/link";\nexport const L = Link;\n',
    );
    expect(errors).toHaveLength(0);
  });

  it("does not restrict next/* outside src/features", async () => {
    const errors = await restrictedImportErrors(
      "src/app/example/page.ts",
      'import { revalidatePath } from "next/cache";\nexport const x = revalidatePath;\n',
    );
    expect(errors).toHaveLength(0);
  });
});
