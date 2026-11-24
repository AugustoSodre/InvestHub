# 0006. Testing strategy

- **Status:** Accepted, 2026-11-23

## Context

The project uses TDD and vertical slices, with most code written by AI agents. Tests must survive refactors, run without network access to third parties, and catch money-math errors.

## Decision

- **Vitest** for unit and integration tests.
- **Testcontainers** starts a real Postgres in Docker for integration tests.
- **MSW** replays recorded provider fixtures. Tests never call real external APIs.
- **Playwright** for a few critical end-to-end flows only, run on `main`.
- TDD happens at the **slice boundary**: call the server action, handler or job, then assert on the real database and returned output. Do not mock a slice's internals.
- Each issue's Given/When/Then acceptance criteria become failing tests first (red, green, refactor).
- Pure domain logic (average price, accrual, IR/IOF, TWR) also gets focused unit tests with exact decimal expectations.

## Consequences

- Tests check behavior, not structure, so refactors don't break them.
- Integration tests need Docker locally and in CI (GitHub-hosted runners support it).
- Fixtures must be refreshed by hand when a provider changes its format.

## Alternatives considered

- **pg-mem / SQLite in tests:** faster, but diverges from Postgres `numeric` and SQL behavior.
- **Mock-heavy unit tests:** brittle under refactor and prove little.
