import { NextRequest, NextResponse } from 'next/server';
import { getPriceHistory, resolveSymbol } from '@/lib/binance/client';
import { checkAccess } from '@/lib/x402/gateway';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ symbol: string }> }
) {
  // x402 payment check
  const paymentHeader = request.headers.get('x-payment') || undefined;
  const access = checkAccess('alpha_markets', paymentHeader);
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
    const { symbol } = await params;
    const { searchParams } = new URL(request.url);
    const days = parseInt(searchParams.get('days') || '90', 10);
    const interval = searchParams.get('interval') || '1d';

    const binanceSymbol = resolveSymbol(symbol);
    const data = await getPriceHistory(binanceSymbol, days, interval);

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('[API /markets/history] Error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch price history' },
      { status: 500 }
    );
  }
}
