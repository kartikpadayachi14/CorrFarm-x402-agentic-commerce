import { NextRequest, NextResponse } from 'next/server';
import { verifyPayment } from '@/lib/x402/gateway';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { sessionId, txId } = body as { sessionId: string; txId: string };

    if (!sessionId || !txId) {
      return NextResponse.json(
        { success: false, error: 'sessionId and txId are required' },
        { status: 400 }
      );
    }

    const verification = await verifyPayment(sessionId, txId);
    return NextResponse.json({ success: true, data: verification });
  } catch (error) {
    console.error('[API /x402/verify] Error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to verify payment' },
      { status: 500 }
    );
  }
}
