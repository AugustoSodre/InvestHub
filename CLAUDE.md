# InvestHub: agent guide

Personal portfolio tracker for Brazilian and US assets with news, a weekly AI digest and alerts. Read `docs/prd.md` for scope, `docs/GLOSSARY.md` for terms, `docs/adr/` for decisions. v2 ideas live in `docs/roadmap.md`, not in issues.

## Stack

TypeScript, Next.js (App Router), pg-boss worker, PostgreSQL, Drizzle, decimal.js, Tailwind + shadcn/ui + Recharts. Tests: Vitest, Testcontainers, MSW, Playwright. Package manager: pnpm (via corepack).

## Layout

- `src/features/<module>/`: one feature module per domain concept: `accounts`, `catalog`, `ledger`, `valuation`, `fixed-income`, `performance`, `research`, `alerts`, `notifications`. Each holds its UI, server actions, domain logic, queries and tests. A slice (issue) adds behaviour to one or more modules; it never gets its own folder. See ADR 0007.
- `src/integrations/<provider>/`: provider adapters with their fixtures. Use exactly these folder names: `brapi`, `yahoo`, `finnhub`, `coingecko`, `cvm`, `tesouro-transparente`, `bcb`, `google-news`, `rss`, `llm/<provider>` (e.g. `llm/gemini`, `llm/ollama`), `telegram`. Add a new name here before creating a new folder.
- `src/shared/`: db client and migrations (`db/`), decimal helpers (`decimal.ts`), i18n config and PT-BR messages (`i18n/`), shadcn/ui components (`ui/`), business-day calendar.
- `test/`: cross-cutting test harness (Vitest setup, per-file database, MSW server, fixtures). `e2e/`: Playwright specs. Module tests live next to their code.
- `src/worker/`: job entrypoint and schedules. Every pg-boss schedule sets `tz: 'America/Sao_Paulo'`; without it, cron times run in UTC (07:00 BRT would fire at 04:00 BRT).
- `src/app/`: thin routes only. Import from features; put no logic here.

Do not create layer folders (`services/`, `controllers/`, `repositories/`) across features.

Domain logic is plain TypeScript: functions that take a database handle as an argument and never import `next/*` or `server-only`. Server actions (`actions.ts`) and pg-boss job handlers are thin adapters: parse input, call the domain function, then revalidate (actions only). The worker imports feature modules directly.

## Money and numbers

- Never use JavaScript `number` for money, prices, quantities, rates or FX. Use `Decimal` from decimal.js.
- One exception: chart data. Recharts only accepts numbers, so convert `Decimal` to `number` when building chart props, for display only. Never feed a converted value back into a calculation.
- Store them as Postgres `numeric` (quantities `numeric(36,18)`). Wrap driver strings in `Decimal` at the boundary.
- Keep cost basis in the asset's original currency. In BRL views, convert each event's cost at the PTAX sell rate of its trade date and current value at the latest PTAX, so BRL P&L includes the FX effect. Store converted values only as derived data, never as truth. Previous business day on weekends and holidays.

## TDD

- Start every slice from its issue's Given/When/Then criteria. Write each as a failing test first, then make it pass, then refactor.
- Test at the module's interface: call its domain functions with a real database handle and assert on the database and the result. Do not test through server actions, and do not mock module internals.
- Integration tests use Testcontainers Postgres. Never use SQLite or pg-mem.
- Test isolation: one Postgres container per test run (Vitest `globalSetup`), migrations applied once to a template database, and each test file gets its own database cloned from it (`CREATE DATABASE ... TEMPLATE`). Files run in parallel without sharing data; tests inside a file clean up after themselves.
- Never call real external APIs in tests. Record fixtures and replay them with MSW.
- Domain math (average price, accrual, IR/IOF, TWR) gets unit tests with exact decimal expectations.

## Hard rules

- LLM prompts never contain quantities, prices paid, monetary amounts, account names or any user-typed text (names, notes, labels). Only tickers, catalog asset names, percentages, weights, dates and news. Fixed-income holdings get a label generated from stored fields (issuer, indexer, rate, maturity). Build prompts only in the LLM prompt builder.
- API keys are read server-side only. Never expose them to client components or `NEXT_PUBLIC_*`.
- When `DEMO_MODE=true`, block every write and serve seeded data. No live third-party feeds in demo mode.
- Show "as of" dates on prices and CoinGecko attribution wherever crypto prices appear.
- Ledger events are the source of truth. Derive positions; never store them as truth.
- Worker-detected dividends and corporate actions become pending events. Never write them to the ledger without user confirmation.
- Respect provider limits: brapi one request at a time; download CVM files on a schedule, never per request.

## Language

- Code, comments, commits, issues and docs: English.
- UI strings: PT-BR, through the i18n layer. No hard-coded UI text in components.

## Git and PRs

- One branch per issue: `feat/<issue#>-<slug>` (or `fix/`, `docs/`, `chore/`).
- Conventional Commits.
- PR body includes `Closes #<issue>`. Squash merge.
- The human reviews and merges PRs. Never merge yourself.
- `gh pr edit` and `gh issue edit` fail here ("Projects (classic) is being deprecated"). Use the REST API instead: `gh api -X PATCH repos/AugustoSodre/InvestHub/pulls/<n> -F body=@file.md` (or `.../issues/<n>`). `gh pr view`, `gh pr list` and `gh issue view` work.
- Never add `Co-Authored-By: Claude`, "Generated with Claude Code" or any Claude/Anthropic attribution to commits, PRs or issues.

## Agent workflow per issue

The main session orchestrates every step. Subagents cannot spawn subagents, so only the main session dispatches agents.

1. An implementer subagent works in its own git worktree, red-green-refactor against the issue's acceptance criteria.
2. Review the diff against the issue spec and this guide. Either the main session runs the `code-review` skill (it fans out to parallel Standards and Spec reviewers, which only works from the main session), or a single reviewer subagent does one combined pass.
3. Open the PR; the human merges.

Independent slices (see the dependency table in `docs/prd.md`) may run in parallel worktrees, each with its own implementer dispatched by the main session.

## Commands

Node 22 (`.nvmrc`), pnpm through corepack (`corepack enable`). Docker must be running for the database and for integration tests.

- `docker compose up -d`: local Postgres on `127.0.0.1:55432` (the default when `DATABASE_URL` is unset).
- `pnpm db:migrate`: apply Drizzle migrations. `pnpm db:generate` creates a migration from `src/shared/db/schema.ts`.
- `pnpm dev`: Next.js on http://localhost:3000, bound to 127.0.0.1. `pnpm build` / `pnpm start` for production.
- `pnpm worker`: pg-boss worker (`src/worker/index.ts`). Create schedules only through `schedule()` in `src/worker/schedule.ts`, which sets the São Paulo time zone.
- `pnpm lint`, `pnpm typecheck`, `pnpm format` (`pnpm format:check` in CI).
- `pnpm test`: Vitest. Project `unit` runs `*.test.ts`; project `integration` runs `*.int.test.ts` against Testcontainers Postgres. Filter with `pnpm test --project unit` or a path.
- `pnpm test:e2e`: Playwright (`e2e/`). Starts `pnpm dev` itself, or reuses a running one. First run needs `pnpm exec playwright install chromium`.

Test helpers: in an `*.int.test.ts` file, `testDb()` and `testDatabaseUrl()` from `test/db.ts` give that file's own database. `server` from `test/msw/server.ts` is the shared MSW server; register fixtures with `server.use(...)`. Any request without a handler errors (MSW 3 calls the option `onUnhandledFrame`).

Next.js 16 differs from older versions: read the bundled docs in `node_modules/next/dist/docs/` before using a Next API (see `AGENTS.md`, which `next dev` maintains).
