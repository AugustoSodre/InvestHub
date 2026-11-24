import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";

// `pnpm lint` also checks .env.example, which ESLint can't parse: no
// NEXT_PUBLIC_ variable may appear there, since Next ships those to the browser.
const SCRIPT = path.resolve("tooling/check-env-example.mjs");
const dir = mkdtempSync(path.join(tmpdir(), "env-example-"));

afterAll(() => rmSync(dir, { recursive: true, force: true }));

function check(contents: string) {
  const file = path.join(dir, `${Math.random().toString(36).slice(2)}.env`);
  writeFileSync(file, contents);
  return spawnSync(process.execPath, [SCRIPT, file], { encoding: "utf8" });
}

describe("check-env-example", () => {
  it.each([
    "BRAPI_TOKEN=\nNEXT_PUBLIC_BRAPI_TOKEN=\n",
    "# NEXT_PUBLIC_SITE_URL=http://localhost:3000\n",
    "export NEXT_PUBLIC_X=1\n",
  ])("fails on a NEXT_PUBLIC_ reference: %j", (contents) => {
    const result = check(contents);
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/NEXT_PUBLIC_/);
    expect(result.stderr).toMatch(/:\d+/);
  });

  it("passes on server-side variables only", () => {
    const result = check("# Server-side keys\nBRAPI_TOKEN=\nDEMO_MODE=false\n");
    expect(result.status).toBe(0);
  });

  it("passes on the committed .env.example", () => {
    const result = spawnSync(process.execPath, [SCRIPT], { encoding: "utf8" });
    expect(result.status, result.stderr).toBe(0);
  });

  it("runs as part of pnpm lint", () => {
    const pkg = JSON.parse(readFileSync("package.json", "utf8")) as { scripts: { lint: string } };
    expect(pkg.scripts.lint).toContain("tooling/check-env-example.mjs");
  });
});
