/**
 * CorrFarm — Alpha Arcade MCP Tools Integration
 *
 * REST-like wrapper that mirrors the Alpha Arcade MCP tools as async methods.
 * Tries the Alpha Arcade REST API first using just the API key (no algod needed for read-only).
 * Falls back to mock data for development/demo.
 *
 * IMPORTANT: Server-side only — do not import from client components.
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
    yes: OrderBookEntry[];
    no: OrderBookEntry[];
  };
  recentTrades: Trade[];
}

export interface OrderBookEntry {
  price: number;
  quantity: number;
}

export interface Trade {
  side: 'yes' | 'no';
  price: number;
  quantity: number;
  timestamp: string;
}

export interface PriceHistoryPoint {
  timestamp: string;
  yesPrice: number;
  noPrice: number;
  volume: number;
}

export interface RewardsInfo {
  address: string;
  totalRewards: number;
  pendingRewards: number;
  claimedRewards: number;
  markets: {
    appId: number;
    question: string;
    lpAmount: number;
    pendingRewards: number;
    sharePercent: number;
  }[];
}

export interface OrderResult {
  orderId: string;
  appId: number;
  side: 'yes' | 'no';
  price: number;
  quantity: number;
  status: 'pending' | 'filled' | 'partial' | 'cancelled';
  txId?: string;
  createdAt: string;
}

export interface CancelOrderResult {
  orderId: string;
  appId: number;
  status: 'cancelled';
  txId?: string;
  cancelledAt: string;
}

export interface LiquidityResult {
  appId: number;
  lpAmount: number;
  lpShares: number;
  sharePercent: number;
  txId?: string;
  status: 'success' | 'pending';
  createdAt: string;
}

export interface MCPCallResult<T> {
  success: boolean;
  data?: T;
  error?: string;
  source: 'api' | 'mock';
}

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

const MOCK_MARKETS: PredictionMarket[] = [
  {
    appId: 3078581851,
    question: 'Will BTC exceed $100k by end of Q2 2026?',
    description:
      'Bitcoin price prediction market — resolves YES if BTC/USD trades above $100,000 on any major exchange before June 30, 2026.',
    category: 'crypto',
    yesPrice: 0.67,
    noPrice: 0.33,
    volume: 1_250_000,
    liquidity: 450_000,
    expiresAt: '2026-06-30T23:59:59Z',
    active: true,
  },
  {
    appId: 3078581852,
    question: 'Will ETH/BTC ratio rise above 0.06 by Q3 2025?',
    description:
      'Resolves YES if the ETH/BTC trading pair exceeds 0.06 on Binance before September 30, 2025.',
    category: 'crypto',
    yesPrice: 0.42,
    noPrice: 0.58,
    volume: 890_000,
    liquidity: 320_000,
    expiresAt: '2025-09-30T23:59:59Z',
    active: true,
  },
  {
    appId: 3078581853,
    question: 'Will SOL flip ETH in market cap?',
    description:
      'Resolves YES if Solana market cap exceeds Ethereum market cap at any point before expiry.',
    category: 'crypto',
    yesPrice: 0.12,
    noPrice: 0.88,
    volume: 560_000,
    liquidity: 180_000,
    expiresAt: '2026-12-31T23:59:59Z',
    active: true,
  },
  {
    appId: 3078581854,
    question: 'Will BTC and ETH be positively correlated (>0.7) over the next 30 days?',
    description:
      'Resolves YES if the 30-day rolling Pearson correlation between BTC and ETH daily returns stays above 0.7 at any point during the measurement window.',
    category: 'correlation',
    yesPrice: 0.78,
    noPrice: 0.22,
    volume: 740_000,
    liquidity: 290_000,
    expiresAt: '2025-07-15T23:59:59Z',
    active: true,
  },
  {
    appId: 3078581855,
    question: 'Will a US Bitcoin ETF see >$500M net inflows in a single week?',
    description:
      'Resolves YES if any US-listed spot Bitcoin ETF records more than $500M in net inflows during a single trading week (Mon-Fri).',
    category: 'crypto',
    yesPrice: 0.55,
    noPrice: 0.45,
    volume: 2_100_000,
    liquidity: 780_000,
    expiresAt: '2025-12-31T23:59:59Z',
    active: true,
  },
  {
    appId: 3078581856,
    question: 'Will DOGE and SHIB 7-day correlation exceed 0.85?',
    description:
      'Resolves YES if the 7-day rolling Pearson correlation coefficient between DOGE/USD and SHIB/USD returns exceeds 0.85 before market expiry.',
    category: 'correlation',
    yesPrice: 0.61,
    noPrice: 0.39,
    volume: 320_000,
    liquidity: 95_000,
    expiresAt: '2025-09-30T23:59:59Z',
    active: true,
  },
  {
    appId: 3078581857,
    question: 'Will Algorand reach top 10 by market cap?',
    description:
      'Resolves YES if ALGO is in the top 10 cryptocurrencies by market cap at any point before expiry.',
    category: 'crypto',
    yesPrice: 0.08,
    noPrice: 0.92,
    volume: 340_000,
    liquidity: 95_000,
    expiresAt: '2026-06-30T23:59:59Z',
    active: true,
  },
  {
    appId: 3078581858,
    question: 'Will BTC drop below $40k before rising above $100k?',
    description:
      'Resolves YES if BTC/USD trades below $40,000 on any major exchange before it trades above $100,000. Time-ordered: the drop must happen first.',
    category: 'crypto',
    yesPrice: 0.35,
    noPrice: 0.65,
    volume: 1_100_000,
    liquidity: 410_000,
    expiresAt: '2026-12-31T23:59:59Z',
    active: true,
  },
];

function generateMockOrderbook(midPrice: number): { yes: OrderBookEntry[]; no: OrderBookEntry[] } {
  const yes: OrderBookEntry[] = [];
  const no: OrderBookEntry[] = [];
  for (let i = 0; i < 8; i++) {
    const offset = (i + 1) * 0.015;
    yes.push({
      price: Math.max(0.01, Math.round((midPrice - offset) * 1000) / 1000),
      quantity: Math.round(Math.random() * 8000 + 500),
    });
    no.push({
      price: Math.max(0.01, Math.round((1 - midPrice - offset) * 1000) / 1000),
      quantity: Math.round(Math.random() * 8000 + 500),
    });
  }
  return { yes, no };
}

function generateMockTrades(midPrice: number, count: number = 8): Trade[] {
  return Array.from({ length: count }, (_, i) => ({
    side: Math.random() > 0.5 ? ('yes' as const) : ('no' as const),
    price: Math.round((midPrice + (Math.random() - 0.5) * 0.08) * 1000) / 1000,
    quantity: Math.round(Math.random() * 2000 + 100),
    timestamp: new Date(Date.now() - i * 180_000).toISOString(),
  }));
}

function generateMockPriceHistory(currentYes: number, days: number = 30): PriceHistoryPoint[] {
  const points: PriceHistoryPoint[] = [];
  let yesP = currentYes;
  for (let i = days; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    yesP += (Math.random() - 0.5) * 0.04 + (currentYes - yesP) * 0.05;
    yesP = Math.max(0.01, Math.min(0.99, yesP));
    points.push({
      timestamp: d.toISOString().slice(0, 10),
      yesPrice: Math.round(yesP * 1000) / 1000,
      noPrice: Math.round((1 - yesP) * 1000) / 1000,
      volume: Math.round(Math.random() * 100_000 + 10_000),
    });
  }
  return points;
}

// ---------------------------------------------------------------------------
// AlphaArcadeMCPClient
// ---------------------------------------------------------------------------

export class AlphaArcadeMCPClient {
  private readonly apiKey: string | undefined;
  private readonly baseUrl: string;
  private readonly isConfigured: boolean;

  constructor() {
    this.apiKey = process.env.ALPHA_API_KEY;
    this.baseUrl = process.env.ALPHA_MCP_URL || 'https://api.alphaarcade.com';
    this.isConfigured = !!this.apiKey;
  }

  // -----------------------------------------------------------------------
  // Internal helper — call the REST API first, then MCP, then mock
  // -----------------------------------------------------------------------

  private async callAPI<T>(
    tool: string,
    params: Record<string, unknown> = {}
  ): Promise<MCPCallResult<T>> {
    if (!this.isConfigured) {
      return { success: true, source: 'mock' } as MCPCallResult<T>;
    }

    // Strategy 1: Try REST API with just API key (no algod needed)
    try {
      const url = `${this.baseUrl}/v1/${tool.replace(/_/g, '-')}`;
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        signal: AbortSignal.timeout(10000),
      });

      if (response.ok) {
        const data = (await response.json()) as T;
        return { success: true, data, source: 'api' };
      }

      console.warn(
        `[AlphaArcade MCP] REST ${tool} returned ${response.status}`
      );
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      console.warn(`[AlphaArcade MCP] REST ${tool} call failed:`, msg);
    }

    // Strategy 2: Try MCP tools endpoint
    try {
      const url = `${this.baseUrl}/v1/tools/${tool}`;
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(params),
      });

      if (response.ok) {
        const data = (await response.json()) as T;
        return { success: true, data, source: 'api' };
      }

      console.warn(
        `[AlphaArcade MCP] ${tool} returned ${response.status}`
      );
      return { success: false, error: `HTTP ${response.status}`, source: 'api' };
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      console.warn(`[AlphaArcade MCP] ${tool} call failed:`, msg);
      return { success: false, error: msg, source: 'api' };
    }
  }

  // -----------------------------------------------------------------------
  // MCP Tool: get_markets
  // -----------------------------------------------------------------------

  async getMarkets(): Promise<MCPCallResult<PredictionMarket[]>> {
    // Try REST API directly with just API key
    if (this.isConfigured) {
      try {
        const url = `${this.baseUrl}/v1/markets`;
        const response = await fetch(url, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
          },
          signal: AbortSignal.timeout(10000),
        });

        if (response.ok) {
          const rawData = await response.json();
          const markets = Array.isArray(rawData) ? rawData : rawData.markets || rawData.data || [];
          if (markets.length > 0) {
            const mapped: PredictionMarket[] = markets.map((m: Record<string, unknown>) => ({
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
            return { success: true, data: mapped, source: 'api' };
          }
        }
        console.warn(`[AlphaArcade MCP] REST markets returned ${response.status}`);
      } catch (error) {
        console.warn('[AlphaArcade MCP] REST markets failed:', error instanceof Error ? error.message : error);
      }
    }

    // Fallback to MCP call
    const result = await this.callAPI<PredictionMarket[]>('get_markets');

    if (result.source === 'mock' || !result.success) {
      return {
        success: true,
        data: MOCK_MARKETS.filter((m) => m.active),
        source: 'mock',
      };
    }

    return result;
  }

  // -----------------------------------------------------------------------
  // MCP Tool: get_market_details
  // -----------------------------------------------------------------------

  async getMarketDetails(
    appId: number
  ): Promise<MCPCallResult<MarketDetails | null>> {
    const result = await this.callAPI<MarketDetails>('get_market_details', {
      appId,
    });

    if (result.source === 'mock' || !result.success) {
      const market = MOCK_MARKETS.find((m) => m.appId === appId);
      if (!market) {
        return { success: true, data: null, source: 'mock' };
      }

      const details: MarketDetails = {
        ...market,
        orderbook: generateMockOrderbook(market.yesPrice),
        recentTrades: generateMockTrades(market.yesPrice),
      };

      return { success: true, data: details, source: 'mock' };
    }

    return result;
  }

  // -----------------------------------------------------------------------
  // MCP Tool: get_market_orders
  // -----------------------------------------------------------------------

  async getMarketOrders(
    appId: number
  ): Promise<MCPCallResult<{ yes: OrderBookEntry[]; no: OrderBookEntry[] }>> {
    const result = await this.callAPI<{ yes: OrderBookEntry[]; no: OrderBookEntry[] }>(
      'get_market_orders',
      { appId }
    );

    if (result.source === 'mock' || !result.success) {
      const market = MOCK_MARKETS.find((m) => m.appId === appId);
      const midPrice = market?.yesPrice ?? 0.5;
      return {
        success: true,
        data: generateMockOrderbook(midPrice),
        source: 'mock',
      };
    }

    return result;
  }

  // -----------------------------------------------------------------------
  // MCP Tool: get_market_price_history
  // -----------------------------------------------------------------------

  async getMarketPriceHistory(
    appId: number,
    days: number = 30
  ): Promise<MCPCallResult<PriceHistoryPoint[]>> {
    const result = await this.callAPI<PriceHistoryPoint[]>(
      'get_market_price_history',
      { appId, days }
    );

    if (result.source === 'mock' || !result.success) {
      const market = MOCK_MARKETS.find((m) => m.appId === appId);
      const midPrice = market?.yesPrice ?? 0.5;
      return {
        success: true,
        data: generateMockPriceHistory(midPrice, days),
        source: 'mock',
      };
    }

    return result;
  }

  // -----------------------------------------------------------------------
  // MCP Tool: get_rewards_info
  // -----------------------------------------------------------------------

  async getRewardsInfo(
    address: string
  ): Promise<MCPCallResult<RewardsInfo>> {
    const result = await this.callAPI<RewardsInfo>('get_rewards_info', {
      address,
    });

    if (result.source === 'mock' || !result.success) {
      const mockRewards: RewardsInfo = {
        address,
        totalRewards: 1_523.45,
        pendingRewards: 312.78,
        claimedRewards: 1_210.67,
        markets: [
          {
            appId: 3078581851,
            question: 'Will BTC exceed $100k by end of Q2 2026?',
            lpAmount: 5_000,
            pendingRewards: 187.34,
            sharePercent: 1.12,
          },
          {
            appId: 3078581854,
            question: 'Will BTC and ETH be positively correlated (>0.7) over the next 30 days?',
            lpAmount: 3_200,
            pendingRewards: 125.44,
            sharePercent: 0.87,
          },
        ],
      };
      return { success: true, data: mockRewards, source: 'mock' };
    }

    return result;
  }

  // -----------------------------------------------------------------------
  // MCP Tool: place_order (testnet)
  // -----------------------------------------------------------------------

  async placeOrder(
    appId: number,
    side: 'yes' | 'no',
    price: number,
    quantity: number
  ): Promise<MCPCallResult<OrderResult>> {
    if (price <= 0 || price >= 1) {
      return {
        success: false,
        error: 'Price must be between 0 and 1 (exclusive)',
        source: this.isConfigured ? 'api' : 'mock',
      };
    }
    if (quantity <= 0) {
      return {
        success: false,
        error: 'Quantity must be positive',
        source: this.isConfigured ? 'api' : 'mock',
      };
    }

    const result = await this.callAPI<OrderResult>('place_order', {
      appId,
      side,
      price,
      quantity,
    });

    if (result.source === 'mock' || !result.success) {
      const mockOrder: OrderResult = {
        orderId: `order-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`,
        appId,
        side,
        price,
        quantity,
        status: 'pending',
        txId: undefined,
        createdAt: new Date().toISOString(),
      };
      return { success: true, data: mockOrder, source: 'mock' };
    }

    return result;
  }

  // -----------------------------------------------------------------------
  // MCP Tool: cancel_order
  // -----------------------------------------------------------------------

  async cancelOrder(
    appId: number,
    orderId: string
  ): Promise<MCPCallResult<CancelOrderResult>> {
    const result = await this.callAPI<CancelOrderResult>('cancel_order', {
      appId,
      orderId,
    });

    if (result.source === 'mock' || !result.success) {
      const mockCancel: CancelOrderResult = {
        orderId,
        appId,
        status: 'cancelled',
        txId: undefined,
        cancelledAt: new Date().toISOString(),
      };
      return { success: true, data: mockCancel, source: 'mock' };
    }

    return result;
  }

  // -----------------------------------------------------------------------
  // MCP Tool: provide_liquidity (testnet)
  // -----------------------------------------------------------------------

  async provideLiquidity(
    appId: number,
    amount: number
  ): Promise<MCPCallResult<LiquidityResult>> {
    if (amount <= 0) {
      return {
        success: false,
        error: 'Amount must be positive',
        source: this.isConfigured ? 'api' : 'mock',
      };
    }

    const result = await this.callAPI<LiquidityResult>('provide_liquidity', {
      appId,
      amount,
    });

    if (result.source === 'mock' || !result.success) {
      const mockLiq: LiquidityResult = {
        appId,
        lpAmount: amount,
        lpShares: Math.round(amount * 0.95),
        sharePercent: Math.round((amount / 500_000) * 10000) / 100,
        txId: undefined,
        status: 'success',
        createdAt: new Date().toISOString(),
      };
      return { success: true, data: mockLiq, source: 'mock' };
    }

    return result;
  }

  // -----------------------------------------------------------------------
  // Utility: get configuration status
  // -----------------------------------------------------------------------

  getConfigStatus(): { configured: boolean; baseUrl: string; hasApiKey: boolean } {
    return {
      configured: this.isConfigured,
      baseUrl: this.baseUrl,
      hasApiKey: this.isConfigured,
    };
  }
}

// ---------------------------------------------------------------------------
// Singleton instance (server-side only)
// ---------------------------------------------------------------------------

let _instance: AlphaArcadeMCPClient | null = null;

export function getAlphaArcadeMCP(): AlphaArcadeMCPClient {
  if (!_instance) {
    _instance = new AlphaArcadeMCPClient();
  }
  return _instance;
}
