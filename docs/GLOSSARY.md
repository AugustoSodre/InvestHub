# Glossary

Domain terms as used in this codebase. Brazilian market terms keep their Portuguese names.

## Market and financial terms

**BDR** (Brazilian Depositary Receipt): a B3-listed certificate backed by a foreign share, e.g. `AAPL34`. Asset type `BDR`, priced in BRL.

**CDI** (Certificado de Depósito Interbancário): Brazil's interbank overnight rate. The benchmark for post-fixed fixed income ("110% do CDI"). Daily values come from BCB SGS series 12.

**CNPJ**: Brazilian company/fund tax ID. The natural key for `INVESTMENT_FUND` assets (the fund class CNPJ in CVM data).

**CDB / LCI / LCA / LC / CRI / CRA**: bank- or securitizer-issued credit products held to maturity. Valued by the fixed-income calculator, not by a market price. LCI and LCA are exempt from income tax for individuals.

**Fato relevante**: a material-fact filing a listed company must publish (CVM). Triggers an alert. Detected best-effort from news; CVM IPE data confirms it later because it updates only weekly.

**FII** (Fundo de Investimento Imobiliário): a B3-listed real-estate fund, traded like a stock (e.g. `HGLG11`). Asset type `FII`.

**Informe Diário**: CVM's daily report of investment fund quotas (`VL_QUOTA`) and net assets, published as monthly ZIP files. Price source for `INVESTMENT_FUND`. Lags about one business day.

**IOF** (Imposto sobre Operações Financeiras): tax on fixed-income gains redeemed within the first 30 days, on a declining daily table.

**IPCA**: Brazil's official consumer inflation index. Monthly values from BCB SGS series 433. Used by IPCA+ products and Tesouro IPCA+.

**IR regressivo**: the regressive income-tax table on fixed-income gains: 22.5% (up to 180 days), 20% (181–360), 17.5% (361–720), 15% (over 720).

**JCP** (Juros sobre Capital Próprio): a Brazilian form of shareholder payout, similar to a dividend but taxed at source. A ledger event type of its own.

**Pré / Pós / IPCA+**: the three fixed-income indexers. Pré: fixed annual rate. Pós: percentage of CDI (or Selic). IPCA+: IPCA plus a fixed spread.

**Preço médio** (average price): the weighted average acquisition cost of a position, including fees, in the asset's original currency. Buys change it; sells do not.

**PTAX**: the official USD/BRL rate published daily by Banco Central. Used to convert USD values to BRL. No rate on weekends or holidays, so use the previous business day.

**Selic**: Brazil's policy interest rate. Indexer for Tesouro Selic.

**SGS** (Sistema Gerenciador de Séries Temporais): Banco Central's free time-series API. Source of CDI and IPCA.

**Tesouro Direto**: Brazilian government bonds sold to individuals (Tesouro Selic, Prefixado, IPCA+). Asset type `TESOURO`, valued at the daily market sell price from Tesouro Transparente, with the contracted rate shown alongside.

**TWR** (Time-Weighted Return): portfolio return that neutralises the effect of deposits and withdrawals by chaining sub-period returns between cash flows. The headline portfolio performance metric.

## Domain concepts

**Account**: where assets are held (a broker or exchange, e.g. XP, Avenue, Binance), with a country and a base currency. Every ledger event belongs to exactly one account.

**Alert**: a notification raised by the worker when a rule fires for a held asset: daily move beyond the threshold (default ±5%), a fato relevante or earnings, or a dividend/JCP announcement. Delivered in-app and via Telegram.

**Asset**: an entry in the typed catalog, identified by type plus natural key (ticker@exchange, CoinGecko id, CNPJ, or fixed-income terms). Carries its price source, which the user can override.

**Digest**: the weekly AI-written summary (Monday 07:00 BRT, PT-BR) of portfolio change, top movers with cited news and upcoming events. Stored for history.

**Feature module**: a folder in `src/features/<module>/` named after one domain concept (e.g. `ledger`, `valuation`). Holds that concept's UI, server actions, domain logic, queries and tests. See [ADR 0007](adr/0007-domain-modules-next-free-core.md).

**Ledger event**: an immutable record of something that happened to a position: buy, sell, dividend, JCP, split, bonus shares, fee. Has date, quantity, price, currency and account. Positions are derived from ledger events.

**Pending event**: a ledger event suggested by the worker (e.g. a detected dividend or split) that is not part of the ledger until the user confirms it.

**Position**: the derived holding of one asset in one account (or consolidated): quantity, average price, realized and unrealized P&L, income received. Never stored as the source of truth.

**Snapshot**: a stored end-of-day price (and derived portfolio value) for a date. Taken daily from day one; the basis for history charts and TWR.

**Slice**: a unit of delivery: one GitHub issue `Sxx · <name>` that cuts vertically through UI, logic, database and tests. A slice adds behaviour to one or more feature modules; it is not a folder.
