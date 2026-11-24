# 0005. LLM privacy: never send quantities or amounts

- **Status:** Accepted, 2026-11-23

## Context

The digest and research features use a free LLM API. Gemini's free tier states that content may be used to improve Google products and may be read by human reviewers. The portfolio's quantities and monetary amounts are private.

## Decision

- LLM prompts contain only: tickers and asset names, percentages (returns, moves), portfolio weights, dates, and news headlines, snippets and links.
- LLM prompts **never** contain quantities, prices paid, monetary amounts or account names.
- All LLM calls go through one provider interface. The provider (Gemini, Groq, OpenRouter, Ollama) is selected with `LLM_PROVIDER`.
- The prompt builder is the single place that assembles LLM input, and it is tested to prove no amounts leak.

## Consequences

- The digest talks about percentages and weights, not R$ values.
- Swapping to local Ollama (fully private) is a config change.

## Alternatives considered

- **Send everything:** simplest, but leaks private data to a provider that may train on it.
- **Ollama only:** fully private but slower and lower quality on modest hardware, and unavailable in a hosted deploy.
