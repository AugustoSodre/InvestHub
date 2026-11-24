# 0003. No vector RAG in v1

- **Status:** Accepted, 2026-11-23

## Context

v1 research features are a per-holding news feed, a weekly digest and alerts. The question was whether to build a RAG (retrieval-augmented generation) pipeline with embeddings.

## Decision

- v1 uses **structured retrieval**: fetch news, de-duplicate, tag by ticker, store in Postgres, then query by ticker and date range.
- The digest prompt receives that structured context (recent news per holding plus percentages and weights) directly. It fits in one prompt.
- No embeddings or vector store in v1.

## Consequences

- Simpler pipeline, deterministic retrieval, easy to test with SQL fixtures.
- No fuzzy "find things similar to X" in v1.
- When new-asset suggestions or chat over the news archive arrive (see [roadmap](../roadmap.md)), add **pgvector** to the existing Postgres.

## Alternatives considered

- **Vector RAG from day one:** adds embedding cost, a free-tier dependency and evaluation complexity for no v1 feature that needs it.
