import { NextRequest, NextResponse } from 'next/server';
import { fetchCryptoNews } from '@/lib/credibility/detector';
import { checkAccess } from '@/lib/x402/gateway';

export async function GET(request: NextRequest) {
  // x402 payment check
  const paymentHeader = request.headers.get('x-payment') || undefined;
  const access = checkAccess('news_analysis', paymentHeader);
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
    const limit = parseInt(searchParams.get('limit') || '20', 10);

    const news = await fetchCryptoNews(limit);

    return NextResponse.json({ success: true, data: news });
  } catch (error) {
    console.error('[API /credibility/news] Error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to fetch news' },
      { status: 500 }
    );
  }
}
