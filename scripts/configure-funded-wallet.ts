#!/usr/bin/env npx tsx
/**
 * CorrFarm — Configure Funded Wallet for x402 Payments
 *
 * Use this script when you already have a funded Algorand testnet wallet
 * (e.g., your friend sent 10 ALGO to an address) and need to:
 *   1. Verify the wallet has ALGO balance
 *   2. Check/enable USDC opt-in
 *   3. Update .env with the wallet address
 *   4. Test the x402 payment flow
 *
 * Usage:
 *   npx tsx scripts/configure-funded-wallet.ts <WALLET_ADDRESS>
 *
 * Example:
 *   npx tsx scripts/configure-funded-wallet.ts ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890
 */

import algosdk from 'algosdk';
import fs from 'fs';
import path from 'path';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const ALGOD_SERVER = process.env.ALGOD_SERVER || 'https://testnet-api.algonode.cloud';
const USDC_TESTNET_ASSET_ID = parseInt(process.env.USDC_TESTNET_ASSET_ID || '10458941', 10);
const ENV_FILE = path.join(process.cwd(), '.env');
const ENV_LOCAL_FILE = path.join(process.cwd(), '.env.local');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function separator(char = '═', length = 60): string {
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
  const walletAddress = process.argv[2];

  console.log('\n' + separator('═', 60));
  console.log('  CorrFarm — Configure Funded Wallet for x402');
  console.log(separator('═', 60));

  if (!walletAddress) {
    console.log('\n  ERROR: Wallet address is required!');
    console.log('\n  Usage:');
    console.log('    npx tsx scripts/configure-funded-wallet.ts <WALLET_ADDRESS>');
    console.log('\n  Example:');
    console.log('    npx tsx scripts/configure-funded-wallet.ts ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890');
    process.exit(1);
  }

  // Validate address format
  try {
    algosdk.decodeAddress(walletAddress);
    console.log(`\n  Address format: VALID`);
  } catch {
    console.log(`\n  ERROR: Invalid Algorand address format: ${walletAddress}`);
    console.log('  Algorand addresses are 58 characters long and end with a checksum.');
    process.exit(1);
  }

  // ── Step 1: Connect to testnet ──────────────────────────────────────
  header('Step 1: Connect to Algorand Testnet');

  let algodClient: algosdk.Algodv2;
  try {
    algodClient = new algosdk.Algodv2('', ALGOD_SERVER, '');
    await algodClient.healthCheck().do();
    console.log(`  Connected to: ${ALGOD_SERVER}`);
  } catch (err) {
    console.log(`  ERROR: Cannot connect to algod: ${err}`);
    process.exit(1);
  }

  // ── Step 2: Check account balance ───────────────────────────────────
  header('Step 2: Check Wallet Balance');

  let accountInfo: any;
  try {
    accountInfo = await algodClient.accountInformation(walletAddress).do() as any;
    const balanceMicroAlgos = accountInfo.amount ?? 0;
    const balanceAlgos = (balanceMicroAlgos / 1_000_000).toFixed(6);
    console.log(`  Address: ${walletAddress}`);
    console.log(`  ALGO Balance: ${balanceAlgos} ALGO`);
    console.log(`  Status: ${accountInfo.status ?? 'unknown'}`);

    if (balanceMicroAlgos === 0) {
      console.log('\n  WARNING: This wallet has 0 ALGO. It may not be funded yet.');
      console.log('  Fund it at: https://lora.algokit.io/testnet?account=' + walletAddress);
    }
  } catch (err: any) {
    if (err?.status === 404 || String(err).includes('account not found')) {
      console.log(`  Account not found on-chain: ${walletAddress}`);
      console.log('  This wallet has never received any ALGO.');
      console.log('  Fund it at: https://lora.algokit.io/testnet?account=' + walletAddress);
      process.exit(1);
    }
    console.log(`  ERROR checking account: ${err}`);
    process.exit(1);
  }

  // ── Step 3: Check USDC opt-in ───────────────────────────────────────
  header('Step 3: Check USDC Opt-in');

  const assets = accountInfo.assets ?? [];
  const usdcAsset = assets.find((a: any) => a['asset-id'] === USDC_TESTNET_ASSET_ID);

  if (usdcAsset) {
    const usdcBalance = ((usdcAsset.amount ?? 0) / 1_000_000).toFixed(6);
    console.log(`  USDC Asset: OPTED IN`);
    console.log(`  USDC Balance: ${usdcBalance} USDC`);
    console.log(`  Asset ID: ${USDC_TESTNET_ASSET_ID}`);
  } else {
    console.log(`  USDC Asset: NOT OPTED IN`);
    console.log(`  Asset ID: ${USDC_TESTNET_ASSET_ID}`);
    console.log('\n  To opt in to USDC, you need to:');
    console.log('    1. Open Pera Wallet (or any Algorand wallet) in testnet mode');
    console.log(`    2. Add asset ID ${USDC_TESTNET_ASSET_ID} (USDC Testnet)`);
    console.log('    3. Or use algosdk to send a 0-amount asset transfer to yourself');
    console.log('\n  Without USDC opt-in, x402 payments cannot be received.');
    console.log('  The app will still work in BYPASS_X402=true (demo) mode.');
  }

  // ── Step 4: Update .env file ────────────────────────────────────────
  header('Step 4: Update Environment Configuration');

  // Update .env
  let envContent = '';
  if (fs.existsSync(ENV_FILE)) {
    envContent = fs.readFileSync(ENV_FILE, 'utf-8');
  }

  // Replace or add X402_RECIPIENT_ADDRESS
  const lines = envContent.split('\n');
  let found = false;
  const updatedLines = lines.map(line => {
    if (line.startsWith('X402_RECIPIENT_ADDRESS=')) {
      found = true;
      return `X402_RECIPIENT_ADDRESS=${walletAddress}`;
    }
    return line;
  });
  if (!found) {
    updatedLines.push(`X402_RECIPIENT_ADDRESS=${walletAddress}`);
  }

  fs.writeFileSync(ENV_FILE, updatedLines.join('\n'));
  console.log(`  Updated .env with wallet address`);

  // Also update .env.local if it exists
  if (fs.existsSync(ENV_LOCAL_FILE)) {
    let localContent = fs.readFileSync(ENV_LOCAL_FILE, 'utf-8');
    const localLines = localContent.split('\n');
    let localFound = false;
    const updatedLocalLines = localLines.map(line => {
      if (line.startsWith('X402_RECIPIENT_ADDRESS=')) {
        localFound = true;
        return `X402_RECIPIENT_ADDRESS=${walletAddress}`;
      }
      return line;
    });
    if (!localFound) {
      updatedLocalLines.push(`X402_RECIPIENT_ADDRESS=${walletAddress}`);
    }
    fs.writeFileSync(ENV_LOCAL_FILE, updatedLocalLines.join('\n'));
    console.log(`  Updated .env.local with wallet address`);
  }

  // ── Step 5: Summary ─────────────────────────────────────────────────
  header('Configuration Summary');

  console.log(`\n  Wallet Address: ${walletAddress}`);
  console.log(`  Network: Algorand Testnet`);
  console.log(`  Algoid Server: ${ALGOD_SERVER}`);
  console.log(`  USDC Asset ID: ${USDC_TESTNET_ASSET_ID}`);
  console.log(`  USDC Opted In: ${usdcAsset ? 'YES' : 'NO — OPT IN FIRST!'}`);

  console.log('\n  Next Steps:');
  if (!usdcAsset) {
    console.log('    1. URGENT: Opt-in to USDC asset (ID 10458941) using your wallet');
    console.log('       - Pera Wallet > Testnet > Add Asset > Search 10458941');
    console.log('       - This requires ~0.1 ALGO minimum balance + 0.001 ALGO for the transaction');
  }
  console.log(`    ${usdcAsset ? '1' : '2'}. Set BYPASS_X402=false in .env to enable real x402 payments`);
  console.log(`    ${usdcAsset ? '2' : '3'}. Run: bun install && bun dev`);
  console.log(`    ${usdcAsset ? '3' : '4'}. Visit http://localhost:3000`);

  console.log('\n  x402 Payment Flow:');
  console.log('    Client -> API endpoint -> Gets 402 response with payment details');
  console.log('    Client -> Sends USDC to your wallet -> Resends request with tx proof');
  console.log('    Server -> Verifies tx on Algorand -> Returns data');

  console.log('\n' + separator('═', 60));
  console.log('  Configuration complete!');
  console.log(separator('═', 60) + '\n');
}

// Run
main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
