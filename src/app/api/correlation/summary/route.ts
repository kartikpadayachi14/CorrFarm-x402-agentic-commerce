import { NextRequest, NextResponse } from 'next/server';
import { getMultiPriceHistory, SYMBOL_MAP } from '@/lib/binance/client';
import { computeCorrelationSummary } from '@/lib/correlation/engine';
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
    const searchParams = request.nextUrl.searchParams;
    const symbolsParam = searchParams.get('symbols');
    const days = parseInt(searchParams.get('days') || '30', 10);
    const method = (searchParams.get('method') || 'pearson') as 'pearson' | 'spearman' | 'kendall';

    let symbols: string[];
    if (symbolsParam) {
      symbols = symbolsParam.split(',').map(s => s.trim());
    } else {
      symbols = Object.keys(SYMBOL_MAP).slice(0, 10);
    }

    const returnsData = await getMultiPriceHistory(symbols, days, '1d');
    const summary = computeCorrelationSummary(returnsData, method);

    return NextResponse.json({ success: true, data: summary });
  } catch (error) {
    console.error('[API /correlation/summary] Error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to compute correlation summary' },
      { status: 500 }
    );
  }
}
