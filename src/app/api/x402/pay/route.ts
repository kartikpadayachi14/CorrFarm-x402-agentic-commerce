import { NextRequest, NextResponse } from 'next/server';
import { grantPaidAccess } from '@/lib/x402/gateway';
import {
  sendAgentPayment,
  AgentNotConfiguredError,
  AgentUnfundedError,
} from '@/lib/x402/agent-pay';

/**
 * Real on-chain x402 payment. The server agent wallet sends a testnet ALGO
 * micro-payment to the recipient, then grants access for the resource.
 * Returns the confirmed on-chain txId (clickable on the Algorand explorer).
 *
 * Falls back with a clear, actionable error if the agent isn't configured or
 * funded — the client can then drop back to /api/x402/demo-pay.
 */
export async function POST(request: NextRequest) {
  try {
    const { resource } = await request.json();
    if (!resource || typeof resource !== 'string') {
      return NextResponse.json(
        { success: false, error: 'Missing "resource"' },
        { status: 400 }
      );
    }

    const payment = await sendAgentPayment();
    const verification = grantPaidAccess(resource, payment.txId);

    return NextResponse.json({
      success: true,
      data: {
        mode: 'onchain',
        sessionId: verification.sessionId,
        txId: payment.txId,
        verification,
        chain: {
          confirmedRound: payment.confirmedRound,
          amountAlgo: payment.amountAlgo,
          sender: payment.sender,
          recipient: payment.recipient,
          explorerUrl: payment.explorerUrl,
        },
      },
    });
  } catch (err) {
    if (err instanceof AgentNotConfiguredError) {
      return NextResponse.json(
        { success: false, error: err.message, code: 'AGENT_NOT_CONFIGURED' },
        { status: 503 }
      );
    }
    if (err instanceof AgentUnfundedError) {
      return NextResponse.json(
        { success: false, error: err.message, code: 'AGENT_UNFUNDED' },
        { status: 503 }
      );
    }
    return NextResponse.json(
      {
        success: false,
        error: err instanceof Error ? err.message : 'Payment failed',
      },
      { status: 500 }
    );
  }
}
