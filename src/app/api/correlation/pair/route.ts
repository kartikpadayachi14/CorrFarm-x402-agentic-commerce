import { NextRequest, NextResponse } from 'next/server';
import { getPriceHistory } from '@/lib/binance/client';
import { computePairCorrelation, computeRollingCorrelation, computeBestCorrelation } from '@/lib/correlation/engine';
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
    const days = parseInt(searchParams.get('days') || '30', 10);
    const method = (searchParams.get('method') || 'pearson') as 'pearson' | 'spearman' | 'kendall';

    const [historyA, historyB] = await Promise.all([
      getPriceHistory(symbolA, days, '1d'),
      getPriceHistory(symbolB, days, '1d'),
    ]);

    const returnsA = historyA.map(p => p.returns).filter((r): r is number => r !== null);
    const returnsB = historyB.map(p => p.returns).filter((r): r is number => r !== null);

    const pairResult = computePairCorrelation(returnsA, returnsB, method);
    const best = computeBestCorrelation(returnsA, returnsB);
    const rolling = computeRollingCorrelation(returnsA, returnsB, Math.min(30, Math.floor(returnsA.length / 3)));

    return NextResponse.json({
      success: true,
      data: {
        pair: pairResult,
        best,
        rolling,
        symbolA,
        symbolB,
        days,
      },
    });
  } catch (error) {
    console.error('[API /correlation/pair] Error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to compute pair correlation' },
      { status: 500 }
    );
  }
}
