# AgroRoot 🌱

**Verified environmental impact, paid to farmers who have never owned crypto.**

A farmer photographs their plot in a chat app. A company buys that proof of impact. USD₮ lands in the farmer's smart account — no wallet to install, no seed phrase to guard, no ETH to buy, no gas to pay.

> Built for **Aleph Hackathon 2026** — **WDK Gasless Track** (Tether).
> Module: [`@tetherto/wdk-wallet-evm-erc-4337`](https://www.npmjs.com/package/@tetherto/wdk-wallet-evm-erc-4337) · ERC-4337 account abstraction · Candide paymaster · Ethereum Sepolia.

---

## 🎥 Video demo

▶️ (https://www.youtube.com/watch?v=ZIhIiJaOOWc)

---

## 📌 Executive summary

Two groups need each other and cannot transact:

- **Rural farmers** preserve land but are unbanked. They have no way to be paid for the environmental value they create.
- **Companies** must prove real ESG impact, and paper certificates are not proof.

**AgroRoot** turns a geolocated photo into a **PIV** — a *Punto de Impacto Verificado* (Verified Impact Point) — that a company can buy for a fixed 25 USD₮. The payment settles directly into an ERC-4337 smart account derived for that farmer.

The hard part is not the payment. It is that **receiving money on-chain normally requires already holding crypto to pay for gas** — a circular dependency that excludes precisely the people this is built for. AgroRoot breaks it with a token paymaster: the network fee is quoted and paid **in USD₮ by the treasury**, so the farmer never holds, buys, or spends a native token at any point in the flow.

---

## 🎯 WDK integration — permalinks

**Judges: start here.** Every WDK call in the project lives in one file, [`src/services/wdkService.js`](src/services/wdkService.js).

| What | Where |
| --- | --- |
| Package import | [`wdkService.js#L104-L106`](src/services/wdkService.js#L104-L106) |
| Wallet manager construction | [`wdkService.js#L107`](src/services/wdkService.js#L107) |
| ERC-4337 config (paymaster, token, Safe modules, fee caps) | [`wdkService.js#L40-L54`](src/services/wdkService.js#L40-L54) |
| `getAccount(index)` → smart account derivation | [`wdkService.js#L140`](src/services/wdkService.js#L140) |
| `getAddress()` → farmer's counterfactual address | [`wdkService.js#L141`](src/services/wdkService.js#L141) |
| `quoteTransfer()` → **gas priced in USD₮ before confirming** | [`wdkService.js#L222-L226`](src/services/wdkService.js#L222-L226) |
| `getTokenBalance()` → treasury solvency check | [`wdkService.js#L228`](src/services/wdkService.js#L228) |
| `transfer()` → **the one place money moves** | [`wdkService.js#L235-L239`](src/services/wdkService.js#L235-L239) |
| `waitForTransaction()` → **on-chain confirmation before settling** | [`wdkService.js#L247-L249`](src/services/wdkService.js#L247-L249) |
| `dispose()` → wallet teardown | [`wdkService.js#L112`](src/services/wdkService.js#L112) |

Flow: `createSmartAccountIfNeeded(chatId)` → `getFeeQuote(amount)` → `sendFunding(pivId, amount)`.

The wallet is constructed inside `withWallet()` and disposed in a `finally` block, so no request can leak an open wallet handle.

---

## 🔄 How it works

```text
┌────────────────┐   photo + location    ┌──────────────────────────┐
│    Farmer      │──────────────────────▶│  Telegram bot (polling)  │
│   (Telegram)   │                       │  rate-limit: 1 open PIV  │
└────────────────┘                       └────────────┬─────────────┘
        ▲                                             │ writes
        │                                             ▼
        │                                 ┌───────────────────────┐
        │                                 │  SQLite               │
        │                                 │  Farmers · PIVs       │
        │                                 └───────────┬───────────┘
        │                                             │ reads
        │                                             ▼
        │                                 ┌───────────────────────┐
        │                                 │  Company dashboard    │
        │                                 │  pending PIVs + photo │
        │                                 └───────────┬───────────┘
        │                                             │ 1. quoteTransfer()
        │                                             ▼
        │                             ╔═══════════════════════════════╗
        │                             ║  Fee shown in USD₮            ║
        │                             ║  BEFORE the buyer confirms    ║
        │                             ╚═══════════════┬═══════════════╝
        │                                             │ 2. transfer()
        │                                             ▼
        │                                 ┌───────────────────────┐
        │                                 │  WDK · ERC-4337       │
        │                                 │  UserOperation        │
        │                                 │  paymaster pays gas   │
        │                                 └───────────┬───────────┘
        │                                             │ Sepolia
        │       3. receipt + Etherscan link           ▼
        └─────────────────────────────  USD₮ → farmer's smart account
```

1. **Farmer** sends a photo and a location to the bot. No app install, no signup, no password — identity *is* the chat.
2. A **PIV** is created as `pending` and appears in the company dashboard with the real photo and coordinates.
3. **Company** opens the purchase dialog. The paymaster fee is quoted **in USD₮ and displayed before the confirm button is enabled**.
4. On confirm, a **UserOperation** moves 25 USD₮ from the treasury smart account to the farmer's. The paymaster settles the gas and is reimbursed in USD₮.
5. The bot messages the farmer with the amount and the **Etherscan receipt**.

---

## 🏗️ Architecture

Two processes share one SQLite database:

| Process | Command | Role |
| --- | --- | --- |
| Telegram bot | `npm run bot` | **Receives** photos and locations; writes `Farmers` / `Impact_Points` |
| Express server | `npm start` | Serves the dashboard, executes WDK payments, **sends** the payment receipt |

They are separate by necessity, not by accident. The bot uses long polling; if the HTTP server also instantiated it, both would poll the same token and Telegram would answer `409 Conflict`. The server therefore sends messages through the Telegram HTTP API in [`src/services/notifier.js`](src/services/notifier.js) rather than importing the bot.

That file is also the **only** module that knows the messaging channel is Telegram. Business logic — PIVs, database, WDK — never references it, so the channel is replaceable without touching the payment path.

```
bot.js                    receives: photo + location → PIV
src/
├── server.js             Express app, static dashboard, error handler
├── routes/pivs.js        HTTP surface (thin: validate → service → respond)
├── services/
│   ├── wdkService.js     ← every WDK call lives here
│   └── notifier.js       ← every Telegram send lives here
├── db/
│   ├── index.js          connection, schema bootstrap, migrations
│   ├── pivs.js           queries + PIV state transitions
│   └── schema.sql
public/                   dashboard (no framework, no bundler)
scripts/wdk-test.js       isolated WDK smoke test
```

---

## 🧰 Stack

| Layer | Choice |
| --- | --- |
| Runtime | Node.js ≥ 22 |
| HTTP | Express 5 |
| Database | SQLite via the built-in `node:sqlite` — no external database, no ORM |
| Wallet | `@tetherto/wdk-wallet-evm-erc-4337` `1.0.0-beta.16` |
| Account abstraction | ERC-4337 · Safe modules `0.3.0` |
| Bundler + paymaster | Candide (Pimlico supported by config swap) |
| Network | Ethereum Sepolia (`11155111`) |
| Messaging | `node-telegram-bot-api` `0.67.0` (long polling) + Telegram HTTP API |
| Frontend | Hand-written HTML, CSS and JavaScript — no framework, no build step |

No bundler, no ORM, no Docker, no microservices. The only runtime dependencies are WDK, Express, dotenv and the Telegram client.

---

## ⚙️ Quick start

Requires **Node.js ≥ 22** (for the built-in `node:sqlite`).

```bash
npm install
cp .env.example .env      # then fill it in — see below
```

Two terminals:

```bash
npm start        # dashboard + API on http://localhost:3000
```

```bash
npm run bot      # Telegram bot (long polling)
```

| URL | What |
| --- | --- |
| `http://localhost:3000` | Company dashboard |
| `http://localhost:3000/chat-simulado.html` | Static chat mock for the demo video |
| `http://localhost:3000/health` | Database health check |

### Environment variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `TELEGRAM_BOT_TOKEN` | yes | Bot token from [@BotFather](https://t.me/BotFather) |
| `SEED_PHRASE` | for payments | BIP-39 seed owning the treasury and deriving farmer accounts |
| `RPC_URL` | for payments | Sepolia JSON-RPC endpoint |
| `BUNDLER_URL` / `PAYMASTER_URL` | for payments | ERC-4337 bundler and paymaster service |
| `PAYMASTER_ADDRESS` | for payments | Paymaster contract |
| `PAYMASTER_TOKEN_ADDRESS` | for payments | Token the paymaster accepts as gas payment |
| `USDT_TOKEN_ADDRESS` | for payments | Token transferred to the farmer |
| `SAFE_MODULES_VERSION` | for payments | `0.3.0` — required by WDK beta.15+ |
| `TRANSFER_MAX_FEE` / `TRANSACTION_MAX_FEE` | no | Fee ceiling in base units; aborts if a quote exceeds it |
| `ACCOUNT_INDEX` | no | Treasury HD index (default `0`) |
| `PIV_PRICE_USDT` | no | Fixed price per PIV (default `25`) |

`.env` is gitignored. No seed phrase, token or API key is committed to this repository.

### Isolated WDK smoke test

Verifies the wallet layer alone, with no HTTP server and no database:

```bash
npm run wdk:test
```

It prints the treasury smart account address, its USD₮ balance, the paymaster quote, and — unless `WDK_DRY_RUN=true` — submits a real UserOperation and prints the hash.

---

## 🔌 API

```bash
# PIVs awaiting a buyer — feeds the dashboard
curl -sS http://localhost:3000/api/pivs/pending

# Filter by status
curl -sS 'http://localhost:3000/api/pivs?status=funded'

# The farmer's plot photo, proxied from Telegram
curl -sS http://localhost:3000/api/pivs/1/photo --output plot.jpg

# Gas quoted in USD₮ — shown before the buyer confirms
curl -sS 'http://localhost:3000/api/pivs/quote?amount=25'

# Buy a PIV: treasury smart account → farmer smart account, gasless
curl -sS -X POST http://localhost:3000/api/pivs/fund/1 \
  -H 'content-type: application/json' \
  -d '{"amount":"25"}'
```

| Method | Path | Notes |
| --- | --- | --- |
| `GET` | `/api/pivs/pending` | PIVs awaiting purchase |
| `GET` | `/api/pivs?status=` | All PIVs, optionally filtered |
| `GET` | `/api/pivs/:id` | Single PIV |
| `GET` | `/api/pivs/:id/photo` | Telegram photo proxy — the bot token is resolved server-side and never reaches the browser |
| `GET` | `/api/pivs/quote?amount=` | Paymaster fee in USD₮ |
| `POST` | `/api/pivs/fund/:id` | Execute the gasless payment |
| `POST` | `/api/pivs` | Seed a PIV without Telegram (development helper) |
| `GET` | `/health` | Database connectivity |

A successful purchase returns the hash, both amounts, and whether the farmer was reached:

```json
{
  "ok": true,
  "pivId": 1,
  "status": "funded",
  "txHash": "0x2827717048dafd8398498c8dbc96f06a5e2c60a95c7927fc105be6b2983f3eee",
  "amountUsdt": "25",
  "feeUsdt": "1.222428",
  "recipient": "0xB70F090Ef693F34D3Cefb3b040BDCFa7538b31B5",
  "finality": "confirmed",
  "block": 11549239,
  "notified": true,
  "explorerUrl": "https://sepolia.etherscan.io/tx/0x2827717048dafd8398498c8dbc96f06a5e2c60a95c7927fc105be6b2983f3eee"
}
```

That is a real response from the run recorded below — `finality: "confirmed"` means the receipt was read back from chain, not assumed.

---

## 🗄️ Data model

Two tables. The Telegram `chatId` is the farmer's identity — there is no login.

```
Farmers ──< Impact_Points
```

| Table | Purpose |
| --- | --- |
| `Farmers` | One row per Telegram chat. Holds the derived `smart_account_address` once WDK creates it. |
| `Impact_Points` | One PIV per plot photo. Stores the Telegram `file_id`, coordinates, status, transaction hash, amount and fee. |

**PIV state machine:**

```
pending ──► funding ──► funded          (confirmed on chain)
   ▲           │
   │           ├──► failed              (before submission — retryable)
   │           │
   └───────────┘    stays in funding    (after submission — held, never retried)
```

`funding` is written *before* the UserOperation is submitted, so a crash mid-transfer leaves a visible in-flight state rather than a silently stuck `pending`. The split after submission is deliberate: see *Design notes*.

---

## 🔗 Live testnet references

**Network:** Ethereum Sepolia (`11155111`)

### Executed gasless payouts

Two farmers onboarded through Telegram, three payouts settled on chain. Neither farmer installed a wallet, held a key, or acquired a native token.

| PIV | Amount | Gas paid in USD₮ | Transaction |
| --- | --- | --- | --- |
| #1 | 25 USD₮ | 1.222428 | [`0x28277170…983f3eee`](https://sepolia.etherscan.io/tx/0x2827717048dafd8398498c8dbc96f06a5e2c60a95c7927fc105be6b2983f3eee) — block `11549239` |
| #3 | 25 USD₮ | 1.270396 | [`0x2584bd0e…fe9d1f40`](https://sepolia.etherscan.io/tx/0x2584bd0e08c23380cbc3562af7bac0d6b207e3f5ee702b4eb022b65efe9d1f40) |
| #4 | 25 USD₮ | 1.217926 | [`0x06cad040…6d86e875`](https://sepolia.etherscan.io/tx/0x06cad0407473a1487199c8a2e832e78ee1f043dc0c27e739a8a0c6b16d86e875) |

75 USD₮ delivered for **3.71 USD₮ of gas — all of it denominated and settled in USD₮**, none of it paid by a farmer.

### The proof, in balances

| Account | Address | USD₮ | **Native ETH** |
| --- | --- | ---: | ---: |
| Treasury | [`0xcb1Ace5D…FABbD72`](https://sepolia.etherscan.io/address/0xcb1Ace5D6cc081Aa441303938F68291B2FABbD72) | 15.95 | **0** |
| Farmer 1 | [`0xB70F090E…538b31B5`](https://sepolia.etherscan.io/address/0xB70F090Ef693F34D3Cefb3b040BDCFa7538b31B5) | 51.00 | **0** |
| Farmer 2 | [`0x281DF968…c873Bf83`](https://sepolia.etherscan.io/address/0x281DF96879E06f2CB100Cd4a061C5E54c873Bf83) | 25.00 | **0** |

Both farmers hold USD₮ and **zero native ETH**. They were paid without ever acquiring, holding, or spending the network's gas token — which is the entire claim of this build, stated as a number rather than a promise. The treasury holds no ETH either: the paymaster fronted the gas and was reimbursed in USD₮.

### Contracts

| What | Address |
| --- | --- |
| USD₮ test token (transfer + gas payment) | [`0xd077a400968890eacc75cdc901f0356c943e4fdb`](https://sepolia.etherscan.io/token/0xd077a400968890eacc75cdc901f0356c943e4fdb) |
| Paymaster | [`0x8b1f6cb5d062aa2ce8d581942bbb960420d875ba`](https://sepolia.etherscan.io/address/0x8b1f6cb5d062aa2ce8d581942bbb960420d875ba) |

---

## 📐 Design notes

**Fixed price, no marketplace.** Every PIV is 25 USD₮. Auctions and pricing discovery are deliberately out of scope — the subject of this build is the payment rail, not a market.

**One open PIV per farmer.** The bot refuses a second submission while one is still `pending` or `funding`. Without it, a single chat could flood the buyer's queue.

**A bundler acknowledgement is not a settlement.** `transfer()` returning a hash only means the UserOperation was accepted; it can still revert on chain or be dropped. The PIV is settled only after `waitForTransaction(hash, { target: 'confirmed' })` returns, and a receipt with `success === false` or `finality === 'dropped'` fails the payment instead of recording it.

**A submitted payment is never retried.** The hash is written to the database the moment the bundler accepts it, before the wait begins. If anything then fails — including a confirmation timeout — the PIV stays in `funding` rather than moving to `failed`, because `failed` is retryable and a retry would pay the farmer twice. It is held for a human to resolve against the explorer, with the hash already saved.

**A failed notification never fails a payment.** Once the transfer confirms, the money has moved on-chain and that fact cannot be undone by a messaging outage. The Telegram call is wrapped in its own try/catch and the result surfaces as `notified: false` rather than an error — the payment response tells the truth about both independently.

**Fee ceilings are enforced before signing.** `TRANSFER_MAX_FEE` and `TRANSACTION_MAX_FEE` cap what the paymaster may charge. A quote above the ceiling aborts the UserOperation instead of paying it.

**Solvency is checked against amount + fee.** The treasury balance is verified to cover *both* before submission, so an underfunded treasury fails with a readable message instead of a reverted operation.

**Degrades honestly without credentials.** With no WDK configuration, the dashboard and all read endpoints still work; `quote` and `fund` return a clear error that the UI displays. No fake hash and no invented balance is ever produced.

---

## ⚠️ Known limits

Stated plainly, because a hackathon build that hides its edges is worse than one that does not have them.

- **Farmer wallets are custodial.** Every account is derived from the treasury's single seed at HD index `farmer.id`. The farmer controls no key. This is what makes the zero-onboarding demo possible, and it is the first thing that would change in production: a real deployment gives each farmer their own seed, or a smart account with a farmer-held signer.
- **Photo verification is mocked.** Every submission is approved by default. Real verification — satellite cross-referencing, EXIF and coordinate validation, human review — is the natural next module and is intentionally not simulated here.
- **The messaging channel is Telegram, not WhatsApp.** Telegram needs no number provisioning, which is why the prototype uses it. The channel is isolated behind `notifier.js`, so a WhatsApp Business API deployment replaces that one file and nothing else.
- **Location is trusted as sent.** Telegram location can be spoofed by a modified client. Binding a PIV to hardware-attested coordinates is out of scope here.
- **Single-process bot.** The bot polls from one host. Horizontal scaling needs webhooks instead of polling — a configuration change, not a redesign.

---

## 📄 License

MIT
