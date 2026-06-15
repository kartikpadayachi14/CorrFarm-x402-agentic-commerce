/**
 * CorrFarm — Main Types File
 * Re-exports all types from all backend modules.
 */

// ---------------------------------------------------------------------------
// Binance client types
// ---------------------------------------------------------------------------
export type {
  Kline,
  PriceHistoryPoint,
  MultiAssetReturns,
  Ticker24H,
} from './binance/client';

// ---------------------------------------------------------------------------
// Correlation engine types
// ---------------------------------------------------------------------------
export type {
  CorrelationResult,
  CorrelationMatrix,
  CorrelationSummary,
  RollingCorrelation,
} from './correlation/engine';

// ---------------------------------------------------------------------------
// Copula types
// ---------------------------------------------------------------------------
export type {
  CopulaParams,
  TailDependence,
  CopulaResult,
} from './correlation/copula';

// ---------------------------------------------------------------------------
// DCC-GARCH types
// ---------------------------------------------------------------------------
export type {
  GARCHParams,
  GARCHResult,
  DCCGARCHResult,
} from './correlation/dcc-garch';

// ---------------------------------------------------------------------------
// Credibility detector types
// ---------------------------------------------------------------------------
export type {
  CredibilityResult,
  NewsItem,
  MarketClaimVerification,
  SocialPropagationResult,
} from './credibility/detector';

// ---------------------------------------------------------------------------
// x402 payment gateway types
// ---------------------------------------------------------------------------
export type {
  PaymentRequest,
  PaymentVerification,
} from './x402/gateway';

// ---------------------------------------------------------------------------
// Alpha Arcade MCP types
// ---------------------------------------------------------------------------
export type {
  PredictionMarket,
  MarketDetails,
  OrderBookEntry,
  Trade,
  PriceHistoryPoint as AlphaPriceHistoryPoint,
  RewardsInfo,
  OrderResult,
  CancelOrderResult,
  LiquidityResult,
  MCPCallResult,
} from './alpha-arcade/mcp';

// ---------------------------------------------------------------------------
// x402 Webhook types
// ---------------------------------------------------------------------------
export type {
  WebhookEventType,
  WebhookConfig,
  RegisteredWebhook,
  WebhookTriggerResult,
} from './x402/webhook';
