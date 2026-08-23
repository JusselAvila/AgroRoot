/**
 * AgroRoot — isolated WDK smoke test (Persona A, Saturday afternoon).
 *
 * Derives an ERC-4337 smart account on Sepolia, quotes the paymaster fee in
 * USD₮, submits a UserOperation that transfers USD₮, and prints the hash.
 *
 * Do not wire this into Express until it produces a real Sepolia hash on its own.
 *
 * Usage:
 *   cp .env.example .env   # fill SEED_PHRASE + recipient + RPC if needed
 *   npm run wdk:test
 */

require("dotenv").config();

const REQUIRED = [
  "SEED_PHRASE",
  "RPC_URL",
  "BUNDLER_URL",
  "PAYMASTER_URL",
  "PAYMASTER_ADDRESS",
  "PAYMASTER_TOKEN_ADDRESS",
  "USDT_TOKEN_ADDRESS",
  "TRANSFER_TO",
];

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

function assertEnv() {
  const missing = REQUIRED.filter((key) => !process.env[key] || !String(process.env[key]).trim());
  if (missing.length > 0) {
    throw new Error(
      `Fill these in .env before running the WDK test:\n  - ${missing.join("\n  - ")}`,
    );
  }
}

function formatUsdt(units, decimals = 6) {
  const value = BigInt(units);
  const base = 10n ** BigInt(decimals);
  const whole = value / base;
  const frac = (value % base).toString().padStart(decimals, "0").replace(/0+$/, "");
  return frac ? `${whole}.${frac}` : `${whole}`;
}

function buildConfig() {
  const transferMaxFee = BigInt(optionalEnv("TRANSFER_MAX_FEE", "5000000"));
  const transactionMaxFee = BigInt(optionalEnv("TRANSACTION_MAX_FEE", "5000000"));

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
    transferMaxFee,
    transactionMaxFee,
    onChainIdentifier: optionalEnv("ON_CHAIN_IDENTIFIER", "AgroRoot"),
  };
}

async function main() {
  assertEnv();

  const { default: WalletManagerEvmErc4337 } = await import(
    "@tetherto/wdk-wallet-evm-erc-4337"
  );

  const seedPhrase = requireEnv("SEED_PHRASE");
  const usdtToken = requireEnv("USDT_TOKEN_ADDRESS");
  const recipient = requireEnv("TRANSFER_TO");
  const amountUnits = BigInt(optionalEnv("TRANSFER_AMOUNT", "1000000")); // 1.0 USDT
  const accountIndex = Number(optionalEnv("ACCOUNT_INDEX", "0"));
  const dryRun = optionalEnv("WDK_DRY_RUN", "false") === "true";

  const config = buildConfig();
  const wallet = new WalletManagerEvmErc4337(seedPhrase, config);

  try {
    console.log("=== AgroRoot WDK test (Sepolia ERC-4337) ===");
    console.log(`Package: @tetherto/wdk-wallet-evm-erc-4337`);
    console.log(`Chain ID: ${config.chainId}`);
    console.log(`Bundler: ${config.bundlerUrl}`);
    console.log(`Paymaster: ${config.paymasterUrl}`);
    console.log(`Paymaster contract: ${config.paymasterAddress}`);
    console.log(`Paymaster / transfer token: ${usdtToken}`);
    if (process.env.DELEGATION_ADDRESS) {
      console.log(`Delegation address (checklist): ${process.env.DELEGATION_ADDRESS}`);
    }

    const account = await wallet.getAccount(accountIndex);
    const smartAccountAddress = await account.getAddress();
    console.log(`\nSmart account [${accountIndex}]: ${smartAccountAddress}`);

    let tokenBalance;
    try {
      tokenBalance = await account.getTokenBalance(usdtToken);
      console.log(`USD₮ balance: ${formatUsdt(tokenBalance)} (${tokenBalance} base units)`);
    } catch (error) {
      console.warn(`Could not read USD₮ balance: ${error.message}`);
    }

    const transferParams = {
      token: usdtToken,
      recipient,
      amount: amountUnits,
    };

    console.log(`\nQuoting paymaster fee for transfer of ${formatUsdt(amountUnits)} USD₮ → ${recipient}`);
    const quote = await account.quoteTransfer(transferParams);
    console.log(`Fee quote: ${formatUsdt(quote.fee)} USD₮ (${quote.fee} base units)`);

    if (dryRun) {
      console.log("\nWDK_DRY_RUN=true — stopped after quote. Unset it to submit the UserOperation.");
      return;
    }

    if (tokenBalance !== undefined && tokenBalance < amountUnits + quote.fee) {
      throw new Error(
        `Smart account needs more Sepolia USD₮. Have ${formatUsdt(tokenBalance)}, need ~${formatUsdt(amountUnits + quote.fee)} (transfer + fee). Fund ${smartAccountAddress} then retry.`,
      );
    }

    console.log("\nSubmitting UserOperation (transfer + paymaster)...");
    const result = await account.transfer(transferParams);

    console.log("\n=== SUCCESS ===");
    console.log(`UserOperation / tx hash: ${result.hash}`);
    console.log(`Fee paid (USD₮ units): ${result.fee}`);
    console.log(`Explorer: https://sepolia.etherscan.io/tx/${result.hash}`);
  } finally {
    wallet.dispose();
  }
}

main().catch((error) => {
  console.error("\nWDK test failed:");
  console.error(error?.stack || error?.message || error);
  process.exit(1);
});
