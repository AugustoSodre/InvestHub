import { execFileSync, spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

// The Stop/SubagentStop hook in .claude/settings.json. Each test runs the real
// script in a throwaway git repo with a fake `pnpm` first on PATH, so it is fast
// and needs no Docker. The fake logs each script it is asked to run and fails
// the one named in FAKE_PNPM_FAIL with a TypeScript-style error.
const HOOK = path.resolve(".claude/hooks/verify.sh");

const FAKE_PNPM = `#!/usr/bin/env bash
echo "$1" >> "$FAKE_PNPM_LOG"
if [ "$1" = "\${FAKE_PNPM_FAIL:-}" ]; then
  for i in $(seq 1 \${FAKE_PNPM_NOISE:-0}); do echo "noise line $i"; done
  echo "src/money.ts(1,7): error TS2322: Type 'string' is not assignable to type 'number'."
  exit 1
fi
echo "pnpm $1 ok"
`;

let root: string;
let repo: string;
let log: string;

function git(...args: string[]) {
  execFileSync("git", args, { cwd: repo, stdio: "pipe" });
}

beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), "verify-hook-"));
  repo = path.join(root, "repo");
  const bin = path.join(root, "bin");
  log = path.join(root, "pnpm.log");
  mkdirSync(repo);
  mkdirSync(bin);
  writeFileSync(path.join(bin, "pnpm"), FAKE_PNPM);
  chmodSync(path.join(bin, "pnpm"), 0o755);
  writeFileSync(log, "");

  git("init", "-q", "-b", "main");
  writeFileSync(path.join(repo, "money.ts"), "export const x = 1;\n");
  commitAll("init");
});

afterEach(() => rmSync(root, { recursive: true, force: true }));

function commitAll(message: string) {
  git("add", ".");
  git(
    "-c",
    "user.name=t",
    "-c",
    "user.email=t@example.com",
    "-c",
    "commit.gpgsign=false",
    "commit",
    "-qm",
    message,
  );
}

/** A feature branch with one committed change and a clean working tree. */
function commitOnBranch() {
  git("switch", "-q", "-c", "feat/1-money");
  dirty();
  commitAll("feat: money");
}

function dirty() {
  writeFileSync(path.join(repo, "money.ts"), 'export const x: number = "1";\n');
}

function runHook(stopHookActive: boolean, fail?: "lint" | "typecheck" | "test:unit", noise = 0) {
  return spawnSync("bash", [HOOK], {
    cwd: repo,
    input: JSON.stringify({ hook_event_name: "Stop", stop_hook_active: stopHookActive, cwd: repo }),
    encoding: "utf8",
    env: {
      ...process.env,
      PATH: `${path.join(root, "bin")}${path.delimiter}${process.env.PATH}`,
      FAKE_PNPM_LOG: log,
      FAKE_PNPM_FAIL: fail ?? "",
      FAKE_PNPM_NOISE: String(noise),
    },
  });
}

const ranScripts = () => readFileSync(log, "utf8").split("\n").filter(Boolean);

describe("verify hook", () => {
  it("exits 0 on a clean tree at main without running any check", () => {
    const result = runHook(false, "typecheck");
    expect(result.status).toBe(0);
    expect(ranScripts()).toEqual([]);
  });

  it("exits 0 on a clean branch with no commits beyond main", () => {
    git("switch", "-q", "-c", "feat/1-money");
    expect(runHook(false, "typecheck").status).toBe(0);
    expect(ranScripts()).toEqual([]);
  });

  it("checks commits not yet on main even when the tree is clean", () => {
    commitOnBranch();
    const result = runHook(false, "typecheck");
    expect(result.status).toBe(2);
    expect(result.stderr).toContain("error TS2322");
    expect(ranScripts()).toEqual(["lint", "typecheck"]);
  });

  it("measures commits against origin/main when it exists", () => {
    commitOnBranch();
    // The remote already has the branch's work; local main is stale.
    git("update-ref", "refs/remotes/origin/main", "HEAD");
    expect(runHook(false, "typecheck").status).toBe(0);
    expect(ranScripts()).toEqual([]);
  });

  it("runs lint, typecheck and unit tests on a dirty tree and exits 0 when they pass", () => {
    dirty();
    const result = runHook(false);
    expect(result.status, result.stderr).toBe(0);
    expect(ranScripts()).toEqual(["lint", "typecheck", "test:unit"]);
  });

  it("checks untracked files too", () => {
    writeFileSync(path.join(repo, "new.ts"), "export const y = 2;\n");
    expect(runHook(false).status).toBe(0);
    expect(ranScripts()).toEqual(["lint", "typecheck", "test:unit"]);
  });

  it("blocks with exit 2 and puts the type error on stderr", () => {
    dirty();
    const result = runHook(false, "typecheck");
    expect(result.status).toBe(2);
    expect(result.stderr).toContain("error TS2322");
    expect(ranScripts()).toEqual(["lint", "typecheck"]);
  });

  it("trims the failing output to its last 80 lines", () => {
    dirty();
    const result = runHook(false, "lint", 500);
    expect(result.status).toBe(2);
    expect(result.stderr).toContain("error TS2322");
    expect(result.stderr).not.toContain("noise line 1\n");
    expect(result.stderr.split("\n").length).toBeLessThan(100);
  });

  it("gives up with a warning after blocking 3 times in a row with stop_hook_active", () => {
    dirty();
    for (let i = 0; i < 3; i++) {
      expect(runHook(true, "lint").status).toBe(2);
    }
    const result = runHook(true, "lint");
    expect(result.status).toBe(0);
    expect(`${result.stdout}${result.stderr}`).toMatch(/warning/i);
  });

  it("starts counting again when stop_hook_active is false", () => {
    dirty();
    for (let i = 0; i < 3; i++) runHook(true, "lint");
    expect(runHook(false, "lint").status).toBe(2);
    expect(runHook(true, "lint").status).toBe(2);
  });

  it("resets the counter when the checks pass", () => {
    dirty();
    runHook(true, "lint");
    runHook(true, "lint");
    expect(runHook(true).status).toBe(0);
    for (let i = 0; i < 3; i++) {
      expect(runHook(true, "lint").status).toBe(2);
    }
  });

  it("keeps its counter out of the working tree", () => {
    writeFileSync(path.join(repo, "new.ts"), "export const y = 2;\n");
    const before = execFileSync("git", ["status", "--porcelain"], { cwd: repo, encoding: "utf8" });
    runHook(true, "lint");
    const after = execFileSync("git", ["status", "--porcelain"], { cwd: repo, encoding: "utf8" });
    expect(after).toBe(before);
  });
});
