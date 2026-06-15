import { NextRequest, NextResponse } from 'next/server';
import { checkAccess, createPaymentRequest } from '@/lib/x402/gateway';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { resource } = body as { resource: string };

    if (!resource) {
      return NextResponse.json(
        { success: false, error: 'Resource is required' },
        { status: 400 }
      );
    }

    const access = checkAccess(resource);
    return NextResponse.json({ success: true, data: access });
  } catch (error) {
    console.error('[API /x402/check] Error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to check access' },
      { status: 500 }
    );
  }
}
