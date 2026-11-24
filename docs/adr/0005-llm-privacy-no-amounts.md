# 0005. LLM privacy: never send quantities or amounts

- **Status:** Accepted, 2026-11-23

## Context

The digest and research features use a free LLM API. Gemini's free tier states that content may be used to improve Google products and may be read by human reviewers. The portfolio's quantities and monetary amounts are private.

## Decision

- LLM prompts contain only: tickers, catalog asset names (from a provider or the catalog, e.g. "Petrobras PN"), percentages (returns, moves), portfolio weights, dates, and news headlines, snippets and links.
- Fixed-income holdings have no ticker, so the prompt builder generates their label from stored fields: issuer, indexer, rate and maturity (e.g. "CDB Banco Inter · 110% CDI · vence 2028-03").
- LLM prompts **never** contain quantities, prices paid, monetary amounts, account names or any user-typed text (custom names, notes, labels). Free text can hide an amount or an account ("CDB XP 50k reserva").
- All LLM calls go through one provider interface. The provider (Gemini, Groq, OpenRouter, Ollama) is selected with `LLM_PROVIDER`.
- The prompt builder is the single place that assembles LLM input, and it is tested to prove no amounts and no user-typed text leak.

## Consequences

- The digest talks about percentages and weights, not R$ values.
- Swapping to local Ollama (fully private) is a config change.

## Alternatives considered

- **Send everything:** simplest, but leaks private data to a provider that may train on it.
- **Ollama only:** fully private but slower and lower quality on modest hardware, and unavailable in a hosted deploy.
