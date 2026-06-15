'use client';

import { useState, useCallback } from 'react';
import { useWallet } from '@/contexts/wallet-context';
import { useToast } from '@/hooks/use-toast';

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

/**
 * Hook for x402 micropayments. Automatically handles payment when
 * ensureAccess() is called — no user confirmation needed if wallet is connected.
 */
export function useX402(resource: string) {
  const { isConnected, hasAccess, payForResource } = useWallet();
  const { toast } = useToast();
  const [isPaying, setIsPaying] = useState(false);
  const [lastTxId, setLastTxId] = useState<string | null>(null);

  const ensureAccess = useCallback(async (): Promise<boolean> => {
    if (hasAccess(resource)) return true;

    setIsPaying(true);
    const label = RESOURCE_LABELS[resource] ?? resource;
    const price = RESOURCE_PRICES[resource] ?? '?';

    toast({
      title: '⚡ x402 Payment Sending',
      description: `${label} · ${price} USDC on Algorand Testnet...`,
    });

    try {
      const result = await payForResource(resource);
      if (result) {
        setLastTxId(result.txId);
        toast({
          title: '✅ Payment Confirmed',
          description: `TxID: ${result.txId}`,
        });
        return true;
      }
      toast({
        title: '❌ Payment Failed',
        description: 'Connect your wallet and try again.',
        variant: 'destructive',
      });
      return false;
    } finally {
      setIsPaying(false);
    }
  }, [resource, hasAccess, payForResource, toast]);

  return {
    isGranted: hasAccess(resource),
    isPaying,
    lastTxId,
    ensureAccess,
    isConnected,
  };
}
