# InvestHub

A personal investment hub for a Brazilian investor: one ledger for B3 stocks, FIIs, US stocks and ETFs, crypto, investment funds, Tesouro Direto and bank fixed income, valued daily in BRL, with news, a weekly AI digest and alerts about what you hold.

> **Status: early development.** The walking skeleton (S00) is in place; feature slices come next.

## Planned features (v1)

- **Ledger** of buys, sells, dividends, JCP, splits and fees across multiple brokerage accounts.
- **All major asset classes**: BR stocks, FIIs, BDRs, ETFs, US stocks and ETFs, crypto, investment funds (e.g. XP Trend), Tesouro Direto, CDB, LCI, LCA, LC, CRI, CRA.
- **Daily valuation in BRL** with PTAX conversion, average price, realized and unrealized P&L.
- **Fixed-income calculator** for Pré, %CDI and IPCA+, with gross and estimated net value (IR, IOF).
- **Performance**: TWR vs CDI, IBOV and S&P 500 in BRL.
- **B3 spreadsheet import** and dividend/split suggestions you confirm.
- **Research**: news feed per holding, weekly AI digest, alerts for big moves, fatos relevantes and dividends, in-app and via Telegram.
- **Free tiers only**, and the LLM never sees your amounts.

## Stack

TypeScript · Next.js · pg-boss worker · PostgreSQL · Drizzle · decimal.js · Tailwind · shadcn/ui · Recharts · Vitest · Testcontainers · MSW · Playwright

## How it's built

- **Spec-driven:** each vertical slice is a GitHub issue with Given/When/Then acceptance criteria.
- **Vertical slices over domain modules:** each slice adds behaviour to a feature module in `src/features/<module>/` (ledger, valuation, …), which holds its UI, logic, queries and tests together.
- **TDD** at each module's interface against a real Postgres.

## Docs

- [Product requirements](docs/prd.md)
- [Glossary](docs/GLOSSARY.md)
- [Architecture decisions](docs/adr/README.md)
- [Roadmap (v2 and later)](docs/roadmap.md)
- [Agent guide](CLAUDE.md)

## Getting started

Needs Node 22 and Docker.

```bash
corepack enable && pnpm install && docker compose up -d --wait && pnpm db:migrate && pnpm dev
```

Open http://localhost:3000. Run the background worker with `pnpm worker`. To add your own free API keys, copy `.env.example` to `.env` and fill it in. See the Commands section of [CLAUDE.md](CLAUDE.md) for tests and other scripts.

## License

[MIT](LICENSE)
