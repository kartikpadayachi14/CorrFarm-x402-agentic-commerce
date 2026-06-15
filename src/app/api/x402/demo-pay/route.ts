import { NextRequest, NextResponse } from 'next/server';
import { createDemoPayment } from '@/lib/x402/gateway';

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

    const result = createDemoPayment(resource);
    const amountAlgo = (parseInt(process.env.X402_ALGO_AMOUNT || '50000', 10) / 1e6).toFixed(6);
    return NextResponse.json({
      success: true,
      data: {
        ...result,
        mode: 'demo',
        chain: {
          explorerUrl: `https://lora.algokit.io/testnet/transaction/${result.txId}`,
          amountAlgo,
          sender: process.env.X402_AGENT_ADDRESS || 'AGENT_WALLET',
          recipient: process.env.X402_RECIPIENT_ADDRESS || 'RECIPIENT_WALLET',
        },
      },
    });
  } catch (error) {
    console.error('[API /x402/demo-pay] Error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to create demo payment' },
      { status: 500 }
    );
  }
}
