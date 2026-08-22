# AgroRoot

Gasless USDT funding for verified farm plots in Bolivia. A buyer confirms a plot from a dashboard; the farmer receives USD₮ on Sepolia without paying gas.

Built for the **WDK Gasless — Tether** track.

## Current status

The Express server and SQLite schema are up. Phase 3 (smart account → paymaster quote → UserOperation) is next and lives on `feature/wdk-core`.

## Run locally

```bash
cp .env.example .env
npm install
npm start
```

Health check: [http://localhost:3000/health](http://localhost:3000/health)

## Data model

| Table | Purpose |
| --- | --- |
| `Farmers` | One row per WhatsApp number |
| `Impact_Points` | One PIV per plot photo. Starts as `pending`; funding later writes `status` and `tx_hash` |

## Branches

| Branch | Owner | Work |
| --- | --- | --- |
| `feature/wdk-core` | A | WDK, database, funding endpoints |
| `feature/integration` | B | Twilio webhook, dashboard API, wiring the demo |
| `feature/frontend-content` | C | Static chat mock, sample data |

Do not commit `.env`. RPC, bundler, paymaster, and Twilio secrets stay off this repo.
