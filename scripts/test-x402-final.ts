#!/usr/bin/env npx tsx
/**
 * CorrFarm — x402 Payment Flow Final Verification Test
 *
 * After fixing the USDC asset ID (31566704 → 10458941) and
 * integrating @x402/avm constants, this test verifies:
 * 1. @x402/avm integration (constants match)
 * 2. Gateway module works with CAIP-2 network format
 * 3. Algorand testnet connectivity (algod + USDC asset)
 * 4. Full x402 protocol flow
 */

import algosdk from 'algosdk';
import { USDC_TESTNET_ASA_ID, ALGORAND_TESTNET_CAIP2, USDC_DECIMALS } from '@x402/avm';

// ============================================================================
// Constants
// ============================================================================

const CORRECT_USDC_ASSET_ID = Number(USDC_TESTNET_ASA_ID);
const ALGOD_SERVER = 'https://testnet-api.algonode.cloud';

// ============================================================================
// Test utilities
// ============================================================================

const passed: string[] = [];
const failed: string[] = [];
const warnings: string[] = [];

function test(name: string, fn: () => boolean | void): void {
  try {
    const result = fn();
    if (result === false) {
      failed.push(name);
      console.log(`  ❌ FAIL: ${name}`);
    } else {
      passed.push(name);
      console.log(`  ✅ PASS: ${name}`);
    }
  } catch (err) {
    failed.push(name);
    console.log(`  ❌ FAIL: ${name} — ${err}`);
  }
}

async function testAsync(name: string, fn: () => Promise<boolean | void>): Promise<void> {
  try {
    const result = await fn();
    if (result === false) {
      failed.push(name);
      console.log(`  ❌ FAIL: ${name}`);
    } else {
      passed.push(name);
      console.log(`  ✅ PASS: ${name}`);
    }
  } catch (err) {
    failed.push(name);
    console.log(`  ❌ FAIL: ${name} — ${err}`);
  }
}

function header(text: string): void {
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`  ${text}`);
  console.log('═'.repeat(60));
}

function section(text: string): void {
  console.log(`\n  ▸ ${text}`);
  console.log(`  ${'─'.repeat(40)}`);
}

// ============================================================================
// Test 1: @x402/avm Integration
// ============================================================================

async function testX402AvmIntegration(): Promise<void> {
  header('Test 1: @x402/avm Integration');

  section('Constants');

  test('USDC_TESTNET_ASA_ID = 10458941 (from @x402/avm)', () => {
    return CORRECT_USDC_ASSET_ID === 10458941;
  });

  test('USDC_DECIMALS = 6 (from @x402/avm)', () => {
    return USDC_DECIMALS === 6;
  });

  test('ALGORAND_TESTNET_CAIP2 is CAIP-2 format', () => {
    return ALGORAND_TESTNET_CAIP2.startsWith('algorand:') && ALGORAND_TESTNET_CAIP2.length > 20;
  });

  console.log(`    CAIP-2: ${ALGORAND_TESTNET_CAIP2}`);

  section('Gateway uses @x402/avm constants');

  const gateway = await import('../src/lib/x402/gateway');

  test('createPaymentRequest returns CAIP-2 network identifier', () => {
    const req = gateway.createPaymentRequest('correlation_matrix');
    return req.payment.network === ALGORAND_TESTNET_CAIP2;
  });

  test('createPaymentRequest returns correct USDC asset ID', () => {
    const req = gateway.createPaymentRequest('correlation_matrix');
    return req.payment.assetId === CORRECT_USDC_ASSET_ID;
  });

  section('Wallet uses @x402/avm constants');

  const wallet = await import('../src/lib/x402/wallet');

  test('Wallet module exports correct USDC asset ID', () => {
    return wallet.USDC_TESTNET_ASSET_ID === CORRECT_USDC_ASSET_ID;
  });
}

// ============================================================================
// Test 2: Algorand Testnet Connectivity
// ============================================================================

async function testAlgorandConnectivity(): Promise<void> {
  header('Test 2: Algorand Testnet Connectivity');

  section('Algod Connection');

  await testAsync('Connect to testnet algod (health check)', async () => {
    const client = new algosdk.Algodv2('', ALGOD_SERVER, '');
    await client.healthCheck().do();
    return true;
  });

  await testAsync('Get testnet status (last round)', async () => {
    const client = new algosdk.Algodv2('', ALGOD_SERVER, '');
    const status = await client.status().do() as any;
    const lastRound = status.lastRound || status['last-round'];
    console.log(`    Last round: ${lastRound}`);
    return !!lastRound;
  });

  section('USDC Asset Verification');

  await testAsync(`USDC asset ${CORRECT_USDC_ASSET_ID} exists on testnet`, async () => {
    const client = new algosdk.Algodv2('', ALGOD_SERVER, '');
    const assetInfo = await client.getAssetByID(CORRECT_USDC_ASSET_ID).do() as any;
    const name = assetInfo.params?.name;
    const decimals = Number(assetInfo.params?.decimals);
    console.log(`    Name: ${name}, Decimals: ${decimals}`);
    return name === 'USDC' && decimals === 6;
  });

  await testAsync('Old asset ID 31566704 (mainnet) does NOT exist on testnet', async () => {
    const client = new algosdk.Algodv2('', ALGOD_SERVER, '');
    try {
      await client.getAssetByID(31566704).do();
      return false; // Should not exist on testnet
    } catch {
      return true; // Expected: 404
    }
  });

  await testAsync('Known testnet account lookup works', async () => {
    const client = new algosdk.Algodv2('', ALGOD_SERVER, '');
    const knownAddr = 'GD64YIY3TWGDMCNPP553DZPPR6LDUSFQOIJVFDPPXWEG3FVOJCCDBBHU5A';
    const info = await client.accountInformation(knownAddr).do() as any;
    const balance = Number(info.amount) / 1_000_000;
    console.log(`    Faucet balance: ${balance.toFixed(2)} ALGO`);
    return Number(info.amount) > 0;
  });

  section('Wallet Module');

  await testAsync('Generate testnet wallet', async () => {
    const wallet = await import('../src/lib/x402/wallet');
    const w = wallet.generateTestnetWallet();
    console.log(`    Address: ${w.address.substring(0, 20)}...`);
    return w.address.length > 50 && w.mnemonic.split(' ').length === 25;
  });

  await testAsync('Mnemonic verification roundtrip', async () => {
    const wallet = await import('../src/lib/x402/wallet');
    const w = wallet.generateTestnetWallet();
    return wallet.verifyMnemonic(w.mnemonic) === w.address;
  });
}

// ============================================================================
// Test 3: x402 Protocol Flow
// ============================================================================

async function testX402ProtocolFlow(): Promise<void> {
  header('Test 3: x402 Protocol Flow');

  const gateway = await import('../src/lib/x402/gateway');
  const origBypass = process.env.BYPASS_X402;
  process.env.BYPASS_X402 = 'true';

  section('402 Payment Request (x402 Spec)');

  test('Payment request includes all x402 required fields', () => {
    const req = gateway.createPaymentRequest('correlation_matrix');
    const p = req.payment;
    return typeof p.sessionId === 'string' &&
      typeof p.resource === 'string' &&
      typeof p.amount === 'number' &&
      typeof p.recipient === 'string' &&
      typeof p.assetId === 'number' &&
      typeof p.network === 'string' &&
      typeof p.expiresAt === 'string' &&
      p.assetId === CORRECT_USDC_ASSET_ID &&
      p.network === ALGORAND_TESTNET_CAIP2;
  });

  test('Status code is 402', () => {
    const req = gateway.createPaymentRequest('pair_correlation');
    return req.status === 402;
  });

  test('Amounts are in micro-USDC (6 decimals)', () => {
    const req = gateway.createPaymentRequest('credibility_score');
    // 30,000 micro-USDC = 0.03 USDC
    return req.payment.amount === 30_000 && req.payment.amount / 1e6 === 0.03;
  });

  test('Network identifier is CAIP-2 format', () => {
    const req = gateway.createPaymentRequest('copula_analysis');
    return req.payment.network.startsWith('algorand:');
  });

  section('Demo Payment Flow');

  test('Demo payment creates verified access', () => {
    const result = gateway.createDemoPayment('news_analysis');
    return result.verification.valid === true &&
      result.verification.resource === 'news_analysis' &&
      result.txId.startsWith('demo-');
  });

  test('Bypass mode grants immediate access', () => {
    const access = gateway.checkAccess('alpha_markets');
    return access.granted === true;
  });

  section('Payment Verification');

  process.env.BYPASS_X402 = '';

  const req = gateway.createPaymentRequest('dcc_garch');

  await testAsync('Demo txId verification works', async () => {
    const verification = await gateway.verifyPayment(req.payment.sessionId, `demo-${Date.now()}`);
    return verification.valid === true && verification.resource === 'dcc_garch';
  });

  await testAsync('Invalid txId rejected gracefully', async () => {
    const req2 = gateway.createPaymentRequest('webhook_registration');
    const verification = await gateway.verifyPayment(req2.payment.sessionId, 'INVALID_ON_CHAIN_TX');
    return verification.valid === false;
  });

  await testAsync('Expired/nonexistent session rejected', async () => {
    const verification = await gateway.verifyPayment('nonexistent', 'some-tx');
    return verification.valid === false;
  });

  process.env.BYPASS_X402 = origBypass;

  section('Access Duration & Pricing');

  test('Payment window is 10 minutes', () => {
    const before = Date.now();
    const req = gateway.createPaymentRequest('correlation_matrix');
    const windowMs = new Date(req.payment.expiresAt).getTime() - before;
    return Math.abs(windowMs - 10 * 60 * 1000) < 5000;
  });

  test('All 10 pricing tiers have valid amounts', () => {
    const pricing = gateway.getPricing();
    const keys = Object.keys(pricing);
    if (keys.length !== 10) return false;
    for (const [, p] of Object.entries(pricing)) {
      if (p.microUsdc < 20_000 || p.microUsdc > 300_000) return false;
      if (p.usdc !== p.microUsdc / 1_000_000) return false;
    }
    return true;
  });
}

// ============================================================================
// Run all tests
// ============================================================================

async function main(): Promise<void> {
  console.log('\n' + '═'.repeat(60));
  console.log('  🧪 CorrFarm x402 — Final Verification Test');
  console.log('═'.repeat(60));
  console.log(`  @x402/avm version:     2.14.0`);
  console.log(`  USDC Asset ID:         ${CORRECT_USDC_ASSET_ID} (from @x402/avm)`);
  console.log(`  Network CAIP-2:        ${ALGORAND_TESTNET_CAIP2}`);
  console.log(`  USDC Decimals:         ${USDC_DECIMALS}`);

  await testX402AvmIntegration();
  await testAlgorandConnectivity();
  await testX402ProtocolFlow();

  // ── Summary ────────────────────────────────────────────────────────
  header('Test Summary');

  console.log(`\n  Passed:   ${passed.length}`);
  console.log(`  Failed:   ${failed.length}`);
  console.log(`  Warnings: ${warnings.length}`);

  if (failed.length > 0) {
    console.log('\n  Failed tests:');
    for (const f of failed) {
      console.log(`    ❌ ${f}`);
    }
  }

  const total = passed.length + failed.length;
  const grade = total > 0 ? passed.length / total : 0;
  console.log(`\n  Grade: ${(grade * 100).toFixed(1)}% ${grade >= 0.9 ? '✅' : grade >= 0.7 ? '⚠️' : '❌'}`);
  console.log('\n' + '═'.repeat(60));

  process.exit(failed.length > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
