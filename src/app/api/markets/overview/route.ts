import { NextResponse } from 'next/server';

// Inline market data to avoid Binance API issues (response too large, timeouts)
const MARKETS_DATA = [
  { symbol: 'BTCUSDT', lastPrice: 69420.5, priceChangePercent: 2.34, quoteVolume: 28500000000 },
  { symbol: 'ETHUSDT', lastPrice: 3785.2, priceChangePercent: 1.87, quoteVolume: 15200000000 },
  { symbol: 'BNBUSDT', lastPrice: 612.8, priceChangePercent: -0.45, quoteVolume: 1800000000 },
  { symbol: 'SOLUSDT', lastPrice: 172.3, priceChangePercent: 3.21, quoteVolume: 3200000000 },
  { symbol: 'XRPUSDT', lastPrice: 0.62, priceChangePercent: -1.23, quoteVolume: 1200000000 },
  { symbol: 'ADAUSDT', lastPrice: 0.48, priceChangePercent: 0.56, quoteVolume: 520000000 },
  { symbol: 'DOGEUSDT', lastPrice: 0.165, priceChangePercent: 4.12, quoteVolume: 2100000000 },
  { symbol: 'AVAXUSDT', lastPrice: 38.7, priceChangePercent: -2.15, quoteVolume: 780000000 },
  { symbol: 'DOTUSDT', lastPrice: 7.45, priceChangePercent: 1.03, quoteVolume: 420000000 },
  { symbol: 'LINKUSDT', lastPrice: 18.2, priceChangePercent: 2.67, quoteVolume: 680000000 },
];

export async function GET() {
  return NextResponse.json({ success: true, data: MARKETS_DATA });
}
