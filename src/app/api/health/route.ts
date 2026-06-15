import { NextRequest, NextResponse } from 'next/server';
import { getAccessStatus } from '@/lib/x402/gateway';
import { ALGOD_SERVER } from '@/lib/x402/wallet';

export async function GET(_request: NextRequest) {
  try {
    const recipientAddr = process.env.X402_RECIPIENT_ADDRESS;
    const bypassMode = process.env.BYPASS_X402 === 'true';
    const openaiKey = !!process.env.OPENAI_API_KEY;
    const openrouterKey = !!process.env.OPENROUTER_API_KEY;

    const accessStatus = getAccessStatus();

    return NextResponse.json({
      success: true,
      data: {
        status: 'healthy',
        service: 'CorrFarm API',
        version: '1.1.0',
        network: 'algorand:SGO1GKSzyE7IEPItTxCByw9x8FmnrCDexi9/cOUJOiI=',
        wallet: {
          configured: !!recipientAddr && recipientAddr !== 'CORRFARM_DEMO_RECIPIENT_ADDR',
          address: recipientAddr || 'not configured (demo mode)',
          algodServer: ALGOD_SERVER,
          usdcAssetId: parseInt(process.env.USDC_TESTNET_ASSET_ID || '10458941', 10),
          features: ['generate', 'info', 'usdc-balance', 'faucet', 'verify-mnemonic'],
        },
        x402: {
          bypassMode,
          activeAccessCount: Object.keys(accessStatus).length,
          activeAccess: accessStatus,
        },
        credibility: {
          llmAvailable: openaiKey || openrouterKey,
          llmProvider: openrouterKey ? 'openrouter' : openaiKey ? 'openai' : 'none',
          fallbackMethod: 'heuristic',
          features: {
            marketReactionVerification: true,
            financialNLP: true,
            sourceCredibilityAnalysis: true,
            socialPropagationAnalysis: true,
            marketClaimVerification: true,
          },
          dimensions: [
            'sensationalism',
            'factualConsistency',
            'sourceReliability',
            'emotionalManipulation',
            'marketConsistency',
            'marketReaction',
            'financialNLP',
            'sourceCredibility',
            'socialPropagation',
          ],
        },
        endpoints: {
          new: [
            '/api/credibility/verify-claim',
            '/api/credibility/social-analysis',
            '/api/x402/wallet',
          ],
          existing: [
            '/api/health',
            '/api/alpha-arcade/markets',
            '/api/alpha-arcade/opportunities',
            '/api/correlation/copula',
            '/api/correlation/dcc-garch',
            '/api/correlation/matrix',
            '/api/correlation/pair',
            '/api/correlation/pair/[coinA]/[coinB]',
            '/api/correlation/rolling',
            '/api/correlation/summary',
            '/api/credibility/analyze',
            '/api/credibility/news',
            '/api/markets/overview',
            '/api/markets/history/[symbol]',
            '/api/x402/check',
            '/api/x402/demo-pay',
            '/api/x402/payments',
            '/api/x402/pricing',
            '/api/x402/verify',
            '/api/x402/webhooks',
          ],
        },
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error('[API /health] Error:', error);
    return NextResponse.json(
      { success: false, error: 'Health check failed' },
      { status: 500 }
    );
  }
}
