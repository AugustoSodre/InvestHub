// Part of `pnpm lint`. ESLint can't parse .env files, so this checks that
// .env.example (or the file given as the first argument) declares no
// NEXT_PUBLIC_ variable: Next inlines those into the browser bundle, and every
// key in this app stays server-side.
import { readFileSync } from "node:fs";

const file = process.argv[2] ?? ".env.example";
const hits = readFileSync(file, "utf8")
  .split("\n")
  .flatMap((line, index) => (line.includes("NEXT_PUBLIC_") ? [`${file}:${index + 1}`] : []));

if (hits.length > 0) {
  for (const hit of hits) {
    console.error(`${hit}: NEXT_PUBLIC_ variables reach the browser; keep keys server-side.`);
  }
  process.exit(1);
}
