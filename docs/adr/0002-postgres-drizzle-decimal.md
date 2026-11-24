# 0002. PostgreSQL, Drizzle and decimal money

- **Status:** Accepted, 2026-11-23

## Context

The core data is a financial ledger: events belong to assets and accounts, and totals must add up exactly. Prices and quantities range from BRL cents to crypto fractions. Vector search may be needed later (see [0003](0003-no-vector-rag-in-v1.md)).

## Decision

- **PostgreSQL** is the only database.
- **Drizzle ORM** for schema, queries and migrations.
- Money and quantities use Postgres `numeric`. Quantities are `numeric(36,18)` so crypto fractions fit.
- All arithmetic in code uses **decimal.js**. JavaScript `number` is never used for money, prices, quantities or rates.

## Consequences

- Exact arithmetic; constraints and foreign keys protect ledger integrity.
- `numeric` values arrive as strings from the driver and must be wrapped in `Decimal` at the boundary.
- pgvector can be added later in the same database.

## Alternatives considered

- **MongoDB:** poor fit for relational, constraint-heavy ledger data.
- **Prisma:** heavier, and slower in integration tests; Drizzle stays closer to SQL.
- **Floats / integer cents:** floats are wrong (`0.1 + 0.2`); integer cents cannot represent crypto quantities or fund quotas.
