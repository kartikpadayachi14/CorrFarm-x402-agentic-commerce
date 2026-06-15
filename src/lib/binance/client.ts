/**
 * CorrFarm — Binance API Client
 * PUBLIC endpoints only — no API key needed
 * Base URL: https://api.binance.com (non-US Binance)
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Kline {
  openTime: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  closeTime: number;
  quoteVolume: number;
  trades: number;
}

export interface PriceHistoryPoint {
  date: string;
  price: number;
  returns: number | null;
}

export interface MultiAssetReturns {
  dates: string[];
  assets: Record<string, number[]>; // asset -> returns array
  prices: Record<string, number[]>; // asset -> prices array
}

export interface Ticker24H {
  symbol: string;
  priceChange: number;
  priceChangePercent: number;
  weightedAvgPrice: number;
  lastPrice: number;
  volume: number;
  quoteVolume: number;
  trades: number;
}

// ---------------------------------------------------------------------------
// Symbol mapping — top 20 cryptos
// ---------------------------------------------------------------------------

export const SYMBOL_MAP: Record<string, string> = {
  bitcoin: 'BTCUSDT',
  ethereum: 'ETHUSDT',
  bnb: 'BNBUSDT',
  ripple: 'XRPUSDT',
  solana: 'SOLUSDT',
  cardano: 'ADAUSDT',
  dogecoin: 'DOGEUSDT',
  avalanche: 'AVAXUSDT',
  polkadot: 'DOTUSDT',
  tron: 'TRXUSDT',
  chainlink: 'LINKUSDT',
  polygon: 'MATICUSDT',
  shiba: 'SHIBUSDT',
  litecoin: 'LTCUSDT',
  uniswap: 'UNIUSDT',
  cosmos: 'ATOMUSDT',
  stellar: 'XLMUSDT',
  monero: 'XMRUSDT',
  ethereumclassic: 'ETCUSDT',
  near: 'NEARUSDT',
};

/** Reverse map: BTCUSDT -> bitcoin */
export const REVERSE_SYMBOL_MAP: Record<string, string> = Object.fromEntries(
  Object.entries(SYMBOL_MAP).map(([k, v]) => [v, k])
);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const BASE_URL = 'https://api.binance.com';

async function fetchBinance<T>(endpoint: string, params: Record<string, string> = {}): Promise<T> {
  const qs = new URLSearchParams(params).toString();
  const url = `${BASE_URL}${endpoint}${qs ? `?${qs}` : ''}`;

  const res = await fetch(url, {
    headers: { 'Accept': 'application/json' },
    next: { revalidate: 60 }, // cache 60 s
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Binance API error ${res.status}: ${body}`);
  }

  return res.json() as Promise<T>;
}

/** Convert a friendly name or a raw symbol to the Binance symbol. */
export function resolveSymbol(input: string): string {
  const upper = input.toUpperCase();
  if (upper.endsWith('USDT')) return upper;
  const mapped = SYMBOL_MAP[input.toLowerCase()];
  if (mapped) return mapped;
  return `${upper}USDT`;
}

// ---------------------------------------------------------------------------
// Public API methods
// ---------------------------------------------------------------------------

/**
 * Fetch top crypto tickers sorted by 24h quote volume.
 */
export async function getTopCryptos(limit: number = 20): Promise<Ticker24H[]> {
  const data = await fetchBinance<unknown[]>('/api/v3/ticker/24hr', {
    type: 'FULL',
  });

  // Filter to USDT pairs only
  const usdtPairs = (data as Ticker24H[]).filter(
    (t) => t.symbol.endsWith('USDT') && typeof t.quoteVolume === 'number'
  );

  // Sort by quote volume descending
  usdtPairs.sort((a, b) => b.quoteVolume - a.quoteVolume);

  return usdtPairs.slice(0, limit);
}

/**
 * Fetch candlestick / kline data.
 * Intervals: 1m,3m,5m,15m,30m,1h,2h,4h,6h,8h,12h,1d,3d,1w,1M
 */
export async function getKlines(
  symbol: string,
  interval: string = '1d',
  limit: number = 100
): Promise<Kline[]> {
  const data = await fetchBinance<unknown[]>('/api/v3/klines', {
    symbol: resolveSymbol(symbol),
    interval,
    limit: String(limit),
  });

  return (data as unknown[][]).map((k) => ({
    openTime: Number(k[0]),
    open: Number(k[1]),
    high: Number(k[2]),
    low: Number(k[3]),
    close: Number(k[4]),
    volume: Number(k[5]),
    closeTime: Number(k[6]),
    quoteVolume: Number(k[7]),
    trades: Number(k[8]),
  }));
}

/**
 * Get historical price data and compute daily returns.
 * `days` is approximate — we fetch `days + 1` klines so we can compute
 * `days` return values.
 */
export async function getPriceHistory(
  symbol: string,
  days: number = 90,
  interval: string = '1d'
): Promise<PriceHistoryPoint[]> {
  const klines = await getKlines(symbol, interval, days + 1);

  const points: PriceHistoryPoint[] = klines.map((k, i) => {
    const date = new Date(k.openTime).toISOString().slice(0, 10);
    const price = k.close;
    let returns: number | null = null;
    if (i > 0) {
      const prev = klines[i - 1].close;
      if (prev > 0) returns = (price - prev) / prev;
    }
    return { date, price, returns };
  });

  // Drop the first point (null return) for a cleaner series
  return points.slice(1);
}

/**
 * Get aligned price/return history for multiple assets.
 * Aligns on shared dates using inner join.
 */
export async function getMultiPriceHistory(
  symbols: string[],
  days: number = 90,
  interval: string = '1d'
): Promise<MultiAssetReturns> {
  // Fetch all in parallel
  const histories = await Promise.all(
    symbols.map(async (s) => {
      const pts = await getPriceHistory(s, days, interval);
      return { symbol: s, points: pts };
    })
  );

  // Build date -> index map for each asset
  const dateSets = histories.map((h) => new Set(h.points.map((p) => p.date)));

  // Intersect all date sets
  let commonDates = dateSets[0] ? Array.from(dateSets[0]) : [];
  for (let i = 1; i < dateSets.length; i++) {
    const s = dateSets[i];
    commonDates = commonDates.filter((d) => s.has(d));
  }
  commonDates.sort();

  const dateMap = new Map(commonDates.map((d, i) => [d, i]));

  // Build aligned arrays
  const assets: Record<string, number[]> = {};
  const prices: Record<string, number[]> = {};

  for (const h of histories) {
    const returnsArr = new Array<number>(commonDates.length).fill(0);
    const pricesArr = new Array<number>(commonDates.length).fill(0);

    for (const p of h.points) {
      const idx = dateMap.get(p.date);
      if (idx !== undefined && p.returns !== null) {
        returnsArr[idx] = p.returns;
        pricesArr[idx] = p.price;
      }
    }

    assets[h.symbol] = returnsArr;
    prices[h.symbol] = pricesArr;
  }

  return { dates: commonDates, assets, prices };
}

/**
 * Quick price lookup for a single symbol.
 */
export async function getCurrentPrice(symbol: string): Promise<number> {
  const data = await fetchBinance<{ price: string }>('/api/v3/ticker/price', {
    symbol: resolveSymbol(symbol),
  });
  return Number(data.price);
}

// ---------------------------------------------------------------------------
// Binance Vision — Historical Bulk Data
// Source: https://data.binance.vision/
// ---------------------------------------------------------------------------

const VISION_BASE_URL = 'https://data.binance.vision';

/**
 * Available data types from Binance Vision.
 */
export type VisionDataType = 'klines' | 'trades' | 'aggTrades' | 'bookDepth';

export interface VisionFileInfo {
  symbol: string;
  interval: string;
  year: number;
  month: number;
  day?: number;
  dataType: VisionDataType;
}

/**
 * Build the URL for a Binance Vision historical data file.
 *
 * Structure: /data/spot/daily/klines/{SYMBOL}/{INTERVAL}/{SYMBOL}-{INTERVAL}-{DATE}.zip
 * Monthly: /data/spot/monthly/klines/{SYMBOL}/{INTERVAL}/{SYMBOL}-{INTERVAL}-{MONTH}.zip
 */
export function buildVisionUrl(info: VisionFileInfo, daily: boolean = true): string {
  const { symbol, interval, dataType, year, month, day } = info;
  const sy = resolveSymbol(symbol);

  if (daily && day) {
    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    return `${VISION_BASE_URL}/data/spot/daily/${dataType}/${sy}/${interval}/${sy}-${interval}-${dateStr}.zip`;
  }

  const monthStr = `${year}-${String(month).padStart(2, '0')}`;
  return `${VISION_BASE_URL}/data/spot/monthly/${dataType}/${sy}/${interval}/${sy}-${interval}-${monthStr}.zip`;
}

/**
 * Fetch available monthly dates for historical data.
 * Returns an array of { year, month } for which data is likely available.
 */
export function getAvailableMonths(lookbackMonths: number = 12): { year: number; month: number }[] {
  const months: { year: number; month: number }[] = [];
  const now = new Date();

  for (let i = 1; i <= lookbackMonths; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push({ year: d.getFullYear(), month: d.getMonth() + 1 });
  }

  return months;
}

/**
 * Fetch historical kline data from Binance Vision (bulk CSV/zip files).
 * Falls back to the REST API for recent data.
 *
 * For the hackathon demo, we use the REST API with extended limits
 * and cache aggressively. Full Vision integration would require
 * downloading and parsing zip files server-side.
 */
export async function getExtendedPriceHistory(
  symbol: string,
  days: number = 365,
  interval: string = '1d'
): Promise<PriceHistoryPoint[]> {
  // Binance REST API supports up to 1000 klines per request
  // For longer periods, we paginate
  const maxPerRequest = 1000;
  const totalKlines = days + 1;

  if (totalKlines <= maxPerRequest) {
    return getPriceHistory(symbol, days, interval);
  }

  // For extended history, fetch in chunks
  const allKlines: Kline[] = [];
  let endTime: number | undefined;

  while (allKlines.length < totalKlines) {
    const remaining = totalKlines - allKlines.length;
    const limit = Math.min(remaining, maxPerRequest);

    const params: Record<string, string> = {
      symbol: resolveSymbol(symbol),
      interval,
      limit: String(limit),
    };

    if (endTime) {
      params.endTime = String(endTime - 1); // Go further back
    }

    const qs = new URLSearchParams(params).toString();
    const url = `${BASE_URL}/api/v3/klines?${qs}`;

    const res = await fetch(url, {
      headers: { 'Accept': 'application/json' },
      next: { revalidate: 3600 }, // Cache 1h for historical data
    });

    if (!res.ok) break;

    const data = (await res.json()) as unknown[][];
    if (data.length === 0) break;

    const klines: Kline[] = data.map((k) => ({
      openTime: Number(k[0]),
      open: Number(k[1]),
      high: Number(k[2]),
      low: Number(k[3]),
      close: Number(k[4]),
      volume: Number(k[5]),
      closeTime: Number(k[6]),
      quoteVolume: Number(k[7]),
      trades: Number(k[8]),
    }));

    allKlines.unshift(...klines);
    endTime = klines[0].openTime;

    if (klines.length < limit) break; // No more data available
  }

  // Compute returns
  const points: PriceHistoryPoint[] = allKlines.map((k, i) => {
    const date = new Date(k.openTime).toISOString().slice(0, 10);
    const price = k.close;
    let returns: number | null = null;
    if (i > 0) {
      const prev = allKlines[i - 1].close;
      if (prev > 0) returns = (price - prev) / prev;
    }
    return { date, price, returns };
  });

  // Drop first point (null return) and trim to requested days
  return points.slice(1).slice(-days);
}

/**
 * Fetch extended multi-asset price history with pagination support.
 */
export async function getExtendedMultiPriceHistory(
  symbols: string[],
  days: number = 365,
  interval: string = '1d'
): Promise<MultiAssetReturns> {
  const histories = await Promise.all(
    symbols.map(async (s) => {
      const pts = await getExtendedPriceHistory(s, days, interval);
      return { symbol: s, points: pts };
    })
  );

  // Build date -> index map for each asset
  const dateSets = histories.map((h) => new Set(h.points.map((p) => p.date)));

  // Intersect all date sets
  let commonDates = dateSets[0] ? Array.from(dateSets[0]) : [];
  for (let i = 1; i < dateSets.length; i++) {
    const s = dateSets[i];
    commonDates = commonDates.filter((d) => s.has(d));
  }
  commonDates.sort();

  const dateMap = new Map(commonDates.map((d, i) => [d, i]));

  const assets: Record<string, number[]> = {};
  const prices: Record<string, number[]> = {};

  for (const h of histories) {
    const returnsArr = new Array<number>(commonDates.length).fill(0);
    const pricesArr = new Array<number>(commonDates.length).fill(0);

    for (const p of h.points) {
      const idx = dateMap.get(p.date);
      if (idx !== undefined && p.returns !== null) {
        returnsArr[idx] = p.returns;
        pricesArr[idx] = p.price;
      }
    }

    assets[h.symbol] = returnsArr;
    prices[h.symbol] = pricesArr;
  }

  return { dates: commonDates, assets, prices };
}
