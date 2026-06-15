import { NextRequest, NextResponse } from 'next/server';
import { getMultiPriceHistory, SYMBOL_MAP } from '@/lib/binance/client';
import { estimateStudentTCopula, computeTailDependence } from '@/lib/correlation/copula';
import { checkAccess } from '@/lib/x402/gateway';

export async function GET(request: NextRequest) {
  // x402 payment check
  const paymentHeader = request.headers.get('x-payment') || undefined;
  const access = checkAccess('copula_analysis', paymentHeader);
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
    const days = parseInt(searchParams.get('days') || '90', 10);

    let symbols: string[];
    if (symbolsParam) {
      symbols = symbolsParam.split(',').map(s => s.trim());
    } else {
      symbols = Object.keys(SYMBOL_MAP).slice(0, 8);
    }

    const returnsData = await getMultiPriceHistory(symbols, days, '1d');
    const copulaResult = estimateStudentTCopula(returnsData);

    return NextResponse.json({ success: true, data: copulaResult });
  } catch (error) {
    console.error('[API /correlation/copula] Error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to compute copula analysis' },
      { status: 500 }
    );
  }
}
