# 0007. Domain modules with a Next-free core

- **Status:** Accepted, 2026-11-23. Amended 2026-11-24: input validation moved from server actions into domain functions (S01, #27).
- **Supersedes:** the folder-per-slice layout in [0001](0001-nextjs-monolith-with-worker.md) and the "call the server action" test entry point in [0006](0006-testing-strategy.md). Everything else in those ADRs stands.

## Context

Two problems surfaced in an architecture review before any code was written:

1. **Folder per slice scatters the ledger.** The slice table in the PRD is a delivery schedule. If each issue gets its own folder (`record-buy`, `record-sell`, `b3-import`, `pending-events`), each needs to know what a ledger event does to a position, and those rules get copied across four or five folders.
2. **Next-only code can't be reused.** The worker is a plain Node process, and Vitest runs outside a request. Logic that sits in `"use server"` files and calls `revalidatePath`, `cookies()` or imports `server-only` can't be called from either. `revalidatePath` throws outside a request, so testing through server actions breaks on the first action that revalidates.

## Decision

- `src/features/<module>/` holds one **feature module** per domain concept from the glossary: `accounts`, `catalog`, `ledger`, `valuation`, `fixed-income`, `performance`, `research`, `alerts`, `notifications`. Each keeps its own UI, server actions, domain logic, queries and tests together.
- A **slice** is a unit of delivery (one issue). It adds behaviour to one or more feature modules and never gets its own folder. Example: S12 (B3 import) adds an importer inside `ledger` that produces ledger events through the same entry point as manual entry.
- **Domain logic is plain TypeScript.** Domain functions take a database handle (and any provider they need) as arguments and never import `next/*` or `server-only`.
- **Server actions and job handlers are thin adapters.** A server action reads its raw input (for example `FormData`), calls a domain function, then revalidates. A pg-boss handler calls the same domain function.
- **Domain functions validate their own input** (zod), taking it as `unknown` and returning field-level errors. Tests at the module interface then cover validation, and the worker gets the same checks as the web app.
- **Tests call domain functions** with a Testcontainers Postgres handle and assert on the database and the returned result. They don't go through server actions.

## Consequences

- All rules for one concept live in one folder: fix once, fixed for the web app, the worker and every test.
- The worker imports feature modules directly; no logic is duplicated for background jobs.
- Tests don't need the Next.js runtime.
- S00 adds a lint rule (`no-restricted-imports`) so domain files can't import `next/*` or `server-only`. Only `actions.ts`, UI files and `src/app` may.
- A slice may touch several modules, so parallel worktrees must still check the dependency table in the PRD.

## Alternatives considered

- **Folder per slice (original 0001 layout):** maps issues onto folders neatly, but scatters shared rules (positions, valuation) across slices.
- **Layer folders (`services/`, `repositories/`):** rejected in 0001 and still rejected; it splits one concept across layers.
- **Test through server actions with Next internals mocked:** brittle, and it tests the adapter instead of the logic.
