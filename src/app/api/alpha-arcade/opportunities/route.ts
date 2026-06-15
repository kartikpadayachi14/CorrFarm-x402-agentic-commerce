import { NextRequest, NextResponse } from 'next/server';

// Simple mock opportunities — the correlation computation is too heavy for serverless
// and crashes the process. This gives instant results for the hackathon demo.

const MOCK_OPPORTUNITIES = [
  {
    marketAppId: 3078581854,
    question: 'Will BTC and ETH be positively correlated (>0.7) over the next 30 days?',
    category: 'correlation',
    marketImpliedProb: 0.78,
    estimatedProb: 0.89,
    edge: 0.11,
    absEdge: 0.11,
    direction: 'buy_yes',
    pair: 'bitcoin,ethereum',
    correlation: 0.87,
    tailDependence: { lower: 0.18, upper: 0.22 },
    volume: 740000,
    liquidity: 290000,
    confidence: 0.72,
    expiresAt: '2025-07-15T23:59:59Z',
  },
  {
    marketAppId: 3078581851,
    question: 'Will BTC exceed $100k by end of Q2 2026?',
    category: 'crypto',
    marketImpliedProb: 0.67,
    estimatedProb: 0.79,
    edge: 0.12,
    absEdge: 0.12,
    direction: 'buy_yes',
    pair: 'bitcoin,ethereum',
    correlation: 0.87,
    tailDependence: { lower: 0.18, upper: 0.22 },
    volume: 1250000,
    liquidity: 450000,
    confidence: 0.65,
    expiresAt: '2026-06-30T23:59:59Z',
  },
  {
    marketAppId: 3078581856,
    question: 'Will DOGE and SHIB 7-day correlation exceed 0.85?',
    category: 'correlation',
    marketImpliedProb: 0.61,
    estimatedProb: 0.73,
    edge: 0.12,
    absEdge: 0.12,
    direction: 'buy_yes',
    pair: 'dogecoin,shiba',
    correlation: 0.82,
    tailDependence: { lower: 0.25, upper: 0.31 },
    volume: 320000,
    liquidity: 95000,
    confidence: 0.58,
    expiresAt: '2025-09-30T23:59:59Z',
  },
  {
    marketAppId: 3078581853,
    question: 'Will SOL flip ETH in market cap?',
    category: 'crypto',
    marketImpliedProb: 0.12,
    estimatedProb: 0.05,
    edge: -0.07,
    absEdge: 0.07,
    direction: 'buy_no',
    pair: 'solana,ethereum',
    correlation: 0.79,
    tailDependence: { lower: 0.14, upper: 0.19 },
    volume: 560000,
    liquidity: 180000,
    confidence: 0.61,
    expiresAt: '2026-12-31T23:59:59Z',
  },
  {
    marketAppId: 3078581858,
    question: 'Will BTC drop below $40k before rising above $100k?',
    category: 'crypto',
    marketImpliedProb: 0.35,
    estimatedProb: 0.22,
    edge: -0.13,
    absEdge: 0.13,
    direction: 'buy_no',
    pair: 'bitcoin,ethereum',
    correlation: 0.87,
    tailDependence: { lower: 0.18, upper: 0.22 },
    volume: 1100000,
    liquidity: 410000,
    confidence: 0.55,
    expiresAt: '2026-12-31T23:59:59Z',
  },
  {
    marketAppId: 3078581852,
    question: 'Will ETH/BTC ratio rise above 0.06 by Q3 2025?',
    category: 'crypto',
    marketImpliedProb: 0.42,
    estimatedProb: 0.51,
    edge: 0.09,
    absEdge: 0.09,
    direction: 'buy_yes',
    pair: 'ethereum,bitcoin',
    correlation: 0.87,
    tailDependence: { lower: 0.18, upper: 0.22 },
    volume: 890000,
    liquidity: 320000,
    confidence: 0.60,
    expiresAt: '2025-09-30T23:59:59Z',
  },
];

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const minEdge = parseFloat(searchParams.get('minEdge') || '0.05');
  const maxResults = parseInt(searchParams.get('limit') || '20', 10);

  const filtered = MOCK_OPPORTUNITIES.filter(o => o.absEdge >= minEdge);
  const limited = filtered.slice(0, maxResults);

  return NextResponse.json({
    success: true,
    data: limited,
    meta: {
      source: 'demo',
      totalOpportunities: filtered.length,
      returned: limited.length,
      minEdge,
      generatedAt: new Date().toISOString(),
    },
  });
}
