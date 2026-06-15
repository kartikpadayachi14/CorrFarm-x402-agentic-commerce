'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

export interface PaymentRecord {
  resource: string;
  txId: string;
  sessionId: string;
  expiresAt: string;
  paidAt: string;
  amount: number; // micro-USDC
  explorerUrl?: string;
  mode?: 'demo' | 'onchain';
}

interface PayResult {
  txId: string;
  expiresAt: string;
  sessionId: string;
  mode: 'demo' | 'onchain';
  explorerUrl?: string;
  amountAlgo?: string;
}

interface WalletContextType {
  address: string | null;
  isConnected: boolean;
  connect: (address: string) => void;
  disconnect: () => void;
  payments: PaymentRecord[];
  payForResource: (resource: string) => Promise<PayResult | null>;
  hasAccess: (resource: string) => boolean;
  totalPayments: number;
  latestTxId: string | null;
  demoMode: boolean;
  setDemoMode: (v: boolean) => void;
  lastPayError: string | null;
}

const WalletContext = createContext<WalletContextType | null>(null);

const WALLET_KEY = 'corrfarm_wallet_v2';
const PAYMENTS_KEY = 'corrfarm_payments_v2';
const DEMO_MODE_KEY = 'corrfarm_demo_mode_v2';

const RESOURCE_AMOUNTS: Record<string, number> = {
  correlation_matrix: 50_000,
  pair_correlation: 20_000,
  copula_analysis: 100_000,
  dcc_garch: 100_000,
  credibility_score: 30_000,
  news_analysis: 50_000,
  alpha_markets: 30_000,
  alpha_opportunities: 80_000,
  full_access: 250_000,
};

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const [address, setAddress] = useState<string | null>(null);
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [latestTxId, setLatestTxId] = useState<string | null>(null);
  const [demoMode, setDemoModeState] = useState<boolean>(true);
  const [lastPayError, setLastPayError] = useState<string | null>(null);

  // Hydrate from localStorage
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const storedAddr = localStorage.getItem(WALLET_KEY);
      if (storedAddr) setAddress(storedAddr);
      const storedPayments = localStorage.getItem(PAYMENTS_KEY);
      if (storedPayments) setPayments(JSON.parse(storedPayments));
      const storedDemo = localStorage.getItem(DEMO_MODE_KEY);
      if (storedDemo !== null) setDemoModeState(storedDemo === 'true');
    } catch { /* ignore */ }
  }, []);

  const setDemoMode = useCallback((v: boolean) => {
    setDemoModeState(v);
    if (typeof window !== 'undefined') localStorage.setItem(DEMO_MODE_KEY, String(v));
  }, []);

  const connect = useCallback((addr: string) => {
    const trimmed = addr.trim();
    setAddress(trimmed);
    if (typeof window !== 'undefined') {
      localStorage.setItem(WALLET_KEY, trimmed);
    }
  }, []);

  const disconnect = useCallback(() => {
    setAddress(null);
    if (typeof window !== 'undefined') {
      localStorage.removeItem(WALLET_KEY);
    }
  }, []);

  const hasAccess = useCallback((resource: string): boolean => {
    const payment = payments.find(p => p.resource === resource);
    if (!payment) return false;
    return new Date(payment.expiresAt) > new Date();
  }, [payments]);

  const payForResource = useCallback(async (
    resource: string
  ): Promise<PayResult | null> => {
    setLastPayError(null);
    const endpoint = demoMode ? '/api/x402/demo-pay' : '/api/x402/pay';
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resource }),
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        setLastPayError(data?.error || `Payment failed (${res.status})`);
        return null;
      }

      if (data.data?.verification?.valid) {
        const record: PaymentRecord = {
          resource,
          txId: data.data.txId,
          sessionId: data.data.sessionId,
          expiresAt: data.data.verification.expiresAt,
          paidAt: new Date().toISOString(),
          amount: RESOURCE_AMOUNTS[resource] ?? 0,
          explorerUrl: data.data.chain?.explorerUrl,
          mode: data.data.mode === 'onchain' ? 'onchain' : 'demo',
        };
        const updated = [
          ...payments.filter(p => p.resource !== resource),
          record,
        ];
        setPayments(updated);
        setLatestTxId(data.data.txId);
        if (typeof window !== 'undefined') {
          localStorage.setItem(PAYMENTS_KEY, JSON.stringify(updated));
        }
        return {
          txId: data.data.txId,
          expiresAt: data.data.verification.expiresAt,
          sessionId: data.data.sessionId,
          mode: data.data.mode === 'onchain' ? 'onchain' : 'demo',
          explorerUrl: data.data.chain?.explorerUrl,
          amountAlgo: data.data.chain?.amountAlgo,
        };
      }
      setLastPayError('Payment could not be verified');
      return null;
    } catch (e) {
      setLastPayError(e instanceof Error ? e.message : 'Payment request failed');
      return null;
    }
  }, [payments, demoMode]);

  const totalPayments = payments.filter(p => new Date(p.expiresAt) > new Date()).length;

  return (
    <WalletContext.Provider value={{
      address,
      isConnected: !!address,
      connect,
      disconnect,
      payments,
      payForResource,
      hasAccess,
      totalPayments,
      latestTxId,
      demoMode,
      setDemoMode,
      lastPayError,
    }}>
      {children}
    </WalletContext.Provider>
  );
}

export function useWallet() {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error('useWallet must be used within WalletProvider');
  return ctx;
}
