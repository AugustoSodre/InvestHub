# 0004. Free data providers and their terms of use

- **Status:** Accepted, 2026-11-23
- Facts checked on 2026-11-23 against official pages and live calls. Re-check before relying on limits.

## Context

The project runs on free tiers only. Each asset class needs a price source, and research features need news and an LLM. Several free sources restrict use to personal, non-commercial purposes.

## Decision

Every provider sits behind an adapter in `src/integrations/<provider>/` with recorded fixtures. Keys live in `.env`, server-side only, and each user supplies their own.

| Need | Primary | Fallback / notes |
|---|---|---|
| BR stocks, FIIs, ETFs, BDRs | brapi (free token) | Yahoo |
| US stocks, ETFs | Yahoo | Finnhub for real-time quotes and news |
| History before day one | Yahoo | — |
| Crypto | CoinGecko demo key | attribution required in UI |
| Investment funds | CVM Informe Diário | — |
| Tesouro Direto | Tesouro Transparente | — |
| USD/BRL | BCB PTAX | previous business day on holidays |
| CDI, IPCA | BCB SGS (series 12, 433) | — |
| News | Google News RSS, InfoMoney, Money Times, Valor, Finnhub | — |
| LLM | Gemini free Flash | Ollama (local), swappable |

### Provider facts

- **brapi** (brapi.dev): 15,000 requests/month free, no card. One ticker per call, one request at a time (parallel calls get HTTP 429). Quotes ~30 min delayed. History: 3 months daily; dividends 1 year. Without a token only PETR4, VALE3, MGLU3, ITUB4 work; **FIIs, ETFs and BDRs need a token**. Key must stay server-side. No re-exposing as a feed or proxy; brapi has no B3 data license.
- **Yahoo via `yahoo-finance2`** (unofficial): working and maintained (v4.0.6, Node 22+, server-side only). Covers `.SA` B3 tickers and US. Not endorsed by Yahoo; ToS grey area. Use with caching and a fallback, never as the only source.
- **Finnhub:** 60 calls/min free, US coverage. Real-time US quotes and `/company-news` (North American companies) reported free; candles are premium. **Personal use only**, no redistribution of data or derived results.
- **CoinGecko** demo plan: free key, 10,000 calls/month, 100/min, ~60 s fresh, 1 year history. **Attribution required.**
- **CVM Informe Diário** (ODbL): monthly ZIP of `;`-separated latin1 CSV at `https://dados.cvm.gov.br/dados/FI/DOC/INF_DIARIO/DADOS/inf_diario_fi_YYYYMM.zip`. Current and previous month refresh Mon–Sat 08:00, so quotas lag about one business day. Columns: `TP_FUNDO_CLASSE;CNPJ_FUNDO_CLASSE;ID_SUBCLASSE;DT_COMPTC;VL_TOTAL;VL_QUOTA;VL_PATRIM_LIQ;CAPTC_DIA;RESG_DIA;NR_COTST`. ~31 MB unzipped: download and filter on a schedule, never per request.
- **CVM IPE** (fatos relevantes, comunicados): yearly ZIP at `https://dados.cvm.gov.br/dados/CIA_ABERTA/DOC/IPE/DADOS/ipe_cia_aberta_YYYY.zip`. **Updated weekly only**, so it confirms filings later and cannot drive same-day alerts.
- **BCB PTAX** (no token, no published limits): `https://olinda.bcb.gov.br/olinda/servico/PTAX/versao/v1/odata/CotacaoDolarDia(dataCotacao=@dataCotacao)?@dataCotacao='MM-DD-YYYY'&$format=json`. Weekends and holidays return an empty array: fall back to the previous business day. Use `CotacaoDolarPeriodo` for ranges.
- **Google News RSS** (`https://news.google.com/rss/search?q=...&hl=pt-BR&gl=BR&ceid=BR:pt-419`): **personal, non-commercial feed-reader use only.** OK self-hosted; not for the public demo.
- **Brazilian RSS:** InfoMoney, Money Times, Valor feeds respond. Show headline, short snippet and link only.
- **Gemini free tier:** Flash and Flash-Lite models are free. **Free-tier content may be used to improve Google products and read by human reviewers.** See [0005](0005-llm-privacy-no-amounts.md). Exact per-model rate limits unconfirmed.

## Consequences

- Rate limits shape the design: daily snapshots, caching, sequential brapi calls, scheduled CVM downloads.
- The public demo uses seeded fake data only, never live feeds.
- The UI shows CoinGecko attribution and "as of" dates on prices.
- Tests never call these APIs; they replay fixtures.

## Alternatives considered

- **Paid data (e.g. B3 licensed feeds):** out of budget.
- **Alpha Vantage:** free tier 25 requests/day; open-source tier idea kept in the [roadmap](../roadmap.md).
- **Groq, OpenRouter free models:** viable LLM fallbacks behind the same interface (OpenRouter free: 20/min, 50/day).
