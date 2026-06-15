/**
 * CorrFarm — Algorand Testnet Wallet Utilities
 *
 * Provides wallet generation, account info lookup, and USDC balance checking
 * for the x402 payment gateway on Algorand testnet.
 *
 * Uses https://testnet-api.algonode.cloud as the algod server.
 */

import algosdk from 'algosdk';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const ALGOD_SERVER = process.env.ALGOD_SERVER || 'https://testnet-api.algonode.cloud';
const ALGOD_TOKEN = process.env.ALGOD_TOKEN || '';
const ALGOD_PORT = process.env.ALGOD_PORT || '';

/**
 * USDC asset ID on Algorand testnet.
 * Source: @x402/avm USDC_TESTNET_ASA_ID = 10458941
 * (Mainnet USDC is 31566704 — do NOT use on testnet)
 */
const USDC_TESTNET_ASSET_ID = parseInt(process.env.USDC_TESTNET_ASSET_ID || '10458941', 10);

/** Lora faucet URL for funding testnet accounts */
const FAUCET_URL = 'https://lora.algokit.io/testnet';

// ---------------------------------------------------------------------------
// Algod Client Singleton
// ---------------------------------------------------------------------------

let _algodClient: algosdk.Algodv2 | null = null;

function getAlgodClient(): algosdk.Algodv2 {
  if (!_algodClient) {
    _algodClient = new algosdk.Algodv2(ALGOD_TOKEN, ALGOD_SERVER, ALGOD_PORT);
  }
  return _algodClient;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface GeneratedWallet {
  address: string;
  mnemonic: string;
}

export interface WalletInfo {
  address: string;
  balance: number; // microAlgos
  assets: Array<{
    'asset-id': number;
    amount: number;
    'is-frozen': boolean;
    'creator'?: string;
    'unit-name'?: string;
    'name'?: string;
    decimals?: number;
  }>;
  status: string;
  round: number;
}

export interface USDCBalance {
  address: string;
  assetId: number;
  balance: number; // in USDC base units (micro-USDC, 6 decimals)
  usdcFormatted: string; // human-readable e.g. "1.500000"
  isOptedIn: boolean;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Generate a new Algorand testnet wallet.
 *
 * Creates a fresh keypair using algosdk and returns both the
 * address and the 25-word mnemonic for recovery.
 *
 * IMPORTANT: The mnemonic should be stored securely and never
 * shared or committed to version control.
 */
export function generateTestnetWallet(): GeneratedWallet {
  const account = algosdk.generateAccount();
  const address = account.addr.toString();
  const mnemonic = algosdk.secretKeyToMnemonic(account.sk);

  return { address, mnemonic };
}

/**
 * Look up account information from Algorand testnet via algod.
 *
 * @param address - The Algorand wallet address to look up
 * @returns Account info including balance, assets, and status
 */
export async function getWalletInfo(address: string): Promise<WalletInfo> {
  const client = getAlgodClient();

  try {
    const accountInfo = await client.accountInformation(address).do() as any;

    return {
      address,
      balance: accountInfo.amount ?? 0,
      assets: (accountInfo.assets ?? []).map((asset: any) => ({
        'asset-id': asset['asset-id'],
        amount: asset.amount ?? 0,
        'is-frozen': asset['is-frozen'] ?? false,
        creator: asset.creator,
      })),
      status: accountInfo.status ?? 'unknown',
      round: accountInfo.round ?? 0,
    };
  } catch (error) {
    console.error('[wallet] Failed to get account info:', error);
    throw new Error(
      `Failed to get wallet info for ${address}: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Check the USDC asset balance for a given wallet address.
 *
 * Verifies whether the account is opted into the USDC testnet asset
 * and returns the balance in both base units and formatted USDC.
 *
 * @param address - The Algorand wallet address
 * @returns USDC balance info including opt-in status
 */
export async function checkUSDCBalance(address: string): Promise<USDCBalance> {
  const client = getAlgodClient();

  try {
    const accountInfo = await client.accountInformation(address).do() as any;
    const assets = accountInfo.assets ?? [];

    // Find the USDC asset in the account's holdings
    const usdcAsset = assets.find(
      (asset: any) => asset['asset-id'] === USDC_TESTNET_ASSET_ID
    );

    if (!usdcAsset) {
      return {
        address,
        assetId: USDC_TESTNET_ASSET_ID,
        balance: 0,
        usdcFormatted: '0.000000',
        isOptedIn: false,
      };
    }

    const balance = usdcAsset.amount ?? 0;
    // USDC has 6 decimals
    const usdcFormatted = (balance / 1_000_000).toFixed(6);

    return {
      address,
      assetId: USDC_TESTNET_ASSET_ID,
      balance,
      usdcFormatted,
      isOptedIn: true,
    };
  } catch (error) {
    console.error('[wallet] Failed to check USDC balance:', error);
    throw new Error(
      `Failed to check USDC balance for ${address}: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Get the faucet URL and funding instructions for a testnet account.
 *
 * Note: The Lora faucet requires manual interaction — this function
 * returns the URL and pre-fills the address for convenience.
 * Programmatic faucet funding is not supported to prevent abuse.
 *
 * @param address - The Algorand wallet address to fund
 * @returns Object with faucet URL and funding instructions
 */
export function fundFromFaucet(address: string): {
  faucetUrl: string;
  instructions: string[];
} {
  return {
    faucetUrl: `${FAUCET_URL}?account=${address}`,
    instructions: [
      '1. Open the faucet URL in your browser',
      '2. Click "Fund Account" to receive test ALGO',
      '3. Wait for the transaction to confirm (~5 seconds)',
      '4. Use the funded account to opt-in to USDC asset and make payments',
      '',
      'To opt-in to USDC (asset ID ' + USDC_TESTNET_ASSET_ID + '):',
      '  - Use Pera Wallet or any Algorand wallet to add the asset',
      '  - Or use algosdk to send a 0-amount asset transfer to yourself',
    ],
  };
}

/**
 * Verify a mnemonic phrase and return the corresponding address.
 *
 * Useful for validating that a stored mnemonic is correct.
 *
 * @param mnemonic - The 25-word mnemonic phrase
 * @returns The Algorand address derived from the mnemonic
 */
export function verifyMnemonic(mnemonic: string): string {
  try {
    const account = algosdk.mnemonicToSecretKey(mnemonic);
    return account.addr.toString();
  } catch (error) {
    throw new Error(
      `Invalid mnemonic phrase: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Re-export the algod client for use by other modules (e.g., gateway.ts).
 */
export { getAlgodClient, USDC_TESTNET_ASSET_ID, ALGOD_SERVER };
