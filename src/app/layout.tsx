import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { Navbar } from "@/components/layout/navbar";
import { WalletProvider } from "@/contexts/wallet-context";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "CorrFarm — Crypto Correlation Pricing Engine",
  description:
    "Correlation engine for crypto markets with Student-t Copula, DCC-GARCH, and x402 payments on Algorand",
  keywords: [
    "correlation",
    "crypto",
    "DCC-GARCH",
    "Student-t Copula",
    "x402",
    "Algorand",
    "DeFi",
    "credibility",
    "fake news",
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning className="dark">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        <WalletProvider>
        <div className="min-h-screen flex flex-col">
          <Navbar />
          <main className="flex-1 overflow-y-auto">{children}</main>
          <footer className="glass border-t border-white/5 shrink-0">
            <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-4">
              <div className="flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-muted-foreground">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-amber-400 text-glow-amber">CorrFarm</span>
                  <span className="text-muted-foreground/60">— Built for Algorand x402 Agentic Commerce Hackathon</span>
                </div>
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-1.5">
                    <div className="h-1.5 w-1.5 rounded-full bg-green-400 animate-pulse pulse-dot" />
                    <span>Algorand Testnet</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="font-mono text-amber-400/80">USDC #10458941</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span>x402 Protocol</span>
                  </div>
                </div>
              </div>
            </div>
          </footer>
        </div>
        </WalletProvider>
        <Toaster />
      </body>
    </html>
  );
}
