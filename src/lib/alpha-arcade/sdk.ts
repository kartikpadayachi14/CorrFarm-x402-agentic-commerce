/**
 * CorrFarm — Alpha Arcade SDK Wrapper
 *
 * Tries the Alpha Arcade REST API first using just the API key (no algod needed for read-only).
 * Falls back to @alpha-arcade/sdk if algod credentials are available.
 * Final fallback to mock data if all else fails.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PredictionMarket {
  appId: number;
  question: string;
  description: string;
  category: string;
  yesPrice: number;
  noPrice: number;
  volume: number;
  liquidity: number;
  expiresAt: string;
  imageUrl?: string;
  active: boolean;
}

export interface MarketDetails extends PredictionMarket {
  orderbook: {
    yes: { price: number; quantity: number }[];
    no: { price: number; quantity: number }[];
  };
  recentTrades: {
    side: 'yes' | 'no';
    price: number;
    quantity: number;
    timestamp: string;
  }[];
}

// ---------------------------------------------------------------------------
// Mock data for demo / fallback
// ---------------------------------------------------------------------------

const MOCK_MARKETS: PredictionMarket[] = [
  {
    appId: 3078581851,
    question: 'Will BTC exceed $100k by end of Q2 2026?',
    description: 'Bitcoin price prediction market — resolves YES if BTC/USD trades above $100,000 on any major exchange before June 30, 2026.',
    category: 'crypto',
    yesPrice: 0.67,
    noPrice: 0.33,
    volume: 1250000,
    liquidity: 450000,
    expiresAt: '2026-06-30T23:59:59Z',
    active: true,
  },
  {
    appId: 3078581852,
    question: 'Will Ethereum complete the Dencun upgrade successfully?',
    description: 'Resolves YES if the Ethereum Dencun upgrade is executed on mainnet without critical bugs.',
    category: 'crypto',
    yesPrice: 0.85,
    noPrice: 0.15,
    volume: 890000,
    liquidity: 320000,
    expiresAt: '2025-12-31T23:59:59Z',
    active: true,
  },
  {
    appId: 3078581853,
    question: 'Will SOL flip ETH in market cap?',
    description: 'Resolves YES if Solana market cap exceeds Ethereum market cap at any point.',
    category: 'crypto',
    yesPrice: 0.12,
    noPrice: 0.88,
    volume: 560000,
    liquidity: 180000,
    expiresAt: '2026-12-31T23:59:59Z',
    active: true,
  },
  {
    appId: 3078581854,
    question: 'Will a US Bitcoin ETF be approved in 2025?',
    description: 'Resolves YES if any spot Bitcoin ETF is approved by the SEC in 2025.',
    category: 'crypto',
    yesPrice: 0.92,
    noPrice: 0.08,
    volume: 2100000,
    liquidity: 780000,
    expiresAt: '2025-12-31T23:59:59Z',
    active: true,
  },
  {
    appId: 3078581855,
    question: 'Will Algorand reach top 10 by market cap?',
    description: 'Resolves YES if ALGO is in the top 10 cryptocurrencies by market cap at any point.',
    category: 'crypto',
    yesPrice: 0.08,
    noPrice: 0.92,
    volume: 340000,
    liquidity: 95000,
    expiresAt: '2026-06-30T23:59:59Z',
    active: true,
  },
];

// ---------------------------------------------------------------------------
// SDK Wrapper
// ---------------------------------------------------------------------------

/**
 * Get all active prediction markets.
 *
 * Priority:
 * 1. Alpha Arcade REST API (just needs API key)
 * 2. @alpha-arcade/sdk (needs algod credentials)
 * 3. Mock data fallback
 */
export async function getMarkets(): Promise<PredictionMarket[]> {
  const apiKey = process.env.ALPHA_API_KEY;

  // Strategy 1: Try REST API with just API key
  if (apiKey) {
    try {
      const baseUrl = process.env.ALPHA_API_BASE_URL || 'https://api.alphaarcade.com';
      const url = `${baseUrl}/v1/markets`;
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        signal: AbortSignal.timeout(10000), // 10s timeout
      });

      if (response.ok) {
        const data = await response.json();
        // Handle various response formats
        const markets = Array.isArray(data) ? data : data.markets || data.data || [];
        if (markets.length > 0) {
          return markets.map((m: Record<string, unknown>) => ({
            appId: (m.marketAppId as number) || (m.appId as number) || (m.id as number) || 0,
            question: (m.title as string) || (m.question as string) || '',
            description: (m.description as string) || (m.title as string) || '',
            category: (m.categories as string[])?.[0] || (m.category as string) || 'crypto',
            yesPrice: (m.yesProb as number) ?? (m.yesPrice as number) ?? 0.5,
            noPrice: (m.noProb as number) ?? (m.noPrice as number) ?? 0.5,
            volume: (m.volume as number) ?? 0,
            liquidity: (m.liquidity as number) ?? 0,
            expiresAt: m.endTs
              ? new Date((m.endTs as number) * 1000).toISOString()
              : (m.expiresAt as string) || '',
            imageUrl: (m.image as string) || undefined,
            active: (m.active as boolean) ?? true,
          }));
        }
      } else {
        console.warn(`[AlphaArcade] REST API returned ${response.status}`);
      }
    } catch (error) {
      console.warn('[AlphaArcade] REST API call failed:', error instanceof Error ? error.message : error);
    }
  }

  // Strategy 2: Try @alpha-arcade/sdk if algod credentials are available
  const algodToken = process.env.ALGOD_TOKEN;
  const algodServer = process.env.ALGOD_SERVER;

  if (apiKey && algodToken && algodServer) {
    try {
      const { getLiveMarketsFromApi } = await import('@alpha-arcade/sdk');
      const algosdk = await import('algosdk');

      const algodClient = new algosdk.Algodv2(algodToken, algodServer, process.env.ALGOD_PORT || '');
      const indexerClient = new algosdk.Indexer(
        algodToken,
        process.env.ALGOD_INDEXER_SERVER || algodServer,
        process.env.ALGOD_INDEXER_PORT || ''
      );

      const sdkConfig = {
        algodClient,
        indexerClient,
        signer: null as never,
        activeAddress: '',
        matcherAppId: 3078581851,
        usdcAssetId: 10458941,
        apiKey,
        apiBaseUrl: process.env.ALPHA_API_BASE_URL,
      };

      const alphaMarkets = await getLiveMarketsFromApi(sdkConfig);

      return alphaMarkets.map((m) => ({
        appId: m.marketAppId,
        question: m.title,
        description: m.title,
        category: (m.categories?.[0] as string) || 'crypto',
        yesPrice: m.yesProb ?? 0.5,
        noPrice: m.noProb ?? 0.5,
        volume: m.volume ?? 0,
        liquidity: 0,
        expiresAt: m.endTs ? new Date(m.endTs * 1000).toISOString() : '',
        imageUrl: m.image,
        active: true,
      }));
    } catch (error) {
      console.warn('[AlphaArcade] SDK call failed, returning mock data:', error);
    }
  }

  // Strategy 3: Mock data fallback
  return MOCK_MARKETS.filter((m) => m.active);
}

/**
 * Get details for a specific prediction market.
 */
export async function getMarketDetails(appId: number): Promise<MarketDetails | null> {
  const apiKey = process.env.ALPHA_API_KEY;

  // Try REST API first
  if (apiKey) {
    try {
      const baseUrl = process.env.ALPHA_API_BASE_URL || 'https://api.alphaarcade.com';
      const url = `${baseUrl}/v1/markets/${appId}`;
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        signal: AbortSignal.timeout(10000),
      });

      if (response.ok) {
        const m = await response.json();
        return {
          appId: m.marketAppId || m.appId || appId,
          question: m.title || m.question || '',
          description: m.description || m.title || '',
          category: m.categories?.[0] || m.category || 'crypto',
          yesPrice: m.yesProb ?? m.yesPrice ?? 0.5,
          noPrice: m.noProb ?? m.noPrice ?? 0.5,
          volume: m.volume ?? 0,
          liquidity: m.liquidity ?? 0,
          expiresAt: m.endTs ? new Date(m.endTs * 1000).toISOString() : m.expiresAt || '',
          imageUrl: m.image || undefined,
          active: true,
          orderbook: { yes: [], no: [] },
          recentTrades: [],
        };
      }
    } catch (error) {
      console.warn('[AlphaArcade] REST API getMarketDetails failed:', error instanceof Error ? error.message : error);
    }
  }

  // Fallback to mock
  const market = MOCK_MARKETS.find((m) => m.appId === appId);
  if (!market) return null;

  const midPrice = market.yesPrice;
  const yesOrders = [];
  const noOrders = [];
  for (let i = 0; i < 6; i++) {
    const offset = (i + 1) * 0.02;
    yesOrders.push({
      price: Math.max(0.01, Math.round((midPrice - offset) * 100) / 100),
      quantity: Math.round(Math.random() * 5000 + 500),
    });
    noOrders.push({
      price: Math.max(0.01, Math.round((1 - midPrice - offset) * 100) / 100),
      quantity: Math.round(Math.random() * 5000 + 500),
    });
  }

  const recentTrades = Array.from({ length: 5 }, (_, i) => ({
    side: Math.random() > 0.5 ? 'yes' as const : 'no' as const,
    price: Math.round((midPrice + (Math.random() - 0.5) * 0.1) * 100) / 100,
    quantity: Math.round(Math.random() * 1000 + 100),
    timestamp: new Date(Date.now() - i * 300000).toISOString(),
  }));

  return {
    ...market,
    orderbook: { yes: yesOrders, no: noOrders },
    recentTrades,
  };
}
