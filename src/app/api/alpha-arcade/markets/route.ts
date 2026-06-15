import { NextRequest, NextResponse } from 'next/server';

// ---------------------------------------------------------------------------
// Alpha Arcade Live Markets API
// Endpoint: GET /api/alpha-arcade/markets
// Uses the real Alpha Arcade REST API: platform.alphaarcade.com/api/get-live-markets
// Auth: x-api-key header
// ---------------------------------------------------------------------------

interface AlphaOption {
  id: string;
  label: string;
  percentage: number;
  volume: number;
  marketAppId: number;
  yesProb: number;     // microunits: 159500 = $0.1595 = 15.95%
  noProb: number;
  yesAssetId: number;
  noAssetId: number;
  feeBasePercent: number;
  midpoint: number;
}

interface AlphaMarket {
  id: string;
  title: string;
  slug: string;
  image: string;
  categories: string[];
  featured: boolean;
  volume: number;
  twentyFourHrVolume: number;
  endTs: number;        // milliseconds timestamp
  feeBasePercent: number;
  options: AlphaOption[];
  isLive?: number;
}

// Normalised market for our UI
interface NormalisedMarket {
  appId: number;
  marketId: string;
  question: string;
  description: string;
  category: string;
  image: string;
  yesPrice: number;    // 0-1 fraction (e.g. 0.67)
  noPrice: number;     // 0-1 fraction (e.g. 0.33)
  volume: number;
  liquidity: number;
  expiresAt: string;
  active: boolean;
  options: {
    id: string;
    label: string;
    percentage: number;
    yesProb: number;
    noProb: number;
    marketAppId: number;
  }[];
  slug: string;
  featured: boolean;
  twentyFourHrVolume: number;
}

function normaliseMarket(m: AlphaMarket): NormalisedMarket | null {
  try {
    // Primary option for the main YES/NO display
    const primaryOption = m.options?.[0];
    const yesProb = primaryOption
      ? primaryOption.yesProb / 1_000_000   // microunits → fraction
      : 0.5;
    const noProb = primaryOption
      ? primaryOption.noProb / 1_000_000
      : 0.5;

    const category = Array.isArray(m.categories) && m.categories.length > 0
      ? m.categories[0]
      : 'General';

    return {
      appId: primaryOption?.marketAppId ?? 0,
      marketId: m.id,
      question: m.title || 'Unknown Market',
      description: m.title || '',
      category,
      image: m.image || '',
      yesPrice: Math.round(yesProb * 100) / 100,
      noPrice: Math.round(noProb * 100) / 100,
      volume: m.twentyFourHrVolume ?? m.volume ?? 0,
      liquidity: m.volume ?? 0,
      expiresAt: m.endTs ? new Date(m.endTs).toISOString() : '',
      active: (m.isLive ?? 1) === 1,
      options: (m.options || []).map((o) => {
        const oYes = typeof o.yesProb === 'number' ? o.yesProb / 1_000_000 : 0.5;
        const oNo = typeof o.noProb === 'number' ? o.noProb / 1_000_000 : 1 - oYes;
        return {
          id: o.id,
          label: o.label ?? 'Option',
          percentage: typeof o.percentage === 'number' ? o.percentage : Math.round(oYes * 100),
          yesProb: oYes,
          noProb: oNo,
          marketAppId: o.marketAppId ?? primaryOption?.marketAppId ?? 0,
        };
      }),
      slug: m.slug || '',
      featured: m.featured ?? false,
      twentyFourHrVolume: m.twentyFourHrVolume ?? 0,
    };
  } catch (err) {
    console.warn('[AlphaArcade] Failed to normalise market:', err);
    return null;
  }
}

// Fallback mock data (only used when API is unreachable)
const MOCK_MARKETS: NormalisedMarket[] = [
  {
    appId: 1, marketId: 'mock-1',
    question: 'Will BTC exceed $100k by end of Q2 2026?',
    description: 'Bitcoin price prediction market',
    category: 'Crypto', image: '', yesPrice: 0.67, noPrice: 0.33,
    volume: 1250000, liquidity: 450000,
    expiresAt: '2026-06-30T23:59:59Z', active: true,
    options: [
      { id: 'opt-1-yes', label: 'Yes', percentage: 67, yesProb: 0.67, noProb: 0.33, marketAppId: 1 },
      { id: 'opt-1-no', label: 'No', percentage: 33, yesProb: 0.33, noProb: 0.67, marketAppId: 1 },
    ],
    slug: 'btc-100k-q2-2026', featured: true, twentyFourHrVolume: 125000,
  },
  {
    appId: 2, marketId: 'mock-2',
    question: 'Will ETH flip $5k before 2027?',
    description: 'Ethereum price prediction',
    category: 'Crypto', image: '', yesPrice: 0.42, noPrice: 0.58,
    volume: 890000, liquidity: 320000,
    expiresAt: '2027-01-01T00:00:00Z', active: true,
    options: [
      { id: 'opt-2-yes', label: 'Yes', percentage: 42, yesProb: 0.42, noProb: 0.58, marketAppId: 2 },
      { id: 'opt-2-no', label: 'No', percentage: 58, yesProb: 0.58, noProb: 0.42, marketAppId: 2 },
    ],
    slug: 'eth-5k-2027', featured: false, twentyFourHrVolume: 89000,
  },
  {
    appId: 3, marketId: 'mock-3',
    question: 'Will SOL reach top 3 by market cap?',
    description: 'Solana market cap prediction',
    category: 'Crypto', image: '', yesPrice: 0.12, noPrice: 0.88,
    volume: 560000, liquidity: 180000,
    expiresAt: '2026-12-31T23:59:59Z', active: true,
    options: [
      { id: 'opt-3-yes', label: 'Yes', percentage: 12, yesProb: 0.12, noProb: 0.88, marketAppId: 3 },
      { id: 'opt-3-no', label: 'No', percentage: 88, yesProb: 0.88, noProb: 0.12, marketAppId: 3 },
    ],
    slug: 'sol-top-3', featured: false, twentyFourHrVolume: 56000,
  },
  {
    appId: 4, marketId: 'mock-4',
    question: 'Will a US Bitcoin ETF see >$500M net inflows in a single week?',
    description: 'Bitcoin ETF inflow prediction',
    category: 'Crypto', image: '', yesPrice: 0.55, noPrice: 0.45,
    volume: 2100000, liquidity: 780000,
    expiresAt: '2025-12-31T23:59:59Z', active: true,
    options: [
      { id: 'opt-4-yes', label: 'Yes', percentage: 55, yesProb: 0.55, noProb: 0.45, marketAppId: 4 },
      { id: 'opt-4-no', label: 'No', percentage: 45, yesProb: 0.45, noProb: 0.55, marketAppId: 4 },
    ],
    slug: 'btc-etf-500m', featured: true, twentyFourHrVolume: 210000,
  },
  {
    appId: 5, marketId: 'mock-5',
    question: 'Will ALGO reach top 20 by market cap in 2026?',
    description: 'Algorand market cap prediction',
    category: 'Crypto', image: '', yesPrice: 0.18, noPrice: 0.82,
    volume: 340000, liquidity: 95000,
    expiresAt: '2026-12-31T23:59:59Z', active: true,
    options: [
      { id: 'opt-5-yes', label: 'Yes', percentage: 18, yesProb: 0.18, noProb: 0.82, marketAppId: 5 },
      { id: 'opt-5-no', label: 'No', percentage: 82, yesProb: 0.82, noProb: 0.18, marketAppId: 5 },
    ],
    slug: 'algo-top-20', featured: false, twentyFourHrVolume: 34000,
  },
  {
    appId: 6, marketId: 'mock-6',
    question: 'Will BTC and ETH be positively correlated (>0.7) over the next 30 days?',
    description: 'Correlation prediction market',
    category: 'Correlation', image: '', yesPrice: 0.78, noPrice: 0.22,
    volume: 740000, liquidity: 290000,
    expiresAt: '2025-07-15T23:59:59Z', active: true,
    options: [
      { id: 'opt-6-yes', label: 'Yes', percentage: 78, yesProb: 0.78, noProb: 0.22, marketAppId: 6 },
      { id: 'opt-6-no', label: 'No', percentage: 22, yesProb: 0.22, noProb: 0.78, marketAppId: 6 },
    ],
    slug: 'btc-eth-corr-07', featured: false, twentyFourHrVolume: 74000,
  },
];

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const category = searchParams.get('category');
  const limit = parseInt(searchParams.get('limit') || '50', 10);
  const apiKey = process.env.ALPHA_API_KEY;

  let markets: NormalisedMarket[] = [];
  let source = 'mock';

  // ── Try Live Alpha Arcade API ──────────────────────────────────────────
  if (apiKey) {
    // Try multiple endpoint patterns — Alpha Arcade has used different URLs
    const endpoints = [
      { url: 'https://platform.alphaarcade.com/api/get-live-markets', header: 'x-api-key' },
      { url: 'https://api.alphaarcade.com/v1/markets', header: 'Authorization' },
      { url: 'https://platform.alphaarcade.com/api/markets', header: 'x-api-key' },
    ];

    for (const endpoint of endpoints) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 8000); // 8s timeout to prevent crash

        const headers: Record<string, string> = {
          'Accept': 'application/json',
        };
        if (endpoint.header === 'Authorization') {
          headers['Authorization'] = `Bearer ${apiKey}`;
        } else {
          headers['x-api-key'] = apiKey;
        }

        const response = await fetch(endpoint.url, {
          method: 'GET',
          headers,
          signal: controller.signal,
        });
        clearTimeout(timeoutId);

        if (response.ok) {
          const data = await response.json();
          const rawMarkets: AlphaMarket[] = Array.isArray(data)
            ? data
            : data.markets || data.data || [];

          if (rawMarkets.length > 0) {
            // Filter for markets with some volume or featured
            const activeMarkets = rawMarkets.filter(m =>
              (m.twentyFourHrVolume ?? m.volume ?? 0) > 0 || m.featured
            );

            // Sort: featured first, then by 24h volume descending
            activeMarkets.sort((a, b) => {
              if (a.featured !== b.featured) return a.featured ? -1 : 1;
              return (b.twentyFourHrVolume ?? 0) - (a.twentyFourHrVolume ?? 0);
            });

            const toProcess = activeMarkets.slice(0, Math.min(limit, 30));

            const normalised = toProcess
              .map(normaliseMarket)
              .filter((m): m is NormalisedMarket => m !== null && m.active);

            if (normalised.length > 0) {
              markets = normalised;
              source = 'api';
              break; // Success — stop trying other endpoints
            }
          }
        } else {
          console.warn(`[AlphaArcade] ${endpoint.url} returned ${response.status}`);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes('abort')) {
          console.warn(`[AlphaArcade] ${endpoint.url} timed out (8s)`);
        } else {
          console.warn(`[AlphaArcade] ${endpoint.url} failed:`, msg);
        }
      }
    }
  }

  // ── Fallback to mock ───────────────────────────────────────────────────
  if (markets.length === 0) {
    markets = MOCK_MARKETS;
    source = apiKey ? 'api-fallback' : 'mock';
  }

  // Filter by category if specified
  if (category) {
    markets = markets.filter((m) => m.category.toLowerCase() === category.toLowerCase());
  }

  return NextResponse.json({
    success: true,
    data: markets,
    meta: {
      source,
      total: markets.length,
      configured: !!apiKey,
      timestamp: new Date().toISOString(),
    },
  });
}
