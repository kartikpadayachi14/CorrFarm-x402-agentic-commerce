import { NextRequest, NextResponse } from 'next/server';
import { getTopCryptos, getMultiPriceHistory, SYMBOL_MAP } from '@/lib/binance/client';
import { computeCorrelationMatrix, computeCorrelationSummary } from '@/lib/correlation/engine';
import { checkAccess } from '@/lib/x402/gateway';

export async function GET(request: NextRequest) {
  // x402 payment check
  const paymentHeader = request.headers.get('x-payment') || undefined;
  const access = checkAccess('correlation_matrix', paymentHeader);
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
    const { searchParams } = new URL(request.url);
    const coinsParam = searchParams.get('coins');
    const days = parseInt(searchParams.get('days') || '90', 10);
    const method = (searchParams.get('method') || 'pearson') as 'pearson' | 'spearman' | 'kendall';

    // Determine which coins to analyze
    let coins: string[];
    if (coinsParam) {
      coins = coinsParam.split(',').map((c) => c.trim().toLowerCase());
    } else {
      // Use top 10 from Binance by volume
      const topTickers = await getTopCryptos(10);
      // Map Binance symbols back to coin names
      const topCoinNames = topTickers.map((t) => {
        const entry = Object.entries(SYMBOL_MAP).find(([, v]) => v === t.symbol);
        return entry ? entry[0] : t.symbol.replace('USDT', '').toLowerCase();
      });
      coins = topCoinNames.slice(0, 10);
    }

    // Fetch aligned price/return history
    const multiReturns = await getMultiPriceHistory(coins, days);

    // Compute correlation matrix
    const matrix = computeCorrelationMatrix(multiReturns, method);

    // Compute summary
    const summary = computeCorrelationSummary(multiReturns, method);

    return NextResponse.json({
      success: true,
      data: {
        method,
        coins: matrix.assets,
        days,
        matrix: matrix.matrix,
        summary,
      },
    });
  } catch (error) {
    console.error('[API /correlation/matrix] Error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to compute correlation matrix' },
      { status: 500 }
    );
  }
}
