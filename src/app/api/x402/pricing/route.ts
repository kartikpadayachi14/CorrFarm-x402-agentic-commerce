import { NextResponse } from 'next/server';
import { getPricing } from '@/lib/x402/gateway';

export async function GET() {
  try {
    const pricing = getPricing();
    return NextResponse.json({ success: true, data: pricing });
  } catch (error) {
    console.error('[API /x402/pricing] Error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to get pricing' },
      { status: 500 }
    );
  }
}
