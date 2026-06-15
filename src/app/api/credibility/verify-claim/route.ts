/**
 * CorrFarm — Market Claim Verification API Route
 * POST /api/credibility/verify-claim
 *
 * Verifies a market-related claim against real price data.
 * Uses verifyMarketClaim() from the enhanced credibility detector.
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyMarketClaim } from '@/lib/credibility/detector';
import { checkAccess } from '@/lib/x402/gateway';

export async function POST(request: NextRequest) {
  // x402 payment check
  const paymentHeader = request.headers.get('x-payment') || undefined;
  const access = checkAccess('credibility_score', paymentHeader);
  if (!access.granted) {
    return NextResponse.json(
      {
        success: false,
        error: 'Payment required',
        payment: access.paymentRequired,
      },
      { status: 402 }
    );
  }

  try {
    const body = await request.json();
    const { claim, symbol } = body as { claim?: string; symbol?: string };

    if (!claim) {
      return NextResponse.json(
        { success: false, error: 'claim is required' },
        { status: 400 }
      );
    }

    const result = await verifyMarketClaim(claim, symbol);

    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    console.error('[API /credibility/verify-claim] Error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to verify market claim' },
      { status: 500 }
    );
  }
}
