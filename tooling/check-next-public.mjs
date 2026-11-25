// Part of `pnpm lint`. Next inlines NEXT_PUBLIC_ variables into the browser
// bundle, and every key in this app stays server-side. ESLint
// (hard-rules/no-next-public) covers code files; this covers what it can't
// parse: .env.example, and every non-code file under src/ (JSON messages, CSS).
// Arguments override the default paths; a directory is walked recursively.
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const CODE_FILE = /\.(ts|tsx|mts|cts|js|jsx|mjs|cjs)$/;
const paths = process.argv.length > 2 ? process.argv.slice(2) : [".env.example", "src"];

const files = paths.flatMap((target) =>
  statSync(target).isDirectory()
    ? readdirSync(target, { recursive: true, withFileTypes: true })
        .filter((entry) => entry.isFile() && !CODE_FILE.test(entry.name))
        .map((entry) => path.join(entry.parentPath, entry.name))
    : [target],
);

const hits = files.flatMap((file) =>
  readFileSync(file, "utf8")
    .split("\n")
    .flatMap((line, index) => (line.includes("NEXT_PUBLIC_") ? [`${file}:${index + 1}`] : [])),
);

if (hits.length > 0) {
  for (const hit of hits) {
    console.error(`${hit}: NEXT_PUBLIC_ variables reach the browser; keep keys server-side.`);
  }
  process.exit(1);
}
