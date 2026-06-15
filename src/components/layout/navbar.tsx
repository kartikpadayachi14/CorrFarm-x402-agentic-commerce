'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, useCallback } from 'react';
import {
  Network, Menu, X, Wallet, Settings, Zap, Copy, CheckCircle2,
  LogOut, ChevronDown, ExternalLink, Shield,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { useWallet } from '@/contexts/wallet-context';
import { useToast } from '@/hooks/use-toast';

const navLinks = [
  { href: '/', label: 'Dashboard' },
  { href: '/correlation', label: 'Correlation' },
  { href: '/markets', label: 'Alpha Arcade' },
  { href: '/fake-news', label: 'Trust Check' },
  { href: '/pricing', label: 'Pricing & x402' },
];

function shortAddress(addr: string): string {
  if (addr.length <= 12) return addr;
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(text).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button onClick={copy} className="text-muted-foreground hover:text-foreground transition-colors">
      {copied ? <CheckCircle2 className="h-3.5 w-3.5 text-green-400" /> : <Copy className="h-3.5 w-3.5" />}
    </button>
  );
}

export function Navbar() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [connectOpen, setConnectOpen] = useState(false);
  const [walletInput, setWalletInput] = useState('');
  const [walletDropOpen, setWalletDropOpen] = useState(false);
  const { address, isConnected, connect, disconnect, totalPayments, payments, demoMode, setDemoMode } = useWallet();
  const { toast } = useToast();
  const [agent, setAgent] = useState<{ funded: boolean; balanceAlgo: string; address: string | null; faucetUrl?: string; perPaymentAlgo: string } | null>(null);

  const refreshAgent = useCallback(() => {
    fetch('/api/x402/agent').then(r => r.json()).then(d => { if (d.success) setAgent(d.data); }).catch(() => {});
  }, []);

  const handleConnect = () => {
    const trimmed = walletInput.trim();
    if (!trimmed) {
      toast({ title: 'Enter a wallet address', variant: 'destructive' });
      return;
    }
    connect(trimmed);
    setConnectOpen(false);
    setWalletInput('');
    toast({
      title: '✅ Wallet Connected',
      description: `${shortAddress(trimmed)} · Algorand Testnet`,
    });
  };

  const handleDisconnect = () => {
    disconnect();
    setWalletDropOpen(false);
    toast({ title: 'Wallet disconnected' });
  };

  const handleUseDemo = () => {
    const demoAddr = 'TESTALGO7K2DEMO3XCORRFARMX402ALGORANDTESTNETUSDC10458941';
    setWalletInput(demoAddr);
  };

  return (
    <>
      <header className="sticky top-0 z-50 w-full glass-strong border-b border-white/5">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2.5 group">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 shadow-lg shadow-amber-500/20 transition-all group-hover:shadow-amber-500/40 group-hover:scale-105">
              <Network className="h-5 w-5 text-white" />
            </div>
            <span className="text-xl font-bold bg-gradient-to-r from-amber-400 to-orange-500 bg-clip-text text-transparent text-glow-amber">
              CorrFarm
            </span>
          </Link>

          {/* Desktop nav */}
          <nav className="hidden md:flex items-center gap-1 p-1 glass rounded-xl">
            {navLinks.map((link) => {
              const isActive =
                link.href === '/' ? pathname === '/' : pathname.startsWith(link.href);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={cn(
                    'px-3 py-1.5 rounded-lg text-sm font-medium transition-all duration-200',
                    isActive
                      ? 'text-amber-400 bg-amber-500/10 shadow-sm shadow-amber-500/10'
                      : 'text-muted-foreground hover:text-foreground hover:bg-white/5'
                  )}
                >
                  {link.label}
                </Link>
              );
            })}
          </nav>

          {/* Right side */}
          <div className="hidden md:flex items-center gap-3">
            <Badge variant="secondary" className="text-[10px] bg-amber-500/10 text-amber-400 border-amber-500/20 hidden lg:flex gap-1">
              <Zap className="h-2.5 w-2.5" />
              x402 · USDC #10458941
            </Badge>

            <Link href="/settings">
              <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-foreground hover:bg-white/5">
                <Settings className="h-4 w-4" />
              </Button>
            </Link>

            {isConnected && address ? (
              <div className="relative">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => { const next = !walletDropOpen; setWalletDropOpen(next); if (next) refreshAgent(); }}
                  className="gap-2 border-amber-500/50 text-amber-400 bg-amber-500/10 hover:bg-amber-500/20 transition-all"
                >
                  <div className="h-2 w-2 rounded-full bg-green-400 animate-pulse" />
                  <Wallet className="h-4 w-4" />
                  {shortAddress(address)}
                  {totalPayments > 0 && (
                    <Badge className="bg-amber-500 text-white text-[9px] px-1.5 py-0 h-4">
                      {totalPayments}
                    </Badge>
                  )}
                  <ChevronDown className="h-3 w-3" />
                </Button>

                {walletDropOpen && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setWalletDropOpen(false)} />
                    <div className="absolute right-0 top-full mt-1 z-50 w-72 rounded-xl glass-strong border border-white/10 shadow-xl p-3 space-y-3">
                      {/* Address */}
                      <div className="rounded-lg bg-white/5 p-3 space-y-1">
                        <div className="flex items-center justify-between">
                          <p className="text-[10px] text-muted-foreground">Algorand Testnet Address</p>
                          <CopyButton text={address} />
                        </div>
                        <p className="text-xs font-mono text-amber-400 break-all">{address}</p>
                      </div>

                      {/* USDC info */}
                      <div className="flex items-center justify-between px-1 text-xs">
                        <span className="text-muted-foreground">USDC Asset</span>
                        <span className="font-mono text-amber-400">#10458941</span>
                      </div>

                      {/* Payment mode toggle: Demo vs Real on-chain */}
                      <div className="rounded-lg bg-white/5 p-3 space-y-2">
                        <div className="flex items-center justify-between">
                          <p className="text-[11px] font-medium">Payment Mode</p>
                          <div className="flex rounded-lg border border-white/10 overflow-hidden text-[10px]">
                            <button
                              onClick={() => setDemoMode(true)}
                              className={cn(
                                'px-2.5 py-1 transition-colors',
                                demoMode ? 'bg-amber-500 text-white' : 'text-muted-foreground hover:text-foreground'
                              )}
                            >
                              Demo
                            </button>
                            <button
                              onClick={() => setDemoMode(false)}
                              className={cn(
                                'px-2.5 py-1 transition-colors',
                                !demoMode ? 'bg-green-500 text-white' : 'text-muted-foreground hover:text-foreground'
                              )}
                            >
                              Real
                            </button>
                          </div>
                        </div>
                        {demoMode ? (
                          <p className="text-[10px] text-muted-foreground">
                            Demo: full x402 flow with simulated TxIDs — nothing is deducted. Try every feature free first.
                          </p>
                        ) : (
                          <div className="space-y-1.5">
                            <p className="text-[10px] text-muted-foreground">
                              Real: the server agent wallet sends {agent?.perPaymentAlgo ?? '0.05'} ALGO on-chain per use (real TxID).
                            </p>
                            <div className="flex items-center justify-between text-[10px]">
                              <span className="text-muted-foreground">Agent balance</span>
                              <span className="font-mono text-amber-400">{agent?.balanceAlgo ?? '—'} ALGO</span>
                            </div>
                            {agent && !agent.funded && (
                              <div className="rounded-md bg-red-500/10 border border-red-500/20 p-2 space-y-1">
                                <p className="text-[10px] text-red-400 font-medium">Agent wallet not funded</p>
                                {agent.faucetUrl && (
                                  <a
                                    href={agent.faucetUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="text-[10px] text-amber-400 hover:underline inline-flex items-center gap-0.5"
                                  >
                                    Fund via testnet faucet <ExternalLink className="h-2.5 w-2.5" />
                                  </a>
                                )}
                              </div>
                            )}
                            {agent?.funded && (
                              <div className="flex items-center gap-1 text-[10px] text-green-400">
                                <CheckCircle2 className="h-3 w-3" />
                                Funded — real payments ready
                              </div>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Payment history */}
                      {payments.length > 0 && (
                        <div className="space-y-1">
                          <p className="text-[10px] text-muted-foreground px-1">Recent Payments</p>
                          {payments.slice(-3).reverse().map((p, i) => (
                            <div key={i} className="rounded-lg bg-white/5 p-2 space-y-1">
                              <div className="flex items-center justify-between gap-2">
                                <p className="text-[10px] font-medium truncate capitalize">{p.resource.replace(/_/g, ' ')}</p>
                                <div className="flex items-center gap-1 shrink-0">
                                  <Shield className="h-3 w-3 text-green-400" />
                                  <span className="text-[9px] text-green-400">{p.mode === 'onchain' ? 'On-chain' : 'Demo'}</span>
                                </div>
                              </div>
                              <div className="flex items-center gap-1">
                                <p className="text-[9px] text-muted-foreground font-mono truncate flex-1">{p.txId.slice(0, 16)}…{p.txId.slice(-6)}</p>
                                {p.explorerUrl && (
                                  <a href={p.explorerUrl} target="_blank" rel="noreferrer" className="shrink-0 text-amber-400 hover:text-amber-300">
                                    <ExternalLink className="h-2.5 w-2.5" />
                                  </a>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Disconnect */}
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleDisconnect}
                        className="w-full gap-2 border-red-500/30 text-red-400 hover:bg-red-500/10"
                      >
                        <LogOut className="h-3.5 w-3.5" />
                        Disconnect
                      </Button>
                    </div>
                  </>
                )}
              </div>
            ) : (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setConnectOpen(true)}
                className="gap-2 border-amber-500/30 hover:border-amber-500/60 hover:bg-amber-500/5 transition-all"
              >
                <Wallet className="h-4 w-4" />
                Connect Wallet
              </Button>
            )}
          </div>

          {/* Mobile hamburger */}
          <button
            className="md:hidden p-2 text-muted-foreground hover:text-foreground hover:bg-white/5 rounded-lg transition-colors"
            onClick={() => setMobileOpen(!mobileOpen)}
          >
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>

        {/* Mobile menu */}
        {mobileOpen && (
          <div className="md:hidden glass-strong border-t border-white/5">
            <nav className="flex flex-col p-4 gap-1">
              {navLinks.map((link) => {
                const isActive =
                  link.href === '/' ? pathname === '/' : pathname.startsWith(link.href);
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    onClick={() => setMobileOpen(false)}
                    className={cn(
                      'px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200',
                      isActive
                        ? 'text-amber-400 bg-amber-500/10'
                        : 'text-muted-foreground hover:text-foreground hover:bg-white/5'
                    )}
                  >
                    {link.label}
                  </Link>
                );
              })}
              <div className="mt-3 pt-3 border-t border-white/5">
                {isConnected && address ? (
                  <div className="space-y-2">
                    <div className="rounded-lg bg-white/5 p-2.5 flex items-center gap-2">
                      <div className="h-2 w-2 rounded-full bg-green-400" />
                      <p className="text-xs font-mono text-amber-400 truncate">{shortAddress(address)}</p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleDisconnect}
                      className="w-full gap-2 text-red-400 border-red-500/30"
                    >
                      <LogOut className="h-3.5 w-3.5" />
                      Disconnect
                    </Button>
                  </div>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => { setConnectOpen(true); setMobileOpen(false); }}
                    className="gap-2 w-full border-amber-500/30 hover:border-amber-500/60"
                  >
                    <Wallet className="h-4 w-4" />
                    Connect Wallet
                  </Button>
                )}
              </div>
            </nav>
          </div>
        )}
      </header>

      {/* Connect Wallet Dialog */}
      <Dialog open={connectOpen} onOpenChange={setConnectOpen}>
        <DialogContent className="glass-strong border-white/10 max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Wallet className="h-5 w-5 text-amber-400" />
              Connect Algorand Wallet
            </DialogTitle>
            <DialogDescription>
              Enter your Pera Wallet address. Payments are handled automatically by the CorrFarm x402 agent — no per-transaction signing needed.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 pt-2">
            {/* Network badge */}
            <div className="flex items-center gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
              <div className="h-2 w-2 rounded-full bg-green-400 animate-pulse" />
              <span className="text-xs text-amber-400 font-medium">Algorand Testnet</span>
              <span className="text-xs text-muted-foreground ml-auto">x402 Agentic Autopay</span>
            </div>

            {/* Address input */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Wallet Address</label>
              <input
                type="text"
                value={walletInput}
                onChange={e => setWalletInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleConnect(); }}
                placeholder="ALGO... (58 characters)"
                className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2.5 text-sm font-mono placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-amber-500/40"
                autoFocus
              />
              <p className="text-[10px] text-muted-foreground">
                Get a free testnet wallet at{' '}
                <a href="https://perawallet.app" target="_blank" rel="noreferrer" className="text-amber-400 hover:underline inline-flex items-center gap-0.5">
                  perawallet.app <ExternalLink className="h-2.5 w-2.5" />
                </a>
                . Your address is your identity — the agent pays automatically.
              </p>
            </div>

            {/* Demo option */}
            <div className="rounded-lg border border-white/5 bg-white/3 p-3 space-y-2">
              <p className="text-xs font-medium text-muted-foreground">Hackathon Demo Mode</p>
              <p className="text-[10px] text-muted-foreground">
                Use a demo address to test the full x402 payment flow without a real wallet.
                Transaction IDs are generated and verified on-chain (testnet).
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={handleUseDemo}
                className="w-full gap-1.5 border-white/10 hover:border-amber-500/30 text-xs"
              >
                <Zap className="h-3.5 w-3.5 text-amber-400" />
                Use Demo Address
              </Button>
            </div>

            {/* Connect button */}
            <Button
              onClick={handleConnect}
              disabled={!walletInput.trim()}
              className="w-full gap-2 bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 text-white"
            >
              <Wallet className="h-4 w-4" />
              Connect & Enable Auto-Pay
            </Button>

            <p className="text-[10px] text-muted-foreground text-center">
              Once connected, x402 ALGO micropayments are sent automatically by the server agent — every use generates a real on-chain TxID.
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
