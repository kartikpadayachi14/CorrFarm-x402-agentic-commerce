'use client';

import { type ReactNode, useState, useCallback } from 'react';
import { Loader2, Zap, Wallet, Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useX402 } from '@/hooks/use-x402';
import { useWallet } from '@/contexts/wallet-context';

interface PaywallGateProps {
  resource: string;
  children: ReactNode;
  /** If true, children always render but a payment indicator appears */
  softGate?: boolean;
}

const RESOURCE_LABELS: Record<string, string> = {
  correlation_matrix: 'Correlation Matrix',
  pair_correlation: 'Pair Analysis',
  copula_analysis: 'Copula Analysis',
  dcc_garch: 'DCC-GARCH',
  credibility_score: 'Credibility Check',
  news_analysis: 'News Analysis',
  alpha_markets: 'Alpha Markets',
  alpha_opportunities: 'Opportunities',
  full_access: 'Full Access Pass',
};

const RESOURCE_PRICES: Record<string, string> = {
  correlation_matrix: '$0.05',
  pair_correlation: '$0.02',
  copula_analysis: '$0.10',
  dcc_garch: '$0.10',
  credibility_score: '$0.03',
  news_analysis: '$0.05',
  alpha_markets: '$0.03',
  alpha_opportunities: '$0.08',
  full_access: '$0.25',
};

export function PaywallGate({ resource, children, softGate = false }: PaywallGateProps) {
  const { isGranted, isPaying, lastTxId, ensureAccess } = useX402(resource);
  const { isConnected } = useWallet();

  // In soft gate or bypass mode, always show children
  if (softGate || isGranted) {
    return <>{children}</>;
  }

  // Blocked — show payment prompt
  return (
    <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-6 text-center space-y-4">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-500/10 border border-amber-500/20 mx-auto">
        <Lock className="h-5 w-5 text-amber-400" />
      </div>
      <div>
        <p className="font-semibold text-sm">
          {RESOURCE_LABELS[resource] ?? resource} — Premium Access
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          Pay {RESOURCE_PRICES[resource] ?? '?'} USDC via x402 on Algorand Testnet to access this feature.
        </p>
      </div>

      {!isConnected ? (
        <p className="text-xs text-amber-400">Connect your wallet in the navbar to pay automatically.</p>
      ) : (
        <Button
          size="sm"
          onClick={ensureAccess}
          disabled={isPaying}
          className="gap-2 bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 text-white"
        >
          {isPaying ? (
            <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Sending USDC...</>
          ) : (
            <><Zap className="h-3.5 w-3.5" /> Pay {RESOURCE_PRICES[resource]} via x402</>
          )}
        </Button>
      )}

      {lastTxId && (
        <p className="text-[10px] text-green-400 font-mono">
          TxID: {lastTxId}
        </p>
      )}
    </div>
  );
}
