/**
 * CorrFarm — Wallet Info API Route
 * GET /api/x402/wallet
 *
 * Provides Algorand testnet wallet utilities:
 *   - Generate new testnet wallet
 *   - Look up account info and balances
 *   - Check USDC balance
 *   - Get faucet funding URL
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  generateTestnetWallet,
  getWalletInfo,
  checkUSDCBalance,
  fundFromFaucet,
  verifyMnemonic,
  ALGOD_SERVER,
} from '@/lib/x402/wallet';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const action = searchParams.get('action') || 'status';
    const address = searchParams.get('address');
    const mnemonic = searchParams.get('mnemonic');

    switch (action) {
      case 'generate': {
        // Generate a new testnet wallet
        const wallet = generateTestnetWallet();
        const faucet = fundFromFaucet(wallet.address);
        return NextResponse.json({
          success: true,
          data: {
            wallet: {
              address: wallet.address,
              mnemonic: wallet.mnemonic,
            },
            faucet,
            network: 'algorand-testnet',
            warning: 'Store the mnemonic securely. Never share or commit it to version control.',
          },
        });
      }

      case 'info': {
        // Look up account information
        if (!address) {
          return NextResponse.json(
            { success: false, error: 'address parameter is required for info action' },
            { status: 400 }
          );
        }

        const walletInfo = await getWalletInfo(address);
        return NextResponse.json({
          success: true,
          data: walletInfo,
        });
      }

      case 'usdc-balance': {
        // Check USDC balance for an address
        if (!address) {
          return NextResponse.json(
            { success: false, error: 'address parameter is required for usdc-balance action' },
            { status: 400 }
          );
        }

        const usdcBalance = await checkUSDCBalance(address);
        return NextResponse.json({
          success: true,
          data: usdcBalance,
        });
      }

      case 'faucet': {
        // Get faucet funding URL
        if (!address) {
          return NextResponse.json(
            { success: false, error: 'address parameter is required for faucet action' },
            { status: 400 }
          );
        }

        const faucet = fundFromFaucet(address);
        return NextResponse.json({
          success: true,
          data: faucet,
        });
      }

      case 'verify-mnemonic': {
        // Verify a mnemonic phrase
        if (!mnemonic) {
          return NextResponse.json(
            { success: false, error: 'mnemonic parameter is required for verify-mnemonic action' },
            { status: 400 }
          );
        }

        try {
          const derivedAddress = verifyMnemonic(mnemonic);
          return NextResponse.json({
            success: true,
            data: {
              valid: true,
              address: derivedAddress,
            },
          });
        } catch {
          return NextResponse.json({
            success: true,
            data: {
              valid: false,
              error: 'Invalid mnemonic phrase',
            },
          });
        }
      }

      case 'status':
      default: {
        // Return wallet service status
        const recipientAddr = process.env.X402_RECIPIENT_ADDRESS;
        return NextResponse.json({
          success: true,
          data: {
            service: 'CorrFarm Wallet API',
            network: 'algorand-testnet',
            algodServer: ALGOD_SERVER,
            recipientConfigured: !!recipientAddr && recipientAddr !== 'CORRFARM_DEMO_RECIPIENT_ADDR',
            recipientAddress: recipientAddr || 'not configured (demo mode)',
            actions: ['generate', 'info', 'usdc-balance', 'faucet', 'verify-mnemonic', 'status'],
          },
        });
      }
    }
  } catch (error) {
    console.error('[API /x402/wallet] Error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Wallet operation failed' },
      { status: 500 }
    );
  }
}
