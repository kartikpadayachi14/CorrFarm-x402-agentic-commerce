import { NextResponse } from 'next/server';
import { getAgentAddress } from '@/lib/x402/agent-pay';
import { getWalletInfo } from '@/lib/x402/wallet';

/**
 * Status of the server agent wallet used for real on-chain x402 payments.
 * The UI uses this to show whether "Real payment" mode is ready (funded).
 */
export async function GET() {
  const address = getAgentAddress();
  const configured = !!process.env.X402_AGENT_MNEMONIC;
  const amountMicro = parseInt(process.env.X402_ALGO_AMOUNT || '50000', 10);

  if (!address) {
    return NextResponse.json({
      success: true,
      data: { configured: false, address: null, balanceAlgo: '0', funded: false, perPaymentAlgo: (amountMicro / 1e6).toFixed(6) },
    });
  }

  let balanceMicro = 0;
  try {
    const info = await getWalletInfo(address);
    balanceMicro = info.balance;
  } catch {
    /* network hiccup — report zero */
  }

  return NextResponse.json({
    success: true,
    data: {
      configured,
      address,
      balanceAlgo: (balanceMicro / 1e6).toFixed(6),
      funded: balanceMicro >= amountMicro + 101_000,
      perPaymentAlgo: (amountMicro / 1e6).toFixed(6),
      faucetUrl: `https://lora.algokit.io/testnet?account=${address}`,
    },
  });
}
