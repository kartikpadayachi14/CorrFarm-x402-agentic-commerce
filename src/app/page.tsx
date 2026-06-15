'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Network, BarChart3, TrendingUp, Shield, Zap,
  ArrowRight, Activity, Coins, Globe, RefreshCw, Loader2, Target,
  Server, CheckCircle2, AlertCircle, Cpu, Wallet, Sparkles,
  Radio, Eye, Link2, Brain, MessageSquare, Scale, Heart,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

// Types
interface MarketOverview {
  symbol: string;
  lastPrice: number;
  priceChangePercent: number;
  quoteVolume: number;
}

interface CorrelationSummary {
  averageCorrelation: number;
  marketRegime: string;
  regimeDescription: string;
  medianCorrelation?: number;
  highCorrelationPairs: { assetA: string; assetB: string; correlation: number }[];
}

// Heatmap helpers
function correlationToColor(value: number): string {
  const abs = Math.abs(value);
  if (value >= 0) {
    const g = Math.round(80 + abs * 175);
    const r = Math.round(40 - abs * 20);
    return `rgb(${Math.max(0, r)}, ${g}, ${Math.max(0, r)})`;
  } else {
    const r = Math.round(80 + abs * 175);
    const g = Math.round(40 - abs * 20);
    return `rgb(${r}, ${Math.max(0, g)}, ${Math.max(0, g)})`;
  }
}

function fmt(name: string): string {
  return name.replace('USDT', '').toUpperCase().slice(0, 5);
}

export default function DashboardPage() {
  const [markets, setMarkets] = useState<MarketOverview[]>([]);
  const [correlationSummary, setCorrelationSummary] = useState<CorrelationSummary | null>(null);
  const [correlationMatrix, setCorrelationMatrix] = useState<{ assets: string[]; matrix: number[][] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [matrixLoading, setMatrixLoading] = useState(false);
  const [systemStatus, setSystemStatus] = useState({
    testnet: true,
    usdcAsset: '10458941',
    walletConnected: false,
    llmAvailable: false,
    binanceConnected: false,
  });

  useEffect(() => {
    async function loadData() {
      try {
        // Load lightweight data first - defer heavy correlation matrix to user action
        const [marketsRes, healthRes] = await Promise.allSettled([
          fetch('/api/markets/overview').then(r => r.json()),
          fetch('/api/health').then(r => r.json()),
        ]);

        if (marketsRes.status === 'fulfilled' && marketsRes.value.success) {
          setMarkets(marketsRes.value.data || []);
          setSystemStatus(prev => ({ ...prev, binanceConnected: true }));
        }
        if (healthRes.status === 'fulfilled' && healthRes.value) {
          const h = healthRes.value;
          setSystemStatus(prev => ({
            ...prev,
            testnet: h.algorand?.connected ?? true,
            llmAvailable: h.llm?.available ?? false,
            binanceConnected: h.binance?.connected ?? prev.binanceConnected,
          }));
        }
      } catch (err) {
        console.error('Failed to load dashboard data:', err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  const refreshMatrix = async () => {
    setMatrixLoading(true);
    try {
      const res = await fetch('/api/correlation/matrix?coins=bitcoin,ethereum,solana,bnb,ripple,cardano,dogecoin,avalanche,polkadot,chainlink&days=30&method=pearson', {
        headers: { 'X-Bypass-Payment': 'true' },
      });
      const data = await res.json();
      if (data.success) {
        setCorrelationMatrix({ assets: data.data.coins || [], matrix: data.data.matrix?.matrix || data.data.matrix || [] });
        setCorrelationSummary(data.data.summary || null);
      }
    } catch { /* ignore */ }
    finally { setMatrixLoading(false); }
  };

  const regimeColor = correlationSummary?.marketRegime === 'high_correlation'
    ? 'text-red-400' : correlationSummary?.marketRegime === 'low_correlation'
    ? 'text-green-400' : 'text-amber-400';

  const regimeLabel = correlationSummary?.marketRegime === 'high_correlation'
    ? 'Risk-On / Risk-Off' : correlationSummary?.marketRegime === 'low_correlation'
    ? 'Diversified' : 'Moderate';

  // 9-dimension breakdown data
  const breakdownDimensions = [
    { label: 'Market Reaction', key: 'marketReaction', weight: '25%', icon: TrendingUp, color: 'text-amber-400', gradient: 'from-amber-500 to-orange-500' },
    { label: 'Financial NLP (FinBERT)', key: 'financialNLP', weight: '20%', icon: Brain, color: 'text-cyan-400', gradient: 'from-cyan-500 to-blue-500' },
    { label: 'Source Credibility', key: 'sourceCredibility', weight: '15%', icon: Shield, color: 'text-green-400', gradient: 'from-green-500 to-emerald-500' },
    { label: 'Social Propagation', key: 'socialPropagation', weight: '10%', icon: MessageSquare, color: 'text-purple-400', gradient: 'from-purple-500 to-violet-500' },
    { label: 'Sensationalism', key: 'sensationalism', weight: '8%', icon: AlertCircle, color: 'text-red-400', gradient: 'from-red-500 to-rose-500' },
    { label: 'Factual Consistency', key: 'factualConsistency', weight: '8%', icon: CheckCircle2, color: 'text-blue-400', gradient: 'from-blue-500 to-indigo-500' },
    { label: 'Source Reliability', key: 'sourceReliability', weight: '7%', icon: Server, color: 'text-emerald-400', gradient: 'from-emerald-500 to-teal-500' },
    { label: 'Emotional Manipulation', key: 'emotionalManipulation', weight: '4%', icon: Heart, color: 'text-orange-400', gradient: 'from-orange-500 to-red-500' },
    { label: 'Market Consistency', key: 'marketConsistency', weight: '3%', icon: Scale, color: 'text-yellow-400', gradient: 'from-yellow-500 to-amber-500' },
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      {/* Hero */}
      <div className="relative overflow-hidden rounded-2xl glass-amber glow-amber p-8 border-gradient">
        <div className="absolute -top-32 -right-32 h-64 w-64 rounded-full bg-amber-500/8 blur-3xl" />
        <div className="absolute -bottom-16 -left-16 h-48 w-48 rounded-full bg-orange-500/6 blur-3xl" />
        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 shadow-lg shadow-amber-500/30">
              <Network className="h-6 w-6 text-white" />
            </div>
            <div>
              <h1 className="text-3xl font-bold bg-gradient-to-r from-amber-400 via-orange-400 to-amber-500 bg-clip-text text-transparent text-glow-amber">
                CorrFarm
              </h1>
              <p className="text-xs text-amber-400/60 font-mono">Student-t Copula + DCC-GARCH + x402</p>
            </div>
            <Badge variant="secondary" className="ml-2 text-[10px] bg-amber-500/10 text-amber-400 border-amber-500/20 gap-1">
              <Sparkles className="h-2.5 w-2.5" />
              Hackathon Live
            </Badge>
          </div>
          <p className="text-base text-muted-foreground/80 max-w-2xl leading-relaxed">
            Crypto Correlation Pricing Engine — Predicted joint vs market-implied joint distributions.
            Detect mispriced correlations. Verify news credibility. Pay per compute with x402 on Algorand.
          </p>
          <div className="flex flex-wrap gap-3 mt-5">
            <Link href="/correlation">
              <Button className="gap-2 bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 text-white shadow-lg shadow-amber-500/20 hover:shadow-amber-500/30 transition-all hover:scale-[1.02]">
                <BarChart3 className="h-4 w-4" /> Run Correlation Analysis
              </Button>
            </Link>
            <Link href="/fake-news">
              <Button variant="outline" className="gap-2 border-white/10 hover:border-amber-500/30 hover:bg-amber-500/5 transition-all">
                <Shield className="h-4 w-4" /> Check News Credibility
              </Button>
            </Link>
            <Link href="/pricing">
              <Button variant="outline" className="gap-2 border-white/10 hover:border-amber-500/30 hover:bg-amber-500/5 transition-all">
                <Coins className="h-4 w-4" /> View Pricing
              </Button>
            </Link>
          </div>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="glass-card glass-hover rounded-xl p-4 flex items-center gap-3 transition-all duration-300 cursor-default">
          <div className="h-11 w-11 rounded-xl bg-cyan-500/10 flex items-center justify-center shrink-0 border border-cyan-500/10">
            <Activity className="h-5 w-5 text-cyan-400" />
          </div>
          <div>
            <p className="text-2xl font-bold tracking-tight">{markets.length}</p>
            <p className="text-[11px] text-muted-foreground">Live Markets</p>
          </div>
        </div>
        <div className="glass-card glass-hover rounded-xl p-4 flex items-center gap-3 transition-all duration-300 cursor-default">
          <div className="h-11 w-11 rounded-xl bg-amber-500/10 flex items-center justify-center shrink-0 border border-amber-500/10">
            <TrendingUp className="h-5 w-5 text-amber-400" />
          </div>
          <div>
            <p className="text-2xl font-bold tracking-tight">
              {correlationSummary ? correlationSummary.averageCorrelation.toFixed(2) : '-'}
            </p>
            <p className="text-[11px] text-muted-foreground">Avg Correlation</p>
          </div>
        </div>
        <div className="glass-card glass-hover rounded-xl p-4 flex items-center gap-3 transition-all duration-300 cursor-default">
          <div className="h-11 w-11 rounded-xl bg-green-500/10 flex items-center justify-center shrink-0 border border-green-500/10">
            <Globe className="h-5 w-5 text-green-400" />
          </div>
          <div>
            <p className={`text-2xl font-bold tracking-tight ${regimeColor}`}>{regimeLabel}</p>
            <p className="text-[11px] text-muted-foreground">Market Regime</p>
          </div>
        </div>
        <div className="glass-card glass-hover rounded-xl p-4 flex items-center gap-3 transition-all duration-300 cursor-default">
          <div className="h-11 w-11 rounded-xl bg-purple-500/10 flex items-center justify-center shrink-0 border border-purple-500/10">
            <Zap className="h-5 w-5 text-purple-400" />
          </div>
          <div>
            <p className="text-2xl font-bold tracking-tight bg-gradient-to-r from-amber-400 to-purple-400 bg-clip-text text-transparent">x402</p>
            <p className="text-[11px] text-muted-foreground">Algorand Testnet</p>
          </div>
        </div>
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Correlation Heatmap */}
        <div className="lg:col-span-2 space-y-6">
          <div className="glass-card rounded-xl overflow-hidden">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <BarChart3 className="h-5 w-5 text-amber-400" />
                    Correlation Heatmap <span className="text-xs font-normal text-muted-foreground">(30d)</span>
                  </CardTitle>
                  <CardDescription className="text-muted-foreground/60">Pearson correlation between top 10 crypto assets</CardDescription>
                </div>
                <Button variant="ghost" size="sm" onClick={refreshMatrix} disabled={matrixLoading} className="gap-1.5 hover:bg-white/5">
                  {matrixLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                  Refresh
                </Button>
              </div>
            </CardHeader>
            <CardContent className="pt-2">
              {loading ? (
                <div className="h-72 w-full rounded-lg shimmer" />
              ) : correlationMatrix && correlationMatrix.assets.length > 0 && Array.isArray(correlationMatrix.matrix) && correlationMatrix.matrix.length > 0 ? (
                <TooltipProvider delayDuration={100}>
                  <div className="overflow-x-auto">
                    <div className="inline-grid gap-0.5 min-w-fit" style={{ gridTemplateColumns: `60px repeat(${correlationMatrix.assets.length}, 1fr)` }}>
                      <div />
                      {correlationMatrix.assets.map((a) => (
                        <div key={`h-${a}`} className="text-[9px] text-muted-foreground/60 text-center truncate px-0.5 py-1 font-mono" style={{ minWidth: 36 }}>
                          {fmt(a)}
                        </div>
                      ))}
                      {correlationMatrix.assets.map((asset, i) => (
                        <React.Fragment key={`row-${i}`}>
                          <div className="text-[9px] text-muted-foreground/60 flex items-center justify-end pr-1 truncate font-mono">
                            {fmt(asset)}
                          </div>
                          {(Array.isArray(correlationMatrix.matrix[i]) ? correlationMatrix.matrix[i] : []).map((value: number, j: number) => (
                            <Tooltip key={`${i}-${j}`}>
                              <TooltipTrigger asChild>
                                <div
                                  className="rounded-sm cursor-pointer transition-all duration-150 hover:scale-110 hover:z-10 hover:ring-1 hover:ring-white/20 flex items-center justify-center"
                                  style={{ backgroundColor: correlationToColor(value || 0), minWidth: 36, minHeight: 36 }}
                                >
                                  <span className="text-[8px] font-medium text-white/80 drop-shadow-sm">
                                    {(value || 0).toFixed(2)}
                                  </span>
                                </div>
                              </TooltipTrigger>
                              <TooltipContent side="top" className="text-xs glass-strong border-white/10">
                                {fmt(correlationMatrix.assets[i])} vs {fmt(correlationMatrix.assets[j])}: {(value || 0).toFixed(4)}
                              </TooltipContent>
                            </Tooltip>
                          ))}
                        </React.Fragment>
                      ))}
                    </div>
                  </div>
                </TooltipProvider>
              ) : (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <BarChart3 className="h-12 w-12 text-muted-foreground/20 mb-3" />
                  <p className="text-sm text-muted-foreground/60">No correlation data available. Click Refresh to fetch.</p>
                </div>
              )}
            </CardContent>
          </div>

          {/* Market Overview Table */}
          <div className="glass-card rounded-xl overflow-hidden">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg flex items-center gap-2">
                <Globe className="h-5 w-5 text-cyan-400" />
                Market Overview
              </CardTitle>
              <CardDescription className="text-muted-foreground/60">Top crypto assets by 24h volume (Binance)</CardDescription>
            </CardHeader>
            <CardContent className="pt-2">
              {loading ? (
                <div className="space-y-2">{[1, 2, 3, 4, 5].map((i) => <div key={i} className="h-10 w-full rounded-lg shimmer" />)}</div>
              ) : markets.length > 0 ? (
                <div className="overflow-x-auto max-h-[320px] overflow-y-auto">
                  <table className="text-xs w-full">
                    <thead className="sticky top-0 z-10">
                      <tr className="border-b border-white/5 bg-[oklch(0.16_0.008_285)]/95 backdrop-blur-sm">
                        <th className="text-left py-2.5 px-3 text-muted-foreground/60 font-medium">Symbol</th>
                        <th className="text-right py-2.5 px-3 text-muted-foreground/60 font-medium">Price</th>
                        <th className="text-right py-2.5 px-3 text-muted-foreground/60 font-medium">24h Change</th>
                        <th className="text-right py-2.5 px-3 text-muted-foreground/60 font-medium">Volume</th>
                      </tr>
                    </thead>
                    <tbody>
                      {markets.slice(0, 15).map((m) => (
                        <tr key={m.symbol} className="border-b border-white/3 hover:bg-white/3 transition-colors">
                          <td className="py-2.5 px-3 font-mono font-medium">{fmt(m.symbol)}</td>
                          <td className="py-2.5 px-3 text-right font-mono text-muted-foreground">${m.lastPrice?.toLocaleString(undefined, { maximumFractionDigits: 2 })}</td>
                          <td className={`py-2.5 px-3 text-right font-mono font-medium ${(m.priceChangePercent || 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                            {(m.priceChangePercent || 0) >= 0 ? '+' : ''}{(m.priceChangePercent || 0).toFixed(2)}%
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono text-muted-foreground">${((m.quoteVolume || 0) / 1e6).toFixed(1)}M</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground/60 text-center py-8">No market data available</p>
              )}
            </CardContent>
          </div>
        </div>

        {/* Right Column */}
        <div className="space-y-6">
          {/* System Status */}
          <div className="glass-card rounded-xl overflow-hidden border-gradient">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg flex items-center gap-2">
                <Server className="h-5 w-5 text-amber-400" />
                System Status
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {[
                { icon: <div className={`h-2 w-2 rounded-full ${systemStatus.testnet ? 'bg-green-400 pulse-dot' : 'bg-red-400'}`} />, label: 'Algorand Testnet', value: systemStatus.testnet ? 'Connected' : 'Disconnected', color: systemStatus.testnet ? 'text-green-400' : 'text-red-400' },
                { icon: <Coins className="h-3.5 w-3.5 text-amber-400" />, label: 'USDC Asset', value: `#${systemStatus.usdcAsset}`, color: 'text-amber-400' },
                { icon: <Wallet className="h-3.5 w-3.5 text-amber-400" />, label: 'Wallet', value: systemStatus.walletConnected ? 'Connected' : 'Not Connected', color: systemStatus.walletConnected ? 'text-green-400' : 'text-muted-foreground' },
                { icon: <Cpu className="h-3.5 w-3.5 text-amber-400" />, label: 'LLM Engine', value: systemStatus.llmAvailable ? 'Active (LLM)' : 'Heuristic Fallback', color: systemStatus.llmAvailable ? 'text-green-400' : 'text-amber-400' },
                { icon: <Globe className="h-3.5 w-3.5 text-amber-400" />, label: 'Binance API', value: systemStatus.binanceConnected ? 'Connected' : 'Disconnected', color: systemStatus.binanceConnected ? 'text-green-400' : 'text-red-400' },
                { icon: <Zap className="h-3.5 w-3.5 text-amber-400" />, label: 'x402 Payments', value: 'Active', color: 'text-green-400' },
              ].map((item, i) => (
                <div key={i} className="flex items-center justify-between p-2.5 rounded-lg glass transition-colors hover:bg-white/4">
                  <div className="flex items-center gap-2.5">
                    {item.icon}
                    <span className="text-sm">{item.label}</span>
                  </div>
                  <span className={`text-[10px] font-medium ${item.color}`}>{item.value}</span>
                </div>
              ))}
            </CardContent>
          </div>

          {/* 9-Dimension Credibility Breakdown */}
          <div className="glass-card rounded-xl overflow-hidden border-gradient">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg flex items-center gap-2">
                <Shield className="h-5 w-5 text-amber-400" />
                9-Dimension Analysis
              </CardTitle>
              <CardDescription className="text-muted-foreground/60">Credibility scoring breakdown with weights</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2.5">
              {breakdownDimensions.map((dim) => (
                <div key={dim.key} className="flex items-center gap-2 group">
                  <dim.icon className={`h-3.5 w-3.5 shrink-0 ${dim.color} transition-transform group-hover:scale-110`} />
                  <span className="text-[11px] text-muted-foreground w-36 truncate">{dim.label}</span>
                  <div className="flex-1 h-1.5 bg-white/5 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full bg-gradient-to-r ${dim.gradient} transition-all duration-500`}
                      style={{ width: dim.weight.replace('%', '') }}
                    />
                  </div>
                  <span className="text-[10px] font-mono text-muted-foreground/60 w-8 text-right">{dim.weight}</span>
                </div>
              ))}
              <div className="pt-3 mt-2 border-t border-white/5">
                <Link href="/fake-news" className="text-xs text-amber-400 hover:text-amber-300 flex items-center gap-1.5 transition-colors group">
                  Try full credibility analysis
                  <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
                </Link>
              </div>
            </CardContent>
          </div>

          {/* Market Regime */}
          <div className="glass-card rounded-xl overflow-hidden">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg flex items-center gap-2">
                <Activity className="h-5 w-5 text-amber-400" />
                Market Regime
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {correlationSummary ? (
                <>
                  <div className="text-center p-5 rounded-xl glass glow-amber-sm">
                    <p className={`text-3xl font-bold ${regimeColor} tracking-tight`}>{regimeLabel}</p>
                    <p className="text-xs text-muted-foreground/60 mt-1.5 leading-relaxed">{correlationSummary.regimeDescription}</p>
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div className="rounded-xl glass p-3">
                      <p className="text-muted-foreground/60 text-[10px]">Avg Corr</p>
                      <p className="text-lg font-bold tracking-tight">{correlationSummary.averageCorrelation.toFixed(3)}</p>
                    </div>
                    <div className="rounded-xl glass p-3">
                      <p className="text-muted-foreground/60 text-[10px]">Median</p>
                      <p className="text-lg font-bold tracking-tight">{correlationSummary.medianCorrelation?.toFixed(3) || '-'}</p>
                    </div>
                  </div>
                </>
              ) : (
                <div className="text-center py-6">
                  <div className="h-8 w-8 rounded-full border-2 border-amber-400/30 border-t-amber-400 animate-spin mx-auto mb-3" />
                  <p className="text-sm text-muted-foreground/60">Loading regime data...</p>
                </div>
              )}
            </CardContent>
          </div>

          {/* Top Correlated Pairs */}
          <div className="glass-card rounded-xl overflow-hidden">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-green-400" />
                Top Correlated Pairs
              </CardTitle>
            </CardHeader>
            <CardContent>
              {correlationSummary?.highCorrelationPairs?.length ? (
                <div className="space-y-1.5">
                  {correlationSummary.highCorrelationPairs.slice(0, 6).map((pair, i) => (
                    <div key={i} className="flex items-center justify-between p-2.5 rounded-lg glass glass-hover transition-all duration-200">
                      <div className="flex items-center gap-2 min-w-0">
                        <Badge variant="secondary" className="text-[10px] shrink-0 bg-white/5 border-white/10 font-mono">{fmt(pair.assetA)}</Badge>
                        <span className="text-muted-foreground/40 text-xs">/</span>
                        <Badge variant="secondary" className="text-[10px] shrink-0 bg-white/5 border-white/10 font-mono">{fmt(pair.assetB)}</Badge>
                      </div>
                      <span className="text-sm font-mono font-bold text-amber-400 shrink-0">
                        {pair.correlation.toFixed(3)}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground/60 text-center py-4">No pair data yet</p>
              )}
            </CardContent>
          </div>

          {/* Quick Actions */}
          <div className="glass-card rounded-xl overflow-hidden">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">Quick Actions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {[
                { href: '/correlation', icon: BarChart3, title: 'Correlation Engine', desc: 'Matrix, Copula, DCC-GARCH' },
                { href: '/fake-news', icon: Shield, title: 'Credibility Detector', desc: '9-dimension fake news analysis' },
                { href: '/markets', icon: Target, title: 'Markets', desc: 'Alpha Arcade opportunities' },
                { href: '/pricing', icon: Coins, title: 'Pricing & x402', desc: 'Micropayment access' },
              ].map((action) => (
                <Link key={action.href} href={action.href} className="block">
                  <div className="flex items-center justify-between p-3 rounded-xl glass glass-hover transition-all duration-200 group cursor-pointer">
                    <div className="flex items-center gap-3">
                      <div className="h-9 w-9 rounded-lg bg-amber-500/10 flex items-center justify-center border border-amber-500/10 group-hover:border-amber-500/20 transition-colors">
                        <action.icon className="h-4.5 w-4.5 text-amber-400" />
                      </div>
                      <div>
                        <p className="text-sm font-medium">{action.title}</p>
                        <p className="text-[11px] text-muted-foreground/60">{action.desc}</p>
                      </div>
                    </div>
                    <ArrowRight className="h-4 w-4 text-muted-foreground/30 group-hover:text-amber-400 group-hover:translate-x-0.5 transition-all" />
                  </div>
                </Link>
              ))}
            </CardContent>
          </div>
        </div>
      </div>
    </div>
  );
}
