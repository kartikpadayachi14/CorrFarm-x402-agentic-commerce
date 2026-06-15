import { NextRequest, NextResponse } from 'next/server';
import { analyzeText, analyzeUrl, analyzeNewsItem } from '@/lib/credibility/detector';
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
    const { text, title, url } = body as { text?: string; title?: string; url?: string };

    let result;

    if (url && !text) {
      result = await analyzeUrl(url);
    } else if (title && text) {
      result = await analyzeNewsItem(title, text, url);
    } else if (text) {
      result = await analyzeText(text, url);
    } else {
      return NextResponse.json(
        { success: false, error: 'Provide text, title+text, or url' },
        { status: 400 }
      );
    }

    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    console.error('[API /credibility/analyze] Error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to analyze credibility' },
      { status: 500 }
    );
  }
}
