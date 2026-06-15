# CorrFarm — x402 Agentic Commerce on Algorand

**Algorand x402 Agentic Commerce Hackathon — Track 1: Agentic Commerce + Alpha Arcade Bonus**

CorrFarm is a Crypto Correlation Pricing Engine that gates every premium feature behind automatic **x402 micropayments on Algorand**. A server-side AI agent wallet auto-pays per API call — no user signing, no subscriptions, pure agentic commerce.

Live Alpha Arcade prediction markets are integrated with per-market Correlation Engine, Fake-News Trust Check, and LP Farming Bot — all triggered by x402 autopay.

## x402 Agentic Payment Flow

```
User clicks premium feature (e.g. Correlation Matrix / LP Bot)
  → Frontend: POST /api/x402/pay  (real) | /api/x402/demo-pay  (demo)
  → Server agent wallet signs ALGO txn via algosdk
  → algosdk.waitForConfirmation() confirms on-chain
  → Real TxID returned → access granted → feature unlocked
  → Explorer link shown (lora.algokit.io/testnet)
```

**Demo Mode** (default): generates realistic 52-char Algorand TxIDs instantly — full x402 flow, no wallet needed.
**Real Mode**: switch in the wallet dropdown → server agent sends 0.05 ALGO on-chain, real TxID.

### Fund the agent wallet (for real on-chain payments)
```
Address: 4IVP3CZFNPI7BWGWS5NSF2SWGZSBEFWFRVLAEEHFWV5X24E6DX76ETBWTY
Faucet:  https://lora.algokit.io/testnet?account=4IVP3CZFNPI7BWGWS5NSF2SWGZSBEFWFRVLAEEHFWV5X24E6DX76ETBWTY
```

---

CorrFarm is a correlation pricing engine for crypto markets that uses Student-t Copula, DCC-GARCH, and x402 micropayments on Algorand. It identifies tradeable opportunities by comparing statistical joint probabilities (from our models) against market-implied probabilities (from prediction markets like Alpha Arcade).

## Features

### 1. Correlation Engine (Core)
- **Pearson, Spearman, Kendall** correlation matrices for crypto assets
- **Student-t Copula** estimation with tail dependence analysis
- **DCC-GARCH** dynamic conditional correlation modeling
- **Rolling correlation** time series analysis
- **Market regime detection** (Risk-On / Risk-Off / Neutral / Moderate)
- **Correlation forecasting** via DCC-GARCH h-step ahead
- Real-time data from **Binance API** (public endpoints, no API key needed)

### 2. Predicted vs Market-Implied Edge
- Compares **copula-predicted joint probabilities** against **market-implied probabilities** (assuming independence)
- Example: If our copula says P(BTC up AND ETH up) = 0.42, but the market implies 0.33, that's a +9% edge
- **Monte Carlo simulation** from fitted copula for accurate joint probability estimation
- **Quick edge estimator** using correlation-based approximation for real-time use
- Opportunity scoring: edge %, confidence, recommendation (BUY/SELL/WATCH)

### 3. Fake News / Credibility Detection (9 Dimensions)
- **Market Reaction Verification** (25%) — Links news to actual price action on-chain
- **News Content Analysis via FinBERT** (20%) — Financial NLP engine for sentiment
- **Source Credibility Analysis** (15%) — Finance-domain source trust scoring
- **Social Media Propagation** (10%) — Detects manipulation and coordinated hype
- **Sensationalism Detection** (8%) — ALL CAPS, excessive punctuation, clickbait
- **Factual Consistency** (8%) — Cross-reference with market data
- **Source Reliability** (7%) — Historical accuracy tracking
- **Emotional Manipulation** (4%) — Fear/greed language patterns
- **Market Consistency** (3%) — Price-news divergence detection
- **LLM-powered** via OpenRouter when API key is provided; heuristic fallback otherwise

### 4. Alpha Arcade Integration
- **SDK wrapper** (`@alpha-arcade/sdk`) for live prediction markets
- **MCP client** for 8 tools: markets, details, orders, price history, rewards, place/cancel orders, LP
- **Opportunity scanner** — finds mispriced markets by comparing copula probabilities vs market odds

### 5. x402 Payment Protocol
- HTTP 402 payment required responses for premium endpoints
- Algorand testnet USDC payments with on-chain verification via algosdk
- 9 pricing tiers ($0.02 - $0.25 USDC)
- Demo payment mode for testing
- Bypass mode for development (`BYPASS_X402=true`)
- **Pay-per-job compute**: GPU/CPU correlation jobs start after payment confirmed
- **Webhook relay**: Agents pay to register callbacks triggered on events

### 6. Webhook Event System
- Register webhooks for: `correlation_threshold`, `regime_change`, `opportunity_detected`
- Set asset filters and thresholds
- HMAC-SHA256 signed callback payloads

## Tech Stack

- **Frontend**: Next.js 16, React 19, Tailwind CSS 4, shadcn/ui, Recharts
- **Backend**: Next.js API Routes (serverless functions)
- **Blockchain**: Algorand (testnet), algosdk, x402 protocol
- **Prediction Markets**: Alpha Arcade SDK + MCP
- **Data**: Binance API (public endpoints) + Binance Vision historical data
- **AI**: OpenRouter API (user-provided key, supports multiple LLMs)
- **Database**: SQLite via Prisma

## Quick Start

### Prerequisites
- Node.js 18+ or Bun 1.0+
- npm or bun package manager

### Installation

```bash
# 1. Install dependencies
npm install

# 2. Interactive setup — enter API keys one by one (Enter to keep defaults)
npm run setup

# 3. Start development server
npm run dev

# 4. Open http://localhost:3000
```

Or manually:
```bash
cp .env.example .env.local
# Edit .env.local with your keys, then:
npm run dev
```

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `OPENROUTER_API_KEY` | Recommended | - | OpenRouter API key for LLM-powered credibility analysis |
| `LLM_MODEL` | No | google/gemini-2.0-flash-001 | Model to use via OpenRouter |
| `ALPHA_API_KEY` | No | - | Alpha Arcade API key for live market data |
| `X402_RECIPIENT_ADDRESS` | No | demo | Algorand wallet address for receiving x402 payments |
| `ALGOD_SERVER` | No | https://testnet-api.algonode.cloud | Algorand testnet node URL |
| `ALGOD_INDEXER_SERVER` | No | https://testnet-idx.algonode.cloud | Algorand testnet indexer URL |
| `BYPASS_X402` | No | true | Skip payment checks (development mode) |
| `USDC_TESTNET_ASSET_ID` | No | 10458941 | USDC asset ID on Algorand testnet |
| `WEBHOOK_SECRET` | No | - | Secret for signing webhook payloads |

## Project Structure

```
src/
├── app/
│   ├── page.tsx                       # Dashboard with correlation heatmap
│   ├── layout.tsx                     # Root layout with navbar
│   ├── correlation/page.tsx           # Full correlation analysis UI
│   ├── fake-news/page.tsx             # Credibility detector UI
│   ├── markets/page.tsx               # Alpha Arcade markets + opportunities
│   ├── pricing/page.tsx               # x402 pricing tiers
│   ├── settings/page.tsx              # API keys, webhooks & configuration
│   └── api/
│       ├── alpha-arcade/markets/      # Alpha Arcade market list
│       ├── alpha-arcade/opportunities/ # Correlation vs market opportunities
│       ├── markets/overview/          # Binance market data
│       ├── markets/history/[symbol]/  # Price history
│       ├── correlation/matrix/        # Correlation matrix (x402)
│       ├── correlation/pair/          # Pair analysis (x402)
│       ├── correlation/copula/        # Student-t Copula (x402)
│       ├── correlation/dcc-garch/     # DCC-GARCH (x402)
│       ├── correlation/rolling/       # Rolling correlation
│       ├── correlation/summary/       # Correlation summary
│       ├── credibility/analyze/       # Fake news detection (x402)
│       ├── credibility/news/          # Crypto news feed (x402)
│       ├── credibility/verify-claim/  # Claim verification (x402)
│       ├── credibility/social-analysis/ # Social media analysis (x402)
│       ├── x402/pricing/              # Payment tiers
│       ├── x402/verify/               # Payment verification
│       ├── x402/demo-pay/             # Demo payment
│       ├── x402/check/                # Access check
│       ├── x402/payments/             # Payment status
│       ├── x402/wallet/               # Wallet utilities
│       ├── x402/webhooks/             # Webhook registration & management
│       └── health/                    # Service health check
├── lib/
│   ├── binance/client.ts              # Binance API client (public, no key)
│   ├── correlation/engine.ts          # Pearson/Spearman/Kendall + rolling
│   ├── correlation/copula.ts          # Student-t Copula estimation
│   ├── correlation/dcc-garch.ts       # DCC-GARCH dynamic correlations
│   ├── correlation/edge-detector.ts   # Predicted vs market-implied edge calculator
│   ├── credibility/detector.ts        # 9-dimension credibility detection
│   ├── x402/gateway.ts               # x402 payment gateway
│   ├── x402/webhook.ts               # Webhook relay system
│   ├── x402/wallet.ts                # Algorand wallet utilities
│   ├── alpha-arcade/sdk.ts            # Alpha Arcade SDK wrapper
│   ├── alpha-arcade/mcp.ts            # Alpha Arcade MCP client (8 tools)
│   └── types.ts                       # Central type exports
├── components/
│   ├── layout/navbar.tsx              # Navigation bar
│   └── payment/paywall-gate.tsx       # x402 paywall component
└── scripts/
    ├── setup-wallet.ts                # Generate new testnet wallet
    ├── configure-funded-wallet.ts     # Configure existing funded wallet
    └── accuracy-test.ts               # Run accuracy benchmarks
```

## x402 Pricing Tiers

| Resource | Price | Description |
|----------|-------|-------------|
| Correlation Matrix | $0.05 | Full NxN correlation matrix |
| Pair Analysis | $0.02 | Pairwise correlation + p-value |
| Copula Analysis | $0.10 | Student-t Copula with tail dependence |
| DCC-GARCH | $0.10 | Dynamic conditional correlation |
| Credibility Check | $0.03 | 9-dimension credibility analysis |
| News Analysis | $0.05 | Batch crypto news analysis |
| Alpha Markets | $0.03 | Alpha Arcade market listing |
| Alpha Opportunities | $0.08 | Correlation vs market opportunities |
| Webhook Registration | $0.05 | Event callback registration |
| Full Access Pass | $0.25 | 24-hour unlimited access |

## Mathematical Models

### Student-t Copula
- Parameter estimation via method of moments (kurtosis-based DF estimation)
- Kendall's tau to Pearson correlation conversion: rho = sin(pi * tau / 2)
- Empirical CDF transformation (rank transform with n+1 denominator)
- Cholesky decomposition for log-likelihood computation
- Upper and lower tail dependence: lambda = 2 * t_{df+1}(-sqrt((df+1)(1-rho)/(1+rho)))
- Copula simulation via Cholesky + chi-squared / df transform

### DCC-GARCH(1,1)
- Univariate GARCH(1,1) via MLE with grid search + refinement
- DCC parameter estimation (alpha, beta) via quasi-maximum likelihood
- Dynamic conditional correlation: Q_t = (1-a-b)*Q_bar + a*z*z' + b*Q_{t-1}
- Correlation normalisation: R_t = diag(Q_t)^{-1/2} * Q_t * diag(Q_t)^{-1/2}
- h-step ahead correlation forecasting: E[Q_{t+h}] = (1-(a+b)^h)*Q_bar + (a+b)^h*Q_t

### Edge Detection
- **Predicted joint probability**: P(A up AND B up) estimated via Monte Carlo simulation from fitted Student-t copula
- **Market-implied joint**: P(A) x P(B) assuming independence
- **Edge = predicted joint - market implied joint**
- Confidence scoring based on: sample size, edge magnitude, tail dependence, correlation strength
- Quick estimator: P(joint) ~ P(A)P(B) + rho * sqrt(P(A)(1-P(A))P(B)(1-P(B)))

## Deploy to Netlify

```bash
# Build and deploy
bun run build
netlify deploy --prod

# Set environment variables in Netlify dashboard:
# OPENROUTER_API_KEY, ALPHA_API_KEY, X402_RECIPIENT_ADDRESS
# BYPASS_X402=false  # Set to false for production!
```

## Demo Mode

For hackathon demo purposes:
1. `BYPASS_X402=true` — All x402 paywalls are bypassed
2. Demo payment button — Simulates payment flow without real transactions
3. Heuristic credibility detection — Works without OpenRouter API key
4. Binance public API — No API key needed for market data
5. Alpha Arcade mock data — Works without ALPHA_API_KEY
6. Algorand testnet — All on-chain operations use testnet

## License

MIT — See [LICENSE](./LICENSE) for details.
