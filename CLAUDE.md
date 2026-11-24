# InvestHub: agent guide

Personal portfolio tracker for Brazilian and US assets with news, a weekly AI digest and alerts. Read `docs/prd.md` for scope, `docs/GLOSSARY.md` for terms, `docs/adr/` for decisions. v2 ideas live in `docs/roadmap.md`, not in issues.

## Stack

TypeScript, Next.js (App Router), pg-boss worker, PostgreSQL, Drizzle, decimal.js, Tailwind + shadcn/ui + Recharts. Tests: Vitest, Testcontainers, MSW, Playwright. Package manager: pnpm (via corepack).

## Layout

- `src/features/<module>/`: one feature module per domain concept: `accounts`, `catalog`, `ledger`, `valuation`, `fixed-income`, `performance`, `research`, `alerts`, `notifications`. Each holds its UI, server actions, domain logic, queries and tests. A slice (issue) adds behaviour to one or more modules; it never gets its own folder. See ADR 0007.
- `src/integrations/<provider>/`: provider adapters (brapi, yahoo, finnhub, coingecko, cvm, tesouro, bcb, news, llm) with their fixtures.
- `src/shared/`: db client, decimal helpers, business-day calendar.
- `src/worker/`: job entrypoint and schedules. Every pg-boss schedule sets `tz: 'America/Sao_Paulo'`; without it, cron times run in UTC (07:00 BRT would fire at 04:00 BRT).
- `src/app/`: thin routes only. Import from features; put no logic here.

Do not create layer folders (`services/`, `controllers/`, `repositories/`) across features.

Domain logic is plain TypeScript: functions that take a database handle as an argument and never import `next/*` or `server-only`. Server actions (`actions.ts`) and pg-boss job handlers are thin adapters: parse input, call the domain function, then revalidate (actions only). The worker imports feature modules directly.

## Money and numbers

- Never use JavaScript `number` for money, prices, quantities, rates or FX. Use `Decimal` from decimal.js.
- One exception: chart data. Recharts only accepts numbers, so convert `Decimal` to `number` when building chart props, for display only. Never feed a converted value back into a calculation.
- Store them as Postgres `numeric` (quantities `numeric(36,18)`). Wrap driver strings in `Decimal` at the boundary.
- Keep cost basis in the asset's original currency. Convert to BRL only for display, using PTAX (previous business day on holidays).

## TDD

- Start every slice from its issue's Given/When/Then criteria. Write each as a failing test first, then make it pass, then refactor.
- Test at the module's interface: call its domain functions with a real database handle and assert on the database and the result. Do not test through server actions, and do not mock module internals.
- Integration tests use Testcontainers Postgres. Never use SQLite or pg-mem.
- Test isolation: one Postgres container per test run (Vitest `globalSetup`), migrations applied once to a template database, and each test file gets its own database cloned from it (`CREATE DATABASE ... TEMPLATE`). Files run in parallel without sharing data; tests inside a file clean up after themselves.
- Never call real external APIs in tests. Record fixtures and replay them with MSW.
- Domain math (average price, accrual, IR/IOF, TWR) gets unit tests with exact decimal expectations.

## Hard rules

- LLM prompts never contain quantities, prices paid, monetary amounts or account names. Only tickers, percentages, weights, dates and news. Build prompts only in the LLM prompt builder.
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
- Never add `Co-Authored-By: Claude`, "Generated with Claude Code" or any Claude/Anthropic attribution to commits, PRs or issues.

## Agent workflow per issue

1. An implementer subagent works in its own git worktree, red-green-refactor against the issue's acceptance criteria.
2. A reviewer subagent checks the diff against the issue spec and this guide.
3. Open the PR; the human merges.

Independent slices (see the dependency table in `docs/prd.md`) may run in parallel worktrees.

## Commands

TBD in S00 (walking skeleton). Update this section when the scripts exist.
