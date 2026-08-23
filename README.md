# AgroRoot

Gasless USDT funding for verified farm plots in Bolivia. A buyer confirms a plot from a dashboard; the farmer receives USD₮ on Sepolia without paying gas.

Built for the **WDK Gasless — Tether** track.

## Current status

Express + SQLite are up. The isolated WDK script lives at `scripts/wdk-test.js` on `feature/wdk-core`. Do not integrate funding endpoints until that script prints a real Sepolia hash.

## Run locally

```bash
cp .env.example .env
npm install
npm start
```

Health check: [http://localhost:3000/health](http://localhost:3000/health)

## WDK smoke test (Persona A — block 2)

```bash
# 1. Put SEED_PHRASE and TRANSFER_TO in .env (see .env.example)
# 2. Fund the printed smart account with Sepolia USD₮:
#    token 0xd077a400968890eacc75cdc901f0356c943e4fdb
# 3. Run:
npm run wdk:test
```

Uses `@tetherto/wdk-wallet-evm-erc-4337@1.0.0-beta.16` (paymaster token mode on Sepolia). Success = a UserOperation hash in the terminal.

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
