/**
 * CorrFarm — Social Propagation Analysis API Route
 * POST /api/credibility/social-analysis
 *
 * Analyzes text for social media manipulation patterns:
 *   - Bot likelihood
 *   - Coordination detection
 *   - Pump & dump signals
 *   - Hype cycle phase
 *   - Viral coefficient
 *
 * Uses analyzeSocialPropagation() from the enhanced credibility detector.
 */

import { NextRequest, NextResponse } from 'next/server';
import { analyzeSocialPropagation } from '@/lib/credibility/detector';
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
    const { text, shares, likes } = body as {
      text?: string;
      shares?: number;
      likes?: number;
    };

    if (!text) {
      return NextResponse.json(
        { success: false, error: 'text is required' },
        { status: 400 }
      );
    }

    const result = analyzeSocialPropagation(text, shares, likes);

    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    console.error('[API /credibility/social-analysis] Error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to analyze social propagation' },
      { status: 500 }
    );
  }
}
