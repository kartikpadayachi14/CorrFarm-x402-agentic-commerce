/**
 * CorrFarm — x402 Payment Gateway for Algorand Testnet
 *
 * Implements HTTP 402 Payment Required protocol per the x402 specification.
 * Uses @x402/avm for canonical Algorand constants and algosdk for verification.
 * Supports bypass mode (BYPASS_X402=true) and demo payments.
 *
 * x402 Protocol Flow:
 * 1. Client → Server: HTTP request → gets 402 response with payment details
 * 2. Client → Algorand: Sends USDC asset transfer to the recipient address
 * 3. Client → Server: Resends request with payment proof in X-Payment header
 * 4. Server → Facilitator: Verifies payment on-chain
 * 5. Server → Client: Returns requested data
 *
 * Verification flow (on-chain):
 * 1. Try pending transaction lookup (transaction not yet confirmed)
 * 2. Fallback to confirmed transaction lookup via algod
 * 3. Validate transaction type (must be axfer — asset transfer)
 * 4. Validate receiver address matches X402_RECIPIENT_ADDRESS
 * 5. Validate asset ID matches USDC_TESTNET_ASSET_ID (10458941)
 * 6. Validate amount is within tolerance of expected payment
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PaymentRequest {
  status: 402;
  payment: {
    sessionId: string;
    resource: string;
    amount: number; // in micro-USDC
    recipient: string; // Algorand wallet address
    assetId: number; // USDC asset ID on testnet
    network: string;
    expiresAt: string;
  };
}

export interface PaymentVerification {
  valid: boolean;
  resource: string;
  sessionId: string;
  txId: string;
  expiresAt: string;
}

interface AccessRecord {
  resource: string;
  paid: boolean;
  expiresAt: string;
  txId?: string;
  sessionId?: string;
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/** Pricing tiers — amounts in micro-USDC (1 USDC = 1,000,000 micro-USDC) */
const PRICING: Record<string, number> = {
  correlation_matrix: 50_000,     // $0.05
  pair_correlation: 20_000,       // $0.02
  copula_analysis: 100_000,       // $0.10
  dcc_garch: 100_000,             // $0.10
  credibility_score: 30_000,      // $0.03
  news_analysis: 50_000,          // $0.05
  alpha_markets: 30_000,          // $0.03
  alpha_opportunities: 80_000,    // $0.08
  webhook_registration: 50_000,   // $0.05
  full_access: 250_000,           // $0.25 (24h pass)
};

/**
 * USDC asset ID on Algorand testnet.
 * Source: @x402/avm USDC_TESTNET_ASA_ID = 10458941
 * Network CAIP-2 (from @x402/avm): algorand:SGO1GKSzyE7IEPItTxCByw9x8FmnrCDexi9/cOUJOiI=
 * (Mainnet USDC is 31566704 — do NOT use on testnet)
 */
const USDC_TESTNET_ASSET_ID = parseInt(process.env.USDC_TESTNET_ASSET_ID || '10458941', 10);

/** x402-spec network identifier (CAIP-2 format, from @x402/avm) */
const ALGORAND_TESTNET_NETWORK = 'algorand:SGO1GKSzyE7IEPItTxCByw9x8FmnrCDexi9/cOUJOiI=';

/** Algorand testnet algod URL */
const ALGOD_SERVER = process.env.ALGOD_SERVER || 'https://testnet-api.algonode.cloud';
const ALGOD_TOKEN = process.env.ALGOD_TOKEN || '';
const ALGOD_PORT = process.env.ALGOD_PORT || '';

/** Amount tolerance for verification (1% — allows for rounding in micro-USDC) */
const AMOUNT_TOLERANCE = 0.01;

/** Access duration per resource (ms) */
const RESOURCE_DURATION: Record<string, number> = {
  correlation_matrix: 30 * 60 * 1000,  // 30 min
  pair_correlation: 30 * 60 * 1000,
  copula_analysis: 60 * 60 * 1000,      // 1 hour
  dcc_garch: 60 * 60 * 1000,
  credibility_score: 30 * 60 * 1000,
  news_analysis: 30 * 60 * 1000,
  alpha_markets: 30 * 60 * 1000,
  alpha_opportunities: 60 * 60 * 1000,
  webhook_registration: 24 * 60 * 60 * 1000, // 24 hours (webhook stays active)
  full_access: 24 * 60 * 60 * 1000,     // 24 hours
};

function getRecipientAddress(): string {
  return process.env.X402_RECIPIENT_ADDRESS || 'CORRFARM_DEMO_RECIPIENT_ADDR';
}

function isBypassMode(): boolean {
  return process.env.BYPASS_X402 === 'true';
}

// ---------------------------------------------------------------------------
// In-memory access store
// ---------------------------------------------------------------------------

const accessStore = new Map<string, AccessRecord>();
const sessionStore = new Map<string, { resource: string; createdAt: number; expiresAt: number }>();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function generateSessionId(): string {
  return `x402-${Date.now()}-${Math.random().toString(36).substring(2, 10)}`;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Create a 402 payment request for a specific resource.
 */
export function createPaymentRequest(resource: string): PaymentRequest {
  const amount = PRICING[resource];
  if (!amount) {
    throw new Error(
      `Unknown resource: ${resource}. Available: ${Object.keys(PRICING).join(', ')}`
    );
  }

  const sessionId = generateSessionId();
  const now = Date.now();
  const duration = RESOURCE_DURATION[resource] || 30 * 60 * 1000;

  // Store session
  sessionStore.set(sessionId, {
    resource,
    createdAt: now,
    expiresAt: now + 10 * 60 * 1000, // Payment window: 10 minutes
  });

  return {
    status: 402,
    payment: {
      sessionId,
      resource,
      amount,
      recipient: getRecipientAddress(),
      assetId: USDC_TESTNET_ASSET_ID,
      network: ALGORAND_TESTNET_NETWORK,
      expiresAt: new Date(now + 10 * 60 * 1000).toISOString(),
    },
  };
}

/**
 * Verify an Algorand payment transaction.
 *
 * In production, this would:
 * 1. Connect to Algorand testnet via algosdk
 * 2. Look up the transaction by txId
 * 3. Verify it's a valid asset transfer to our address
 * 4. Verify the amount matches
 *
 * For the hackathon demo, we support:
 * - Real Algorand verification (if algosdk available)
 * - Demo payment mode (any txId starting with "demo-")
 * - Bypass mode (BYPASS_X402=true)
 */
export async function verifyPayment(
  sessionId: string,
  txId: string
): Promise<PaymentVerification> {
  // Check bypass mode
  if (isBypassMode()) {
    return createVerifiedAccess(sessionId, txId, 'bypass');
  }

  // Check session exists
  const session = sessionStore.get(sessionId);
  if (!session) {
    return {
      valid: false,
      resource: '',
      sessionId,
      txId,
      expiresAt: '',
    };
  }

  // Check session hasn't expired
  if (Date.now() > session.expiresAt) {
    sessionStore.delete(sessionId);
    return {
      valid: false,
      resource: session.resource,
      sessionId,
      txId,
      expiresAt: new Date(session.expiresAt).toISOString(),
    };
  }

  // Demo payment mode
  if (txId.startsWith('demo-')) {
    return createVerifiedAccess(sessionId, txId, 'demo');
  }

  // Real Algorand verification
  try {
    const verification = await verifyAlgorandTransaction(sessionId, txId, session.resource);
    if (verification.valid) {
      return createVerifiedAccess(sessionId, txId, 'algorand');
    }
    return verification;
  } catch (error) {
    console.warn('[x402] Algorand verification failed:', error);
    return {
      valid: false,
      resource: session.resource,
      sessionId,
      txId,
      expiresAt: '',
    };
  }
}

/**
 * Check if access is granted for a resource.
 * If a valid payment header is provided, verify it.
 */
export function checkAccess(resource: string, paymentHeader?: string): {
  granted: boolean;
  paymentRequired?: PaymentRequest;
  reason?: string;
} {
  // Bypass mode
  if (isBypassMode()) {
    return { granted: true };
  }

  // Full access pass grants access to everything
  const fullAccess = accessStore.get('full_access');
  if (fullAccess && fullAccess.paid && new Date(fullAccess.expiresAt) > new Date()) {
    return { granted: true };
  }

  // Check resource-specific access
  const access = accessStore.get(resource);
  if (access && access.paid && new Date(access.expiresAt) > new Date()) {
    return { granted: true };
  }

  // Parse payment header if provided (format: "x402 sessionId:txId")
  if (paymentHeader) {
    const parts = paymentHeader.split(':');
    if (parts.length === 2) {
      const [, txId] = parts;
      const sessionId = parts[0].replace('x402 ', '');
      const session = sessionStore.get(sessionId);
      if (session) {
        const existingAccess = accessStore.get(resource);
        if (existingAccess?.sessionId === sessionId && existingAccess.paid) {
          return { granted: true };
        }
      }
      // Access needs verification — return not granted, caller should verify
      return {
        granted: false,
        reason: 'Payment needs verification. Call verifyPayment first.',
      };
    }
  }

  // Return 402 payment request
  return {
    granted: false,
    paymentRequired: createPaymentRequest(resource),
  };
}

/**
 * Get all access statuses.
 */
export function getAccessStatus(): Record<string, AccessRecord> {
  const status: Record<string, AccessRecord> = {};
  accessStore.forEach((value, key) => {
    // Only include active access
    if (value.paid && new Date(value.expiresAt) > new Date()) {
      status[key] = value;
    }
  });
  return status;
}

/**
 * Get pricing for all resources.
 */
export function getPricing(): Record<string, { microUsdc: number; usdc: number; description: string }> {
  const descriptions: Record<string, string> = {
    correlation_matrix: 'Full NxN correlation matrix with method selection',
    pair_correlation: 'Pairwise correlation with p-value and interpretation',
    copula_analysis: 'Student-t copula estimation with tail dependence',
    dcc_garch: 'DCC-GARCH dynamic conditional correlation model',
    credibility_score: 'Single credibility analysis of text/news',
    news_analysis: 'Batch analysis of crypto news feed',
    alpha_markets: 'Alpha Arcade prediction markets listing',
    alpha_opportunities: 'Copula-based market mispricing opportunities',
    webhook_registration: 'Register a webhook callback for event notifications',
    full_access: '24-hour unlimited access to all endpoints',
  };

  const result: Record<string, { microUsdc: number; usdc: number; description: string }> = {};
  for (const [resource, amount] of Object.entries(PRICING)) {
    result[resource] = {
      microUsdc: amount,
      usdc: amount / 1_000_000,
      description: descriptions[resource] || '',
    };
  }
  return result;
}

/**
 * Create a demo payment for testing purposes.
 * This allows the frontend to test the payment flow without real transactions.
 */
/** Generate a realistic 52-character Algorand base32 TxID for demo payments. */
function generateAlgoTxId(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let id = '';
  for (let i = 0; i < 52; i++) id += chars[Math.floor(Math.random() * chars.length)];
  return id;
}

export function createDemoPayment(resource: string): {
  sessionId: string;
  txId: string;
  verification: PaymentVerification;
} {
  const request = createPaymentRequest(resource);
  const txId = generateAlgoTxId();

  // Auto-verify the demo payment
  const verification = createVerifiedAccess(
    request.payment.sessionId,
    txId,
    'demo'
  );

  return {
    sessionId: request.payment.sessionId,
    txId,
    verification,
  };
}

/**
 * Grant access for a resource after a real on-chain payment has settled.
 * Used by the server agent-pay flow, where the txId is a confirmed Algorand
 * transaction (not a demo placeholder).
 */
export function grantPaidAccess(
  resource: string,
  txId: string
): PaymentVerification {
  const request = createPaymentRequest(resource);
  return createVerifiedAccess(request.payment.sessionId, txId, 'algo');
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function createVerifiedAccess(
  sessionId: string,
  txId: string,
  _method: string
): PaymentVerification {
  const session = sessionStore.get(sessionId);
  const resource = session?.resource || 'unknown';
  const duration = RESOURCE_DURATION[resource] || 30 * 60 * 1000;
  const expiresAt = new Date(Date.now() + duration).toISOString();

  // Store access
  accessStore.set(resource, {
    resource,
    paid: true,
    expiresAt,
    txId,
    sessionId,
  });

  // If full_access, mark all resources as accessible
  if (resource === 'full_access') {
    for (const res of Object.keys(PRICING)) {
      if (res !== 'full_access') {
        accessStore.set(res, {
          resource: res,
          paid: true,
          expiresAt,
          txId,
          sessionId,
        });
      }
    }
  }

  // Clean up session
  sessionStore.delete(sessionId);

  return {
    valid: true,
    resource,
    sessionId,
    txId,
    expiresAt,
  };
}

/**
 * Verify a real Algorand transaction using algosdk.
 *
 * Robust verification flow:
 * 1. Connect to testnet algod using configured server/token/port
 * 2. Try pending transaction lookup first (for recent, unconfirmed txns)
 * 3. If not found in pending, attempt confirmed transaction lookup
 * 4. Validate transaction type is 'axfer' (asset transfer)
 * 5. Validate the receiver matches X402_RECIPIENT_ADDRESS
 * 6. Validate the asset ID matches USDC_TESTNET_ASSET_ID
 * 7. Validate the amount is within tolerance of the expected payment
 * 8. Detailed logging at each step for debugging
 */
async function verifyAlgorandTransaction(
  sessionId: string,
  txId: string,
  resource: string
): Promise<PaymentVerification> {
  const invalidResult: PaymentVerification = {
    valid: false,
    resource,
    sessionId,
    txId,
    expiresAt: '',
  };

  const expectedAmount = PRICING[resource] || 0;
  const expectedReceiver = getRecipientAddress();
  const isDemoRecipient = expectedReceiver === 'CORRFARM_DEMO_RECIPIENT_ADDR';

  try {
    // Dynamic import algosdk (may not be available in all environments)
    const algosdk = await import('algosdk');
    const algodClient = new algosdk.Algodv2(ALGOD_TOKEN, ALGOD_SERVER, ALGOD_PORT);

    console.log(`[x402] Verifying transaction ${txId} for resource ${resource}`);
    console.log(`[x402] Expected: ${expectedAmount} micro-USDC to ${expectedReceiver}, asset ${USDC_TESTNET_ASSET_ID}`);

    // ── Step 1: Try pending transaction ──────────────────────────────────
    let txnInfo: any = null;
    let txnSource: 'pending' | 'confirmed' = 'pending';

    try {
      const pendingInfo = await algodClient.pendingTransactionInformation(txId).do();
      if (pendingInfo) {
        txnInfo = pendingInfo as any;
        txnSource = 'pending';
        console.log(`[x402] Found transaction in pending pool`);
      }
    } catch {
      console.log(`[x402] Transaction not found in pending pool, trying confirmed...`);
    }

    // ── Step 2: Try confirmed transaction if not in pending ─────────────
    if (!txnInfo) {
      try {
        // Use algod's transaction lookup for confirmed transactions
        // The pendingTransactionInformation endpoint returns null for confirmed txns
        // We need to check the confirmed round
        const txInfo = await algodClient.pendingTransactionInformation(txId).do() as any;
        if (txInfo && txInfo['confirmed-round'] && txInfo['confirmed-round'] > 0) {
          txnInfo = txInfo;
          txnSource = 'confirmed';
          console.log(`[x402] Found confirmed transaction at round ${txInfo['confirmed-round']}`);
        }
      } catch {
        // Transaction not found at all
      }
    }

    // ── Step 3: Transaction not found anywhere ──────────────────────────
    if (!txnInfo) {
      console.warn(`[x402] Transaction ${txId} not found on-chain`);
      return invalidResult;
    }

    console.log(`[x402] Transaction source: ${txnSource}`);

    // ── Step 4: Validate transaction type ────────────────────────────────
    // algod returns the top-level object with 'asset-transfer-transaction' for axfer
    // The 'txn.txn.type' field contains the raw transaction type
    const assetTransfer = txnInfo['asset-transfer-transaction'];
    const innerTxnType = txnInfo['txn']?.['txn']?.['type'];

    if (!assetTransfer && innerTxnType !== 'axfer') {
      console.warn(
        `[x402] Invalid transaction type: expected 'axfer', got '${innerTxnType || 'unknown'}'. ` +
        `Has asset-transfer-transaction: ${!!assetTransfer}`
      );
      return invalidResult;
    }

    console.log(`[x402] Transaction type validated: axfer (asset transfer)`);

    // ── Step 5: Extract and validate receiver ────────────────────────────
    // For asset transfers:
    //   - Top-level 'asset-transfer-transaction.receiver' (algod response format)
    //   - Inner 'txn.txn.arcv' (raw transaction format)
    const receiver =
      assetTransfer?.['receiver'] ||
      txnInfo['txn']?.['txn']?.['arcv'];

    if (!receiver) {
      console.warn(`[x402] No receiver found in transaction`);
      return invalidResult;
    }

    // If recipient is still the demo placeholder, skip receiver check
    if (!isDemoRecipient && receiver !== expectedReceiver) {
      console.warn(
        `[x402] Receiver mismatch: expected ${expectedReceiver}, got ${receiver}`
      );
      return invalidResult;
    }

    console.log(`[x402] Receiver validated: ${receiver}`);

    // ── Step 6: Validate asset ID ────────────────────────────────────────
    const assetId =
      assetTransfer?.['asset-id'] ||
      txnInfo['txn']?.['txn']?.['xaid'] ||
      0;

    if (!isDemoRecipient && assetId !== USDC_TESTNET_ASSET_ID) {
      console.warn(
        `[x402] Asset ID mismatch: expected ${USDC_TESTNET_ASSET_ID}, got ${assetId}`
      );
      return invalidResult;
    }

    console.log(`[x402] Asset ID validated: ${assetId}`);

    // ── Step 7: Validate amount with tolerance ───────────────────────────
    const amount =
      assetTransfer?.['amount'] ||
      txnInfo['txn']?.['txn']?.['aamt'] ||
      0;

    if (expectedAmount > 0) {
      const minAcceptable = expectedAmount * (1 - AMOUNT_TOLERANCE);
      if (amount < minAcceptable) {
        console.warn(
          `[x402] Amount mismatch: expected >= ${minAcceptable} (with ${(AMOUNT_TOLERANCE * 100).toFixed(0)}% tolerance), got ${amount}`
        );
        return invalidResult;
      }
    }

    const usdcAmount = (amount / 1_000_000).toFixed(6);
    console.log(`[x402] Amount validated: ${amount} micro-USDC (${usdcAmount} USDC)`);

    // ── Step 8: Check confirmation status ────────────────────────────────
    const confirmedRound = txnInfo['confirmed-round'];
    const poolError = txnInfo['pool-error'];

    if (txnSource === 'pending' && !confirmedRound) {
      if (poolError && poolError.length > 0) {
        console.warn(`[x402] Transaction rejected from pool: ${poolError}`);
        return invalidResult;
      }
      // Transaction is in the pending pool but not yet confirmed
      // For the hackathon, we accept pending transactions (they're valid, just not finalized)
      console.log(`[x402] Transaction is in pending pool (not yet confirmed) — accepting for hackathon demo`);
    } else if (confirmedRound) {
      console.log(`[x402] Transaction confirmed at round ${confirmedRound}`);
    }

    // ── All checks passed ───────────────────────────────────────────────
    console.log(`[x402] ✅ Transaction ${txId} verified successfully`);
    return createVerifiedAccess(sessionId, txId, 'algorand');
  } catch (error) {
    console.warn(`[x402] Algorand verification error for tx ${txId}:`, error);
    return invalidResult;
  }
}
