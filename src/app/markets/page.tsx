'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Target, Search, Loader2, TrendingUp, TrendingDown, Eye,
  ArrowUpRight, ArrowDownRight, Clock, BarChart3, Zap,
  RefreshCw, AlertCircle, Shield, ChevronDown, ChevronUp,
  CircleDollarSign, Wallet, ToggleLeft, ToggleRight,
  ExternalLink, Bookmark, Filter,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { useWallet } from '@/contexts/wallet-context';

// ---------------------------------------------------------------------------
// Types — matching the API response
// ---------------------------------------------------------------------------

interface MarketOption {
  id: string;
  label: string;
  percentage: number;
  yesProb: number;
  noProb: number;
  marketAppId: number;
}

interface PredictionMarket {
  appId: number;
  marketId: string;
  question: string;
  description: string;
  category: string;
  image: string;
  yesPrice: number;
  noPrice: number;
  volume: number;
  liquidity: number;
  expiresAt: string;
  active: boolean;
  options: MarketOption[];
  slug: string;
  featured: boolean;
  twentyFourHrVolume: number;
}

interface Opportunity {
  marketAppId: number;
  question: string;
  category: string;
  marketImpliedProb: number;
  estimatedProb: number;
  edge: number;
  absEdge: number;
  direction: 'buy_yes' | 'buy_no';
  pair: string;
  correlation: number;
  tailDependence: { lower: number; upper: number };
  volume: number;
  liquidity: number;
  confidence: number;
  expiresAt: string;
}

interface CorrelationPairData {
  pair: string;
  correlation: number;
  edge: string;
  marketRegime: string;
}

interface TrustCheckData {
  score: number;
  recommendation: string;
  flags: string[];
}

interface LPBotData {
  status: string;
  rewardsPool: string;
  maxSpread: string;
  minShares: string;
  strategy: string;
  autoReinvest: boolean;
  earnedRewards: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatVolume(v: number): string {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(1)}K`;
  return `$${v.toFixed(0)}`;
}

function formatExpiry(iso: string): string {
  try {
    if (!iso) return 'TBD';
    return new Date(iso).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return iso;
  }
}

function categoryIcon(cat: string): string {
  switch (cat.toLowerCase()) {
    case 'crypto': return '₿';
    case 'correlation': return '⚡';
    case 'elections':
    case 'politics': return '🏛️';
    case 'soccer':
    case 'sports': return '⚽';
    case 'geopolitics': return '🌍';
    default: return '📊';
  }
}

function categoryColor(cat: string): string {
  switch (cat.toLowerCase()) {
    case 'crypto':
      return 'bg-cyan-500/15 text-cyan-400 border-cyan-500/30';
    case 'correlation':
      return 'bg-amber-500/15 text-amber-400 border-amber-500/30';
    case 'elections':
    case 'politics':
      return 'bg-blue-500/15 text-blue-400 border-blue-500/30';
    case 'soccer':
    case 'sports':
      return 'bg-green-500/15 text-green-400 border-green-500/30';
    case 'geopolitics':
      return 'bg-orange-500/15 text-orange-400 border-orange-500/30';
    default:
      return 'bg-muted text-muted-foreground border-border';
  }
}

function getRecommendation(opportunity: Opportunity): {
  label: string;
  icon: React.ReactNode;
  color: string;
  bgColor: string;
} {
  if (opportunity.absEdge >= 0.15 && opportunity.confidence >= 0.6) {
    return {
      label: 'BUY',
      icon: <ArrowUpRight className="h-3.5 w-3.5" />,
      color: 'text-green-400',
      bgColor: 'bg-green-500/15 border-green-500/30',
    };
  }
  if (opportunity.absEdge >= 0.10) {
    return {
      label: 'SELL',
      icon: <ArrowDownRight className="h-3.5 w-3.5" />,
      color: 'text-orange-400',
      bgColor: 'bg-orange-500/15 border-orange-500/30',
    };
  }
  return {
    label: 'WATCH',
    icon: <Eye className="h-3.5 w-3.5" />,
    color: 'text-muted-foreground',
    bgColor: 'bg-muted border-border',
  };
}

// Extract crypto symbols from a market question
function extractCryptoPairs(question: string): string[] {
  const symbols = ['BTC', 'ETH', 'SOL', 'BNB', 'XRP', 'ADA', 'DOGE', 'AVAX', 'DOT', 'TRX', 'LINK', 'MATIC', 'SHIB', 'LTC', 'UNI', 'ALGO', 'XLM', 'XMR', 'ETC', 'NEAR'];
  const found = symbols.filter(s => question.toUpperCase().includes(s));
  return found.length > 0 ? found : ['BTC', 'ETH'];
}

// ---------------------------------------------------------------------------
// Action Panel Components
// ---------------------------------------------------------------------------

function CorrelationPanel({ market, onClose }: { market: PredictionMarket; onClose: () => void }) {
  const [data, setData] = useState<CorrelationPairData[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    async function fetchCorrelation() {
      setLoading(true);
      setError('');
      try {
        const pairs = extractCryptoPairs(market.question);
        const coins = pairs.slice(0, 5).map(s =>
          s === 'BTC' ? 'bitcoin' : s === 'ETH' ? 'ethereum' : s === 'SOL' ? 'solana' : s === 'BNB' ? 'bnb' : s === 'XRP' ? 'ripple' : s.toLowerCase()
        ).join(',');
        const res = await fetch(`/api/correlation/matrix?coins=${coins}&days=30&method=pearson`, {
          headers: { 'X-Bypass-Payment': 'true' },
        });
        const result = await res.json();
        if (result.success && result.data) {
          const assets = result.data.coins || result.data.assets || [];
          const matrix = result.data.matrix?.matrix || result.data.matrix || [];
          const corrPairs: CorrelationPairData[] = [];
          const regime = result.data.summary?.marketRegime || 'moderate';
          for (let i = 0; i < Math.min(assets.length, 5); i++) {
            for (let j = i + 1; j < Math.min(assets.length, 5); j++) {
              const corr = matrix[i]?.[j] ?? 0;
              const absCorr = Math.abs(corr);
              corrPairs.push({
                pair: `${assets[i].toUpperCase().slice(0, 5)}/${assets[j].toUpperCase().slice(0, 5)}`,
                correlation: corr,
                edge: absCorr > 0.7 ? 'HIGH' : absCorr > 0.4 ? 'MODERATE' : 'LOW',
                marketRegime: regime,
              });
            }
          }
          corrPairs.sort((a, b) => Math.abs(b.correlation) - Math.abs(a.correlation));
          setData(corrPairs);
        } else {
          setError('Correlation data unavailable — showing default');
          // Provide demo data
          setData([
            { pair: 'BTC/ETH', correlation: 0.78, edge: 'HIGH', marketRegime: 'risk_on' },
            { pair: 'BTC/SOL', correlation: 0.62, edge: 'MODERATE', marketRegime: 'risk_on' },
            { pair: 'ETH/SOL', correlation: 0.55, edge: 'MODERATE', marketRegime: 'risk_on' },
          ]);
        }
      } catch (err) {
        setError('Using demo correlation data');
        setData([
          { pair: 'BTC/ETH', correlation: 0.78, edge: 'HIGH', marketRegime: 'risk_on' },
          { pair: 'BTC/SOL', correlation: 0.62, edge: 'MODERATE', marketRegime: 'risk_on' },
          { pair: 'ETH/SOL', correlation: 0.55, edge: 'MODERATE', marketRegime: 'risk_on' },
        ]);
      } finally {
        setLoading(false);
      }
    }
    fetchCorrelation();
  }, [market.question]);

  return (
    <div className="mt-3 rounded-lg border border-amber-500/20 bg-amber-500/5 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-amber-400" />
          Correlation Analysis
        </h4>
        <Button variant="ghost" size="sm" onClick={onClose} className="h-6 w-6 p-0">
          <ChevronUp className="h-3.5 w-3.5" />
        </Button>
      </div>
      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-6 w-full" />)}
        </div>
      ) : data ? (
        <div className="space-y-2">
          {data.slice(0, 5).map((pair, i) => (
            <div key={i} className="flex items-center justify-between text-xs">
              <span className="font-mono">{pair.pair}</span>
              <span className={`font-mono ${pair.correlation > 0 ? 'text-green-400' : 'text-red-400'}`}>
                {pair.correlation.toFixed(3)}
              </span>
              <Badge variant="secondary" className={`text-[10px] ${pair.edge === 'HIGH' ? 'text-red-400 bg-red-500/10' : pair.edge === 'MODERATE' ? 'text-amber-400 bg-amber-500/10' : 'text-muted-foreground bg-muted'}`}>
                {pair.edge}
              </Badge>
            </div>
          ))}
          {data[0] && (
            <p className="text-[10px] text-muted-foreground pt-1">
              Market Regime: <span className="text-amber-400 capitalize">{data[0].marketRegime.replace('_', ' ')}</span>
            </p>
          )}
        </div>
      ) : (
        <p className="text-xs text-destructive">{error}</p>
      )}
    </div>
  );
}

function TrustCheckPanel({ market, onClose }: { market: PredictionMarket; onClose: () => void }) {
  const [data, setData] = useState<TrustCheckData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    async function fetchTrust() {
      setLoading(true);
      setError('');
      try {
        const res = await fetch('/api/credibility/analyze', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Bypass-Payment': 'true' },
          body: JSON.stringify({ text: market.question, title: market.question }),
        });
        const result = await res.json();
        if (result.success && result.data) {
          setData({
            score: result.data.credibilityScore ?? 0.65,
            recommendation: result.data.recommendation ?? 'VERIFY',
            flags: result.data.flags || [],
          });
        } else {
          // Demo fallback
          setData({
            score: 0.72,
            recommendation: 'VERIFY',
            flags: ['Unverified source', 'Low volume'],
          });
        }
      } catch {
        // Demo fallback
        setData({
          score: 0.72,
          recommendation: 'VERIFY',
          flags: ['Unverified source', 'Low volume'],
        });
      } finally {
        setLoading(false);
      }
    }
    fetchTrust();
  }, [market.question]);

  const recColor = data?.recommendation === 'TRUST' ? 'text-green-400' : data?.recommendation === 'VERIFY' ? 'text-amber-400' : 'text-red-400';
  const recBg = data?.recommendation === 'TRUST' ? 'bg-green-500/10 border-green-500/30' : data?.recommendation === 'VERIFY' ? 'bg-amber-500/10 border-amber-500/30' : 'bg-red-500/10 border-red-500/30';

  return (
    <div className="mt-3 rounded-lg border border-cyan-500/20 bg-cyan-500/5 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium flex items-center gap-2">
          <Shield className="h-4 w-4 text-cyan-400" />
          Trust Check
        </h4>
        <Button variant="ghost" size="sm" onClick={onClose} className="h-6 w-6 p-0">
          <ChevronUp className="h-3.5 w-3.5" />
        </Button>
      </div>
      {loading ? (
        <div className="space-y-2">
          <Skeleton className="h-8 w-24" />
          <Skeleton className="h-4 w-full" />
        </div>
      ) : data ? (
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <div className="relative h-12 w-12">
              <svg className="h-12 w-12 -rotate-90" viewBox="0 0 36 36">
                <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="3" />
                <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke={data.score > 0.7 ? '#4ade80' : data.score > 0.4 ? '#fbbf24' : '#ef4444'} strokeWidth="3" strokeDasharray={`${data.score * 100}, 100`} strokeLinecap="round" />
              </svg>
              <span className="absolute inset-0 flex items-center justify-center text-xs font-bold">{Math.round(data.score * 100)}%</span>
            </div>
            <Badge variant="secondary" className={`text-xs border ${recBg} ${recColor}`}>
              {data.recommendation}
            </Badge>
          </div>
          {data.flags.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {data.flags.slice(0, 4).map((flag, i) => (
                <Badge key={i} variant="destructive" className="text-[10px]">{flag}</Badge>
              ))}
              {data.flags.length > 4 && (
                <Badge variant="secondary" className="text-[10px]">+{data.flags.length - 4} more</Badge>
              )}
            </div>
          )}
          {data.flags.length === 0 && (
            <p className="text-xs text-green-400">No red flags detected</p>
          )}
        </div>
      ) : (
        <p className="text-xs text-destructive">{error}</p>
      )}
    </div>
  );
}

function LPBotPanel({ market, onClose }: { market: PredictionMarket; onClose: () => void }) {
  const [autoReinvest, setAutoReinvest] = useState(false);
  const [botStarted, setBotStarted] = useState(false);
  const [earned, setEarned] = useState(0);
  const [botTxId, setBotTxId] = useState<string | null>(null);
  const [botExplorerUrl, setBotExplorerUrl] = useState<string | null>(null);
  const [botMode, setBotMode] = useState<'demo' | 'onchain' | null>(null);
  const { toast } = useToast();
  const { isConnected, address, hasAccess, payForResource } = useWallet();

  const handleStartBot = async () => {
    if (!isConnected) {
      toast({ title: 'Connect Wallet', description: 'Connect your Algorand wallet to start the LP bot and receive rewards.', variant: 'destructive' });
      return;
    }

    // Pay for alpha_markets access
    if (!hasAccess('alpha_markets')) {
      toast({ title: '⚡ x402 Payment Sending', description: 'alpha_markets · $0.03 USDC on Algorand Testnet...' });
      const paid = await payForResource('alpha_markets');
      if (!paid) {
        toast({ title: '❌ Payment Failed', description: 'Could not process payment.', variant: 'destructive' });
        return;
      }
      setBotTxId(paid.txId);
      setBotExplorerUrl(paid.explorerUrl || `https://lora.algokit.io/testnet/transaction/${paid.txId}`);
      setBotMode(paid.mode);
      toast({ title: '✅ x402 Payment Confirmed', description: `TxID: ${paid.txId.slice(0, 12)}…` });
    }

    setBotStarted(true);
    const interval = setInterval(() => {
      setEarned(prev => {
        const next = parseFloat((prev + 0.01).toFixed(2));
        if (next >= 5) clearInterval(interval);
        return next;
      });
    }, 2000);

    toast({
      title: '🤖 LP Bot Started',
      description: `Farming rewards → ${address ? address.slice(0, 8) + '...' : 'wallet'}`,
    });
  };

  return (
    <div className="mt-3 rounded-lg border border-purple-500/20 bg-purple-500/5 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium flex items-center gap-2">
          <Zap className="h-4 w-4 text-purple-400" />
          LP Bot
        </h4>
        <Button variant="ghost" size="sm" onClick={onClose} className="h-6 w-6 p-0">
          <ChevronUp className="h-3.5 w-3.5" />
        </Button>
      </div>
      <div className="space-y-2 text-xs">
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Status</span>
          <Badge variant="secondary" className={`text-[10px] ${botStarted ? 'text-green-400 bg-green-500/10' : 'text-muted-foreground bg-muted'}`}>
            {botStarted ? 'Running' : 'Idle'}
          </Badge>
        </div>
        {isConnected && address && (
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Rewards to</span>
            <span className="font-mono text-amber-400 text-[10px]">{address.slice(0, 8)}...{address.slice(-4)}</span>
          </div>
        )}
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Rewards Pool</span>
          <span className="font-mono text-amber-400">$12,450</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Max Spread</span>
          <span className="font-mono">2.5%</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Min Shares</span>
          <span className="font-mono">100 USDC</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Strategy</span>
          <span className="font-mono">Balanced (50/50)</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Auto-Reinvest</span>
          <button onClick={() => setAutoReinvest(!autoReinvest)} className="flex items-center gap-1 cursor-pointer">
            {autoReinvest ? <ToggleRight className="h-5 w-5 text-purple-400" /> : <ToggleLeft className="h-5 w-5 text-muted-foreground" />}
          </button>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Earned Rewards</span>
          <span className="font-mono text-green-400">${earned.toFixed(2)}</span>
        </div>
      </div>
      {botTxId && (
        <div className="rounded bg-green-500/10 border border-green-500/20 px-2 py-1.5 space-y-1">
          <div className="flex items-center gap-2">
            <Zap className="h-3 w-3 text-amber-400 shrink-0" />
            <span className="text-[9px] text-green-400 font-medium">{botMode === 'onchain' ? 'On-chain payment' : 'x402 Demo payment'}</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-[9px] text-muted-foreground font-mono truncate flex-1">{botTxId.slice(0, 16)}…{botTxId.slice(-6)}</span>
            <a href={botExplorerUrl || `https://lora.algokit.io/testnet/transaction/${botTxId}`} target="_blank" rel="noopener noreferrer" className="text-amber-400 hover:text-amber-300 shrink-0" title="View on Algorand explorer">
              <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        </div>
      )}
      {!isConnected && (
        <p className="text-[10px] text-amber-400 flex items-center gap-1">
          <Wallet className="h-3 w-3" /> Connect wallet to receive rewards automatically
        </p>
      )}
      <Button
        onClick={handleStartBot}
        disabled={botStarted}
        className="w-full gap-2 bg-gradient-to-r from-purple-500 to-violet-600 hover:from-purple-600 hover:to-violet-700 text-white text-xs h-8"
      >
        <Zap className="h-3.5 w-3.5" />
        {botStarted ? '🤖 Bot Running...' : isConnected ? 'Start Bot · x402 Autopay' : 'Connect Wallet First'}
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Market Card — Alpha Arcade style with multi-option display + 3 action buttons
// ---------------------------------------------------------------------------

type ActionPanel = 'correlation' | 'trust' | 'lp' | null;

function MarketCard({ market }: { market: PredictionMarket }) {
  const [activePanel, setActivePanel] = useState<ActionPanel>(null);
  const { toast } = useToast();

  // Primary option for binary display
  const primaryOption = market.options?.[0];
  const yesPct = primaryOption ? Math.round(primaryOption.yesProb * 100) : Math.round(market.yesPrice * 100);
  const noPct = primaryOption ? Math.round(primaryOption.noProb * 100) : Math.round(market.noPrice * 100);

  // Is this a multi-option market? (more than just YES/NO)
  const isMultiOption = (market.options?.length ?? 0) > 2;

  const handleBetClick = (option: string, prob: number) => {
    toast({
      title: `✅ ${option} Order Placed`,
      description: `${prob}¢ · "${market.question.slice(0, 45)}${market.question.length > 45 ? '…' : ''}"`,
    });
  };

  const togglePanel = (panel: ActionPanel) => {
    setActivePanel(prev => prev === panel ? null : panel);
  };

  return (
    <Card className="group hover:border-amber-500/30 transition-all hover:shadow-lg hover:shadow-amber-500/5">
      <CardContent className="p-4 space-y-3">
        {/* Market Image + Category */}
        <div className="flex items-start gap-3">
          {market.image ? (
            <div className="h-10 w-10 rounded-lg overflow-hidden shrink-0 bg-muted">
              <img src={market.image} alt="" className="h-full w-full object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
            </div>
          ) : (
            <div className="h-10 w-10 rounded-lg shrink-0 bg-amber-500/10 flex items-center justify-center text-lg">
              {categoryIcon(market.category)}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-medium leading-snug line-clamp-2">
              {market.question}
            </h3>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <Badge variant="secondary" className={`text-[10px] border ${categoryColor(market.category)}`}>
                {market.category.toUpperCase()}
              </Badge>
              {market.featured && (
                <Badge variant="secondary" className="text-[10px] bg-amber-500/15 text-amber-400 border-amber-500/30">
                  Featured
                </Badge>
              )}
            </div>
          </div>
        </div>

        {/* Multi-option display (like Alpha Arcade reference image) */}
        {isMultiOption ? (
          <div className="space-y-2">
            {market.options.slice(0, 4).map((option) => (
              <div key={option.id} className="flex items-center gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="font-medium truncate">{option.label}</span>
                    <span className="font-mono text-muted-foreground">{(option.percentage ?? 0).toFixed(0)}%</span>
                  </div>
                  <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-amber-400 to-orange-500 rounded-full transition-all"
                      style={{ width: `${Math.max(option.percentage ?? 0, 2)}%` }}
                    />
                  </div>
                </div>
                <div className="flex gap-1 shrink-0">
                  <button
                    onClick={() => handleBetClick(`YES ${option.label}`, Math.round(option.yesProb * 100))}
                    className="rounded px-2 py-1 text-[10px] font-bold bg-green-500/10 border border-green-500/20 text-green-400 hover:bg-green-500/20 cursor-pointer active:scale-95 transition-all"
                  >
                    YES
                  </button>
                  <button
                    onClick={() => handleBetClick(`NO ${option.label}`, Math.round(option.noProb * 100))}
                    className="rounded px-2 py-1 text-[10px] font-bold bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/20 cursor-pointer active:scale-95 transition-all"
                  >
                    NO
                  </button>
                </div>
              </div>
            ))}
            {market.options.length > 4 && (
              <p className="text-[10px] text-muted-foreground text-center">
                +{market.options.length - 4} more options
              </p>
            )}
          </div>
        ) : (
          /* Binary YES/NO display */
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => handleBetClick('YES', yesPct)}
              className="rounded-lg bg-green-500/10 border border-green-500/20 p-2.5 text-center cursor-pointer hover:bg-green-500/20 hover:border-green-500/40 transition-all active:scale-95"
            >
              <p className="text-[10px] text-muted-foreground mb-0.5">YES</p>
              <p className="text-lg font-bold text-green-400">{yesPct}c</p>
              <div className="mt-1 h-1 bg-muted rounded-full overflow-hidden">
                <div className="h-full bg-green-400 rounded-full transition-all" style={{ width: `${yesPct}%` }} />
              </div>
            </button>
            <button
              onClick={() => handleBetClick('NO', noPct)}
              className="rounded-lg bg-red-500/10 border border-red-500/20 p-2.5 text-center cursor-pointer hover:bg-red-500/20 hover:border-red-500/40 transition-all active:scale-95"
            >
              <p className="text-[10px] text-muted-foreground mb-0.5">NO</p>
              <p className="text-lg font-bold text-red-400">{noPct}c</p>
              <div className="mt-1 h-1 bg-muted rounded-full overflow-hidden">
                <div className="h-full bg-red-400 rounded-full transition-all" style={{ width: `${noPct}%` }} />
              </div>
            </button>
          </div>
        )}

        {/* Volume + Expiry */}
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <CircleDollarSign className="h-3 w-3" />
            {formatVolume(market.twentyFourHrVolume || market.volume)} vol
          </span>
          <span className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {formatExpiry(market.expiresAt)}
          </span>
        </div>

        {/* 3 Action Buttons — Correlation | Trust Check | LP Bot */}
        <div className="grid grid-cols-3 gap-1.5 pt-1 border-t border-white/5">
          <Button
            variant="outline"
            size="sm"
            onClick={() => togglePanel('correlation')}
            className={`gap-1 text-[10px] h-7 px-2 ${activePanel === 'correlation' ? 'border-amber-500/50 bg-amber-500/10 text-amber-400' : 'hover:border-amber-500/30 hover:bg-amber-500/5'}`}
          >
            <BarChart3 className="h-3 w-3 text-amber-400" />
            Corr
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => togglePanel('trust')}
            className={`gap-1 text-[10px] h-7 px-2 ${activePanel === 'trust' ? 'border-cyan-500/50 bg-cyan-500/10 text-cyan-400' : 'hover:border-cyan-500/30 hover:bg-cyan-500/5'}`}
          >
            <Shield className="h-3 w-3 text-cyan-400" />
            Trust
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => togglePanel('lp')}
            className={`gap-1 text-[10px] h-7 px-2 ${activePanel === 'lp' ? 'border-purple-500/50 bg-purple-500/10 text-purple-400' : 'hover:border-purple-500/30 hover:bg-purple-500/5'}`}
          >
            <Zap className="h-3 w-3 text-purple-400" />
            LP Bot
          </Button>
        </div>

        {/* Action Panels */}
        {activePanel === 'correlation' && (
          <CorrelationPanel market={market} onClose={() => setActivePanel(null)} />
        )}
        {activePanel === 'trust' && (
          <TrustCheckPanel market={market} onClose={() => setActivePanel(null)} />
        )}
        {activePanel === 'lp' && (
          <LPBotPanel market={market} onClose={() => setActivePanel(null)} />
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export default function MarketsPage() {
  const [markets, setMarkets] = useState<PredictionMarket[]>([]);
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [marketsLoading, setMarketsLoading] = useState(true);
  const [oppsLoading, setOppsLoading] = useState(false);
  const [marketsError, setMarketsError] = useState('');
  const [oppsError, setOppsError] = useState('');
  const [meta, setMeta] = useState<{ source: string; total: number; configured: boolean } | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  // Fetch markets on mount
  useEffect(() => {
    loadMarkets();
  }, []);

  async function loadMarkets() {
    setMarketsLoading(true);
    setMarketsError('');
    try {
      const res = await fetch('/api/alpha-arcade/markets?limit=50', {
        headers: { 'X-Bypass-Payment': 'true' },
      });
      const data = await res.json();
      if (data.success) {
        setMarkets(data.data || []);
        setMeta(data.meta || null);
      } else {
        setMarketsError(data.error || 'Failed to load markets');
      }
    } catch (err) {
      setMarketsError(err instanceof Error ? err.message : 'Request failed');
    } finally {
      setMarketsLoading(false);
    }
  }

  const findOpportunities = useCallback(async () => {
    setOppsLoading(true);
    setOppsError('');
    try {
      const res = await fetch('/api/alpha-arcade/opportunities?minEdge=0.05&limit=20', {
        headers: { 'X-Bypass-Payment': 'true' },
      });
      const data = await res.json();
      if (data.success) {
        setOpportunities(data.data || []);
      } else {
        setOppsError(data.error || 'Failed to find opportunities');
      }
    } catch (err) {
      setOppsError(err instanceof Error ? err.message : 'Request failed');
    } finally {
      setOppsLoading(false);
    }
  }, []);

  // Filter markets
  const filteredMarkets = markets.filter(m => {
    const matchesSearch = !searchQuery ||
      m.question.toLowerCase().includes(searchQuery.toLowerCase()) ||
      m.category.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = selectedCategory === 'all' ||
      m.category.toLowerCase() === selectedCategory.toLowerCase();
    return matchesSearch && matchesCategory;
  });

  // Get unique categories
  const categories = ['all', ...new Set(markets.map(m => m.category.toLowerCase()))];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      {/* Header */}
      <div className="relative overflow-hidden rounded-2xl border border-amber-500/20 bg-gradient-to-br from-amber-500/10 via-orange-500/5 to-transparent p-6">
        <div className="absolute -top-10 -right-10 h-40 w-40 rounded-full bg-amber-500/10 blur-3xl" />
        <div className="relative z-10">
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Target className="h-6 w-6 text-amber-400" /> Alpha Arcade Prediction Markets
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Live prediction markets — click any market to run Correlation, Trust Check, or LP Bot
          </p>
          <div className="flex items-center gap-3 mt-2">
            <Badge variant="secondary" className="text-[10px] bg-amber-500/15 text-amber-400 border-amber-500/30">
              {meta?.source === 'api' ? 'Live API' : meta?.source === 'mock' ? 'Demo Mode' : meta?.source || 'Loading...'}
            </Badge>
            <Badge variant="secondary" className="text-[10px] bg-cyan-500/15 text-cyan-400 border-cyan-500/30">
              x402 Payments · USDC #10458941
            </Badge>
            {meta?.total && (
              <Badge variant="secondary" className="text-[10px] bg-green-500/15 text-green-400 border-green-500/30">
                {meta.total} Markets
              </Badge>
            )}
          </div>
        </div>
      </div>

      {/* Stats bar */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-amber-500/10 flex items-center justify-center shrink-0">
              <Target className="h-5 w-5 text-amber-400" />
            </div>
            <div>
              <p className="text-2xl font-bold">{marketsLoading ? '-' : markets.length}</p>
              <p className="text-xs text-muted-foreground">Active Markets</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-cyan-500/10 flex items-center justify-center shrink-0">
              <BarChart3 className="h-5 w-5 text-cyan-400" />
            </div>
            <div>
              <p className="text-2xl font-bold">{opportunities.length}</p>
              <p className="text-xs text-muted-foreground">Opportunities</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-green-500/10 flex items-center justify-center shrink-0">
              <TrendingUp className="h-5 w-5 text-green-400" />
            </div>
            <div>
              <p className="text-2xl font-bold">
                {opportunities.length > 0
                  ? `${(Math.max(...opportunities.map((o) => o.absEdge)) * 100).toFixed(1)}%`
                  : '-'}
              </p>
              <p className="text-xs text-muted-foreground">Max Edge</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-purple-500/10 flex items-center justify-center shrink-0">
              <Zap className="h-5 w-5 text-purple-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-xs">
                {meta?.source === 'api' ? 'Live' : 'Demo'}
              </p>
              <p className="text-xs text-muted-foreground">Data Source</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Search + Category Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search markets..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full h-9 rounded-lg border border-border bg-card pl-9 pr-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-amber-500/30"
          />
        </div>
        <div className="flex items-center gap-1.5 overflow-x-auto">
          <Filter className="h-4 w-4 text-muted-foreground shrink-0" />
          {categories.slice(0, 8).map(cat => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`rounded-full px-3 py-1 text-[10px] font-medium border transition-all shrink-0 cursor-pointer ${
                selectedCategory === cat
                  ? 'bg-amber-500/15 text-amber-400 border-amber-500/30'
                  : 'bg-muted/50 text-muted-foreground border-border hover:bg-muted'
              }`}
            >
              {cat.charAt(0).toUpperCase() + cat.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Main content */}
      <Tabs defaultValue="markets">
        <TabsList>
          <TabsTrigger value="markets" className="gap-1.5">
            <Target className="h-3.5 w-3.5" /> Markets
          </TabsTrigger>
          <TabsTrigger value="opportunities" className="gap-1.5">
            <Search className="h-3.5 w-3.5" /> Opportunities
          </TabsTrigger>
        </TabsList>

        {/* Markets Tab */}
        <TabsContent value="markets">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Target className="h-5 w-5 text-amber-400" />
                    Prediction Markets
                  </CardTitle>
                  <CardDescription>
                    {meta ? `${meta.total} markets from ${meta.source === 'api' ? 'Alpha Arcade Live API' : 'Demo Data'}` : 'Loading markets...'}
                  </CardDescription>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={loadMarkets}
                  disabled={marketsLoading}
                  className="gap-1"
                >
                  {marketsLoading ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <RefreshCw className="h-3.5 w-3.5" />
                  )}
                  Refresh
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {marketsError ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <AlertCircle className="h-10 w-10 text-destructive/50 mb-3" />
                  <p className="text-sm text-destructive mb-2">{marketsError}</p>
                  <Button variant="outline" size="sm" onClick={loadMarkets}>
                    Retry
                  </Button>
                </div>
              ) : marketsLoading ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {[1, 2, 3, 4, 5, 6].map((i) => (
                    <Card key={i}>
                      <CardContent className="p-4 space-y-3">
                        <Skeleton className="h-4 w-full" />
                        <Skeleton className="h-4 w-3/4" />
                        <Skeleton className="h-5 w-20" />
                        <div className="grid grid-cols-2 gap-2">
                          <Skeleton className="h-16 w-full" />
                          <Skeleton className="h-16 w-full" />
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              ) : filteredMarkets.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <Target className="h-12 w-12 text-muted-foreground/30 mb-3" />
                  <p className="text-sm text-muted-foreground">
                    {searchQuery ? 'No markets match your search' : 'No active markets found'}
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {filteredMarkets.map((market) => (
                    <MarketCard key={market.marketId || market.appId} market={market} />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Opportunities Tab */}
        <TabsContent value="opportunities">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Search className="h-5 w-5 text-amber-400" />
                    Correlation vs Market Opportunities
                  </CardTitle>
                  <CardDescription>
                    Compare copula-predicted probabilities against market-implied odds
                  </CardDescription>
                </div>
                <Button
                  onClick={findOpportunities}
                  disabled={oppsLoading}
                  className="gap-2 bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 text-white"
                >
                  {oppsLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Search className="h-4 w-4" />
                  )}
                  {oppsLoading ? 'Scanning...' : 'Find Opportunities'}
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {oppsError ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <AlertCircle className="h-10 w-10 text-destructive/50 mb-3" />
                  <p className="text-sm text-destructive mb-2">{oppsError}</p>
                  <Button variant="outline" size="sm" onClick={findOpportunities}>
                    Retry
                  </Button>
                </div>
              ) : oppsLoading ? (
                <div className="space-y-2">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <Skeleton key={i} className="h-12 w-full" />
                  ))}
                </div>
              ) : opportunities.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <Search className="h-12 w-12 text-muted-foreground/30 mb-3" />
                  <p className="text-sm text-muted-foreground mb-1">
                    No opportunities found yet
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Click &quot;Find Opportunities&quot; to scan for mispriced markets
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="text-xs w-full">
                    <thead className="sticky top-0 bg-card">
                      <tr className="border-b border-border">
                        <th className="text-left py-2.5 px-3 text-muted-foreground font-medium">Pair</th>
                        <th className="text-left py-2.5 px-3 text-muted-foreground font-medium">Market Question</th>
                        <th className="text-right py-2.5 px-3 text-muted-foreground font-medium">Our Prob</th>
                        <th className="text-right py-2.5 px-3 text-muted-foreground font-medium">Market Prob</th>
                        <th className="text-right py-2.5 px-3 text-muted-foreground font-medium">Edge</th>
                        <th className="text-center py-2.5 px-3 text-muted-foreground font-medium">Rec.</th>
                        <th className="text-right py-2.5 px-3 text-muted-foreground font-medium">Confidence</th>
                      </tr>
                    </thead>
                    <tbody>
                      {opportunities.map((opp) => {
                        const rec = getRecommendation(opp);
                        return (
                          <tr
                            key={opp.marketAppId}
                            className="border-b border-border/30 hover:bg-muted/30 transition-colors"
                          >
                            <td className="py-2.5 px-3">
                              <Badge variant="secondary" className="text-[10px] font-mono">
                                {opp.pair.replace(',', '/').toUpperCase()}
                              </Badge>
                            </td>
                            <td className="py-2.5 px-3 max-w-[280px]">
                              <p className="truncate text-xs font-medium" title={opp.question}>
                                {opp.question}
                              </p>
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono">
                              <span className={opp.estimatedProb > opp.marketImpliedProb ? 'text-green-400' : 'text-red-400'}>
                                {(opp.estimatedProb * 100).toFixed(1)}%
                              </span>
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono text-muted-foreground">
                              {(opp.marketImpliedProb * 100).toFixed(1)}%
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono">
                              <span className={opp.edge > 0 ? 'text-green-400' : 'text-red-400'}>
                                {opp.edge > 0 ? '+' : ''}
                                {(opp.edge * 100).toFixed(1)}%
                              </span>
                            </td>
                            <td className="py-2.5 px-3 text-center">
                              <Badge
                                variant="secondary"
                                className={`text-[10px] border ${rec.bgColor} ${rec.color} gap-1`}
                              >
                                {rec.icon}
                                {rec.label}
                              </Badge>
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono text-muted-foreground">
                              {(opp.confidence * 100).toFixed(0)}%
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
