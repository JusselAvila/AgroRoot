/**
 * Reusable WDK helpers for AgroRoot funding.
 *
 * Contract for Persona B:
 *   createSmartAccountIfNeeded(phone) → { phone, farmerId, smartAccountAddress }
 *   getFeeQuote(amount)               → { amountUsdt, feeUsdt, amountUnits, feeUnits }
 *   sendFunding(pivId, amount)        → { pivId, txHash, amountUsdt, feeUsdt, recipient }
 */

const {
  getFarmerByPhone,
  upsertFarmerByPhone,
  setFarmerSmartAccount,
  getPivById,
  markPivFunding,
  markPivFunded,
  markPivFailed,
} = require("../db/pivs");

const USDT_DECIMALS = 6n;

function requireEnv(name) {
  const value = process.env[name];
  if (!value || !String(value).trim()) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return String(value).trim();
}

function optionalEnv(name, fallback) {
  const value = process.env[name];
  if (value === undefined || value === null || String(value).trim() === "") {
    return fallback;
  }
  return String(value).trim();
}

function buildWdkConfig() {
  return {
    chainId: Number(optionalEnv("CHAIN_ID", "11155111")),
    provider: requireEnv("RPC_URL"),
    bundlerUrl: requireEnv("BUNDLER_URL"),
    paymasterUrl: requireEnv("PAYMASTER_URL"),
    paymasterAddress: requireEnv("PAYMASTER_ADDRESS"),
    safeModulesVersion: optionalEnv("SAFE_MODULES_VERSION", "0.3.0"),
    paymasterToken: {
      address: requireEnv("PAYMASTER_TOKEN_ADDRESS"),
    },
    transferMaxFee: BigInt(optionalEnv("TRANSFER_MAX_FEE", "5000000")),
    transactionMaxFee: BigInt(optionalEnv("TRANSACTION_MAX_FEE", "5000000")),
    onChainIdentifier: optionalEnv("ON_CHAIN_IDENTIFIER", "AgroRoot"),
  };
}

function getUsdtToken() {
  return requireEnv("USDT_TOKEN_ADDRESS");
}

function getTreasuryAccountIndex() {
  return Number(optionalEnv("ACCOUNT_INDEX", "0"));
}

/** Accept "1", "1.5", or already-base-unit integers like "1000000". */
function toUsdtUnits(amount) {
  if (typeof amount === "bigint") {
    return amount;
  }

  const raw = String(amount).trim();
  if (!raw) {
    throw new Error("amount is required");
  }

  if (/^\d+$/.test(raw)) {
    const asInt = BigInt(raw);
    // Values that already look like base units (>= 1 USDT in base units with no dot)
    // are ambiguous; treat bare integers < 1e6 as whole USDT, otherwise as units.
    if (asInt > 0n && asInt < 1_000_000n) {
      return asInt * 10n ** USDT_DECIMALS;
    }
    return asInt;
  }

  if (!/^\d+(\.\d+)?$/.test(raw)) {
    throw new Error(`Invalid USDT amount: ${amount}`);
  }

  const [wholePart, fracPart = ""] = raw.split(".");
  const frac = `${fracPart}000000`.slice(0, Number(USDT_DECIMALS));
  return BigInt(wholePart) * 10n ** USDT_DECIMALS + BigInt(frac || "0");
}

function formatUsdt(units) {
  const value = BigInt(units);
  const base = 10n ** USDT_DECIMALS;
  const whole = value / base;
  const frac = (value % base).toString().padStart(Number(USDT_DECIMALS), "0").replace(/0+$/, "");
  return frac ? `${whole}.${frac}` : `${whole}`;
}

async function withWallet(run) {
  const { default: WalletManagerEvmErc4337 } = await import(
    "@tetherto/wdk-wallet-evm-erc-4337"
  );
  const wallet = new WalletManagerEvmErc4337(requireEnv("SEED_PHRASE"), buildWdkConfig());

  try {
    return await run(wallet);
  } finally {
    wallet.dispose();
  }
}

/**
 * Ensure a farmer row exists for this phone and store their derived smart account.
 * Treasury (ACCOUNT_INDEX) pays; farmer account index = farmer.id (never 0).
 */
async function createSmartAccountIfNeeded(phone) {
  const farmer = upsertFarmerByPhone({ phone });

  if (farmer.smart_account_address) {
    return {
      phone: farmer.phone,
      farmerId: farmer.id,
      smartAccountAddress: farmer.smart_account_address,
      created: false,
    };
  }

  const accountIndex = Number(farmer.id);
  if (accountIndex === getTreasuryAccountIndex()) {
    throw new Error(
      `Farmer id ${accountIndex} collides with treasury ACCOUNT_INDEX; use a different treasury index.`,
    );
  }

  return withWallet(async (wallet) => {
    const account = await wallet.getAccount(accountIndex);
    const smartAccountAddress = await account.getAddress();
    const updated = setFarmerSmartAccount(farmer.id, smartAccountAddress);

    return {
      phone: updated.phone,
      farmerId: updated.id,
      smartAccountAddress: updated.smart_account_address,
      created: true,
    };
  });
}

/**
 * Quote paymaster fee in USD₮ for transferring `amount` (human or base units).
 */
async function getFeeQuote(amount) {
  const amountUnits = toUsdtUnits(amount);
  const token = getUsdtToken();

  return withWallet(async (wallet) => {
    const treasury = await wallet.getAccount(getTreasuryAccountIndex());
    const recipient =
      optionalEnv("TRANSFER_TO", "") || (await treasury.getAddress());

    const quote = await treasury.quoteTransfer({
      token,
      recipient,
      amount: amountUnits,
    });

    return {
      amountUnits: amountUnits.toString(),
      amountUsdt: formatUsdt(amountUnits),
      feeUnits: quote.fee.toString(),
      feeUsdt: formatUsdt(quote.fee),
      token,
      recipient,
    };
  });
}

/**
 * Fund a pending PIV: treasury smart account → farmer smart account.
 */
async function sendFunding(pivId, amount) {
  const piv = getPivById(Number(pivId));
  if (!piv) {
    const error = new Error(`PIV ${pivId} not found`);
    error.statusCode = 404;
    throw error;
  }

  if (piv.status === "funded" && piv.tx_hash) {
    const error = new Error(`PIV ${pivId} is already funded`);
    error.statusCode = 409;
    throw error;
  }

  if (!["pending", "failed", "funding"].includes(piv.status)) {
    const error = new Error(`PIV ${pivId} cannot be funded from status=${piv.status}`);
    error.statusCode = 409;
    throw error;
  }

  const amountUnits = toUsdtUnits(amount);
  const accountInfo = await createSmartAccountIfNeeded(piv.farmer_phone);
  const recipient = accountInfo.smartAccountAddress;
  const token = getUsdtToken();

  markPivFunding(piv.id);

  try {
    const result = await withWallet(async (wallet) => {
      const treasury = await wallet.getAccount(getTreasuryAccountIndex());
      const treasuryAddress = await treasury.getAddress();

      const quote = await treasury.quoteTransfer({
        token,
        recipient,
        amount: amountUnits,
      });

      const balance = await treasury.getTokenBalance(token);
      if (balance < amountUnits + quote.fee) {
        throw new Error(
          `Treasury ${treasuryAddress} needs more Sepolia USD₮. Have ${formatUsdt(balance)}, need ~${formatUsdt(amountUnits + quote.fee)}.`,
        );
      }

      const transfer = await treasury.transfer({
        token,
        recipient,
        amount: amountUnits,
      });

      return {
        txHash: transfer.hash,
        feeUnits: transfer.fee.toString(),
        feeUsdt: formatUsdt(transfer.fee),
        treasuryAddress,
      };
    });

    const funded = markPivFunded(piv.id, {
      txHash: result.txHash,
      amountUsdt: formatUsdt(amountUnits),
      feeUsdt: result.feeUsdt,
    });

    return {
      pivId: funded.id,
      status: funded.status,
      txHash: funded.tx_hash,
      amountUsdt: funded.amount_usdt,
      feeUsdt: funded.fee_usdt,
      recipient,
      farmerId: accountInfo.farmerId,
      explorerUrl: `https://sepolia.etherscan.io/tx/${funded.tx_hash}`,
    };
  } catch (error) {
    markPivFailed(piv.id, error.message || "funding failed");
    throw error;
  }
}

module.exports = {
  createSmartAccountIfNeeded,
  getFeeQuote,
  sendFunding,
  toUsdtUnits,
  formatUsdt,
};
