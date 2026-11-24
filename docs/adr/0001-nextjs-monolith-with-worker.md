# 0001. Next.js monolith with a pg-boss worker

- **Status:** Accepted, 2026-11-23

## Context

InvestHub is a single-user app with scheduled background work: daily price snapshots, news ingestion, the weekly digest and alerts. It is built in vertical slices with TDD, mostly by AI agents, and should stay free to run. Real use is local; a read-only demo is deployed publicly.

## Decision

- One **Next.js** (App Router, TypeScript) application, not a monorepo.
- A separate **worker** entrypoint (`src/worker/`) in the same repo runs scheduled and queued jobs with **pg-boss** (Postgres-backed queue, no Redis).
- Each slice lives in `src/features/<slice>/` with its UI, server actions, domain logic, database queries and tests. Route files in `src/app` stay thin.
- Shared provider adapters live in `src/integrations/<provider>/`; cross-cutting helpers in `src/shared/`.
- Package manager: pnpm via corepack. Local run: `docker compose up`.
- UI: Tailwind, shadcn/ui, Recharts.

## Consequences

- The least code between an issue and a working feature; slices map onto folders cleanly.
- The public demo deploys to Vercel without the worker (it uses seeded data).
- Long-running jobs never run inside request handlers.
- Backend structure is less formal than NestJS; conventions in `CLAUDE.md` keep it consistent.

## Alternatives considered

- **Next.js + NestJS API + worker (Turborepo):** popular in Brazilian job ads, but about twice the boilerplate, and NestJS's layered defaults work against vertical slices.
- **Vite React SPA + NestJS:** same costs, plus a separate frontend deploy.
- **Bootstrap for UI:** dated look and a weaker fit with React.
