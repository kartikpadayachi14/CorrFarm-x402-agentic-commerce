import { NextRequest, NextResponse } from 'next/server';
import { getAccessStatus } from '@/lib/x402/gateway';

export async function GET(request: NextRequest) {
  try {
    const status = getAccessStatus();

    return NextResponse.json({
      success: true,
      data: {
        accessStatus: status,
        totalActive: Object.keys(status).length,
      },
    });
  } catch (error) {
    console.error('[API /x402/payments] Error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to get payment status' },
      { status: 500 }
    );
  }
}
