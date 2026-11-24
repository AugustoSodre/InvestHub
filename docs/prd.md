# InvestHub — Product Requirements (v1)

Status: Draft, agreed 2026-11-23. Deferred ideas live in [roadmap.md](roadmap.md).

## Problem

A Brazilian investor holds assets across many brokers and asset classes: B3 stocks, FIIs, US stocks and ETFs, crypto, investment funds (e.g. XP Trend), Tesouro Direto and bank-issued fixed income. There is no single place that:

- keeps the full purchase history (when, how much, at what price),
- values everything consistently in BRL,
- tells you what happened to *your* holdings this week and why.

## User

A single user (the owner), running the app locally. The data model carries a `userId` so multi-user stays possible, but v1 has no signup, auth or tenancy.

## Goals

1. Record every portfolio event in a ledger and derive positions, average price and P&L from it.
2. Value the whole portfolio daily in BRL, with history and benchmarks.
3. Surface relevant news, a weekly AI digest and alerts for the assets held.
4. Use only free-tier data sources and LLMs.
5. Serve as a public portfolio project: clean vertical slices, TDD, documented decisions.

## v1 scope

### Assets

| Type | Identifier | Price source |
|---|---|---|
| `BR_STOCK`, `FII`, `BDR`, `BR_ETF` | ticker@B3 | brapi (token), Yahoo fallback |
| `US_STOCK`, `US_ETF` | ticker@exchange | Yahoo, Finnhub |
| `CRYPTO` | CoinGecko id | CoinGecko |
| `INVESTMENT_FUND` | CNPJ | CVM Informe Diário |
| `TESOURO` | title + maturity | Tesouro Transparente |
| `CDB`, `LCI`, `LCA`, `LC`, `CRI`, `CRA` | issuer + terms | Fixed-income calculator |

Assets are added from a typed catalog by searching. The app resolves type and price source; the user can override.

### Ledger

- Event types: buy, sell, dividend, JCP, split, bonus shares, fee.
- Every event belongs to an **Account** (broker/exchange, country, currency).
- Positions, average price, realized and unrealized P&L are derived, never stored as truth.
- Input: manual entry and import of the B3 Área do Investidor spreadsheet.
- Dividends and corporate actions found by the worker become **pending events**. The user confirms them; nothing is written automatically.

### Money

- Display currency: BRL (switchable to USD).
- Cost basis is kept in the asset's original currency. The BRL cost of each event uses the PTAX of its trade date; current market value uses the latest PTAX. BRL P&L therefore includes the FX effect, which a Brazilian investor actually gains or loses. PTAX falls back to the previous business day.
- Postgres `numeric` and decimal.js. No floating-point money anywhere.

### Fixed income

- Indexers: Pré (fixed % a.a.), Pós (% of CDI, or Selic), IPCA+ (spread + IPCA).
- Accrual on 252 business days per year using the B3 holiday calendar. CDI and IPCA come from BCB SGS (series 12 and 433).
- Show gross and estimated net value. Net applies the regressive income tax (22.5% up to 180 days, 20% up to 360, 17.5% up to 720, then 15%) and IOF within the first 30 days. LCI, LCA, CRI and CRA are exempt from income tax for individuals. Tesouro Direto is not exempt.
- Tesouro Direto is valued at the daily market (sell) price, with the contracted rate shown next to it.

### Performance

- Per-position P&L: unrealized, realized and income received.
- Portfolio return as TWR (time-weighted return).
- Benchmarks: CDI, IBOV and S&P 500 converted to BRL.
- A daily end-of-day snapshot is stored from day one (brapi free tier keeps only ~3 months of history). Older history is backfilled from Yahoo.
- Every displayed price shows its "as of" date. Fund quotas lag about one business day.

### Research

- **News feed per holding** from Google News RSS, InfoMoney, Money Times, Valor and Finnhub. Show headline, snippet and link only.
- **Weekly digest**, Monday 07:00 BRT, in PT-BR, stored for history:
  - portfolio change for the week vs benchmarks,
  - top movers and why, citing news links,
  - upcoming events (dividend dates, fixed-income maturities).
  - A "generate now" button exists for testing.
- **Alerts**, with per-asset thresholds:
  - daily move of ±5% (default),
  - fato relevante or earnings, best effort from news (CVM IPE data is only weekly and is used for later confirmation),
  - dividend or JCP announcement.
- Delivery: in-app and Telegram.
- Retrieval is structured SQL (by ticker and date range). No vector RAG in v1 ([ADR 0003](adr/0003-no-vector-rag-in-v1.md)).
- The LLM never receives quantities or monetary amounts, only tickers, percentages, weights and news ([ADR 0005](adr/0005-llm-privacy-no-amounts.md)).

### Providers

All free tier, each behind an adapter with recorded fixtures. Details and terms of use are in [ADR 0004](adr/0004-free-data-providers-and-tos.md). API keys stay server-side and are supplied by the user.

### Deployment and demo mode

- Real use: local, `docker compose up`. The app only listens on localhost.
- Public demo: Vercel with `DEMO_MODE=true`, which serves seeded fake data and blocks all writes. No live third-party feeds in the demo (terms of use).
- The demo reads from a hosted free-tier Postgres (e.g. Neon or Supabase), filled by a seed script. The worker is not deployed, so no provider adapter ever runs in the demo.

## Non-goals (v1)

Multi-user and auth, tax reports (DARF, IRPF), debêntures marked to market, broker-specific CSV importers, crypto exchange APIs, new-asset suggestions, email delivery. See [roadmap.md](roadmap.md).

## Slices

Each slice is a vertical cut (UI, logic, database, tests) tracked as one GitHub issue titled `Sxx · <name>` in milestone `v1`.

| ID | Slice | Depends on |
|---|---|---|
| S00 | Walking skeleton: Next.js, Drizzle, Postgres (compose), worker, Vitest + Testcontainers, CI | — |
| S01 | Accounts: create and list brokerage accounts | S00 |
| S02 | Asset catalog: search and add an asset (BR stock first) | S00 |
| S03 | Record a buy, see the position with average price (tracer bullet) | S01, S02 |
| S04 | Record a sell, realized P&L | S03 |
| S05 | Daily price snapshot job, market value and unrealized P&L (BR) | S03 |
| S06 | US assets and PTAX, consolidated BRL view | S05 |
| S07 | Crypto (CoinGecko) | S05 |
| S08 | Investment funds (CVM quotas) | S05 |
| S09 | Tesouro Direto (market price) | S05 |
| S10 | Fixed-income calculator: Pré, %CDI, IPCA+, B3 holiday calendar | S05 |
| S11 | Gross vs net value (IR, IOF, LCI/LCA exempt) | S10 |
| S12 | B3 spreadsheet import | S04 |
| S13 | Dividend and corporate-action suggestions, user confirms | S05 |
| S14 | History chart, TWR, benchmarks (CDI, IBOV, S&P in BRL) | S06, S10, S13 |
| S15 | News ingestion and per-holding feed | S03 |
| S16 | LLM provider interface and weekly digest | S14, S15 |
| S17 | Alerts engine (price move, fato relevante, dividend), in-app | S05, S13, S15 |
| S18 | Telegram delivery for alerts and digest | S16, S17 |
| S19 | Demo mode, seed data, hosted Postgres, Vercel deploy | S18 (in practice all of S01–S18) |
| S20 | README polish: architecture diagram, ADR index, screenshots | S19 |

After S05, slices S07, S08, S09 and S10 are independent and can run in parallel. S15 can run alongside S12 and S13.

S10 owns the BCB SGS adapter and the stored CDI and IPCA series; S14 reuses them for the CDI benchmark. S14 needs S13 for income received, and through S14 the digest (S16) gets fixed-income maturities (S10) and dividend dates (S13).
