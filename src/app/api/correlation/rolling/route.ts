import { NextRequest, NextResponse } from 'next/server';
import { getPriceHistory } from '@/lib/binance/client';
import { computeRollingCorrelation } from '@/lib/correlation/engine';
import { checkAccess } from '@/lib/x402/gateway';

export async function GET(request: NextRequest) {
  // x402 payment check
  const paymentHeader = request.headers.get('x-payment') || undefined;
  const access = checkAccess('pair_correlation', paymentHeader);
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
    const searchParams = request.nextUrl.searchParams;
    const symbolA = searchParams.get('symbolA') || 'bitcoin';
    const symbolB = searchParams.get('symbolB') || 'ethereum';
    const days = parseInt(searchParams.get('days') || '90', 10);
    const window = parseInt(searchParams.get('window') || '30', 10);

    const [historyA, historyB] = await Promise.all([
      getPriceHistory(symbolA, days, '1d'),
      getPriceHistory(symbolB, days, '1d'),
    ]);

    const returnsA = historyA.map(p => p.returns).filter((r): r is number => r !== null);
    const returnsB = historyB.map(p => p.returns).filter((r): r is number => r !== null);

    const rolling = computeRollingCorrelation(returnsA, returnsB, window);

    return NextResponse.json({ success: true, data: rolling });
  } catch (error) {
    console.error('[API /correlation/rolling] Error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to compute rolling correlation' },
      { status: 500 }
    );
  }
}
