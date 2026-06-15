/**
 * CorrFarm — Enhanced Fake News / Credibility Detection Module
 *
 * Combines multiple analysis dimensions for crypto news credibility:
 *   1. LLM-based analysis (OpenRouter/OpenAI API)
 *   2. Heuristic fallback (rule-based)
 *   3. Market Reaction Verification (cross-reference with Binance price data)
 *   4. Financial NLP Analysis (FinBERT-style rule-based pipeline)
 *   5. Source Credibility Analysis (domain reputation, HTTPS, known sources)
 *   6. Social Media Propagation Analysis (coordination, pump/dump, bots)
 *
 * Integrates CryptoCompare API for news fetching.
 * Uses Binance public API for real price verification.
 */

import {
  getCurrentPrice,
  getKlines,
  resolveSymbol,
  SYMBOL_MAP,
  type Ticker24H,
} from '@/lib/binance/client';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CredibilityResult {
  credibilityScore: number; // 0-1
  flags: string[];
  recommendation: string;
  analysis: string;
  breakdown: {
    sensationalism: number;
    factualConsistency: number;
    sourceReliability: number;
    emotionalManipulation: number;
    marketConsistency: number;
    marketReaction: number;       // NEW - Market Reaction Verification
    financialNLP: number;         // NEW - FinBERT-style analysis
    sourceCredibility: number;    // NEW - Source Credibility Analysis
    socialPropagation: number;    // NEW - Social Media Propagation
  };
  method: 'llm' | 'heuristic' | 'enhanced';
}

export interface NewsItem {
  title: string;
  content: string;
  sourceUrl: string;
  sourceName: string;
  publishedAt: string;
  credibility?: CredibilityResult;
}

/** Result from verifyMarketClaim – dedicated market-claim verification */
export interface MarketClaimVerification {
  claim: string;
  symbol: string;
  currentPrice: number | null;
  priceChange24h: number | null;   // percent
  priceChange7d: number | null;    // percent
  claimDirection: 'bullish' | 'bearish' | 'neutral' | 'unknown';
  actualDirection: 'bullish' | 'bearish' | 'neutral';
  isConsistent: boolean;
  confidence: number;              // 0-1
  details: string;
  marketReactionScore: number;     // 0-1
}

/** Result from analyzeSocialPropagation */
export interface SocialPropagationResult {
  socialPropagationScore: number;  // 0-1
  botLikelihood: number;           // 0-1
  coordinationScore: number;       // 0-1
  pumpDumpScore: number;           // 0-1
  hypeCyclePhase: 'none' | 'accumulation' | 'awareness' | 'viral' | 'euphoria' | 'correction';
  viralCoefficient: number;        // estimated
  flags: string[];
  analysis: string;
}

// ---------------------------------------------------------------------------
// Weight configuration for overall credibility score
// ---------------------------------------------------------------------------

const SCORE_WEIGHTS = {
  marketReaction: 0.25,
  financialNLP: 0.20,
  sourceCredibility: 0.15,
  socialPropagation: 0.10,
  sensationalism: 0.08,
  factualConsistency: 0.08,
  sourceReliability: 0.07,
  emotionalManipulation: 0.04,
  marketConsistency: 0.03,
} as const;

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

function getLLMConfig(): { apiKey: string; baseUrl: string; model: string } | null {
  const apiKey = process.env.OPENROUTER_API_KEY || process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  // If OPENROUTER_API_KEY is set, use OpenRouter
  if (process.env.OPENROUTER_API_KEY) {
    return {
      apiKey,
      baseUrl: 'https://openrouter.ai/api/v1',
      model: process.env.LLM_MODEL || 'google/gemini-2.0-flash-001',
    };
  }

  // Fallback to OpenAI
  return {
    apiKey,
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4o-mini',
  };
}

// ---------------------------------------------------------------------------
// 1. Market Reaction Verification
// ---------------------------------------------------------------------------

/** Recognized crypto symbol patterns in text */
const CRYPTO_SYMBOLS: Record<string, string[]> = {
  BTCUSDT: ['bitcoin', 'btc', '₿'],
  ETHUSDT: ['ethereum', 'eth', 'ether'],
  SOLUSDT: ['solana', 'sol'],
  BNBUSDT: ['bnb', 'binance coin'],
  XRPUSDT: ['ripple', 'xrp'],
  ADAUSDT: ['cardano', 'ada'],
  DOGEUSDT: ['dogecoin', 'doge'],
  AVAXUSDT: ['avalanche', 'avax'],
  DOTUSDT: ['polkadot', 'dot'],
  LINKUSDT: ['chainlink', 'link'],
  MATICUSDT: ['polygon', 'matic'],
  SHIBUSDT: ['shiba', 'shib'],
  LTCUSDT: ['litecoin', 'ltc'],
  UNIUSDT: ['uniswap', 'uni'],
  ATOMUSDT: ['cosmos', 'atom'],
  NEARUSDT: ['near protocol', 'near'],
};

/** Directional / movement words */
const BULLISH_WORDS = [
  'surge', 'surging', 'soar', 'soaring', 'rally', 'rallying',
  'pump', 'pumping', 'moon', 'mooning', 'skyrocket', 'skyrocketing',
  'climb', 'climbing', 'rise', 'rising', 'gain', 'gaining',
  'bullish', 'breakout', 'uptrend', 'recover', 'recovering',
  'jump', 'jumping', 'spike', 'spiking', 'rocket', 'launch',
  'green', 'parabolic', 'boom', 'booming',
];

const BEARISH_WORDS = [
  'crash', 'crashing', 'plunge', 'plunging', 'dump', 'dumping',
  'tank', 'tanking', 'fall', 'falling', 'drop', 'dropping',
  'bearish', 'downtrend', 'decline', 'declining', 'sink', 'sinking',
  'slump', 'slumping', 'nosedive', 'bleed', 'bleeding',
  'red', 'collapse', 'collapsing', 'plummet', 'plummeting',
  'bloodbath', 'carnage', 'slaughter', 'massacre',
];

const PERCENTAGE_PATTERN = /(\d+(?:\.\d+)?)\s*%/g;
const PRICE_PATTERN = /\$(\d{1,3}(?:,\d{3})*(?:\.\d+)?)/g;
const PRICE_TARGET_PATTERN = /(?:price\s+(?:target|prediction|forecast|estimate)|target(?:ing)?|heading\s+(?:to|toward)|could\s+reach|might\s+reach|will\s+reach|expected\s+to\s+reach)\s+\$?(\d{1,3}(?:,\d{3})*(?:\.\d+)?)/gi;

/**
 * Detect which crypto symbols are mentioned in the text.
 */
function detectMentionedSymbols(text: string): string[] {
  const lower = text.toLowerCase();
  const found: string[] = [];

  for (const [binanceSymbol, aliases] of Object.entries(CRYPTO_SYMBOLS)) {
    for (const alias of aliases) {
      if (lower.includes(alias)) {
        if (!found.includes(binanceSymbol)) {
          found.push(binanceSymbol);
        }
        break;
      }
    }
  }

  return found;
}

/**
 * Determine the directional claim made in the text about a symbol.
 */
function detectDirectionalClaim(text: string): 'bullish' | 'bearish' | 'neutral' | 'unknown' {
  const lower = text.toLowerCase();
  let bullishCount = 0;
  let bearishCount = 0;

  for (const word of BULLISH_WORDS) {
    if (lower.includes(word)) bullishCount++;
  }

  for (const word of BEARISH_WORDS) {
    if (lower.includes(word)) bearishCount++;
  }

  if (bullishCount === 0 && bearishCount === 0) return 'neutral';
  if (bullishCount > bearishCount + 1) return 'bullish';
  if (bearishCount > bullishCount + 1) return 'bearish';
  return 'unknown';
}

/**
 * Extract percentage claims from the text (e.g., "surged 15%").
 */
function extractPercentageClaims(text: string): number[] {
  const matches = [...text.matchAll(PERCENTAGE_PATTERN)];
  return matches.map((m) => parseFloat(m[1])).filter((n) => !isNaN(n) && n > 0 && n < 10000);
}

/**
 * Extract price target claims from the text.
 */
function extractPriceTargets(text: string): number[] {
  const targets: number[] = [];

  // Match specific price target language
  const targetMatches = [...text.matchAll(PRICE_TARGET_PATTERN)];
  for (const m of targetMatches) {
    const val = parseFloat(m[1].replace(/,/g, ''));
    if (!isNaN(val) && val > 0) targets.push(val);
  }

  // Also extract standalone dollar amounts
  const priceMatches = [...text.matchAll(PRICE_PATTERN)];
  for (const m of priceMatches) {
    const val = parseFloat(m[1].replace(/,/g, ''));
    if (!isNaN(val) && val > 0) targets.push(val);
  }

  return [...new Set(targets)];
}

/**
 * Fetch real price data for a symbol from Binance.
 * Returns null-safe data even if the API fails.
 */
async function fetchMarketData(symbol: string): Promise<{
  currentPrice: number | null;
  priceChange24h: number | null;
  priceChange7d: number | null;
  high24h: number | null;
  low24h: number | null;
} | null> {
  try {
    const resolved = resolveSymbol(symbol);
    const price = await getCurrentPrice(resolved);
    const klines24h = await getKlines(resolved, '1h', 24);
    const klines7d = await getKlines(resolved, '1d', 7);

    const priceChange24h = klines24h.length >= 2
      ? ((price - klines24h[0].open) / klines24h[0].open) * 100
      : null;

    const priceChange7d = klines7d.length >= 2
      ? ((price - klines7d[0].open) / klines7d[0].open) * 100
      : null;

    const high24h = klines24h.length > 0
      ? Math.max(...klines24h.map((k) => k.high))
      : null;

    const low24h = klines24h.length > 0
      ? Math.min(...klines24h.map((k) => k.low))
      : null;

    return { currentPrice: price, priceChange24h, priceChange7d, high24h, low24h };
  } catch (error) {
    console.warn('[CredibilityDetector] Binance data fetch failed for', symbol, ':', error);
    return null;
  }
}

/**
 * Compute marketReactionScore by comparing text claims to real price data.
 */
async function computeMarketReaction(text: string): Promise<{
  score: number;
  flags: string[];
  details: string;
}> {
  const flags: string[] = [];
  const symbols = detectMentionedSymbols(text);

  if (symbols.length === 0) {
    // No crypto symbols detected – cannot verify market reaction
    return {
      score: 0.6, // Neutral – no evidence either way
      flags: [],
      details: 'No specific crypto symbols detected for market verification.',
    };
  }

  const claimDirection = detectDirectionalClaim(text);
  const percentageClaims = extractPercentageClaims(text);
  const priceTargets = extractPriceTargets(text);

  let totalScore = 0;
  let verifications = 0;

  // Only verify first 3 symbols to avoid excessive API calls
  const symbolsToVerify = symbols.slice(0, 3);

  for (const symbol of symbolsToVerify) {
    const marketData = await fetchMarketData(symbol);

    if (!marketData || marketData.currentPrice === null) {
      // Could not fetch data – neutral score with flag
      totalScore += 0.5;
      verifications++;
      flags.push(`Could not verify market data for ${symbol}`);
      continue;
    }

    const actualDirection: 'bullish' | 'bearish' | 'neutral' =
      (marketData.priceChange24h ?? 0) > 1 ? 'bullish' :
      (marketData.priceChange24h ?? 0) < -1 ? 'bearish' : 'neutral';

    // ---- Direction consistency ----
    if (claimDirection !== 'unknown' && claimDirection !== 'neutral') {
      if (claimDirection === actualDirection) {
        totalScore += 0.9; // Consistent direction
      } else if (actualDirection === 'neutral') {
        totalScore += 0.5; // No strong move either way
      } else {
        totalScore += 0.1; // Contradictory direction – MAJOR RED FLAG
        flags.push(
          `MAJOR: Text claims ${claimDirection} move for ${symbol}, but price is actually ${actualDirection} (${(marketData.priceChange24h ?? 0).toFixed(2)}% in 24h)`
        );
      }
      verifications++;
    }

    // ---- Percentage claim verification ----
    if (percentageClaims.length > 0 && marketData.priceChange24h !== null) {
      const absPriceChange = Math.abs(marketData.priceChange24h);
      for (const claimedPct of percentageClaims) {
        // If the text claims a large move but actual is small
        if (claimedPct > 10 && absPriceChange < claimedPct * 0.3) {
          totalScore += 0.15;
          flags.push(
            `Claimed ${claimedPct}% move for ${symbol}, actual 24h change: ${absPriceChange.toFixed(2)}%`
          );
        } else if (claimedPct > 5 && absPriceChange < claimedPct * 0.5) {
          totalScore += 0.4;
        } else {
          totalScore += 0.8;
        }
        verifications++;
      }
    }

    // ---- Price target verification ----
    if (priceTargets.length > 0 && marketData.currentPrice !== null) {
      for (const target of priceTargets) {
        const deviation = Math.abs(target - marketData.currentPrice) / marketData.currentPrice;

        if (deviation > 0.5) {
          // Target is >50% away from current price – possible but speculative
          totalScore += 0.3;
          flags.push(
            `Price target $${target.toLocaleString()} for ${symbol} is ${(deviation * 100).toFixed(0)}% away from current price $${marketData.currentPrice.toLocaleString()}`
          );
        } else if (deviation > 0.2) {
          totalScore += 0.5;
        } else {
          totalScore += 0.85;
        }
        verifications++;
      }
    }

    // If no specific claims to verify, give base score from data availability
    if (verifications === 0) {
      totalScore += 0.6;
      verifications++;
    }
  }

  const score = verifications > 0 ? totalScore / verifications : 0.6;

  return {
    score: clamp01(score),
    flags,
    details: symbols.length > 0
      ? `Verified against real-time price data for: ${symbolsToVerify.join(', ')}`
      : 'No crypto symbols detected for market verification.',
  };
}

// ---------------------------------------------------------------------------
// 2. Financial NLP (FinBERT-style rule-based analysis)
// ---------------------------------------------------------------------------

/** Bullish financial sentiment words/phrases */
const FIN_BULLISH = [
  'bullish', 'buy signal', 'oversold', 'support level', 'accumulation',
  'buy the dip', 'golden cross', 'cup and handle', 'ascending triangle',
  'breakout above', 'higher high', 'higher low', 'strong support',
  'bounced off support', 'reversal pattern', 'double bottom',
  'bull flag', 'bull pennant', 'positive divergence', 'rally continues',
  'institutional buying', 'whale accumulation', 'adoption', 'partnership',
  'mainnet launch', 'staking rewards', 'deflationary', 'burn',
  'supply shock', 'halving', 'etf approval', 'institutional adoption',
];

/** Bearish financial sentiment words/phrases */
const FIN_BEARISH = [
  'bearish', 'sell signal', 'overbought', 'resistance level', 'distribution',
  'death cross', 'head and shoulders', 'descending triangle',
  'breakdown below', 'lower low', 'lower high', 'weak support',
  'rejected at resistance', 'bear flag', 'bear pennant',
  'negative divergence', 'sell-off continues', 'institutional selling',
  'whale dumping', 'regulation', 'ban', 'sec lawsuit', 'delisting',
  'hack', 'exploit', 'rug pull', 'ponzi', 'insolvency',
  'bankrupt', 'liquidation cascade', 'futures funding negative',
];

/** Neutral financial sentiment words/phrases */
const FIN_NEUTRAL = [
  'consolidation', 'sideways', 'range-bound', 'coiling', 'waiting',
  'neutral', 'mixed signals', 'uncertain', 'indecision', 'doji',
  'flat', 'stable', 'hovering', 'stagnant', 'choppy',
];

/** Internal contradiction patterns */
const CONTRADICTION_PATTERNS: Array<{ pattern: RegExp; description: string }> = [
  {
    pattern: /bullish.*(?:bearish|crash|plunge|dump)/is,
    description: 'Text claims bullish then mentions bearish/crash/plunge',
  },
  {
    pattern: /(?:bearish|crash|plunge).*bullish/is,
    description: 'Text claims bearish then mentions bullish',
  },
  {
    pattern: /(?:surge|rally|gain).*(?:drop|fall|decline)/is,
    description: 'Text mentions both surge and drop in same context',
  },
  {
    pattern: /buy.*sell|sell.*buy/is,
    description: 'Text simultaneously suggests buying and selling',
  },
  {
    pattern: /overbought.*oversold|oversold.*overbought/is,
    description: 'Claims both overbought and oversold conditions',
  },
];

/** Numerical claim patterns for verification */
const NUMERICAL_CLAIM_PATTERNS = [
  /(?:market cap|valuation).*(?:\$?\d[\d,.]*)/i,
  /(?:volume|turnover).*(?:\$?\d[\d,.]*)/i,
  /(?:supply|circulation).*(?:\d[\d,.]*)/i,
  /(?:price|value|worth).*(?:\$?\d[\d,.]*)/i,
];

/**
 * Compute FinBERT-style financial NLP analysis score.
 */
function computeFinancialNLP(text: string): {
  score: number;
  flags: string[];
  sentiment: 'bullish' | 'bearish' | 'neutral';
  details: string;
} {
  const flags: string[] = [];
  const lower = text.toLowerCase();

  // ---- 1. Financial Sentiment Detection ----
  let bullishScore = 0;
  let bearishScore = 0;
  let neutralScore = 0;

  for (const word of FIN_BULLISH) {
    if (lower.includes(word)) bullishScore++;
  }
  for (const word of FIN_BEARISH) {
    if (lower.includes(word)) bearishScore++;
  }
  for (const word of FIN_NEUTRAL) {
    if (lower.includes(word)) neutralScore++;
  }

  const totalSentimentWords = bullishScore + bearishScore + neutralScore;
  const sentiment: 'bullish' | 'bearish' | 'neutral' =
    bullishScore > bearishScore && bullishScore > neutralScore ? 'bullish' :
    bearishScore > bullishScore && bearishScore > neutralScore ? 'bearish' : 'neutral';

  // Sentiment consistency score — strong single direction is more credible
  const sentimentConsistency = totalSentimentWords > 0
    ? Math.max(bullishScore, bearishScore, neutralScore) / totalSentimentWords
    : 0.7; // No sentiment words = neutral, not necessarily bad

  // ---- 2. Internal Contradiction Detection ----
  let contradictionCount = 0;
  for (const { pattern, description } of CONTRADICTION_PATTERNS) {
    if (pattern.test(text)) {
      contradictionCount++;
      flags.push(`Financial contradiction: ${description}`);
    }
  }
  const contradictionScore = Math.max(0, 1 - contradictionCount * 0.3);

  // ---- 3. Numerical Claim Extraction & Verification ----
  let numericalClaimCount = 0;
  let suspiciousNumbers = 0;

  for (const pattern of NUMERICAL_CLAIM_PATTERNS) {
    if (pattern.test(text)) {
      numericalClaimCount++;
    }
  }

  // Check for suspicious round numbers (often fabricated)
  const roundNumberPattern = /\$(\d{1,3}(?:,0{3})+(?:\.0{1,2})?)\b/g;
  const roundMatches = [...text.matchAll(roundNumberPattern)];
  if (roundMatches.length > 2) {
    suspiciousNumbers++;
    flags.push('Multiple suspiciously round numbers in financial claims');
  }

  // Check for price claims with excessive precision
  const excessivePrecisionPattern = /\$\d+\.\d{4,}/g;
  const precisionMatches = [...text.matchAll(excessivePrecisionPattern)];
  if (precisionMatches.length > 1) {
    suspiciousNumbers++;
    flags.push('Excessively precise price figures — possible fabrication');
  }

  const numericalCredibility = numericalClaimCount === 0
    ? 0.7 // No numerical claims is neutral
    : Math.max(0, 1 - suspiciousNumbers * 0.25);

  // ---- 4. Financial Jargon Depth (deeper = more credible) ----
  const jargonWords = [
    'moving average', 'RSI', 'MACD', 'Bollinger', 'Fibonacci',
    'support', 'resistance', 'volume profile', 'order book', 'liquidity',
    'funding rate', 'open interest', 'basis', 'contango', 'backwardation',
    'implied volatility', 'realized volatility', 'sharpe ratio',
    'market cap', 'TVL', 'FDV', 'circulating supply', 'max supply',
    'hash rate', 'difficulty adjustment', 'block reward',
  ];
  let jargonCount = 0;
  for (const j of jargonWords) {
    if (lower.includes(j.toLowerCase())) jargonCount++;
  }
  const jargonDepth = Math.min(1, jargonCount / 5); // Normalize: 5+ jargon words = full score

  // ---- 5. FUD/Hype Detection ----
  const fudPatterns = [
    /imminent\s+(?:crash|collapse|ban)/i,
    /government\s+(?:ban|crackdown|seize)/i,
    /total\s+loss/i,
    /worthless/i,
    /dead\s+coin/i,
  ];
  const hypePatterns = [
    /next\s+(?:bitcoin|ethereum|100x|1000x)/i,
    /guaranteed\s+(?:returns|profits|gains)/i,
    /once\s+in\s+a\s+lifetime/i,
    /never\s+lose/i,
    /risk[- ]?free/i,
    /to\s+the\s+moon/i,
    /will\s+definitely/i,
    /100%\s+(?:guaranteed|sure|certain)/i,
    /foolproof/i,
    /\$(?:1\s+)?million/i,
    /\$\d+[,.]\d+\s+(?:by\s+)?(?:tomorrow|next\s+week|soon)/i,
  ];

  let fudHits = 0;
  let hypeHits = 0;
  for (const p of fudPatterns) {
    if (p.test(text)) fudHits++;
  }
  for (const p of hypePatterns) {
    if (p.test(text)) hypeHits++;
  }

  if (fudHits > 0) flags.push(`FUD pattern detected (${fudHits} instances)`);
  if (hypeHits > 0) flags.push(`Hype pattern detected (${hypeHits} instances)`);

  const fudHypeScore = Math.max(0, 1 - (fudHits + hypeHits) * 0.3);

  // ALL CAPS ratio penalty for financial text
  const fWords = text.split(/\s+/);
  const fCapsWords = fWords.filter(w => w.length > 3 && w === w.toUpperCase() && /[A-Z]/.test(w));
  const fCapsRatio = fCapsWords.length / Math.max(fWords.length, 1);
  const fCapsPenalty = fCapsRatio > 0.25 ? 0.4 : fCapsRatio > 0.15 ? 0.2 : fCapsRatio > 0.08 ? 0.1 : 0;

  // Excessive exclamation mark penalty
  const fExclamationCount = (text.match(/!/g) || []).length;
  const fExclamationPenalty = fExclamationCount > 5 ? 0.3 : fExclamationCount > 3 ? 0.15 : fExclamationCount > 1 ? 0.05 : 0;

  // ---- Aggregate FinBERT-style score ----
  const rawScore =
    sentimentConsistency * 0.15 +
    contradictionScore * 0.25 +
    numericalCredibility * 0.15 +
    jargonDepth * 0.1 +
    fudHypeScore * 0.35 -
    fCapsPenalty -
    fExclamationPenalty;

  const score = clamp01(rawScore);

  const details = `Financial sentiment: ${sentiment} (bull:${bullishScore}/bear:${bearishScore}/neutral:${neutralScore}). ` +
    `Contradictions: ${contradictionCount}. Jargon depth: ${jargonCount}. ` +
    `FUD: ${fudHits}, Hype: ${hypeHits}.`;

  return { score, flags, sentiment, details };
}

// ---------------------------------------------------------------------------
// 3. Source Credibility Analysis
// ---------------------------------------------------------------------------

/** Tier 1: Highly credible established financial/crypto news sources */
const TIER1_SOURCES: Record<string, number> = {
  'coindesk.com': 0.92,
  'cointelegraph.com': 0.88,
  'bloomberg.com': 0.96,
  'reuters.com': 0.97,
  'wsj.com': 0.95,
  'ft.com': 0.95,
  'cnbc.com': 0.90,
  'theblock.co': 0.88,
  'decrypt.co': 0.85,
  'benzinga.com': 0.82,
  'coinbureau.com': 0.80,
  'messari.io': 0.87,
  'coingecko.com': 0.85,
  'coinmarketcap.com': 0.83,
  'beincrypto.com': 0.78,
};

/** Tier 2: Moderate credibility */
const TIER2_SOURCES: Record<string, number> = {
  'medium.com': 0.55,
  'substack.com': 0.55,
  'youtube.com': 0.45,
  'reddit.com': 0.50,
  'twitter.com': 0.40,
  'x.com': 0.40,
  'facebook.com': 0.35,
  'instagram.com': 0.30,
  'tiktok.com': 0.25,
  'discord.gg': 0.30,
  'telegram.org': 0.30,
};

/** Known low-credibility / scam-associated patterns */
const LOW_CREDIBILITY_DOMAINS: string[] = [
  'bit.ly', 'tinyurl.com', 'ow.ly', 't.co', // URL shorteners
];

/**
 * Compute source credibility score from a URL.
 */
function computeSourceCredibility(url: string): {
  score: number;
  flags: string[];
  details: string;
} {
  const flags: string[] = [];
  let score = 0.5; // Default for unknown sources
  const details: string[] = [];

  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname.replace(/^www\./, '');

    // ---- 1. Domain reputation ----
    if (TIER1_SOURCES[hostname] !== undefined) {
      score = TIER1_SOURCES[hostname]!;
      details.push(`Tier 1 source: ${hostname}`);
    } else if (TIER2_SOURCES[hostname] !== undefined) {
      score = TIER2_SOURCES[hostname]!;
      details.push(`Tier 2 source: ${hostname}`);
    } else if (LOW_CREDIBILITY_DOMAINS.includes(hostname)) {
      score = 0.15;
      flags.push(`URL shortener / low-credibility domain: ${hostname}`);
      details.push(`Low-credibility domain: ${hostname}`);
    } else {
      // Unknown domain — do basic checks
      details.push(`Unknown domain: ${hostname}`);

      // Check for professional domain extensions
      const tld = hostname.split('.').pop() || '';
      if (['com', 'org', 'io', 'co', 'net'].includes(tld)) {
        score += 0.1;
      } else if (['xyz', 'top', 'click', 'info', 'biz'].includes(tld)) {
        score -= 0.15;
        flags.push(`Suspicious TLD: .${tld}`);
      }

      // Check for crypto-related domain names (slightly more credible for crypto news)
      if (/crypto|coin|token|defi|nft|blockchain|web3/i.test(hostname)) {
        score += 0.05;
      }
    }

    // ---- 2. HTTPS check ----
    if (parsed.protocol === 'https:') {
      score += 0.05;
      details.push('HTTPS: Yes');
    } else {
      score -= 0.2;
      flags.push('No HTTPS — insecure connection');
      details.push('HTTPS: No');
    }

    // ---- 3. Professional domain indicators ----
    // Check for subdomain that looks unprofessional
    const subdomain = hostname.split('.');
    if (subdomain.length > 2) {
      // Has subdomain — slightly less professional
      score -= 0.05;
    }

    // ---- 4. Path structure analysis ----
    const path = parsed.pathname;
    if (path.includes('/blog/') || path.includes('/article/') || path.includes('/news/')) {
      score += 0.03; // Professional URL structure
    }

    // ---- 5. Suspicious URL patterns ----
    if (/promo|affiliate|ref|sponsor/i.test(url)) {
      score -= 0.15;
      flags.push('URL contains promotional/affiliate indicators');
    }
    if (/buy-now|click-here|limited-offer/i.test(url)) {
      score -= 0.2;
      flags.push('URL contains spam-like promotional language');
    }

  } catch {
    // Invalid URL
    score = 0.2;
    flags.push('Invalid or malformed URL');
    details.push('URL could not be parsed');
  }

  return {
    score: clamp01(score),
    flags,
    details: details.join('. '),
  };
}

// ---------------------------------------------------------------------------
// 4. Social Media Propagation Analysis
// ---------------------------------------------------------------------------

/** Coordinated manipulation language patterns */
const COORDINATION_PATTERNS: Array<{ pattern: RegExp; description: string }> = [
  { pattern: /let'?s\s+(?:all\s+)?buy/i, description: 'Coordinated buying call' },
  { pattern: /everyone\s+(?:should|needs?\s+to)\s+buy/i, description: 'Mass buying appeal' },
  { pattern: /we\s+(?:all\s+)?need\s+to\s+(?:buy|hold|sell)/i, description: 'Collective action appeal' },
  { pattern: /join\s+(?:the\s+)?(?:movement|pump|raid)/i, description: 'Group mobilization call' },
  { pattern: /(?:coordinate|organize|mob)\s+(?:the\s+)?(?:buy|pump|sell|dump)/i, description: 'Explicit coordination' },
];

/** Pump and dump language patterns */
const PUMP_DUMP_PATTERNS: Array<{ pattern: RegExp; description: string }> = [
  { pattern: /pump\s+(?:and\s+dump|it|now|this|soon)/i, description: 'Pump language' },
  { pattern: /dump\s+(?:now|it|this|soon|before)/i, description: 'Dump language' },
  { pattern: /buy\s+(?:now|quick|fast|immediately|before)/i, description: 'Urgency buying signal' },
  { pattern: /sell\s+(?:now|quick|fast|immediately|before)/i, description: 'Urgency selling signal' },
  { pattern: /get\s+(?:in\s+)?(?:now|before\s+it'?s?\s+too\s+late)/i, description: 'FOMO urgency' },
  { pattern: /(?:ape\s+in|apeing|aped)\s+(?:now|into)/i, description: 'Reckless investment language' },
  { pattern: /this\s+is\s+(?:the\s+)?(?:one|it)\s*!/i, description: 'Overconfident selection' },
  { pattern: /(?:100x|1000x|10x)\s+(?:gem|gem|altcoin|token)/i, description: 'Unrealistic multiplier claim' },
  { pattern: /(?:act\s+now|don'?t\s+miss|last\s+chance|limited\s+time|hurry\s+up)/i, description: 'Urgency/manipulation pressure' },
  { pattern: /(?:guaranteed|foolproof|risk[- ]?free|bulletproof|100%)/i, description: 'False certainty language' },
  { pattern: /(?:insiders?\s+(?:say|claim|report)|whispers?\s+(?:suggest|say)|sources?\s+(?:say|claim))/i, description: 'Unverifiable insider claims' },
];

/** Bot-like language patterns */
const BOT_PATTERNS: Array<{ pattern: RegExp; description: string }> = [
  { pattern: /^(?:BUY|SELL|HOLD|PUMP|DUMP)\s+[A-Z]{3,}[\s!]*$/m, description: 'All-caps command style' },
  { pattern: /(?:follow\s+me|join\s+my|check\s+out\s+my)\s+(?:channel|group|signal)/i, description: 'Channel promotion (bot behavior)' },
  { pattern: /(?:free\s+)?signal\s+(?:group|channel|alert)/i, description: 'Signal group promotion' },
  { pattern: /(?:dm\s+me|message\s+me)\s+(?:for|to\s+get)\s+/i, description: 'DM solicitation pattern' },
  { pattern: /(?:🚀|🔥|💎|👇|⚠️|📈|📉){3,}/u, description: 'Excessive emoji spam (bot-like)' },
  { pattern: /tag\s+\d+\s+(?:friends|people)/i, description: 'Viral sharing instruction' },
  { pattern: /share\s+(?:this|now)\s+(?:and|&)\s+/i, description: 'Chain sharing instruction' },
  { pattern: /[A-Z]{4,}!{2,}/, description: 'ALL CAPS with multiple exclamation marks (bot-like)' },
  { pattern: /(?:WILL\s+)?(?:DEFINITELY|CERTAINLY|ABSOLUTELY|GUARANTEED|MUST)/i, description: 'Absolute certainty language (bot/spam)' },
  { pattern: /(?:don'?t\s+miss\s+out|act\s+now|last\s+chance)/i, description: 'Urgency manipulation (spam pattern)' },
];

/** Hype cycle keyword sets */
const HYPE_PHASES = {
  accumulation: ['accumulating', 'quietly buying', 'under the radar', 'stealth', 'before the crowd'],
  awareness: ['just discovered', 'emerging', 'gaining attention', 'starting to notice'],
  viral: ['trending', 'viral', 'everyone talking', 'blowing up', 'spreading fast'],
  euphoria: ['moon', 'lambo', 'parabolic', 'never going down', 'new paradigm', 'this time is different'],
  correction: ['crash', 'correction', 'overvalued', 'bubble popped', 'reality check'],
};

/**
 * Detect the hype cycle phase of the text.
 */
function detectHypeCyclePhase(text: string): 'none' | 'accumulation' | 'awareness' | 'viral' | 'euphoria' | 'correction' {
  const lower = text.toLowerCase();
  let bestPhase: 'none' | 'accumulation' | 'awareness' | 'viral' | 'euphoria' | 'correction' = 'none';
  let bestCount = 0;

  for (const [phase, keywords] of Object.entries(HYPE_PHASES)) {
    let count = 0;
    for (const kw of keywords) {
      if (lower.includes(kw)) count++;
    }
    if (count > bestCount) {
      bestCount = count;
      bestPhase = phase as keyof typeof HYPE_PHASES;
    }
  }

  return bestCount > 0 ? bestPhase : 'none';
}

/**
 * Compute social media propagation analysis score.
 */
function computeSocialPropagation(
  text: string,
  shares?: number,
  likes?: number
): {
  score: number;
  flags: string[];
  botLikelihood: number;
  coordinationScore: number;
  pumpDumpScore: number;
  hypeCyclePhase: 'none' | 'accumulation' | 'awareness' | 'viral' | 'euphoria' | 'correction';
  viralCoefficient: number;
  details: string;
} {
  const flags: string[] = [];

  // ---- 1. Bot-like language detection ----
  let botHits = 0;
  for (const { pattern, description } of BOT_PATTERNS) {
    if (pattern.test(text)) {
      botHits++;
      flags.push(`Bot-like pattern: ${description}`);
    }
  }
  const botLikelihood = clamp01(botHits * 0.2);

  // ---- 2. Coordination detection ----
  let coordinationHits = 0;
  for (const { pattern, description } of COORDINATION_PATTERNS) {
    if (pattern.test(text)) {
      coordinationHits++;
      flags.push(`Coordination pattern: ${description}`);
    }
  }
  const coordinationScore = clamp01(coordinationHits * 0.25);

  // ---- 3. Pump & dump detection ----
  let pumpDumpHits = 0;
  for (const { pattern, description } of PUMP_DUMP_PATTERNS) {
    if (pattern.test(text)) {
      pumpDumpHits++;
      flags.push(`Pump/dump pattern: ${description}`);
    }
  }
  const pumpDumpScore = clamp01(pumpDumpHits * 0.2);

  // ---- 4. Hype cycle detection ----
  const hypeCyclePhase = detectHypeCyclePhase(text);
  // Euphoria and viral phases are most dangerous
  const hypeRiskScore: Record<string, number> = {
    none: 0.9,
    accumulation: 0.85,
    awareness: 0.75,
    viral: 0.4,
    euphoria: 0.2,
    correction: 0.6,
  };
  const hypeScore = hypeRiskScore[hypeCyclePhase] ?? 0.7;

  // ---- 5. Viral coefficient estimation ----
  let viralCoefficient = 1.0; // Default: organic reach
  if (shares !== undefined && likes !== undefined && shares + likes > 0) {
    // Engagement ratio: if share/like ratio is very high, likely manipulation
    const shareToLikeRatio = shares / Math.max(likes, 1);
    if (shareToLikeRatio > 2) {
      viralCoefficient = 3.0; // Unusually high sharing
      flags.push(`Unusual share-to-like ratio: ${shareToLikeRatio.toFixed(1)}`);
    } else if (shareToLikeRatio > 0.8) {
      viralCoefficient = 2.0;
    } else {
      viralCoefficient = 1.0 + shareToLikeRatio * 0.5;
    }
  }

  // Excessive engagement without substance
  if ((shares ?? 0) > 1000 && text.length < 200) {
    viralCoefficient *= 1.5;
    flags.push('Very high engagement on very short content — suspicious');
  }

  // ---- 6. Repetition detection (bot pattern) ----
  const words = text.toLowerCase().split(/\s+/);
  const wordFreq: Record<string, number> = {};
  for (const w of words) {
    wordFreq[w] = (wordFreq[w] || 0) + 1;
  }
  const repeatedWords = Object.entries(wordFreq).filter(([w, c]) => c > 3 && w.length > 4);
  if (repeatedWords.length > 3) {
    flags.push(`Excessive word repetition: ${repeatedWords.map(([w]) => w).slice(0, 5).join(', ')}`);
    viralCoefficient *= 1.2;
  }

  // ---- 7. Hashtag spam ----
  const hashtagCount = (text.match(/#[\w]+/g) || []).length;
  if (hashtagCount > 8) {
    flags.push(`Excessive hashtags: ${hashtagCount} found`);
    viralCoefficient *= 1.15;
  }

  // Normalize viral coefficient to 0-1 scale for scoring
  // Higher viral coefficient = less credible
  const viralScore = Math.max(0, 1 - (viralCoefficient - 1) / 3);

  // ---- Aggregate social propagation score ----
  const rawScore =
    (1 - botLikelihood) * 0.25 +
    (1 - coordinationScore) * 0.25 +
    (1 - pumpDumpScore) * 0.25 +
    hypeScore * 0.15 +
    viralScore * 0.10;

  const score = clamp01(rawScore);

  const details = `Bot likelihood: ${(botLikelihood * 100).toFixed(0)}%. ` +
    `Coordination: ${(coordinationScore * 100).toFixed(0)}%. ` +
    `Pump/dump: ${(pumpDumpScore * 100).toFixed(0)}%. ` +
    `Hype phase: ${hypeCyclePhase}. ` +
    `Viral coefficient: ${viralCoefficient.toFixed(1)}x.`;

  return {
    score,
    flags,
    botLikelihood,
    coordinationScore,
    pumpDumpScore,
    hypeCyclePhase,
    viralCoefficient,
    details,
  };
}

// ---------------------------------------------------------------------------
// LLM-based analysis (OpenRouter/OpenAI) — enhanced prompt
// ---------------------------------------------------------------------------

async function analyzeWithLLM(text: string): Promise<{
  credibilityScore: number;
  flags: string[];
  recommendation: string;
  analysis: string;
  breakdown: {
    sensationalism: number;
    factualConsistency: number;
    sourceReliability: number;
    emotionalManipulation: number;
    marketConsistency: number;
  };
}> {
  const config = getLLMConfig();
  if (!config) {
    throw new Error('No LLM API key configured (set OPENROUTER_API_KEY or OPENAI_API_KEY)');
  }

  const prompt = `You are an expert crypto news credibility analyst. Analyze the following text for credibility and trustworthiness in the context of cryptocurrency markets.

Rate each dimension from 0 (worst) to 1 (best):
- sensationalism: Is the text using sensational/clickbait language?
- factualConsistency: Are claims internally consistent and factually plausible?
- sourceReliability: Does the text cite verifiable sources or make unverifiable claims?
- emotionalManipulation: Does the text try to manipulate reader emotions (fear, greed, FOMO)?
- marketConsistency: Are market-related claims consistent with known crypto market behavior?

Also provide:
- credibilityScore: Overall credibility 0-1
- flags: Array of specific red flag strings
- recommendation: One of "TRUST", "VERIFY", "CAUTION", or "AVOID"
- analysis: 2-3 sentence analysis

TEXT TO ANALYZE:
---
${text}
---

Respond with ONLY valid JSON in this exact format (no markdown, no code blocks):
{"credibilityScore":0.7,"flags":["example flag"],"recommendation":"VERIFY","analysis":"Brief analysis.","breakdown":{"sensationalism":0.8,"factualConsistency":0.6,"sourceReliability":0.5,"emotionalManipulation":0.7,"marketConsistency":0.8}}`;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${config.apiKey}`,
  };

  // OpenRouter-specific headers
  if (process.env.OPENROUTER_API_KEY) {
    headers['HTTP-Referer'] = 'https://corrfarm.ai';
    headers['X-Title'] = 'CorrFarm Credibility Detector';
  }

  const response = await fetch(`${config.baseUrl}/chat/completions`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: config.model,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.1,
      max_tokens: 500,
    }),
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => 'unknown error');
    throw new Error(`OpenAI API error ${response.status}: ${errText}`);
  }

  const data = await response.json() as { choices: { message: { content: string } }[] };
  const content = data.choices?.[0]?.message?.content || '';

  // Parse JSON from response (handle possible markdown wrapping)
  let jsonStr = content;
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (jsonMatch) jsonStr = jsonMatch[0];

  try {
    const parsed = JSON.parse(jsonStr) as {
      credibilityScore?: number;
      flags?: string[];
      recommendation?: string;
      analysis?: string;
      breakdown?: {
        sensationalism?: number;
        factualConsistency?: number;
        sourceReliability?: number;
        emotionalManipulation?: number;
        marketConsistency?: number;
      };
    };

    return {
      credibilityScore: clamp01(parsed.credibilityScore ?? 0.5),
      flags: Array.isArray(parsed.flags) ? parsed.flags : [],
      recommendation: parsed.recommendation || 'VERIFY',
      analysis: parsed.analysis || 'LLM analysis completed.',
      breakdown: {
        sensationalism: clamp01(parsed.breakdown?.sensationalism ?? 0.5),
        factualConsistency: clamp01(parsed.breakdown?.factualConsistency ?? 0.5),
        sourceReliability: clamp01(parsed.breakdown?.sourceReliability ?? 0.5),
        emotionalManipulation: clamp01(parsed.breakdown?.emotionalManipulation ?? 0.5),
        marketConsistency: clamp01(parsed.breakdown?.marketConsistency ?? 0.5),
      },
    };
  } catch {
    // JSON parse failed — return a fallback
    return {
      credibilityScore: 0.5,
      flags: ['llm_response_parse_failed'],
      recommendation: 'VERIFY',
      analysis: 'LLM response could not be parsed. Manual verification recommended.',
      breakdown: {
        sensationalism: 0.5,
        factualConsistency: 0.5,
        sourceReliability: 0.5,
        emotionalManipulation: 0.5,
        marketConsistency: 0.5,
      },
    };
  }
}

// ---------------------------------------------------------------------------
// Rule-based heuristic analysis (fallback) — original dimensions
// ---------------------------------------------------------------------------

const SENSATIONALISM_WORDS = [
  'breaking', 'urgent', 'shocking', 'unbelievable', 'explosive',
  'massive', 'huge', 'incredible', 'insane', 'crazy',
  'moon', 'mooning', 'lambo', 'to the moon', 'rocket',
];

const EMOTIONAL_WORDS = [
  'panic', 'fear', 'terrifying', 'devastating', 'catastrophic',
  'amazing', 'incredible opportunity', 'once in a lifetime',
  'don\'t miss out', 'act now', 'last chance', 'fomo',
  'bloodbath', 'carnage', 'slaughter', 'massacre',
];

const UNVERIFIABLE_PHRASES = [
  'sources say', 'insiders claim', 'rumor has it', 'word on the street',
  'according to anonymous', 'people familiar with', 'whispers suggest',
  'industry sources', 'well-placed sources', 'reliable sources claim',
];

const CERTAINTY_PHRASES = [
  'will definitely', 'guaranteed to', 'certain to', 'without a doubt',
  'sure thing', 'can\'t lose', 'risk-free', '100%', 'bulletproof',
  'foolproof', 'fail-safe', 'impossible to lose',
];

const CLICKBAIT_PATTERNS = [
  /you won't believe/i,
  /what happens next/i,
  /this one trick/i,
  /the real reason/i,
  /they don't want you to know/i,
  /secret (that|which)/i,
  /click here/i,
];

function analyzeWithHeuristics(text: string): {
  credibilityScore: number;
  flags: string[];
  recommendation: string;
  analysis: string;
  breakdown: {
    sensationalism: number;
    factualConsistency: number;
    sourceReliability: number;
    emotionalManipulation: number;
    marketConsistency: number;
  };
} {
  const flags: string[] = [];
  const lower = text.toLowerCase();

  // 1. ALL CAPS words (sensationalism)
  const words = text.split(/\s+/);
  const capsWords = words.filter(
    (w) => w.length > 3 && w === w.toUpperCase() && /[A-Z]/.test(w)
  );
  const capsRatio = capsWords.length / Math.max(words.length, 1);
  if (capsRatio > 0.15) {
    flags.push(`Excessive ALL CAPS words (${capsWords.length} found)`);
  }
  const sensationalismScore = Math.max(0, 1 - capsRatio * 5);

  // 2. Excessive punctuation (!!!)
  const exclamationClusters = (text.match(/!{2,}/g) || []).length;
  const questionClusters = (text.match(/\?{2,}/g) || []).length;
  if (exclamationClusters > 2) {
    flags.push(`Excessive exclamation marks (${exclamationClusters} clusters)`);
  }
  const punctScore = Math.max(0, 1 - (exclamationClusters + questionClusters) * 0.15);

  // 3. Sensationalism trigger words
  let sensationalHits = 0;
  for (const word of SENSATIONALISM_WORDS) {
    if (lower.includes(word)) {
      sensationalHits++;
      flags.push(`Sensational language: "${word}"`);
    }
  }
  const sensationalWordScore = Math.max(0, 1 - sensationalHits * 0.12);

  // 4. Emotional manipulation words
  let emotionalHits = 0;
  for (const word of EMOTIONAL_WORDS) {
    if (lower.includes(word)) {
      emotionalHits++;
      flags.push(`Emotional manipulation language: "${word}"`);
    }
  }
  const emotionalScore = Math.max(0, 1 - emotionalHits * 0.15);

  // 5. Unverifiable claims
  let unverifiableHits = 0;
  for (const phrase of UNVERIFIABLE_PHRASES) {
    if (lower.includes(phrase)) {
      unverifiableHits++;
      flags.push(`Unverifiable claim: "${phrase}"`);
    }
  }
  const sourceReliability = Math.max(0, 1 - unverifiableHits * 0.2);

  // 6. Price prediction certainty
  let certaintyHits = 0;
  for (const phrase of CERTAINTY_PHRASES) {
    if (lower.includes(phrase)) {
      certaintyHits++;
      flags.push(`Overconfident price prediction: "${phrase}"`);
    }
  }
  const marketConsistency = Math.max(0, 1 - certaintyHits * 0.25);

  // 7. Clickbait patterns
  for (const pattern of CLICKBAIT_PATTERNS) {
    if (pattern.test(text)) {
      flags.push(`Clickbait pattern detected: "${pattern.source}"`);
    }
  }

  // 8. Headline vs content consistency (if we detect a headline separator)
  const headlineParts = text.split(/[.|!]\s*[A-Z]/);
  const consistencyScore = headlineParts.length > 1 ? 0.8 : 0.6;

  // Aggregate scores
  const sensationalism = clamp01((sensationalismScore + sensationalWordScore + punctScore) / 3);
  const factualConsistency = clamp01(consistencyScore);
  const emotionalManipulation = clamp01(emotionalScore);
  const marketCons = clamp01(marketConsistency);

  // Apply penalty for ALL CAPS ratio (more aggressive)
  const capsPenalty = capsRatio > 0.3 ? 0.3 : capsRatio > 0.15 ? 0.15 : 0;
  // Apply penalty for certainty phrases (very suspicious in crypto)
  const certaintyPenalty = certaintyHits > 1 ? 0.3 : certaintyHits === 1 ? 0.15 : 0;

  // Overall credibility score — weighted average with penalties
  const rawScore =
    sensationalism * 0.25 +
    factualConsistency * 0.2 +
    sourceReliability * 0.2 +
    emotionalManipulation * 0.2 +
    marketCons * 0.15;

  const credibilityScore = clamp01(rawScore - capsPenalty - certaintyPenalty);

  // Determine recommendation
  let recommendation: string;
  if (credibilityScore >= 0.75) recommendation = 'TRUST';
  else if (credibilityScore >= 0.5) recommendation = 'VERIFY';
  else if (credibilityScore >= 0.3) recommendation = 'CAUTION';
  else recommendation = 'AVOID';

  // Generate analysis text
  const analysis = `Heuristic analysis found ${flags.length} red flag(s). ` +
    (flags.length === 0
      ? 'No significant credibility concerns detected by rule-based analysis.'
      : `Key concerns: ${flags.slice(0, 3).join('; ')}.`);

  return {
    credibilityScore: Math.round(credibilityScore * 100) / 100,
    flags,
    recommendation,
    analysis,
    breakdown: {
      sensationalism: Math.round(sensationalism * 100) / 100,
      factualConsistency: Math.round(factualConsistency * 100) / 100,
      sourceReliability: Math.round(sourceReliability * 100) / 100,
      emotionalManipulation: Math.round(emotionalManipulation * 100) / 100,
      marketConsistency: Math.round(marketCons * 100) / 100,
    },
  };
}

// ---------------------------------------------------------------------------
// Weighted overall score computation
// ---------------------------------------------------------------------------

function computeWeightedScore(breakdown: CredibilityResult['breakdown']): number {
  return clamp01(
    breakdown.marketReaction * SCORE_WEIGHTS.marketReaction +
    breakdown.financialNLP * SCORE_WEIGHTS.financialNLP +
    breakdown.sourceCredibility * SCORE_WEIGHTS.sourceCredibility +
    breakdown.socialPropagation * SCORE_WEIGHTS.socialPropagation +
    breakdown.sensationalism * SCORE_WEIGHTS.sensationalism +
    breakdown.factualConsistency * SCORE_WEIGHTS.factualConsistency +
    breakdown.sourceReliability * SCORE_WEIGHTS.sourceReliability +
    breakdown.emotionalManipulation * SCORE_WEIGHTS.emotionalManipulation +
    breakdown.marketConsistency * SCORE_WEIGHTS.marketConsistency
  );
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Analyze text for credibility using the full enhanced pipeline.
 *
 * Pipeline:
 *   1. Base analysis (LLM if available, else heuristics) → original 5 dimensions
 *   2. Market Reaction Verification (Binance data) → marketReaction score
 *   3. Financial NLP (FinBERT-style) → financialNLP score
 *   4. Source Credibility → sourceCredibility score (if URL provided)
 *   5. Social Propagation → socialPropagation score
 *   6. Weighted aggregation of all 9 dimensions
 */
export async function analyzeText(
  text: string,
  sourceUrl?: string
): Promise<CredibilityResult> {
  if (!text || text.trim().length === 0) {
    return {
      credibilityScore: 0,
      flags: ['empty_text'],
      recommendation: 'AVOID',
      analysis: 'No text provided for analysis.',
      breakdown: {
        sensationalism: 0,
        factualConsistency: 0,
        sourceReliability: 0,
        emotionalManipulation: 0,
        marketConsistency: 0,
        marketReaction: 0,
        financialNLP: 0,
        sourceCredibility: 0,
        socialPropagation: 0,
      },
      method: 'heuristic',
    };
  }

  // ---- Step 1: Base analysis (LLM or heuristic) ----
  let baseResult: {
    credibilityScore: number;
    flags: string[];
    recommendation: string;
    analysis: string;
    breakdown: {
      sensationalism: number;
      factualConsistency: number;
      sourceReliability: number;
      emotionalManipulation: number;
      marketConsistency: number;
    };
  };

  const config = getLLMConfig();
  let method: 'llm' | 'heuristic' | 'enhanced' = 'heuristic';

  if (config) {
    try {
      baseResult = await analyzeWithLLM(text);
      method = 'llm';
    } catch (error) {
      console.warn('[CredibilityDetector] LLM analysis failed, falling back to heuristics:', error);
      baseResult = analyzeWithHeuristics(text);
    }
  } else {
    baseResult = analyzeWithHeuristics(text);
  }

  // ---- Step 2: Market Reaction Verification ----
  let marketReactionScore = 0.6; // Neutral default
  const marketFlags: string[] = [];
  let marketDetails = '';

  try {
    const marketResult = await computeMarketReaction(text);
    marketReactionScore = marketResult.score;
    marketFlags.push(...marketResult.flags);
    marketDetails = marketResult.details;
  } catch (error) {
    console.warn('[CredibilityDetector] Market reaction analysis failed:', error);
    marketFlags.push('Market data verification unavailable');
  }

  // ---- Step 3: Financial NLP Analysis ----
  let finNLPScore = 0.6;
  const finNLPFlags: string[] = [];
  let finNLPDetails = '';

  try {
    const finNLPResult = computeFinancialNLP(text);
    finNLPScore = finNLPResult.score;
    finNLPFlags.push(...finNLPResult.flags);
    finNLPDetails = finNLPResult.details;
  } catch (error) {
    console.warn('[CredibilityDetector] Financial NLP analysis failed:', error);
    finNLPFlags.push('Financial NLP analysis unavailable');
  }

  // ---- Step 4: Source Credibility ----
  let sourceCredibilityScore = 0.5; // Neutral for unknown
  const sourceCredFlags: string[] = [];
  let sourceCredDetails = '';

  if (sourceUrl) {
    try {
      const sourceResult = computeSourceCredibility(sourceUrl);
      sourceCredibilityScore = sourceResult.score;
      sourceCredFlags.push(...sourceResult.flags);
      sourceCredDetails = sourceResult.details;
    } catch (error) {
      console.warn('[CredibilityDetector] Source credibility analysis failed:', error);
      sourceCredFlags.push('Source credibility analysis unavailable');
    }
  } else {
    // Try to extract URLs from the text
    const urlMatch = text.match(/https?:\/\/[^\s]+/);
    if (urlMatch) {
      try {
        const sourceResult = computeSourceCredibility(urlMatch[0]);
        sourceCredibilityScore = sourceResult.score;
        sourceCredFlags.push(...sourceResult.flags);
        sourceCredDetails = sourceResult.details;
      } catch {
        sourceCredDetails = 'URL found in text but could not be analyzed';
      }
    }
  }

  // ---- Step 5: Social Propagation Analysis ----
  let socialScore = 0.7; // Default neutral-good (no social signals = not suspicious)
  const socialFlags: string[] = [];
  let socialDetails = '';

  try {
    const socialResult = computeSocialPropagation(text);
    socialScore = socialResult.score;
    socialFlags.push(...socialResult.flags);
    socialDetails = socialResult.details;
  } catch (error) {
    console.warn('[CredibilityDetector] Social propagation analysis failed:', error);
    socialFlags.push('Social propagation analysis unavailable');
  }

  // ---- Step 6: Assemble full breakdown ----
  const breakdown: CredibilityResult['breakdown'] = {
    sensationalism: Math.round(baseResult.breakdown.sensationalism * 100) / 100,
    factualConsistency: Math.round(baseResult.breakdown.factualConsistency * 100) / 100,
    sourceReliability: Math.round(baseResult.breakdown.sourceReliability * 100) / 100,
    emotionalManipulation: Math.round(baseResult.breakdown.emotionalManipulation * 100) / 100,
    marketConsistency: Math.round(baseResult.breakdown.marketConsistency * 100) / 100,
    marketReaction: Math.round(marketReactionScore * 100) / 100,
    financialNLP: Math.round(finNLPScore * 100) / 100,
    sourceCredibility: Math.round(sourceCredibilityScore * 100) / 100,
    socialPropagation: Math.round(socialScore * 100) / 100,
  };

  // Compute weighted overall score
  const credibilityScore = Math.round(computeWeightedScore(breakdown) * 100) / 100;

  // Merge all flags
  const allFlags = [
    ...baseResult.flags,
    ...marketFlags,
    ...finNLPFlags,
    ...sourceCredFlags,
    ...socialFlags,
  ];

  // Determine recommendation
  let recommendation: string;
  if (credibilityScore >= 0.75) recommendation = 'TRUST';
  else if (credibilityScore >= 0.5) recommendation = 'VERIFY';
  else if (credibilityScore >= 0.3) recommendation = 'CAUTION';
  else recommendation = 'AVOID';

  // Build enhanced analysis text
  const analysisParts = [
    baseResult.analysis,
    marketDetails ? `[Market] ${marketDetails}` : null,
    finNLPDetails ? `[FinNLP] ${finNLPDetails}` : null,
    sourceCredDetails ? `[Source] ${sourceCredDetails}` : null,
    socialDetails ? `[Social] ${socialDetails}` : null,
  ].filter(Boolean).join(' ');

  // Mark method as enhanced when we used the full pipeline
  if (method === 'llm') {
    method = 'enhanced';
  } else {
    method = 'heuristic'; // Still heuristic-based but with new dimensions
  }

  return {
    credibilityScore,
    flags: allFlags,
    recommendation,
    analysis: analysisParts,
    breakdown,
    method,
  };
}

/**
 * Full analysis of a news item (title + content + optional source).
 */
export async function analyzeNewsItem(
  title: string,
  content: string,
  sourceUrl?: string
): Promise<CredibilityResult> {
  const combinedText = sourceUrl
    ? `TITLE: ${title}\nCONTENT: ${content}\nSOURCE: ${sourceUrl}`
    : `TITLE: ${title}\nCONTENT: ${content}`;

  return analyzeText(combinedText, sourceUrl);
}

/**
 * Fetch and analyze a URL.
 * Attempts to fetch the page content and run credibility analysis.
 */
export async function analyzeUrl(url: string): Promise<CredibilityResult> {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'CorrFarm-CredibilityBot/1.0' },
      signal: AbortSignal.timeout(10000), // 10s timeout
    });

    if (!res.ok) {
      return {
        credibilityScore: 0.2,
        flags: [`Failed to fetch URL: HTTP ${res.status}`],
        recommendation: 'CAUTION',
        analysis: `Could not fetch content from ${url}. HTTP status: ${res.status}.`,
        breakdown: {
          sensationalism: 0.5,
          factualConsistency: 0.3,
          sourceReliability: 0.2,
          emotionalManipulation: 0.5,
          marketConsistency: 0.5,
          marketReaction: 0.5,
          financialNLP: 0.5,
          sourceCredibility: 0.2,
          socialPropagation: 0.5,
        },
        method: 'heuristic',
      };
    }

    const html = await res.text();

    // Extract text from HTML (simple approach — strip tags)
    const text = html
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 5000); // Limit text length

    if (text.length < 50) {
      return {
        credibilityScore: 0.3,
        flags: ['Insufficient content extracted from URL'],
        recommendation: 'CAUTION',
        analysis: `Very little content could be extracted from ${url}.`,
        breakdown: {
          sensationalism: 0.5,
          factualConsistency: 0.4,
          sourceReliability: 0.3,
          emotionalManipulation: 0.5,
          marketConsistency: 0.5,
          marketReaction: 0.5,
          financialNLP: 0.5,
          sourceCredibility: 0.3,
          socialPropagation: 0.5,
        },
        method: 'heuristic',
      };
    }

    return analyzeText(text, url);
  } catch (error) {
    return {
      credibilityScore: 0.2,
      flags: [`Error fetching URL: ${String(error)}`],
      recommendation: 'CAUTION',
      analysis: `Could not access or parse content from ${url}.`,
      breakdown: {
        sensationalism: 0.5,
        factualConsistency: 0.3,
        sourceReliability: 0.2,
        emotionalManipulation: 0.5,
        marketConsistency: 0.5,
        marketReaction: 0.5,
        financialNLP: 0.5,
        sourceCredibility: 0.2,
        socialPropagation: 0.5,
      },
      method: 'heuristic',
    };
  }
}

/**
 * Fetch recent crypto news from CryptoCompare API (free, no key required).
 * Returns raw news items without credibility analysis.
 */
export async function fetchCryptoNews(limit: number = 20): Promise<NewsItem[]> {
  try {
    const url = `https://min-api.cryptocompare.com/data/v2/news/?lang=EN&sortOrder=latest&excludeSponsored=true`;

    const res = await fetch(url, {
      headers: { 'Accept': 'application/json' },
      next: { revalidate: 300 }, // 5 min cache
    });

    if (!res.ok) {
      console.warn('[CredibilityDetector] CryptoCompare API error:', res.status);
      return [];
    }

    const data = await res.json() as {
      Data?: Array<{
        title?: string;
        body?: string;
        url?: string;
        source?: string;
        published_on?: number;
        categories?: string;
      }>;
    };

    const items: NewsItem[] = (data.Data || []).slice(0, limit).map((article) => ({
      title: article.title || '',
      content: (article.body || '').slice(0, 2000),
      sourceUrl: article.url || '',
      sourceName: article.source || '',
      publishedAt: article.published_on
        ? new Date(article.published_on * 1000).toISOString()
        : new Date().toISOString(),
    }));

    return items;
  } catch (error) {
    console.warn('[CredibilityDetector] fetchCryptoNews error:', error);
    return [];
  }
}

/**
 * Fetch crypto news and analyze each item for credibility.
 * Returns news items with credibility scores attached.
 */
export async function fetchAndAnalyzeCryptoNews(
  limit: number = 10
): Promise<NewsItem[]> {
  const items = await fetchCryptoNews(limit);

  const analyzed = await Promise.all(
    items.map(async (item) => {
      try {
        const credibility = await analyzeNewsItem(item.title, item.content, item.sourceUrl);
        return { ...item, credibility };
      } catch {
        return item;
      }
    })
  );

  return analyzed;
}

/**
 * Verify a specific market claim against real price data.
 *
 * @param claim - The text of the claim to verify
 * @param symbol - Crypto symbol (e.g. "BTC", "ETH", "bitcoin")
 * @returns MarketClaimVerification with detailed comparison
 */
export async function verifyMarketClaim(
  claim: string,
  symbol: string
): Promise<MarketClaimVerification> {
  const claimDirection = detectDirectionalClaim(claim);
  const resolved = resolveSymbol(symbol);

  let currentPrice: number | null = null;
  let priceChange24h: number | null = null;
  let priceChange7d: number | null = null;
  let actualDirection: 'bullish' | 'bearish' | 'neutral' = 'neutral';
  let isConsistent = false;
  let confidence = 0.3;
  let details = '';

  try {
    const marketData = await fetchMarketData(resolved);

    if (marketData) {
      currentPrice = marketData.currentPrice;
      priceChange24h = marketData.priceChange24h;
      priceChange7d = marketData.priceChange7d;

      actualDirection =
        (priceChange24h ?? 0) > 1 ? 'bullish' :
        (priceChange24h ?? 0) < -1 ? 'bearish' : 'neutral';

      // Determine consistency
      if (claimDirection === 'unknown' || claimDirection === 'neutral') {
        isConsistent = true; // No directional claim to contradict
        confidence = 0.5;
      } else if (claimDirection === actualDirection) {
        isConsistent = true;
        confidence = 0.85;
      } else if (actualDirection === 'neutral') {
        isConsistent = true; // Not contradictory, just no strong move
        confidence = 0.6;
      } else {
        isConsistent = false;
        confidence = 0.9; // High confidence in the inconsistency
      }

      // Check percentage claims
      const percentageClaims = extractPercentageClaims(claim);
      if (percentageClaims.length > 0 && priceChange24h !== null) {
        const absChange = Math.abs(priceChange24h);
        for (const claimedPct of percentageClaims) {
          if (claimedPct > 5 && absChange < claimedPct * 0.3) {
            isConsistent = false;
            confidence = Math.min(1, confidence + 0.05);
          }
        }
      }

      // Check price targets
      const priceTargets = extractPriceTargets(claim);
      if (priceTargets.length > 0 && currentPrice !== null) {
        for (const target of priceTargets) {
          const deviation = Math.abs(target - currentPrice) / currentPrice;
          if (deviation > 0.5 && claimDirection !== 'bearish') {
            // Large upside target claimed
            details += `Target $${target.toLocaleString()} is ${(deviation * 100).toFixed(0)}% from current $${currentPrice.toLocaleString()}. `;
          }
        }
      }

      if (!details) {
        details = `Claim direction: ${claimDirection}. Actual 24h: ${actualDirection} (${(priceChange24h ?? 0).toFixed(2)}%). ` +
          `Current price: $${currentPrice?.toLocaleString() ?? 'N/A'}. ` +
          `${isConsistent ? 'Claim is consistent with market data.' : 'Claim CONTRADICTS market data.'}`;
      }
    } else {
      details = 'Could not fetch market data for verification.';
    }
  } catch (error) {
    details = `Error fetching market data: ${String(error)}`;
  }

  // Compute marketReactionScore for this specific claim
  const marketReactionScore = isConsistent
    ? clamp01(0.5 + confidence * 0.5)
    : clamp01(0.5 - confidence * 0.4);

  return {
    claim,
    symbol: resolved,
    currentPrice,
    priceChange24h,
    priceChange7d,
    claimDirection,
    actualDirection,
    isConsistent,
    confidence: Math.round(confidence * 100) / 100,
    details,
    marketReactionScore: Math.round(marketReactionScore * 100) / 100,
  };
}

/**
 * Analyze social media propagation patterns in text.
 *
 * @param text - The text to analyze
 * @param shares - Optional share count
 * @param likes - Optional like count
 * @returns SocialPropagationResult with detailed analysis
 */
export function analyzeSocialPropagation(
  text: string,
  shares?: number,
  likes?: number
): SocialPropagationResult {
  const result = computeSocialPropagation(text, shares, likes);

  return {
    socialPropagationScore: Math.round(result.score * 100) / 100,
    botLikelihood: Math.round(result.botLikelihood * 100) / 100,
    coordinationScore: Math.round(result.coordinationScore * 100) / 100,
    pumpDumpScore: Math.round(result.pumpDumpScore * 100) / 100,
    hypeCyclePhase: result.hypeCyclePhase,
    viralCoefficient: Math.round(result.viralCoefficient * 100) / 100,
    flags: result.flags,
    analysis: result.details,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}
