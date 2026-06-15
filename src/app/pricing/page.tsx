'use client';

import { useState } from 'react';
import {
  CreditCard, Zap, Check, Wallet, ArrowRight, Server,
  ShieldCheck, Globe, Layers, Loader2, Info, Copy,
  CheckCircle2, ExternalLink, Activity,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useWallet, type PaymentRecord } from '@/contexts/wallet-context';
import { useToast } from '@/hooks/use-toast';

const USDC_ASSET_ID = 10458941;

const TIERS = [
  { key: 'correlation_matrix', label: 'Correlation Matrix', price: '$0.05', microUsdc: 50_000, desc: 'Full NxN correlation matrix with Pearson/Spearman/Kendall', icon: '📊' },
  { key: 'pair_correlation', label: 'Pair Analysis', price: '$0.02', microUsdc: 20_000, desc: 'Pairwise correlation with p-value and rolling window', icon: '🔗' },
  { key: 'copula_analysis', label: 'Copula Analysis', price: '$0.10', microUsdc: 100_000, desc: 'Student-t copula estimation with tail dependence', icon: '📈' },
  { key: 'dcc_garch', label: 'DCC-GARCH', price: '$0.10', microUsdc: 100_000, desc: 'Dynamic conditional correlation & volatility modeling', icon: '⚡' },
  { key: 'credibility_score', label: 'Credibility Check', price: '$0.03', microUsdc: 30_000, desc: '9-dimension credibility analysis of text/URL', icon: '🛡️' },
  { key: 'news_analysis', label: 'News Analysis', price: '$0.05', microUsdc: 50_000, desc: 'Batch crypto news analysis with scoring', icon: '📰' },
];

const FULL_ACCESS = {
  key: 'full_access',
  label: 'Full Access Pass',
  price: '$0.25',
  microUsdc: 250_000,
  desc: '24h unlimited access to all endpoints',
  icon: '🔓',
};

function TxIdDisplay({ txId }: { txId: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(txId).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <div className="flex items-center gap-1.5 text-[10px] font-mono bg-green-500/10 border border-green-500/20 rounded px-2 py-1">
      <CheckCircle2 className="h-3 w-3 text-green-400 shrink-0" />
      <span className="text-green-400 truncate max-w-[160px]" title={txId}>{txId}</span>
      <button onClick={copy} className="text-muted-foreground hover:text-foreground shrink-0">
        {copied ? <CheckCircle2 className="h-3 w-3 text-green-400" /> : <Copy className="h-3 w-3" />}
      </button>
    </div>
  );
}

export default function PricingPage() {
  const { isConnected, address, payForResource, hasAccess, payments } = useWallet();
  const { toast } = useToast();
  const [paying, setPaying] = useState<string | null>(null);
  const [txIds, setTxIds] = useState<Record<string, string>>({});

  const handlePay = async (resource: string) => {
    if (!isConnected) {
      toast({
        title: 'Connect your wallet first',
        description: 'Use the "Connect Wallet" button in the navbar.',
        variant: 'destructive',
      });
      return;
    }
    if (hasAccess(resource)) {
      toast({ title: 'Already have access', description: `${resource.replace(/_/g, ' ')} is still active.` });
      return;
    }
    setPaying(resource);
    const tier = [...TIERS, FULL_ACCESS].find(t => t.key === resource);
    toast({
      title: '⚡ x402 Payment Initiating',
      description: `${tier?.label} · ${tier?.price} USDC · Algorand Testnet...`,
    });
    try {
      const result = await payForResource(resource);
      if (result) {
        setTxIds(prev => ({ ...prev, [resource]: result.txId }));
        toast({
          title: '✅ Payment Confirmed on Algorand',
          description: `TxID: ${result.txId}`,
        });
      } else {
        toast({ title: '❌ Payment failed', variant: 'destructive' });
      }
    } finally {
      setPaying(null);
    }
  };

  const recentPayments = payments.filter(p => new Date(p.expiresAt) > new Date());

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <CreditCard className="h-6 w-6 text-amber-400" />
          Pricing & Payments
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Pay per query with x402 micropayments on Algorand testnet
        </p>
      </div>

      {/* Wallet status */}
      <Card className={isConnected ? 'border-green-500/30 bg-green-500/5' : 'border-amber-500/30 bg-amber-500/5'}>
        <CardContent className="p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${isConnected ? 'bg-green-500/20' : 'bg-amber-500/20'}`}>
              <Wallet className={`h-5 w-5 ${isConnected ? 'text-green-400' : 'text-amber-400'}`} />
            </div>
            <div>
              {isConnected && address ? (
                <>
                  <p className="font-semibold text-green-400 text-sm">Wallet Connected</p>
                  <p className="text-xs text-muted-foreground font-mono">{address.slice(0, 16)}...{address.slice(-8)}</p>
                </>
              ) : (
                <>
                  <p className="font-semibold text-amber-400 text-sm">No Wallet Connected</p>
                  <p className="text-xs text-muted-foreground">Connect your wallet in the navbar to enable auto-payments.</p>
                </>
              )}
            </div>
          </div>
          <div className="flex items-center gap-3 text-xs flex-wrap">
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-muted/50">
              <span className="text-muted-foreground">USDC Asset:</span>
              <span className="font-mono font-bold text-amber-400">#{USDC_ASSET_ID}</span>
            </div>
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-muted/50">
              <div className="h-1.5 w-1.5 rounded-full bg-green-400 animate-pulse" />
              <span>Algorand Testnet</span>
            </div>
            {recentPayments.length > 0 && (
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-green-500/10">
                <Activity className="h-3 w-3 text-green-400" />
                <span className="text-green-400">{recentPayments.length} active</span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Free tier */}
      <Card className="border-green-500/30 bg-green-500/5">
        <CardContent className="p-4 flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-green-400">Free Tier</h3>
            <p className="text-xs text-muted-foreground">Market overview, basic price data, dashboard access</p>
          </div>
          <Badge variant="secondary" className="bg-green-500/20 text-green-400 border-green-500/30">Free</Badge>
        </CardContent>
      </Card>

      {/* Pricing grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {TIERS.map((tier) => {
          const granted = hasAccess(tier.key);
          const isPaying = paying === tier.key;
          const txId = txIds[tier.key];
          return (
            <Card key={tier.key} className={`group transition-all hover:shadow-lg ${granted ? 'border-green-500/40 bg-green-500/5' : 'hover:border-amber-500/30 hover:shadow-amber-500/5'}`}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">{tier.icon}</span>
                    <CardTitle className="text-base">{tier.label}</CardTitle>
                  </div>
                  {granted && <Badge className="bg-green-500/20 text-green-400 border-green-500/30 text-[10px]">Active</Badge>}
                </div>
                <CardDescription className="text-xs">{tier.desc}</CardDescription>
              </CardHeader>
              <CardContent className="pb-3">
                <div className="flex items-baseline gap-1">
                  <span className="text-3xl font-bold text-amber-400">{tier.price}</span>
                  <span className="text-xs text-muted-foreground">per access</span>
                </div>
                <p className="text-[10px] text-muted-foreground mt-1 font-mono">
                  {(tier.microUsdc / 1_000_000).toFixed(2)} USDC · Asset #{USDC_ASSET_ID}
                </p>
                {txId && <TxIdDisplay txId={txId} />}
              </CardContent>
              <CardFooter>
                <Button
                  size="sm"
                  className={`w-full gap-1.5 ${granted ? 'bg-green-500/20 text-green-400 border border-green-500/30 hover:bg-green-500/30' : 'bg-gradient-to-r from-amber-500 to-orange-600 text-white hover:from-amber-600 hover:to-orange-700'}`}
                  onClick={() => handlePay(tier.key)}
                  disabled={isPaying || granted}
                >
                  {isPaying ? (
                    <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Sending USDC...</>
                  ) : granted ? (
                    <><CheckCircle2 className="h-3.5 w-3.5" /> Access Granted</>
                  ) : (
                    <><Zap className="h-3.5 w-3.5" /> Pay with x402</>
                  )}
                </Button>
              </CardFooter>
            </Card>
          );
        })}

        {/* Full Access Pass */}
        {(() => {
          const granted = hasAccess(FULL_ACCESS.key);
          const isPaying = paying === FULL_ACCESS.key;
          const txId = txIds[FULL_ACCESS.key];
          return (
            <Card className={`relative overflow-hidden col-span-full sm:col-span-2 lg:col-span-1 transition-all ${granted ? 'border-green-500/40 bg-green-500/5' : 'border-amber-500/50 hover:shadow-xl hover:shadow-amber-500/10'}`}>
              {!granted && <div className="absolute top-3 right-3"><Badge className="bg-amber-500 text-white">Best Value</Badge></div>}
              {granted && <div className="absolute top-3 right-3"><Badge className="bg-green-500 text-white">Active</Badge></div>}
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                  <span className="text-lg">{FULL_ACCESS.icon}</span>
                  <CardTitle className="text-base">{FULL_ACCESS.label}</CardTitle>
                </div>
                <CardDescription className="text-xs">{FULL_ACCESS.desc}</CardDescription>
              </CardHeader>
              <CardContent className="pb-3">
                <div className="flex items-baseline gap-1">
                  <span className="text-3xl font-bold text-amber-400">{FULL_ACCESS.price}</span>
                  <span className="text-xs text-muted-foreground">24h pass</span>
                </div>
                <p className="text-[10px] text-muted-foreground mt-1 font-mono">
                  {(FULL_ACCESS.microUsdc / 1_000_000).toFixed(2)} USDC · Asset #{USDC_ASSET_ID}
                </p>
                <div className="mt-3 space-y-1">
                  {TIERS.map((t) => (
                    <div key={t.key} className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                      <Check className="h-3 w-3 text-green-400" />
                      <span>{t.label}</span>
                    </div>
                  ))}
                </div>
                {txId && <div className="mt-2"><TxIdDisplay txId={txId} /></div>}
              </CardContent>
              <CardFooter>
                <Button
                  size="sm"
                  className={`w-full gap-1.5 ${granted ? 'bg-green-500/20 text-green-400 border border-green-500/30 hover:bg-green-500/30' : 'bg-gradient-to-r from-amber-500 to-orange-600 text-white hover:from-amber-600 hover:to-orange-700'}`}
                  onClick={() => handlePay(FULL_ACCESS.key)}
                  disabled={isPaying || granted}
                >
                  {isPaying ? (
                    <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Sending USDC...</>
                  ) : granted ? (
                    <><CheckCircle2 className="h-3.5 w-3.5" /> Access Granted</>
                  ) : (
                    <><Zap className="h-3.5 w-3.5" /> Pay {FULL_ACCESS.price} via x402</>
                  )}
                </Button>
              </CardFooter>
            </Card>
          );
        })()}
      </div>

      {/* Active payments */}
      {recentPayments.length > 0 && (
        <Card className="border-green-500/20">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Activity className="h-4 w-4 text-green-400" />
              Active Payments ({recentPayments.length})
            </CardTitle>
            <CardDescription className="text-xs">On-chain transaction records · Algorand Testnet</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {recentPayments.map((p, i) => (
                <div key={i} className="flex items-center justify-between p-2.5 rounded-lg bg-white/3 border border-white/5">
                  <div className="flex items-center gap-2 min-w-0">
                    <CheckCircle2 className="h-4 w-4 text-green-400 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-xs font-medium capitalize">{p.resource.replace(/_/g, ' ')}</p>
                      <p className="text-[10px] font-mono text-muted-foreground truncate max-w-[200px]">{p.txId}</p>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-[10px] text-amber-400">{(p.amount / 1_000_000).toFixed(2)} USDC</p>
                    <p className="text-[9px] text-muted-foreground">
                      Expires {new Date(p.expiresAt).toLocaleTimeString()}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* x402 Architecture */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">x402 Payment Architecture</CardTitle>
          <CardDescription>How micropayments flow through the x402 protocol on Algorand</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col md:flex-row items-center justify-center gap-4 py-6">
            {[
              { icon: Wallet, label: 'Your Wallet', desc: 'Pera Wallet · Algorand', color: 'amber' },
              { icon: Server, label: 'x402 Facilitator', desc: 'HTTP 402 + USDC', color: 'orange' },
              { icon: ShieldCheck, label: 'Algorand', desc: 'On-chain verification', color: 'green' },
            ].map((step, i) => (
              <div key={i} className="contents">
                {i > 0 && <ArrowRight className="h-5 w-5 text-amber-400 rotate-90 md:rotate-0" />}
                <div className={`flex flex-col items-center gap-2 p-4 rounded-lg border border-${step.color}-500/30 bg-${step.color}-500/5 min-w-[140px]`}>
                  <div className={`flex h-10 w-10 items-center justify-center rounded-full bg-${step.color}-500/20`}>
                    <step.icon className={`h-5 w-5 text-${step.color}-400`} />
                  </div>
                  <p className="text-sm font-medium">{step.label}</p>
                  <p className="text-[10px] text-muted-foreground text-center">{step.desc}</p>
                </div>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs text-muted-foreground">
            <div className="rounded-md bg-muted/50 p-3">
              <p className="font-medium text-foreground mb-1">1. Request Access</p>
              Client requests a resource. Receives HTTP 402 with payment instructions.
            </div>
            <div className="rounded-md bg-muted/50 p-3">
              <p className="font-medium text-foreground mb-1">2. Send Payment</p>
              Client sends USDC (Asset #{USDC_ASSET_ID}) on Algorand Testnet. Transaction verified on-chain.
            </div>
            <div className="rounded-md bg-muted/50 p-3">
              <p className="font-medium text-foreground mb-1">3. Access Granted</p>
              Server verifies txId. Returns HTTP 200 with data. TxID shown to user.
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
