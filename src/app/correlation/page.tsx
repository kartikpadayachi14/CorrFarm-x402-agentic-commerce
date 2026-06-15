'use client';

import React, { useState, useCallback } from 'react';
import {
  BarChart3, Play, Loader2, TrendingUp, TrendingDown, AlertTriangle,
  Search, Zap, CheckCircle2, Copy, Wallet
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RTooltip,
  ResponsiveContainer, Legend
} from 'recharts';
import { useWallet } from '@/contexts/wallet-context';
import { useToast } from '@/hooks/use-toast';

function TxIdBadge({ txId }: { txId: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(txId).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <div className="flex items-center gap-2 rounded-lg bg-green-500/10 border border-green-500/20 px-3 py-2">
      <CheckCircle2 className="h-3.5 w-3.5 text-green-400 shrink-0" />
      <span className="text-[10px] text-green-400 font-medium">x402 Paid</span>
      {txId.startsWith('demo-') ? (
        <span className="text-[10px] font-mono text-muted-foreground truncate max-w-[200px]">{txId}</span>
      ) : (
        <a href={`https://testnet.explorer.perawallet.app/tx/${txId}`} target="_blank" rel="noopener noreferrer" className="text-[10px] font-mono text-green-400 hover:underline truncate max-w-[200px]" title="View on Algorand explorer">{txId}</a>
      )}
      <button onClick={copy} className="text-muted-foreground hover:text-foreground shrink-0">
        {copied ? <CheckCircle2 className="h-3 w-3 text-green-400" /> : <Copy className="h-3 w-3" />}
      </button>
    </div>
  );
}

// Constants
const TOP_CRYPTOS = [
  'bitcoin', 'ethereum', 'bnb', 'ripple', 'solana',
  'cardano', 'dogecoin', 'avalanche', 'polkadot', 'tron',
  'chainlink', 'polygon', 'shiba', 'litecoin', 'uniswap',
  'cosmos', 'stellar', 'monero', 'ethereumclassic', 'near',
];

const TIME_RANGES = [
  { value: '7', label: '7 Days' }, { value: '30', label: '30 Days' },
  { value: '90', label: '90 Days' }, { value: '180', label: '180 Days' },
  { value: '365', label: '365 Days' },
];

const INTERVALS = [
  { value: '1d', label: 'Daily' }, { value: '4h', label: '4 Hours' }, { value: '1h', label: '1 Hour' },
];

const METHODS = [
  { value: 'pearson', label: 'Pearson' }, { value: 'spearman', label: 'Spearman' }, { value: 'kendall', label: 'Kendall' },
];

// Heatmap helpers
function correlationToColor(value: number): string {
  const abs = Math.abs(value);
  if (value >= 0) {
    const i = Math.round(abs * 180);
    return `rgb(${40 - i * 0.2}, ${60 + i}, ${40 - i * 0.2})`;
  } else {
    const i = Math.round(abs * 180);
    return `rgb(${60 + i}, ${40 - i * 0.3}, ${40 - i * 0.3})`;
  }
}

function fmt(name: string): string {
  return name.replace('USDT', '').toUpperCase().slice(0, 5);
}

export default function CorrelationPage() {
  const [selectedAssets, setSelectedAssets] = useState<string[]>(TOP_CRYPTOS.slice(0, 10));
  const [days, setDays] = useState('30');
  const [interval, setInterval] = useState('1d');
  const [method, setMethod] = useState('pearson');
  const [assetA, setAssetA] = useState('bitcoin');
  const [assetB, setAssetB] = useState('ethereum');

  const [loading, setLoading] = useState(false);
  const [txIds, setTxIds] = useState<Record<string, string>>({});
  const { isConnected, hasAccess, payForResource } = useWallet();
  const { toast } = useToast();

  const ensurePaid = useCallback(async (resource: string): Promise<boolean> => {
    if (hasAccess(resource)) return true;
    if (!isConnected) {
      toast({ title: 'Connect your wallet', description: 'Connect a wallet in the navbar to pay automatically.', variant: 'destructive' });
      return false;
    }
    toast({ title: '⚡ x402 Payment Sending', description: `Paying for ${resource.replace(/_/g, ' ')} via USDC on Algorand Testnet...` });
    const result = await payForResource(resource);
    if (result) {
      setTxIds((prev) => ({ ...prev, [resource]: result.txId }));
      toast({ title: '✅ Payment Confirmed', description: `TxID: ${result.txId}` });
      return true;
    }
    toast({ title: '❌ Payment Failed', description: 'Try again or check your wallet.', variant: 'destructive' });
    return false;
  }, [isConnected, hasAccess, payForResource, toast]);
  const [matrixData, setMatrixData] = useState<{ assets: string[]; matrix: number[][] } | null>(null);
  const [pairData, setPairData] = useState<{
    best?: { correlation: number; pValue: number; methodLabel: string; reason: string; agreement: number; nObservations: number; strength: string; direction: string };
    correlations: { pearson: { correlation: number; pValue: number; method: string; nObservations: number; interpretation: string }; spearman: { correlation: number; pValue: number }; kendall: { correlation: number; pValue: number } };
    rollingCorrelation: { dates: string[]; correlations: number[] };
    tailDependence: { upper: number; lower: number };
    interpretation: string;
  } | null>(null);
  const [copulaData, setCopulaData] = useState<{
    params: { df: number; correlationMatrix: number[][]; assets: string[] };
    tailDependence: Record<string, Record<string, { upper: number; lower: number }>>;
    logLikelihood: number; aic: number;
  } | null>(null);
  const [dccData, setDccData] = useState<{
    dccAlpha: number; dccBeta: number;
    dynamicCorrelations: { date: string; matrix: number[][] }[];
    assets: string[];
    garchResults: Record<string, { params: { omega: number; alpha: number; beta: number; longRunVariance: number } }>;
  } | null>(null);
  const [edgeData, setEdgeData] = useState<{
    opportunities: { pair: string; assetA: string; assetB: string; correlation: number; tailLower: number; tailUpper: number; edge: string; confidence: number }[];
  } | null>(null);
  const [error, setError] = useState('');

  const toggleAsset = (asset: string) => {
    setSelectedAssets((prev) => prev.includes(asset) ? prev.filter((a) => a !== asset) : [...prev, asset]);
  };

  const runMatrix = useCallback(async () => {
    if (selectedAssets.length < 2) return;
    setLoading(true); setError('');
    try {
      const paid = await ensurePaid('correlation_matrix');
      if (!paid) { setLoading(false); return; }
      const res = await fetch(`/api/correlation/matrix?coins=${selectedAssets.join(',')}&days=${days}&method=${method}`);
      const data = await res.json();
      if (data.success) setMatrixData({ assets: data.data.assets ?? data.data.coins, matrix: data.data.matrix });
      else setError(data.error || 'Failed');
    } catch (err) { setError(err instanceof Error ? err.message : 'Request failed'); }
    finally { setLoading(false); }
  }, [selectedAssets, days, method, ensurePaid]);

  const runPair = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const paid = await ensurePaid('pair_correlation');
      if (!paid) { setLoading(false); return; }
      const res = await fetch(`/api/correlation/pair/${assetA}/${assetB}?days=${days}`);
      const data = await res.json();
      if (data.success) setPairData(data.data);
      else setError(data.error || 'Failed');
    } catch (err) { setError(err instanceof Error ? err.message : 'Request failed'); }
    finally { setLoading(false); }
  }, [assetA, assetB, days, ensurePaid]);

  const runCopula = useCallback(async () => {
    if (selectedAssets.length < 2) return;
    setLoading(true); setError('');
    try {
      const paid = await ensurePaid('copula_analysis');
      if (!paid) { setLoading(false); return null; }
      const res = await fetch(`/api/correlation/copula?coins=${selectedAssets.join(',')}&days=${days}`);
      const data = await res.json();
      if (data.success) {
        setCopulaData(data.data);
        return data.data;
      }
      else setError(data.error || 'Failed');
    } catch (err) { setError(err instanceof Error ? err.message : 'Request failed'); }
    finally { setLoading(false); }
    return null;
  }, [selectedAssets, days, ensurePaid]);

  const runDcc = useCallback(async () => {
    if (selectedAssets.length < 2) return;
    setLoading(true); setError('');
    try {
      const paid = await ensurePaid('dcc_garch');
      if (!paid) { setLoading(false); return; }
      const res = await fetch(`/api/correlation/dcc-garch?coins=${selectedAssets.join(',')}&days=${days}`);
      const data = await res.json();
      if (data.success) setDccData(data.data);
      else setError(data.error || 'Failed');
    } catch (err) { setError(err instanceof Error ? err.message : 'Request failed'); }
    finally { setLoading(false); }
  }, [selectedAssets, days, ensurePaid]);

  // Auto-run copula if not available, then run edge detection
  const runEdgeDetection = useCallback(async () => {
    setLoading(true); setError('');
    try {
      // If no copula data, auto-run copula first (with payment)
      let copulaResult = copulaData;
      if (!copulaResult) {
        const paid = await ensurePaid('copula_analysis');
        if (!paid) { setLoading(false); return; }
        const res = await fetch(`/api/correlation/copula?coins=${selectedAssets.join(',')}&days=${days}`);
        const data = await res.json();
        if (data.success) {
          copulaResult = data.data;
          setCopulaData(data.data);
        } else {
          setError(data.error || 'Copula analysis failed. Cannot detect edges without it.');
          setLoading(false);
          return;
        }
      }

      // Build edge detection from copula data
      const opportunities: { pair: string; assetA: string; assetB: string; correlation: number; tailLower: number; tailUpper: number; edge: string; confidence: number }[] = [];
      const assets = copulaResult.params.assets;
      for (let i = 0; i < assets.length; i++) {
        for (let j = i + 1; j < assets.length; j++) {
          const td = copulaResult.tailDependence[assets[i]]?.[assets[j]];
          const corr = copulaResult.params.correlationMatrix[i]?.[j] ?? 0;
          if (td) {
            const maxTail = Math.max(td.upper, td.lower);
            opportunities.push({
              pair: `${fmt(assets[i])}/${fmt(assets[j])}`,
              assetA: assets[i],
              assetB: assets[j],
              correlation: corr,
              tailLower: td.lower,
              tailUpper: td.upper,
              edge: maxTail > 0.3 ? 'HIGH_TAIL_DEP' : maxTail > 0.15 ? 'MODERATE' : 'LOW',
              confidence: maxTail,
            });
          }
        }
      }
      opportunities.sort((a, b) => b.confidence - a.confidence);
      setEdgeData({ opportunities });
    } catch (err) { setError(err instanceof Error ? err.message : 'Failed'); }
    finally { setLoading(false); }
  }, [copulaData, selectedAssets, days, ensurePaid]);

  const rollingChartData = pairData?.rollingCorrelation
    ? pairData.rollingCorrelation.dates.map((d, i) => ({ date: d, correlation: pairData.rollingCorrelation.correlations[i] }))
    : [];

  const dccChartData = dccData
    ? dccData.dynamicCorrelations
        .filter((_, i) => i % Math.max(1, Math.floor(dccData.dynamicCorrelations.length / 60)) === 0)
        .map((dc) => ({ date: dc.date, [`${fmt(dccData.assets[0])}-${fmt(dccData.assets[1])}`]: dc.matrix[0]?.[1] ?? 0 }))
    : [];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <BarChart3 className="h-6 w-6 text-amber-400" /> Correlation Engine
        </h1>
        <p className="text-muted-foreground text-sm mt-1">Analyze correlations, Student-t Copula tail dependence, DCC-GARCH dynamics, and detect edge opportunities</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Analysis Configuration</CardTitle>
          <CardDescription>Select assets, time range, and parameters</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label className="text-sm font-medium mb-2 block">Assets ({selectedAssets.length} selected)</Label>
            <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-5 gap-2 max-h-48 overflow-y-auto">
              {TOP_CRYPTOS.map((asset) => (
                <div key={asset} className="flex items-center gap-2">
                  <Checkbox id={asset} checked={selectedAssets.includes(asset)} onCheckedChange={() => toggleAsset(asset)} />
                  <Label htmlFor={asset} className="text-xs cursor-pointer capitalize">{asset}</Label>
                </div>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <Label className="text-sm font-medium mb-1.5 block">Time Range</Label>
              <Select value={days} onValueChange={setDays}><SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{TIME_RANGES.map((r) => (<SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>))}</SelectContent></Select>
            </div>
            <div>
              <Label className="text-sm font-medium mb-1.5 block">Interval</Label>
              <Select value={interval} onValueChange={setInterval}><SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{INTERVALS.map((i) => (<SelectItem key={i.value} value={i.value}>{i.label}</SelectItem>))}</SelectContent></Select>
            </div>
            <div>
              <Label className="text-sm font-medium mb-1.5 block">Method</Label>
              <Select value={method} onValueChange={setMethod}><SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{METHODS.map((m) => (<SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>))}</SelectContent></Select>
            </div>
          </div>
          {!isConnected && (
            <div className="flex items-center gap-2 rounded-lg bg-amber-500/10 border border-amber-500/20 px-3 py-2.5">
              <Wallet className="h-4 w-4 text-amber-400 shrink-0" />
              <p className="text-xs text-amber-400">Connect your wallet in the navbar to enable automatic x402 micropayments for each analysis.</p>
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            <Button onClick={runMatrix} disabled={loading || selectedAssets.length < 2} className="gap-2 bg-gradient-to-r from-amber-500 to-orange-600 text-white">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />} Run Matrix <span className="text-[10px] opacity-70">$0.05</span>
            </Button>
            <Button onClick={runPair} disabled={loading} variant="outline" className="gap-2">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />} Run Pair <span className="text-[10px] opacity-70">$0.02</span>
            </Button>
            <Button onClick={runCopula} disabled={loading || selectedAssets.length < 2} variant="outline" className="gap-2">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />} Run Copula <span className="text-[10px] opacity-70">$0.10</span>
            </Button>
            <Button onClick={runDcc} disabled={loading || selectedAssets.length < 2} variant="outline" className="gap-2">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />} Run DCC-GARCH <span className="text-[10px] opacity-70">$0.10</span>
            </Button>
            <Button onClick={runEdgeDetection} disabled={loading || selectedAssets.length < 2} variant="outline" className="gap-2">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />} Detect Edges
            </Button>
          </div>
          {Object.keys(txIds).length > 0 && (
            <div className="space-y-1.5">
              <p className="text-[10px] text-muted-foreground font-medium">x402 Payment Receipts</p>
              <div className="flex flex-wrap gap-2">
                {Object.entries(txIds).map(([resource, txId]) => (
                  <TxIdBadge key={resource} txId={txId} />
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {error && (<Card className="border-destructive/50"><CardContent className="p-4"><p className="text-sm text-destructive">{error}</p></CardContent></Card>)}

      <Tabs defaultValue="matrix">
        <TabsList>
          <TabsTrigger value="matrix">Matrix</TabsTrigger>
          <TabsTrigger value="pair">Pair Detail</TabsTrigger>
          <TabsTrigger value="copula">Copula</TabsTrigger>
          <TabsTrigger value="dcc">DCC-GARCH</TabsTrigger>
          <TabsTrigger value="edges">Edge Detection</TabsTrigger>
        </TabsList>

        <TabsContent value="matrix">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Correlation Matrix</CardTitle>
              <CardDescription>{matrixData ? `${matrixData.assets.length}x${matrixData.assets.length} ${method} correlation matrix` : 'Run analysis to see results'}</CardDescription>
            </CardHeader>
            <CardContent>
              {loading && !matrixData ? (<Skeleton className="h-64 w-full" />) : matrixData ? (
                <TooltipProvider delayDuration={100}>
                  <div className="overflow-x-auto">
                    <div className="inline-grid gap-0.5 min-w-fit" style={{ gridTemplateColumns: `60px repeat(${matrixData.assets.length}, 1fr)` }}>
                      <div />
                      {matrixData.assets.map((a) => (<div key={a} className="text-[9px] text-muted-foreground text-center truncate px-0.5 py-1" style={{ minWidth: 36 }}>{fmt(a)}</div>))}
                      {matrixData.assets.map((asset, i) => (
                        <React.Fragment key={`row-${i}`}>
                          <div className="text-[9px] text-muted-foreground flex items-center justify-end pr-1 truncate">{fmt(asset)}</div>
                          {matrixData.matrix[i].map((value, j) => (
                            <Tooltip key={`${i}-${j}`}>
                              <TooltipTrigger asChild>
                                <div className="rounded-sm cursor-pointer transition-transform hover:scale-110 hover:z-10 flex items-center justify-center"
                                  style={{ backgroundColor: correlationToColor(value), minWidth: 36, minHeight: 36 }}>
                                  <span className="text-[8px] font-medium text-white/80">{value.toFixed(2)}</span>
                                </div>
                              </TooltipTrigger>
                              <TooltipContent side="top" className="text-xs">{fmt(matrixData.assets[i])} vs {fmt(matrixData.assets[j])}: {value.toFixed(4)}</TooltipContent>
                            </Tooltip>
                          ))}
                        </React.Fragment>
                      ))}
                    </div>
                  </div>
                </TooltipProvider>
              ) : (<p className="text-sm text-muted-foreground text-center py-8">Configure and click &quot;Run Matrix&quot;</p>)}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="pair">
          <Card>
            <CardHeader>
              <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                <div className="flex-1"><CardTitle className="text-lg">Pair Analysis</CardTitle><CardDescription>Detailed correlation between two assets</CardDescription></div>
                <div className="flex items-center gap-2">
                  <Select value={assetA} onValueChange={setAssetA}><SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                    <SelectContent>{TOP_CRYPTOS.map((a) => (<SelectItem key={a} value={a} className="capitalize">{a}</SelectItem>))}</SelectContent></Select>
                  <span className="text-muted-foreground">vs</span>
                  <Select value={assetB} onValueChange={setAssetB}><SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                    <SelectContent>{TOP_CRYPTOS.map((a) => (<SelectItem key={a} value={a} className="capitalize">{a}</SelectItem>))}</SelectContent></Select>
                  </div>
              </div>
            </CardHeader>
            <CardContent>
              {pairData ? (
                <div className="space-y-6">
                  {pairData.best && (
                    <div className="rounded-xl border border-primary/30 bg-gradient-to-br from-primary/10 to-primary/5 p-5">
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-xs font-semibold uppercase tracking-wide text-primary">Best Correlation</p>
                        <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-primary/20 text-primary">{pairData.best.methodLabel} · {(pairData.best.agreement * 100).toFixed(0)}% confidence</span>
                      </div>
                      <div className="flex items-end gap-3">
                        <p className="text-4xl font-bold tabular-nums">{pairData.best.correlation.toFixed(4)}</p>
                        <p className="text-sm font-medium text-muted-foreground mb-1 capitalize">{pairData.best.strength} {pairData.best.direction}</p>
                      </div>
                      <p className="text-xs text-muted-foreground mt-2">{pairData.best.reason}</p>
                      <div className="flex gap-4 mt-3 text-[11px] text-muted-foreground">
                        <span>p-value: <span className="font-mono text-foreground">{pairData.best.pValue.toFixed(6)}</span></span>
                        <span>observations: <span className="font-mono text-foreground">{pairData.best.nObservations}</span></span>
                      </div>
                    </div>
                  )}
                  {pairData.tailDependence && (
                    <div>
                      <h3 className="text-sm font-semibold mb-3">Tail Dependence</h3>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="rounded-lg bg-red-500/10 border border-red-500/20 p-4">
                          <div className="flex items-center gap-2 mb-2">
                            <TrendingUp className="h-4 w-4 text-red-400" />
                            <p className="text-sm text-muted-foreground">Upper Tail Dependence</p>
                          </div>
                          <p className="text-2xl font-bold text-red-400">{pairData.tailDependence.upper.toFixed(4)}</p>
                          <p className="text-[10px] text-muted-foreground mt-1">Probability of joint extreme gains</p>
                        </div>
                        <div className="rounded-lg bg-green-500/10 border border-green-500/20 p-4">
                          <div className="flex items-center gap-2 mb-2">
                            <TrendingDown className="h-4 w-4 text-green-400" />
                            <p className="text-sm text-muted-foreground">Lower Tail Dependence</p>
                          </div>
                          <p className="text-2xl font-bold text-green-400">{pairData.tailDependence.lower.toFixed(4)}</p>
                          <p className="text-[10px] text-muted-foreground mt-1">Probability of joint extreme losses</p>
                        </div>
                      </div>
                    </div>
                  )}
                  {rollingChartData.length > 0 && (
                    <div>
                      <h3 className="text-sm font-semibold mb-2">Rolling Correlation (30-day window)</h3>
                      <ResponsiveContainer width="100%" height={280}>
                        <LineChart data={rollingChartData}>
                          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                          <XAxis dataKey="date" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                          <YAxis domain={[-1, 1]} tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                          <RTooltip contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px', fontSize: '12px' }} />
                          <Legend />
                          <Line type="monotone" dataKey="correlation" stroke="#f59e0b" strokeWidth={2} dot={false} name="Correlation" />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </div>
              ) : (<p className="text-sm text-muted-foreground text-center py-8">Select two assets and click &quot;Run Pair&quot;</p>)}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="copula">
          <Card>
            <CardHeader><CardTitle className="text-lg">Student-t Copula Results</CardTitle><CardDescription>Tail dependence and copula parameters</CardDescription></CardHeader>
            <CardContent>
              {copulaData ? (
                <div className="space-y-6">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    <div className="rounded-lg bg-amber-500/10 border border-amber-500/20 p-4">
                      <p className="text-xs text-muted-foreground mb-1">Degrees of Freedom (ν)</p>
                      <p className="text-2xl font-bold text-amber-400">{copulaData.params.df.toFixed(2)}</p>
                      <p className="text-[10px] text-muted-foreground mt-1">Lower ν → fatter tails → more tail dependence</p>
                    </div>
                    <div className="rounded-lg bg-muted/50 p-4">
                      <p className="text-xs text-muted-foreground mb-1">Log-Likelihood</p>
                      <p className="text-2xl font-bold">{copulaData.logLikelihood.toFixed(2)}</p>
                    </div>
                    <div className="rounded-lg bg-muted/50 p-4">
                      <p className="text-xs text-muted-foreground mb-1">AIC</p>
                      <p className="text-2xl font-bold">{copulaData.aic.toFixed(2)}</p>
                    </div>
                    <div className="rounded-lg bg-muted/50 p-4">
                      <p className="text-xs text-muted-foreground mb-1">Assets</p>
                      <p className="text-2xl font-bold">{copulaData.params.assets.length}</p>
                    </div>
                  </div>

                  {copulaData.params.assets.length >= 2 && (
                    <div>
                      <h3 className="text-sm font-semibold mb-3">Tail Dependence Matrix</h3>
                      <p className="text-xs text-muted-foreground mb-3">Measures probability of extreme co-movements. Upper = joint gains, Lower = joint losses.</p>
                      <div className="overflow-x-auto">
                        <table className="text-xs w-full">
                          <thead>
                            <tr className="border-b border-border">
                              <th className="text-left py-2 px-2 text-muted-foreground">Pair</th>
                              <th className="text-right py-2 px-2 text-muted-foreground">Upper Tail</th>
                              <th className="text-right py-2 px-2 text-muted-foreground">Lower Tail</th>
                              <th className="text-right py-2 px-2 text-muted-foreground">Asymmetry</th>
                              <th className="text-center py-2 px-2 text-muted-foreground">Risk Level</th>
                            </tr>
                          </thead>
                          <tbody>
                            {copulaData.params.assets.slice(0, 6).flatMap((assetA, i) =>
                              copulaData.params.assets.slice(i + 1, 6).map((assetB) => {
                                const td = copulaData.tailDependence[assetA]?.[assetB];
                                if (!td) return null;
                                const asymmetry = Math.abs(td.upper - td.lower);
                                const maxTail = Math.max(td.upper, td.lower);
                                return (
                                  <tr key={`${assetA}-${assetB}`} className="border-b border-border/30 hover:bg-muted/30 transition-colors">
                                    <td className="py-2 px-2 font-mono">{fmt(assetA)} / {fmt(assetB)}</td>
                                    <td className="py-2 px-2 text-right font-mono text-red-400">{td.upper.toFixed(4)}</td>
                                    <td className="py-2 px-2 text-right font-mono text-green-400">{td.lower.toFixed(4)}</td>
                                    <td className="py-2 px-2 text-right font-mono">{asymmetry.toFixed(4)}</td>
                                    <td className="py-2 px-2 text-center">
                                      <Badge variant="secondary" className={`text-[10px] ${maxTail > 0.3 ? 'text-red-400 bg-red-500/10' : maxTail > 0.15 ? 'text-amber-400 bg-amber-500/10' : 'text-green-400 bg-green-500/10'}`}>
                                        {maxTail > 0.3 ? 'HIGH' : maxTail > 0.15 ? 'MODERATE' : 'LOW'}
                                      </Badge>
                                    </td>
                                  </tr>
                                );
                              })
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  <div className="rounded-lg bg-muted/50 p-4">
                    <h4 className="text-sm font-semibold mb-2">Degrees of Freedom Interpretation</h4>
                    <div className="space-y-1.5 text-xs text-muted-foreground">
                      <p>• <span className="text-amber-400 font-medium">ν = {copulaData.params.df.toFixed(2)}</span> — {copulaData.params.df < 5 ? 'Very heavy tails — significant tail dependence' : copulaData.params.df < 10 ? 'Moderate tails — some tail dependence' : 'Light tails — approaches Gaussian copula'}</p>
                      <p>• Student-t copula with ν → ∞ becomes Gaussian copula (no tail dependence)</p>
                      <p>• Lower ν means more probability mass in the tails → higher risk of extreme co-movements</p>
                    </div>
                  </div>
                </div>
              ) : (<p className="text-sm text-muted-foreground text-center py-8">Configure and click &quot;Run Copula&quot;</p>)}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="dcc">
          <Card>
            <CardHeader><CardTitle className="text-lg">DCC-GARCH Results</CardTitle><CardDescription>Dynamic conditional correlation over time</CardDescription></CardHeader>
            <CardContent>
              {dccData ? (
                <div className="space-y-6">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    <div className="rounded-lg bg-amber-500/10 border border-amber-500/20 p-4">
                      <p className="text-xs text-muted-foreground mb-1">DCC Alpha (α)</p>
                      <p className="text-2xl font-bold text-amber-400">{dccData.dccAlpha.toFixed(4)}</p>
                      <p className="text-[10px] text-muted-foreground mt-1">Shock persistence</p>
                    </div>
                    <div className="rounded-lg bg-amber-500/10 border border-amber-500/20 p-4">
                      <p className="text-xs text-muted-foreground mb-1">DCC Beta (β)</p>
                      <p className="text-2xl font-bold text-amber-400">{dccData.dccBeta.toFixed(4)}</p>
                      <p className="text-[10px] text-muted-foreground mt-1">Correlation persistence</p>
                    </div>
                    <div className="rounded-lg bg-muted/50 p-4">
                      <p className="text-xs text-muted-foreground mb-1">α + β</p>
                      <p className="text-2xl font-bold">{(dccData.dccAlpha + dccData.dccBeta).toFixed(4)}</p>
                      <p className="text-[10px] text-muted-foreground mt-1">{(dccData.dccAlpha + dccData.dccBeta) < 1 ? 'Stationary' : 'Non-stationary'}</p>
                    </div>
                    <div className="rounded-lg bg-muted/50 p-4">
                      <p className="text-xs text-muted-foreground mb-1">Assets</p>
                      <p className="text-2xl font-bold">{dccData.assets.length}</p>
                    </div>
                  </div>

                  <div>
                    <h3 className="text-sm font-semibold mb-3">GARCH(1,1) Volatility Parameters</h3>
                    <div className="overflow-x-auto">
                      <table className="text-xs w-full">
                        <thead><tr className="border-b border-border">
                          <th className="text-left py-2 px-2 text-muted-foreground">Asset</th>
                          <th className="text-right py-2 px-2 text-muted-foreground">α (News Impact)</th>
                          <th className="text-right py-2 px-2 text-muted-foreground">β (Vol Persistence)</th>
                          <th className="text-right py-2 px-2 text-muted-foreground">Long-run Var</th>
                          <th className="text-center py-2 px-2 text-muted-foreground">Status</th>
                        </tr></thead>
                        <tbody>{dccData.assets.map((asset) => { const g = dccData.garchResults[asset]?.params; return (
                          <tr key={asset} className="border-b border-border/30 hover:bg-muted/30 transition-colors">
                            <td className="py-2 px-2 font-mono">{fmt(asset)}</td>
                            <td className="py-2 px-2 text-right">{g?.alpha.toFixed(4) ?? '-'}</td>
                            <td className="py-2 px-2 text-right">{g?.beta.toFixed(4) ?? '-'}</td>
                            <td className="py-2 px-2 text-right">{g?.longRunVariance.toExponential(3) ?? '-'}</td>
                            <td className="py-2 px-2 text-center">
                              <Badge variant="secondary" className={`text-[10px] ${(g?.alpha ?? 0) + (g?.beta ?? 0) < 1 ? 'text-green-400 bg-green-500/10' : 'text-red-400 bg-red-500/10'}`}>
                                {(g?.alpha ?? 0) + (g?.beta ?? 0) < 1 ? 'Stable' : 'Unstable'}
                              </Badge>
                            </td>
                          </tr>
                        ); })}</tbody>
                      </table>
                    </div>
                  </div>

                  {dccChartData.length > 0 && (
                    <div>
                      <h3 className="text-sm font-semibold mb-2">Dynamic Correlation: {fmt(dccData.assets[0])}-{fmt(dccData.assets[1])}</h3>
                      <ResponsiveContainer width="100%" height={280}>
                        <LineChart data={dccChartData}>
                          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                          <XAxis dataKey="date" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                          <YAxis domain={[-1, 1]} tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                          <RTooltip contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px', fontSize: '12px' }} />
                          <Legend />
                          <Line type="monotone" dataKey={`${fmt(dccData.assets[0])}-${fmt(dccData.assets[1])}`} stroke="#f59e0b" strokeWidth={2} dot={false} />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </div>
              ) : (<p className="text-sm text-muted-foreground text-center py-8">Configure and click &quot;Run DCC-GARCH&quot;</p>)}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Edge Detection Tab */}
        <TabsContent value="edges">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Zap className="h-5 w-5 text-amber-400" />
                    Edge & Opportunity Detection
                  </CardTitle>
                  <CardDescription>Identify pairs with significant tail dependence for trading opportunities</CardDescription>
                </div>
                <Button onClick={runEdgeDetection} disabled={loading || selectedAssets.length < 2} className="gap-2 bg-gradient-to-r from-amber-500 to-orange-600 text-white">
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                  Detect Edges
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {edgeData ? (
                edgeData.opportunities.length > 0 ? (
                  <div className="space-y-3">
                    <div className="rounded-lg bg-amber-500/10 border border-amber-500/20 p-4 text-sm">
                      <p className="font-medium text-amber-400 mb-1">Detected {edgeData.opportunities.length} edge opportunities</p>
                      <p className="text-xs text-muted-foreground">Pairs with high tail dependence offer potential for correlation-based strategies. Higher tail dependence = more predictable extreme co-movements.</p>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="text-xs w-full">
                        <thead>
                          <tr className="border-b border-border">
                            <th className="text-left py-2.5 px-3 text-muted-foreground">Pair</th>
                            <th className="text-right py-2.5 px-3 text-muted-foreground">Correlation</th>
                            <th className="text-right py-2.5 px-3 text-muted-foreground">Upper Tail</th>
                            <th className="text-right py-2.5 px-3 text-muted-foreground">Lower Tail</th>
                            <th className="text-center py-2.5 px-3 text-muted-foreground">Edge</th>
                            <th className="text-center py-2.5 px-3 text-muted-foreground">Confidence</th>
                          </tr>
                        </thead>
                        <tbody>
                          {edgeData.opportunities.map((opp, i) => (
                            <tr key={i} className="border-b border-border/30 hover:bg-muted/30 transition-colors">
                              <td className="py-2.5 px-3 font-mono">{opp.pair}</td>
                              <td className="py-2.5 px-3 text-right font-mono">{opp.correlation.toFixed(4)}</td>
                              <td className="py-2.5 px-3 text-right font-mono text-red-400">{opp.tailUpper.toFixed(4)}</td>
                              <td className="py-2.5 px-3 text-right font-mono text-green-400">{opp.tailLower.toFixed(4)}</td>
                              <td className="py-2.5 px-3 text-center">
                                <Badge variant="secondary" className={`text-[10px] ${opp.edge === 'HIGH_TAIL_DEP' ? 'text-red-400 bg-red-500/10' : opp.edge === 'MODERATE' ? 'text-amber-400 bg-amber-500/10' : 'text-muted-foreground bg-muted'}`}>
                                  {opp.edge}
                                </Badge>
                              </td>
                              <td className="py-2.5 px-3 text-center">
                                <div className="flex items-center justify-center gap-1.5">
                                  <div className="h-1.5 w-16 bg-muted rounded-full overflow-hidden">
                                    <div className="h-full bg-amber-400 rounded-full" style={{ width: `${opp.confidence * 100}%` }} />
                                  </div>
                                  <span className="font-mono">{(opp.confidence * 100).toFixed(1)}%</span>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <AlertTriangle className="h-12 w-12 text-muted-foreground/30 mb-3" />
                    <p className="text-sm text-muted-foreground">No significant edge opportunities detected</p>
                    <p className="text-xs text-muted-foreground mt-1">Try running Copula analysis first, then click Detect Edges</p>
                  </div>
                )
              ) : (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <Zap className="h-12 w-12 text-muted-foreground/30 mb-3" />
                  <p className="text-sm text-muted-foreground">Click &quot;Detect Edges&quot; to find trading opportunities</p>
                  <p className="text-xs text-muted-foreground mt-1">Edge detection uses tail dependence from the Student-t Copula — it will auto-run Copula if not yet available</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
