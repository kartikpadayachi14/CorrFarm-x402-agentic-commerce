#!/usr/bin/env npx tsx
/**
 * CorrFarm — Algorand Testnet Wallet Setup Script
 *
 * Generates a new Algorand testnet wallet for receiving x402 payments
 * and prints instructions for funding and configuration.
 *
 * Usage:
 *   npx tsx scripts/setup-wallet.ts
 *
 * This script is idempotent — running it again generates a new wallet.
 * Store your mnemonic securely and never commit it to version control.
 */

import algosdk from 'algosdk';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const ALGOD_SERVER = process.env.ALGOD_SERVER || 'https://testnet-api.algonode.cloud';
const USDC_TESTNET_ASSET_ID = process.env.USDC_TESTNET_ASSET_ID || '10458941';
const FAUCET_URL = 'https://lora.algokit.io/testnet';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function separator(char = '─', length = 60): string {
  return char.repeat(length);
}

function header(text: string): void {
  console.log('\n' + separator());
  console.log(`  ${text}`);
  console.log(separator());
}

function section(text: string): void {
  console.log(`\n  ▸ ${text}`);
  console.log(`  ${'─'.repeat(40)}`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  console.log('\n' + separator('═', 60));
  console.log('  🌾 CorrFarm — Algorand Testnet Wallet Setup');
  console.log(separator('═', 60));

  // ── Step 1: Generate wallet ─────────────────────────────────────────
  header('Step 1: Generate New Wallet');

  const account = algosdk.generateAccount();
  const address = account.addr.toString();
  const mnemonic = algosdk.secretKeyToMnemonic(account.sk);

  section('Wallet Address (Public)');
  console.log(`  ${address}`);

  section('Mnemonic (PRIVATE — Store Securely!)');
  // Print mnemonic in groups of 5 for readability
  const words = mnemonic.split(' ');
  for (let i = 0; i < words.length; i += 5) {
    const group = words.slice(i, i + 5)
      .map((w, j) => `${String(i + j + 1).padStart(2)}: ${w}`)
      .join('   ');
    console.log(`  ${group}`);
  }

  // ── Step 2: Verify mnemonic roundtrip ────────────────────────────────
  header('Step 2: Verify Mnemonic');

  try {
    const recovered = algosdk.mnemonicToSecretKey(mnemonic);
    if (recovered.addr.toString() === address) {
      console.log('  ✅ Mnemonic verification PASSED — address matches');
    } else {
      console.log('  ❌ Mnemonic verification FAILED — address mismatch!');
      process.exit(1);
    }
  } catch (err) {
    console.log('  ❌ Mnemonic verification FAILED:', err);
    process.exit(1);
  }

  // ── Step 3: Check account on testnet ─────────────────────────────────
  header('Step 3: Check Account on Testnet');

  try {
    const client = new algosdk.Algodv2('', ALGOD_SERVER, '');
    const healthCheck = await client.healthCheck().do();
    console.log(`  ✅ Algod connection OK (server: ${ALGOD_SERVER})`);

    try {
      const accountInfo = await client.accountInformation(address).do() as any;
      const balanceMicroAlgos = accountInfo.amount ?? 0;
      const balanceAlgos = (balanceMicroAlgos / 1_000_000).toFixed(6);
      console.log(`  ℹ️  Account exists with balance: ${balanceAlgos} ALGO`);

      // Check USDC opt-in
      const usdcAsset = (accountInfo.assets ?? []).find(
        (a: any) => a['asset-id'] === parseInt(USDC_TESTNET_ASSET_ID, 10)
      );
      if (usdcAsset) {
        const usdcBalance = ((usdcAsset.amount ?? 0) / 1_000_000).toFixed(6);
        console.log(`  ℹ️  USDC balance: ${usdcBalance} USDC (opted in)`);
      } else {
        console.log(`  ℹ️  Not yet opted in to USDC (asset ${USDC_TESTNET_ASSET_ID})`);
      }
    } catch {
      console.log('  ℹ️  Account not found on-chain (needs funding first)');
    }
  } catch (err) {
    console.log(`  ⚠️  Could not connect to algod: ${err}`);
    console.log('     This is OK — the wallet is still valid, just not funded yet.');
  }

  // ── Step 4: Funding instructions ─────────────────────────────────────
  header('Step 4: Fund Your Wallet');

  console.log(`\n  🔗 Faucet URL:\n     ${FAUCET_URL}?account=${address}`);
  console.log('\n  Steps:');
  console.log('    1. Open the faucet URL above in your browser');
  console.log('    2. Click "Fund Account" to receive test ALGO');
  console.log('    3. Wait for the transaction to confirm (~5 seconds)');
  console.log('    4. After funding, opt-in to USDC testnet asset:');
  console.log(`       Asset ID: ${USDC_TESTNET_ASSET_ID}`);
  console.log('       Use Pera Wallet or send a 0-amount axfer to yourself');

  // ── Step 5: Environment variable setup ───────────────────────────────
  header('Step 5: Configure Environment');

  console.log('\n  Add the following to your .env file:\n');
  console.log('  ┌─────────────────────────────────────────────────────┐');
  console.log(`  │ X402_RECIPIENT_ADDRESS=${address}  │`);
  console.log('  └─────────────────────────────────────────────────────┘');

  console.log('\n  Full .env example:');
  console.log('  ┌────────────────────────────────────────────────────────────────────┐');
  console.log('  │ # Algorand Testnet                                                 │');
  console.log(`  │ ALGOD_SERVER=${ALGOD_SERVER}                      │`);
  console.log('  │ ALGOD_TOKEN=                                                       │');
  console.log('  │ ALGOD_PORT=                                                         │');
  console.log('  │                                                                     │');
  console.log('  │ # x402 Payment                                                     │');
  console.log(`  │ X402_RECIPIENT_ADDRESS=${address}                    │`);
  console.log(`  │ USDC_TESTNET_ASSET_ID=${USDC_TESTNET_ASSET_ID}                               │`);
  console.log('  │ BYPASS_X402=true                                                    │');
  console.log('  └────────────────────────────────────────────────────────────────────┘');

  // ── Security warning ─────────────────────────────────────────────────
  header('⚠️  Security Reminder');

  console.log('\n  • NEVER share your mnemonic with anyone');
  console.log('  • NEVER commit your mnemonic to version control');
  console.log('  • Store it in a password manager or hardware wallet');
  console.log('  • This is a TESTNET wallet — do not use for mainnet funds');
  console.log('  • The .env file should be in .gitignore');

  console.log('\n' + separator('═', 60));
  console.log('  ✅ Wallet setup complete!');
  console.log(separator('═', 60) + '\n');
}

// Run
main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
