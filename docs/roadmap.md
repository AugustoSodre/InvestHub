# Roadmap: v2 and later

v1 scope lives in [prd.md](prd.md). This file keeps everything consciously deferred, so a decision can be revisited without re-deriving it.

**These items are intentionally NOT tracked as GitHub issues.** When one is pulled into scope, write it as a slice with acceptance criteria and open the issue then.

---

## New-asset suggestions (vector RAG)

- **What:** suggest new assets that fit the current portfolio's profile, with reasoning and sources.
- **Why deferred:** hardest feature to make trustworthy; it should build on the v1 news and digest pipeline once that is stable.
- **Notes from grilling:** this is where pgvector embeddings earn their place (similarity search over assets and news). Postgres already hosts the data, so no second database is needed. See [ADR 0003](adr/0003-no-vector-rag-in-v1.md).

## Chat over the news archive

- **What:** ask free-form questions over stored news and digests.
- **Why deferred:** needs the same embeddings as suggestions; no v1 feature depends on it.
- **Notes from grilling:** build together with or after new-asset suggestions.

## Brazilian tax reports

- **What:** monthly DARF calculation, the R$20k monthly stock-sale exemption, IRPF "bens e direitos" report.
- **Why deferred:** sizeable feature with many edge cases.
- **Notes from grilling:** the v1 ledger (average price, realized P&L) and the fixed-income IR/IOF logic are the foundation and should be reused.

## Debêntures marked to market

- **What:** support debêntures valued at secondary-market prices.
- **Why deferred:** they trade on a secondary market, so the v1 fixed-income calculator would mislead.
- **Notes from grilling:** alternative considered: calculator-only with a "not marked to market" warning.

## Broker CSV importers and crypto exchange APIs

- **What:** one importer per broker export format, plus read-only exchange APIs (e.g. Binance).
- **Why deferred:** v1 covers input with manual entry and the B3 spreadsheet. Most Brazilian brokers (XP included) have no public retail API.
- **Notes from grilling:** each importer is its own vertical slice.

## Multi-user and authentication

- **What:** signup, login, per-user data isolation.
- **Why deferred:** v1 is a personal tool, local only, plus a read-only demo.
- **Notes from grilling:** the schema already carries `userId` to keep this possible.

## Email delivery

- **What:** alerts and digest by email.
- **Why deferred:** in-app plus Telegram covers v1 with less setup.

## Alpha Vantage open-source tier

- **What:** apply for Alpha Vantage's unlimited tier for verified open-source/educational projects.
- **Why deferred:** free tier is only 25 requests/day and the application process is undocumented (contact support@alphavantage.co).
- **Notes from grilling:** could replace or back up Yahoo for US data.
