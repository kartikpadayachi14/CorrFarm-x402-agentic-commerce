'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Shield, Search, Newspaper, Loader2, AlertTriangle,
  CheckCircle2, XCircle, Info, ExternalLink, TrendingUp,
  Cpu, Globe, Users, BarChart3, MessageSquare, Copy, Zap
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useWallet } from '@/contexts/wallet-context';
import { useToast } from '@/hooks/use-toast';

function TxIdBadge({ txId }: { txId: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => { navigator.clipboard.writeText(txId).catch(() => {}); setCopied(true); setTimeout(() => setCopied(false), 2000); };
  return (
    <div className="flex items-center gap-2 rounded-lg bg-green-500/10 border border-green-500/20 px-3 py-2">
      <Zap className="h-3.5 w-3.5 text-amber-400 shrink-0" />
      <span className="text-[10px] text-green-400 font-medium">x402 Paid</span>
      {txId.startsWith('demo-') ? (
        <span className="text-[10px] font-mono text-muted-foreground truncate max-w-[180px]">{txId}</span>
      ) : (
        <a href={`https://testnet.explorer.perawallet.app/tx/${txId}`} target="_blank" rel="noopener noreferrer" className="text-[10px] font-mono text-green-400 hover:underline truncate max-w-[180px]" title="View on Algorand explorer">{txId}</a>
      )}
      <button onClick={copy} className="text-muted-foreground hover:text-foreground shrink-0">
        {copied ? <CheckCircle2 className="h-3 w-3 text-green-400" /> : <Copy className="h-3 w-3" />}
      </button>
    </div>
  );
}

// Types
interface CredibilityResult {
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
    marketReaction: number;
    financialNLP: number;
    sourceCredibility: number;
    socialPropagation: number;
  };
  method: 'llm' | 'heuristic' | 'enhanced';
}

interface MarketClaimVerification {
  claim: string;
  symbol: string;
  currentPrice: number | null;
  priceChange24h: number | null;
  priceChange7d: number | null;
  claimDirection: string;
  actualDirection: string;
  isConsistent: boolean;
  confidence: number;
  details: string;
  marketReactionScore: number;
}

interface SocialPropagationResult {
  socialPropagationScore: number;
  botLikelihood: number;
  coordinationScore: number;
  pumpDumpScore: number;
  hypeCyclePhase: string;
  viralCoefficient: number;
  flags: string[];
  analysis: string;
}

interface NewsItem {
  title: string;
  content: string;
  sourceUrl: string;
  sourceName: string;
  publishedAt: string;
  credibility?: CredibilityResult;
}

// Helpers
function scoreColor(score: number): string {
  if (score >= 0.7) return 'text-green-400';
  if (score >= 0.4) return 'text-amber-400';
  return 'text-red-400';
}

function scoreBarColor(score: number): string {
  if (score >= 0.7) return '#22c55e';
  if (score >= 0.4) return '#f59e0b';
  return '#ef4444';
}

function recColor(recommendation: string): { bg: string; text: string; border: string } {
  switch (recommendation.toUpperCase()) {
    case 'TRUST': return { bg: 'bg-green-500/15', text: 'text-green-400', border: 'border-green-500/30' };
    case 'VERIFY': return { bg: 'bg-amber-500/15', text: 'text-amber-400', border: 'border-amber-500/30' };
    case 'CAUTION': return { bg: 'bg-orange-500/15', text: 'text-orange-400', border: 'border-orange-500/30' };
    case 'AVOID': return { bg: 'bg-red-500/15', text: 'text-red-400', border: 'border-red-500/30' };
    default: return { bg: 'bg-muted', text: 'text-muted-foreground', border: 'border-border' };
  }
}

function recIcon(recommendation: string) {
  switch (recommendation.toUpperCase()) {
    case 'TRUST': return <CheckCircle2 className="h-6 w-6 text-green-400" />;
    case 'VERIFY': return <Info className="h-6 w-6 text-amber-400" />;
    case 'CAUTION': return <AlertTriangle className="h-6 w-6 text-orange-400" />;
    case 'AVOID': return <XCircle className="h-6 w-6 text-red-400" />;
    default: return <Info className="h-6 w-6 text-muted-foreground" />;
  }
}

function formatDate(isoStr: string): string {
  try {
    return new Date(isoStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch { return isoStr; }
}

// All 9 breakdown dimensions
const ALL_DIMENSIONS = [
  { key: 'marketReaction', label: 'Market Reaction Verification', icon: TrendingUp, category: 'Market' },
  { key: 'financialNLP', label: 'Financial NLP (FinBERT)', icon: Cpu, category: 'Market' },
  { key: 'sourceCredibility', label: 'Source Credibility', icon: Globe, category: 'Source' },
  { key: 'socialPropagation', label: 'Social Propagation', icon: Users, category: 'Social' },
  { key: 'sensationalism', label: 'Sensationalism', icon: AlertTriangle, category: 'Content' },
  { key: 'factualConsistency', label: 'Factual Consistency', icon: CheckCircle2, category: 'Content' },
  { key: 'sourceReliability', label: 'Source Reliability', icon: Shield, category: 'Source' },
  { key: 'emotionalManipulation', label: 'Emotional Manipulation', icon: MessageSquare, category: 'Content' },
  { key: 'marketConsistency', label: 'Market Consistency', icon: BarChart3, category: 'Market' },
] as const;

// Circular Progress
function CircularProgress({ value, size = 100 }: { value: number; size?: number }) {
  const strokeWidth = 8;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (value * circumference);
  const color = value >= 0.7 ? '#22c55e' : value >= 0.4 ? '#f59e0b' : '#ef4444';

  return (
    <div className="relative inline-flex items-center justify-center">
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="hsl(var(--muted))" strokeWidth={strokeWidth} />
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={color} strokeWidth={strokeWidth}
          strokeDasharray={circumference} strokeDashoffset={offset} strokeLinecap="round" className="transition-all duration-700" />
      </svg>
      <div className="absolute flex flex-col items-center">
        <span className={`text-2xl font-bold ${scoreColor(value)}`}>{Math.round(value * 100)}%</span>
        <span className="text-[10px] text-muted-foreground">Score</span>
      </div>
    </div>
  );
}

// Component
export default function FakeNewsPage() {
  const [text, setText] = useState('');
  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState<CredibilityResult | null>(null);
  const [analyzeError, setAnalyzeError] = useState('');
  const [analyzeTxId, setAnalyzeTxId] = useState<string | null>(null);

  const [news, setNews] = useState<NewsItem[]>([]);
  const [newsLoading, setNewsLoading] = useState(false);
  const [newsError, setNewsError] = useState('');
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);

  // Verify Market Claim
  const [claim, setClaim] = useState('');
  const [claimSymbol, setClaimSymbol] = useState('');
  const [claimResult, setClaimResult] = useState<MarketClaimVerification | null>(null);
  const [claimLoading, setClaimLoading] = useState(false);
  const [claimError, setClaimError] = useState('');

  // Social Analysis
  const [socialText, setSocialText] = useState('');
  const [socialResult, setSocialResult] = useState<SocialPropagationResult | null>(null);
  const [socialLoading, setSocialLoading] = useState(false);
  const [socialError, setSocialError] = useState('');

  const { isConnected, hasAccess, payForResource } = useWallet();
  const { toast } = useToast();

  const ensurePaid = useCallback(async (resource: string): Promise<string | false> => {
    if (hasAccess(resource)) return 'already_paid';
    if (!isConnected) {
      toast({ title: 'Connect your wallet', description: 'Connect a wallet in the navbar to auto-pay via x402.', variant: 'destructive' });
      return false;
    }
    toast({ title: '⚡ x402 Payment Sending', description: `${resource.replace(/_/g, ' ')} · USDC on Algorand Testnet...` });
    const paid = await payForResource(resource);
    if (paid) {
      toast({ title: '✅ Payment Confirmed', description: `TxID: ${paid.txId}` });
      return paid.txId;
    }
    toast({ title: '❌ Payment Failed', description: 'Try again or check your wallet.', variant: 'destructive' });
    return false;
  }, [isConnected, hasAccess, payForResource, toast]);

  const handleAnalyze = useCallback(async () => {
    if (!text && !url) return;
    setAnalyzing(true);
    setAnalyzeError('');
    setResult(null);
    setAnalyzeTxId(null);
    try {
      const txIdOrFalse = await ensurePaid('credibility_score');
      if (txIdOrFalse === false) { setAnalyzing(false); return; }
      if (txIdOrFalse !== 'already_paid') setAnalyzeTxId(txIdOrFalse);
      const res = await fetch('/api/credibility/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, title, url }),
      });
      const data = await res.json();
      if (data.success) setResult(data.data);
      else setAnalyzeError(data.error || 'Analysis failed');
    } catch (err) {
      setAnalyzeError(err instanceof Error ? err.message : 'Request failed');
    } finally { setAnalyzing(false); }
  }, [text, title, url, ensurePaid]);

  const fetchNews = useCallback(async () => {
    setNewsLoading(true);
    setNewsError('');
    try {
      const res = await fetch('/api/credibility/news?limit=20');
      const data = await res.json();
      if (data.success) setNews(data.data || []);
      else setNewsError(data.error || 'Failed to fetch news');
    } catch (err) {
      setNewsError(err instanceof Error ? err.message : 'Request failed');
    } finally { setNewsLoading(false); }
  }, []);

  useEffect(() => { fetchNews(); }, [fetchNews]);

  const handleNewsAnalyze = useCallback(async (item: NewsItem, idx: number) => {
    try {
      const paid = await ensurePaid('news_analysis');
      if (paid === false) return;
      const res = await fetch('/api/credibility/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: item.content, title: item.title, url: item.sourceUrl }),
      });
      const data = await res.json();
      if (data.success) {
        setNews((prev) => { const u = [...prev]; u[idx] = { ...u[idx], credibility: data.data }; return u; });
        setExpandedIdx(idx);
      }
    } catch { /* ignore */ }
  }, [ensurePaid]);

  const handleVerifyClaim = useCallback(async () => {
    if (!claim) return;
    setClaimLoading(true);
    setClaimError('');
    try {
      const res = await fetch('/api/credibility/verify-claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ claim, symbol: claimSymbol || undefined }),
      });
      const data = await res.json();
      if (data.success) setClaimResult(data.data);
      else setClaimError(data.error || 'Verification failed');
    } catch (err) {
      setClaimError(err instanceof Error ? err.message : 'Request failed');
    } finally { setClaimLoading(false); }
  }, [claim, claimSymbol]);

  const handleSocialAnalysis = useCallback(async () => {
    if (!socialText) return;
    setSocialLoading(true);
    setSocialError('');
    try {
      const res = await fetch('/api/credibility/social-analysis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: socialText }),
      });
      const data = await res.json();
      if (data.success) setSocialResult(data.data);
      else setSocialError(data.error || 'Social analysis failed');
    } catch (err) {
      setSocialError(err instanceof Error ? err.message : 'Request failed');
    } finally { setSocialLoading(false); }
  }, [socialText]);

  const getBreakdownValue = (key: string): number => {
    if (!result?.breakdown) return 0;
    return (result.breakdown as Record<string, number>)[key] ?? 0;
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Shield className="h-6 w-6 text-amber-400" /> Credibility Detector
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          9-dimension credibility analysis with Market Reaction Verification, Financial NLP, Source Credibility & Social Propagation
        </p>
      </div>

      <Tabs defaultValue="analyze">
        <TabsList className="flex-wrap">
          <TabsTrigger value="analyze" className="gap-1.5"><Search className="h-3.5 w-3.5" /> Analyze</TabsTrigger>
          <TabsTrigger value="verify" className="gap-1.5"><TrendingUp className="h-3.5 w-3.5" /> Verify Claim</TabsTrigger>
          <TabsTrigger value="social" className="gap-1.5"><Users className="h-3.5 w-3.5" /> Social Analysis</TabsTrigger>
          <TabsTrigger value="feed" className="gap-1.5"><Newspaper className="h-3.5 w-3.5" /> News Feed</TabsTrigger>
        </TabsList>

        {/* ===== ANALYZE TAB ===== */}
        <TabsContent value="analyze">
          
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Input Card */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Analyze Text</CardTitle>
                  <CardDescription>Enter text, title, or URL to check credibility with 9 dimensions</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <Label htmlFor="title" className="text-sm">Title (optional)</Label>
                    <Input id="title" placeholder="Article title..." value={title} onChange={(e) => setTitle(e.target.value)} className="mt-1.5" />
                  </div>
                  <div>
                    <Label htmlFor="url" className="text-sm">URL (optional)</Label>
                    <Input id="url" placeholder="https://example.com/article" value={url} onChange={(e) => setUrl(e.target.value)} className="mt-1.5" />
                  </div>
                  <div>
                    <Label htmlFor="text" className="text-sm">Text to analyze</Label>
                    <Textarea id="text" placeholder="Paste the text you want to analyze for credibility..." value={text} onChange={(e) => setText(e.target.value)} className="mt-1.5 min-h-32" />
                  </div>
                  <Button onClick={handleAnalyze} disabled={analyzing || (!text && !url)} className="w-full gap-2 bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 text-white">
                    {analyzing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                    {analyzing ? 'Analyzing...' : 'Analyze Credibility'} <span className="text-[10px] opacity-70">$0.03</span>
                  </Button>
                  {!isConnected && (
                    <p className="text-[10px] text-amber-400">Connect wallet in navbar to enable auto x402 payments.</p>
                  )}
                  {analyzeTxId && <TxIdBadge txId={analyzeTxId} />}
                  {analyzeError && <p className="text-sm text-destructive">{analyzeError}</p>}
                </CardContent>
              </Card>

              {/* Results Card */}
              <Card>
                <CardHeader><CardTitle className="text-lg">Results</CardTitle></CardHeader>
                <CardContent>
                  {result ? (
                    <div className="space-y-5">
                      {/* Recommendation Banner */}
                      <div className={`flex items-center gap-4 p-4 rounded-xl border ${recColor(result.recommendation).bg} ${recColor(result.recommendation).border}`}>
                        <CircularProgress value={result.credibilityScore} size={90} />
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            {recIcon(result.recommendation)}
                            <span className={`text-2xl font-bold ${recColor(result.recommendation).text}`}>
                              {result.recommendation}
                            </span>
                          </div>
                          <p className="text-sm text-muted-foreground">{result.analysis}</p>
                          <div className="flex items-center gap-2 mt-2">
                            <Badge variant="secondary" className="text-[10px]">Method: {result.method === 'llm' ? 'LLM (OpenAI/OpenRouter)' : result.method === 'enhanced' ? 'Enhanced (9-Dim)' : 'Heuristic'}</Badge>
                            <Badge variant="secondary" className="text-[10px]">Score: {Math.round(result.credibilityScore * 100)}%</Badge>
                          </div>
                        </div>
                      </div>

                      {/* All 9 Dimensions Breakdown */}
                      <div>
                        <h4 className="text-sm font-semibold mb-3">9-Dimension Credibility Breakdown</h4>
                        <div className="space-y-2.5">
                          {ALL_DIMENSIONS.map((dim) => {
                            const value = getBreakdownValue(dim.key);
                            return (
                              <div key={dim.key} className="flex items-center gap-2">
                                <dim.icon className={`h-3.5 w-3.5 shrink-0 ${value >= 0.7 ? 'text-green-400' : value >= 0.4 ? 'text-amber-400' : 'text-red-400'}`} />
                                <span className="text-xs text-muted-foreground w-36 truncate" title={dim.label}>{dim.label}</span>
                                <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                                  <div className="h-full rounded-full transition-all duration-700" style={{
                                    width: `${Math.max(value * 100, 2)}%`,
                                    backgroundColor: scoreBarColor(value),
                                  }} />
                                </div>
                                <span className={`text-xs font-mono w-10 text-right ${scoreColor(value)}`}>{Math.round(value * 100)}%</span>
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      {/* Flags */}
                      {result.flags.length > 0 && (
                        <div>
                          <h4 className="text-sm font-medium mb-2">Flags Detected ({result.flags.length})</h4>
                          <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto">
                            {result.flags.map((flag, i) => (<Badge key={i} variant="destructive" className="text-[10px]">{flag}</Badge>))}
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center py-12 text-center">
                      <Shield className="h-12 w-12 text-muted-foreground/30 mb-3" />
                      <p className="text-sm text-muted-foreground">Enter text or a URL and click &quot;Analyze Credibility&quot; to see results</p>
                      <p className="text-xs text-muted-foreground mt-1">Analysis covers 9 dimensions: Market Reaction, Financial NLP, Source Credibility, Social Propagation, and more</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Detailed Section Cards for Key Dimensions */}
            {result && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
                {/* Market Reaction Verification */}
                <Card className="border-amber-500/20">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2">
                      <TrendingUp className="h-4 w-4 text-amber-400" />
                      Market Reaction Verification
                    </CardTitle>
                    <CardDescription className="text-xs">Cross-reference claims with real Binance price data</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">Score</span>
                        <span className={`text-sm font-bold ${scoreColor(getBreakdownValue('marketReaction'))}`}>
                          {Math.round(getBreakdownValue('marketReaction') * 100)}%
                        </span>
                      </div>
                      <div className="h-2 bg-muted rounded-full overflow-hidden">
                        <div className="h-full rounded-full bg-gradient-to-r from-amber-500 to-orange-500 transition-all duration-700" style={{ width: `${getBreakdownValue('marketReaction') * 100}%` }} />
                      </div>
                      <p className="text-[10px] text-muted-foreground mt-1">
                        Weight: 25% — Highest weighted dimension. Verifies price claims against live market data.
                      </p>
                    </div>
                  </CardContent>
                </Card>

                {/* Financial NLP */}
                <Card className="border-cyan-500/20">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Cpu className="h-4 w-4 text-cyan-400" />
                      Financial NLP (FinBERT-style)
                    </CardTitle>
                    <CardDescription className="text-xs">Sentiment analysis, contradiction & FUD/hype detection</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">Score</span>
                        <span className={`text-sm font-bold ${scoreColor(getBreakdownValue('financialNLP'))}`}>
                          {Math.round(getBreakdownValue('financialNLP') * 100)}%
                        </span>
                      </div>
                      <div className="h-2 bg-muted rounded-full overflow-hidden">
                        <div className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-blue-500 transition-all duration-700" style={{ width: `${getBreakdownValue('financialNLP') * 100}%` }} />
                      </div>
                      <p className="text-[10px] text-muted-foreground mt-1">
                        Weight: 20% — Detects bullish/bearish sentiment, internal contradictions, and FUD/hype patterns.
                      </p>
                    </div>
                  </CardContent>
                </Card>

                {/* Source Credibility */}
                <Card className="border-green-500/20">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Globe className="h-4 w-4 text-green-400" />
                      Source Credibility
                    </CardTitle>
                    <CardDescription className="text-xs">Domain reputation, HTTPS, and known source tiers</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">Score</span>
                        <span className={`text-sm font-bold ${scoreColor(getBreakdownValue('sourceCredibility'))}`}>
                          {Math.round(getBreakdownValue('sourceCredibility') * 100)}%
                        </span>
                      </div>
                      <div className="h-2 bg-muted rounded-full overflow-hidden">
                        <div className="h-full rounded-full bg-gradient-to-r from-green-500 to-emerald-500 transition-all duration-700" style={{ width: `${getBreakdownValue('sourceCredibility') * 100}%` }} />
                      </div>
                      <p className="text-[10px] text-muted-foreground mt-1">
                        Weight: 15% — Tier 1 (Bloomberg, Reuters, CoinDesk), Tier 2 (Medium, Reddit), URL checks.
                      </p>
                    </div>
                  </CardContent>
                </Card>

                {/* Social Propagation */}
                <Card className="border-purple-500/20">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Users className="h-4 w-4 text-purple-400" />
                      Social Propagation Analysis
                    </CardTitle>
                    <CardDescription className="text-xs">Bot detection, coordination, pump/dump & hype cycle</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">Score</span>
                        <span className={`text-sm font-bold ${scoreColor(getBreakdownValue('socialPropagation'))}`}>
                          {Math.round(getBreakdownValue('socialPropagation') * 100)}%
                        </span>
                      </div>
                      <div className="h-2 bg-muted rounded-full overflow-hidden">
                        <div className="h-full rounded-full bg-gradient-to-r from-purple-500 to-pink-500 transition-all duration-700" style={{ width: `${getBreakdownValue('socialPropagation') * 100}%` }} />
                      </div>
                      <p className="text-[10px] text-muted-foreground mt-1">
                        Weight: 10% — Detects bot-like patterns, coordinated buying calls, and pump/dump schemes.
                      </p>
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}
          
        </TabsContent>

        {/* ===== VERIFY CLAIM TAB ===== */}
        <TabsContent value="verify">
          
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <TrendingUp className="h-5 w-5 text-amber-400" />
                    Verify Market Claim
                  </CardTitle>
                  <CardDescription>Verify a market-related claim against real Binance price data</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <Label htmlFor="claim" className="text-sm">Claim</Label>
                    <Textarea id="claim" placeholder='e.g. "Bitcoin surged 15% today" or "ETH is crashing"' value={claim} onChange={(e) => setClaim(e.target.value)} className="mt-1.5 min-h-24" />
                  </div>
                  <div>
                    <Label htmlFor="claimSymbol" className="text-sm">Symbol (optional)</Label>
                    <Input id="claimSymbol" placeholder="BTC, ETH, SOL..." value={claimSymbol} onChange={(e) => setClaimSymbol(e.target.value)} className="mt-1.5" />
                  </div>
                  <Button onClick={handleVerifyClaim} disabled={claimLoading || !claim} className="w-full gap-2 bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 text-white">
                    {claimLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <TrendingUp className="h-4 w-4" />}
                    {claimLoading ? 'Verifying...' : 'Verify Against Market Data'}
                  </Button>
                  {claimError && <p className="text-sm text-destructive">{claimError}</p>}
                </CardContent>
              </Card>

              <Card>
                <CardHeader><CardTitle className="text-lg">Verification Result</CardTitle></CardHeader>
                <CardContent>
                  {claimResult ? (
                    <div className="space-y-4">
                      <div className={`p-4 rounded-xl border ${claimResult.isConsistent ? 'bg-green-500/10 border-green-500/30' : 'bg-red-500/10 border-red-500/30'}`}>
                        <div className="flex items-center gap-2 mb-2">
                          {claimResult.isConsistent ? <CheckCircle2 className="h-5 w-5 text-green-400" /> : <XCircle className="h-5 w-5 text-red-400" />}
                          <span className={`text-lg font-bold ${claimResult.isConsistent ? 'text-green-400' : 'text-red-400'}`}>
                            {claimResult.isConsistent ? 'CONSISTENT' : 'INCONSISTENT'}
                          </span>
                        </div>
                        <p className="text-sm text-muted-foreground">{claimResult.details}</p>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div className="rounded-lg bg-muted/50 p-3">
                          <p className="text-xs text-muted-foreground">Claim Direction</p>
                          <p className="text-sm font-bold capitalize">{claimResult.claimDirection}</p>
                        </div>
                        <div className="rounded-lg bg-muted/50 p-3">
                          <p className="text-xs text-muted-foreground">Actual Direction</p>
                          <p className="text-sm font-bold capitalize">{claimResult.actualDirection}</p>
                        </div>
                        {claimResult.currentPrice !== null && (
                          <div className="rounded-lg bg-muted/50 p-3">
                            <p className="text-xs text-muted-foreground">Current Price</p>
                            <p className="text-sm font-bold font-mono">${claimResult.currentPrice?.toLocaleString(undefined, { maximumFractionDigits: 2 })}</p>
                          </div>
                        )}
                        <div className="rounded-lg bg-muted/50 p-3">
                          <p className="text-xs text-muted-foreground">Confidence</p>
                          <p className={`text-sm font-bold ${scoreColor(claimResult.confidence)}`}>{Math.round(claimResult.confidence * 100)}%</p>
                        </div>
                        {claimResult.priceChange24h !== null && (
                          <div className="rounded-lg bg-muted/50 p-3">
                            <p className="text-xs text-muted-foreground">24h Change</p>
                            <p className={`text-sm font-bold ${(claimResult.priceChange24h ?? 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                              {(claimResult.priceChange24h ?? 0) >= 0 ? '+' : ''}{(claimResult.priceChange24h ?? 0).toFixed(2)}%
                            </p>
                          </div>
                        )}
                        {claimResult.priceChange7d !== null && (
                          <div className="rounded-lg bg-muted/50 p-3">
                            <p className="text-xs text-muted-foreground">7d Change</p>
                            <p className={`text-sm font-bold ${(claimResult.priceChange7d ?? 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                              {(claimResult.priceChange7d ?? 0) >= 0 ? '+' : ''}{(claimResult.priceChange7d ?? 0).toFixed(2)}%
                            </p>
                          </div>
                        )}
                      </div>

                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs text-muted-foreground">Market Reaction Score</span>
                          <span className={`text-sm font-bold ${scoreColor(claimResult.marketReactionScore)}`}>{Math.round(claimResult.marketReactionScore * 100)}%</span>
                        </div>
                        <div className="h-2 bg-muted rounded-full overflow-hidden">
                          <div className="h-full rounded-full transition-all duration-700" style={{
                            width: `${claimResult.marketReactionScore * 100}%`,
                            backgroundColor: scoreBarColor(claimResult.marketReactionScore),
                          }} />
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center py-12 text-center">
                      <TrendingUp className="h-12 w-12 text-muted-foreground/30 mb-3" />
                      <p className="text-sm text-muted-foreground">Enter a market claim to verify against real price data</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          
        </TabsContent>

        {/* ===== SOCIAL ANALYSIS TAB ===== */}
        <TabsContent value="social">
          
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Users className="h-5 w-5 text-amber-400" />
                    Social Propagation Analysis
                  </CardTitle>
                  <CardDescription>Detect bot-like behavior, coordination, pump/dump patterns, and hype cycle phase</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <Label htmlFor="socialText" className="text-sm">Social Media Text</Label>
                    <Textarea id="socialText" placeholder="Paste a tweet, Reddit post, or Telegram message to analyze..." value={socialText} onChange={(e) => setSocialText(e.target.value)} className="mt-1.5 min-h-32" />
                  </div>
                  <Button onClick={handleSocialAnalysis} disabled={socialLoading || !socialText} className="w-full gap-2 bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 text-white">
                    {socialLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Users className="h-4 w-4" />}
                    {socialLoading ? 'Analyzing...' : 'Analyze Social Patterns'}
                  </Button>
                  {socialError && <p className="text-sm text-destructive">{socialError}</p>}
                </CardContent>
              </Card>

              <Card>
                <CardHeader><CardTitle className="text-lg">Social Analysis Result</CardTitle></CardHeader>
                <CardContent>
                  {socialResult ? (
                    <div className="space-y-4">
                      <div className="text-center p-4 rounded-xl bg-muted/50">
                        <p className={`text-3xl font-bold ${scoreColor(socialResult.socialPropagationScore)}`}>
                          {Math.round(socialResult.socialPropagationScore * 100)}%
                        </p>
                        <p className="text-xs text-muted-foreground">Social Propagation Score</p>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div className="rounded-lg bg-red-500/10 border border-red-500/20 p-3">
                          <p className="text-xs text-muted-foreground">Bot Likelihood</p>
                          <p className={`text-lg font-bold ${socialResult.botLikelihood > 0.5 ? 'text-red-400' : 'text-green-400'}`}>
                            {Math.round(socialResult.botLikelihood * 100)}%
                          </p>
                        </div>
                        <div className="rounded-lg bg-orange-500/10 border border-orange-500/20 p-3">
                          <p className="text-xs text-muted-foreground">Coordination</p>
                          <p className={`text-lg font-bold ${socialResult.coordinationScore > 0.5 ? 'text-orange-400' : 'text-green-400'}`}>
                            {Math.round(socialResult.coordinationScore * 100)}%
                          </p>
                        </div>
                        <div className="rounded-lg bg-amber-500/10 border border-amber-500/20 p-3">
                          <p className="text-xs text-muted-foreground">Pump/Dump Score</p>
                          <p className={`text-lg font-bold ${socialResult.pumpDumpScore > 0.5 ? 'text-amber-400' : 'text-green-400'}`}>
                            {Math.round(socialResult.pumpDumpScore * 100)}%
                          </p>
                        </div>
                        <div className="rounded-lg bg-purple-500/10 border border-purple-500/20 p-3">
                          <p className="text-xs text-muted-foreground">Viral Coefficient</p>
                          <p className="text-lg font-bold text-purple-400">{socialResult.viralCoefficient.toFixed(1)}x</p>
                        </div>
                      </div>

                      <div className="rounded-lg bg-muted/50 p-3">
                        <p className="text-xs text-muted-foreground mb-1">Hype Cycle Phase</p>
                        <Badge variant="secondary" className="text-xs capitalize">{socialResult.hypeCyclePhase || 'none'}</Badge>
                      </div>

                      <p className="text-sm text-muted-foreground">{socialResult.analysis}</p>

                      {socialResult.flags.length > 0 && (
                        <div>
                          <h4 className="text-sm font-medium mb-2">Detected Patterns</h4>
                          <div className="flex flex-wrap gap-1.5">
                            {socialResult.flags.map((flag, i) => (<Badge key={i} variant="destructive" className="text-[10px]">{flag}</Badge>))}
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center py-12 text-center">
                      <Users className="h-12 w-12 text-muted-foreground/30 mb-3" />
                      <p className="text-sm text-muted-foreground">Enter social media text to analyze for manipulation patterns</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          
        </TabsContent>

        {/* ===== NEWS FEED TAB ===== */}
        <TabsContent value="feed">
          
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-lg">Crypto News Feed</CardTitle>
                    <CardDescription>Latest crypto news with credibility analysis</CardDescription>
                  </div>
                  <Button variant="outline" size="sm" onClick={fetchNews} disabled={newsLoading} className="gap-1">
                    <Search className="h-3 w-3" /> Refresh
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {newsLoading ? (
                  <div className="space-y-3">{[1, 2, 3, 4, 5].map((i) => (<Skeleton key={i} className="h-24 w-full" />))}</div>
                ) : newsError ? (
                  <p className="text-sm text-destructive text-center py-8">{newsError}</p>
                ) : news.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">No news available</p>
                ) : (
                  <div className="space-y-3 max-h-[600px] overflow-y-auto">
                    {news.map((item, idx) => (
                      <div key={idx} className={`rounded-lg border p-4 transition-colors ${expandedIdx === idx ? 'border-amber-500/30 bg-amber-500/5' : 'border-border bg-card'}`}>
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <h4 className="text-sm font-medium leading-tight line-clamp-2">{item.title}</h4>
                            <div className="flex items-center gap-2 mt-1.5 text-xs text-muted-foreground">
                              <span>{item.sourceName}</span><span>-</span><span>{formatDate(item.publishedAt)}</span>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            {item.credibility ? (
                              <Badge variant="secondary" className={`${scoreColor(item.credibility.credibilityScore)} text-[10px]`}>
                                {Math.round(item.credibility.credibilityScore * 100)}%
                              </Badge>
                            ) : null}
                            <Button variant="ghost" size="sm" onClick={() => { if (item.credibility) setExpandedIdx(expandedIdx === idx ? null : idx); else handleNewsAnalyze(item, idx); }} className="text-xs gap-1">
                              {item.credibility ? 'Details' : 'Analyze'}
                            </Button>
                          </div>
                        </div>
                        {expandedIdx === idx && item.credibility && (
                          <div className="mt-3 pt-3 border-t border-border/50 space-y-2">
                            <div className="flex items-center gap-2">
                              {recIcon(item.credibility.recommendation)}
                              <span className="text-sm font-medium">{item.credibility.recommendation}</span>
                              <Badge variant="secondary" className="text-[10px]">{item.credibility.method}</Badge>
                            </div>
                            <p className="text-xs text-muted-foreground">{item.credibility.analysis}</p>
                            {item.credibility.flags.length > 0 && (
                              <div className="flex flex-wrap gap-1">
                                {item.credibility.flags.slice(0, 5).map((f, fi) => (<Badge key={fi} variant="destructive" className="text-[9px]">{f}</Badge>))}
                              </div>
                            )}
                            {item.sourceUrl && (
                              <a href={item.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-amber-400 hover:underline inline-flex items-center gap-1">
                                <ExternalLink className="h-3 w-3" /> Source
                              </a>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          
        </TabsContent>
      </Tabs>
    </div>
  );
}
