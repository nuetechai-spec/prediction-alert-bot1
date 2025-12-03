# Prediction Market Alert Bot

> ⚠️ **Not financial advice. Use at your own risk. We do not guarantee profits.**  
> Respect Polymarket & Kalshi Terms of Service. The bot provides informational alerts only and must **not** place trades.

## Overview
Node.js Discord bot that watches Polymarket and Kalshi for short-dated markets (≈1 hour / 24 hours / 7 days to resolution), scores them, and pushes structured alerts into a Discord channel. It is designed to be production-ready, testable, and configurable.

## Features
- Discord alerts via `discord.js` (v14) with embeds + plain-text fallback.
- Scheduled scans (default every 2 minutes) plus `!scan`/`/scan`, `!config`/`/config`, and `!testalert`/`/testalert` commands (admin only).
- Market scoring (0–100) combining liquidity, volume momentum, price movement, time pressure, and bid/ask spread.
- Filters for buckets ≤1 hour, ≤24 hours, ≤7 days, configurable thresholds, and duplicate alert suppression.
- Official API integrations for Polymarket and Kalshi w/ respectful scraping fallback (axios + cheerio) including custom User-Agent, robots awareness, and exponential backoff.
- Modular design: scoring + filters live in `utils.js`, easy to unit test or swap out.
- Logging via `winston`, basic error handling, rate-limit backoff, and descriptive comments for tuning.

## Requirements
- Node.js 18+
- Discord bot token with `MESSAGE CONTENT INTENT` enabled if using prefix commands.
- Optional: Polymarket API key, Kalshi API key/secret for authenticated access (anonymous endpoints may be rate-limited).

## Quick Start
1. `npm install`
2. Copy `.env.example` to `.env` and fill in required variables.
3. (Optional) Update `config.overrides.json` for custom scoring weights or thresholds.
4. `npm start` – runs `node index.js` which boots the bot and scheduled scans.

Exported `main()` allows Cursor or other runtimes to `require('./index').main()` if embedding in larger apps.

## Environment Variables
| Variable | Required | Default | Notes |
| --- | --- | --- | --- |
| `DISCORD_TOKEN` | ✅ | – | Bot token. Never commit. |
| `DISCORD_CLIENT_ID` | ⚠️ | – | Needed to register slash commands (guild-specific). |
| `DISCORD_GUILD_ID` | ⚠️ | – | Guild to register slash commands. |
| `DISCORD_ALERT_CHANNEL_ID` | ✅ | – | Channel ID to post alerts. |
| `DISCORD_ADMIN_ROLE_ID` | optional | – | Role allowed to run admin commands. |
| `DISCORD_OWNER_ID` | optional | – | User ID override for admin access. |
| `POLY_API_KEY` | optional | – | Polymarket API key for better rate limits and access. **See [API_KEY_SETUP.md](./API_KEY_SETUP.md) for detailed setup instructions.** |
| `KALSHI_API_KEY` / `KALSHI_API_SECRET` | optional | – | Basic auth for Kalshi Trading API. |
| `SCAN_INTERVAL_MINUTES` | optional | 2 | Clamp 1–5 minutes. |
| `MIN_CONFIDENCE` | optional | 60 | Minimum score to alert. |
| `MIN_LIQUIDITY` | optional | 750 | Minimum liquidity to alert. |
| `MAX_MARKET_AGE_MINUTES` | optional | 2880 | Skip older markets if creation timestamp provided. |
| `DUPLICATE_SUPPRESSION_MINUTES` | optional | 120 | Cooldown per market ID. |
| `API_TIMEOUT_MS` | optional | 10000 | HTTP timeout. |
| `RATE_LIMIT_PAUSE_MS` | optional | 300000 | Pause between retries when 429/503 encountered. |
| `USER_AGENT` | optional | `PredictionAlertBot/...` | Override with contact info per platform policies. |

See `.env.example` for a copy/paste template. **Do not commit secrets.**

### Optional JSON overrides
Create `config.overrides.json` (same folder as `index.js`) with e.g.:
```json
{
  "scoring": {
    "liquidity": { "benchmark": 10000 },
    "price": { "baseline": 0.18 }
  }
}
```
Values merge into defaults without editing source.

## Running
```bash
npm install
npm start          # launches the bot
npm test           # runs Mocha unit tests
```

Deploy as a long-lived service or use PM2/systemd. Logs emit to stdout; redirect to file if desired.

## Discord Commands
- `!scan` / `/scan` – Initiate immediate scan, post new alerts (respects duplicate suppression).
- `!config` / `/config` – Print current thresholds and channel configuration.
- `!testalert` / `/testalert` – Send sample embed to verify formatting.

Commands require either the configured admin role or the owner ID. With no overrides set, server members with `Manage Guild` permission may run them.

## Scoring Model (utils.js)
Weights (modifiable in code or overrides):
- Liquidity (0–30): compares market liquidity to benchmark (default 5k).
- Volume momentum (0–25): favors strong 1h/24h volume deltas; falls back to 24h volume vs. benchmark.
- Price movement (0–20): magnitude of probability change over 1h/24h windows.
- Time pressure (0–15): higher score as resolution nears (≤1h full score, ≤24h 0.75, ≤7d 0.4).
- Spread efficiency (0–10): tighter bid/ask spreads score higher.

Final score is rounded to 0–100. Embeds color-code confidence: green ≥75, yellow 50–74, orange 30–49, red <30.

## Alert Format
Embeds include:
- Title linking to the market.
- Source author tag (Polymarket / Kalshi) with favicon.
- Fields for expiration (human readable + UTC timestamp), bucket tag (1H/24H/7D + emoji), probability, confidence, liquidity category, and single-line rationale.
- Footer: “Not financial advice. Verify before acting.” timestamped.  
Plain-text fallback mirrors the same data for clients without embed support.

## Data Sources & Fallbacks
- **Polymarket:** uses `https://clob.polymarket.com/markets` (limit configurable) with optional API key. On failure, scrapes the public Next.js payload (`#__NEXT_DATA__`) respectfully (custom User-Agent, honors default robots rules, minimal frequency).
- **Kalshi:** uses `https://trading-api.kalshi.com/v1/markets` (Basic auth if keys provided). Falls back to scraping `https://kalshi.com/markets` Next.js data when necessary.

Both fetchers implement exponential backoff, honor `Retry-After`, and set cooldowns after 429/503 responses to avoid rate-limit abuse.

## Tests & Validation
`npm test` runs Mocha/Chai unit tests covering:
- Confidence scoring breakdown for deterministic sample markets.
- Expiration bucketing (≤1h/24h/7d) logic.

Manual validation checklist:
1. Configure `.env`, run `npm start`.
2. In Discord, invoke `!testalert` – confirm embed layout + disclaimer.
3. Invoke `!scan` – watch console logs for fetch + scoring, ensure channel posts.
4. After an alert, re-run `!scan` – notice duplicates suppressed (log entry + message reply).

`test.js` also exposes a small harness to exercise scoring logic with mocked data.

## Production & Ops Notes
- Duplicate suppression uses in-memory cache keyed by `source:marketId`. Consider Redis or persistent store for multi-process deployments (see inline comments).
- Operational failures (API + fallback) trigger an `[Operational Alert]` message in the alert channel so admins can investigate quickly.
- Logs go to stdout via `winston`. Adjust `LOG_LEVEL` or add file transports as needed.
- Respect platform ToS: scrape only when official APIs fail, keep scan interval ≥1 minute.
- Legal: selling trading signals may be regulated. Comply with local laws; the repository provides no guarantees.

## Legal & Ethical
- **Disclaimer:** This project is strictly informational. “This is not financial advice. Use at your own risk. We do not guarantee profits.” appears in README and every alert.
- Do **not** automate order placement or account actions.
- Always review and comply with Polymarket and Kalshi terms, rate limits, and API usage policies.
- Maintain an accurate contact method (via `USER_AGENT`) if platforms request outreach.