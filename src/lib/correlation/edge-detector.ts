/**
 * CorrFarm — Edge Detector: Predicted vs Market-Implied Joint Probability
 *
 * This is the core value proposition:
 *   1. Our model predicts the JOINT probability of events (e.g. BTC up AND ETH up)
 *      using the Student-t Copula + DCC-GARCH
 *   2. The market implies a joint probability via the prices of prediction markets
 *   3. If predicted joint ≠ market-implied joint → that's a TRADEABLE EDGE
 *
 * Example:
 *   - Market says P(BTC up) = 0.60, P(ETH up) = 0.55
 *   - Market implies P(BTC up AND ETH up) ≈ 0.33 (assuming independence: 0.60 × 0.55)
 *   - Our copula says P(BTC up AND ETH up) = 0.42 (because tail dependence)
 *   - Edge = 0.42 - 0.33 = +0.09 → BUY YES on the joint market
 *
 * This is more advanced than Polymarket's simple conditional approach
 * because we model the FULL dependency structure via copulas.
 */

import { estimateStudentTCopula, simulateFromCopula, type CopulaResult } from '../correlation/copula';
import { fitDCCGARCH, forecastCorrelation, type DCCGARCHResult } from '../correlation/dcc-garch';
import type { MultiAssetReturns } from '../binance/client';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MarketProbabilities {
  [asset: string]: number; // e.g. { bitcoin: 0.60, ethereum: 0.55 }
}

export interface EdgeResult {
  pair: string;
  assetA: string;
  assetB: string;

  // Market-implied
  marketProbA: number;
  marketProbB: number;
  marketImpliedJoint: number;   // Assuming independence: P(A) × P(B)

  // Our predicted
  predictedJointUp: number;     // P(A up AND B up) from copula
  predictedJointDown: number;   // P(A down AND B down) from copula
  predictedEitherUp: number;    // P(A up OR B up)

  // Edge
  edge: number;                 // predictedJointUp - marketImpliedJoint
  absEdge: number;
  direction: 'buy_yes' | 'buy_no';

  // Supporting data
  correlation: number;
  tailDependenceUpper: number;
  tailDependenceLower: number;
  copulaDF: number;
  dccAlpha: number;
  dccBeta: number;

  // Confidence
  confidence: number;           // 0-1 based on sample size and model fit
  sampleSize: number;

  // Simulation
  nSimulations: number;
}

export interface EdgeScanResult {
  opportunities: EdgeResult[];
  scanTimestamp: string;
  nAssets: number;
  dataSource: string;
  modelParams: {
    copulaDF: number;
    dccAlpha: number;
    dccBeta: number;
  };
}

// ---------------------------------------------------------------------------
// Core Edge Computation
// ---------------------------------------------------------------------------

/**
 * Compute the predicted joint probability from a fitted Student-t copula.
 *
 * Given marginal probabilities P(A up) and P(B up), compute:
 *   P(A up AND B up) = C(P(A up), P(B up))
 *
 * where C is the copula function. For Student-t copula:
 *   C(u, v) = P(U ≤ u, V ≤ v) under the Student-t dependence structure
 *
 * We estimate this via Monte Carlo simulation from the fitted copula.
 */
export function computePredictedJoint(
  copulaResult: CopulaResult,
  probA: number,
  probB: number,
  assetAIndex: number,
  assetBIndex: number,
  nSimulations: number = 10000
): {
  jointUp: number;
  jointDown: number;
  eitherUp: number;
} {
  const { params } = copulaResult;

  // Simulate from the copula
  const simulations = simulateFromCopula(params, nSimulations);

  // Count joint events
  let jointUp = 0;     // Both below their marginal CDF thresholds (both "up")
  let jointDown = 0;   // Both above their marginal CDF thresholds (both "down")
  let eitherUp = 0;    // At least one below threshold

  for (const sim of simulations) {
    const uA = sim[assetAIndex]; // Uniform [0,1] for asset A
    const uB = sim[assetBIndex]; // Uniform [0,1] for asset B

    // "Up" event: uniform value ≤ marginal probability
    const aUp = uA <= probA;
    const bUp = uB <= probB;

    if (aUp && bUp) jointUp++;
    if (!aUp && !bUp) jointDown++;
    if (aUp || bUp) eitherUp++;
  }

  return {
    jointUp: jointUp / nSimulations,
    jointDown: jointDown / nSimulations,
    eitherUp: eitherUp / nSimulations,
  };
}

/**
 * Compute the market-implied joint probability assuming independence.
 *
 * Under independence: P(A AND B) = P(A) × P(B)
 *
 * This is what the market typically assumes for correlated events
 * unless there's an explicit joint market. Our edge comes from
 * the fact that crypto assets are NOT independent.
 */
export function computeMarketImpliedJoint(probA: number, probB: number): number {
  return probA * probB;
}

/**
 * Compute confidence score for the edge estimate.
 *
 * Factors:
 * - Sample size (more data = higher confidence)
 * - Copula fit (lower AIC = better)
 * - Edge magnitude (very small edges are less reliable)
 * - Tail dependence (higher tail dependence = more reliable copula prediction)
 */
export function computeConfidence(
  sampleSize: number,
  absEdge: number,
  tailDepUpper: number,
  tailDepLower: number,
  correlation: number
): number {
  // Sample size factor: 0-1, saturates at ~500 observations
  const sizeFactor = Math.min(1, sampleSize / 500);

  // Edge magnitude factor: edges > 5% are more reliable
  const edgeFactor = Math.min(1, absEdge / 0.05);

  // Tail dependence factor: non-zero tail dependence makes copula more valuable
  const tailFactor = Math.min(1, (tailDepUpper + tailDepLower) / 0.4);

  // Correlation factor: higher absolute correlation = more edge opportunity
  const corrFactor = Math.min(1, Math.abs(correlation) / 0.5);

  // Weighted combination
  const raw =
    sizeFactor * 0.3 +
    edgeFactor * 0.25 +
    tailFactor * 0.2 +
    corrFactor * 0.25;

  return Math.max(0, Math.min(1, Math.round(raw * 100) / 100));
}

// ---------------------------------------------------------------------------
// Edge Scan — Find all tradeable opportunities
// ---------------------------------------------------------------------------

/**
 * Scan all pairs for predicted-vs-market-implied edge.
 *
 * This is the main entry point for the Opportunities tab.
 *
 * @param returnsData - Aligned multi-asset returns
 * @param marketProbs - Market-implied probabilities for each asset
 * @param minEdge - Minimum absolute edge to report (default 0.05 = 5%)
 * @param nSimulations - Number of copula simulations (default 10000)
 */
export function scanForEdges(
  returnsData: MultiAssetReturns,
  marketProbs: MarketProbabilities,
  minEdge: number = 0.05,
  nSimulations: number = 10000
): EdgeScanResult {
  const assetNames = Object.keys(returnsData.assets);
  const n = returnsData.dates.length;

  // Fit copula and DCC-GARCH on the returns data
  const copulaResult = estimateStudentTCopula(returnsData);
  const dccResult = fitDCCGARCH(returnsData);

  const opportunities: EdgeResult[] = [];

  // Scan all pairs
  for (let i = 0; i < assetNames.length; i++) {
    for (let j = i + 1; j < assetNames.length; j++) {
      const assetA = assetNames[i];
      const assetB = assetNames[j];

      const probA = marketProbs[assetA] ?? 0.5;
      const probB = marketProbs[assetB] ?? 0.5;

      // Compute predicted joint probability from copula
      const predicted = computePredictedJoint(
        copulaResult,
        probA,
        probB,
        i,
        j,
        nSimulations
      );

      // Compute market-implied joint (assuming independence)
      const marketImplied = computeMarketImpliedJoint(probA, probB);

      // Edge = predicted - market_implied
      const edge = predicted.jointUp - marketImplied;
      const absEdge = Math.abs(edge);

      // Skip if edge is below threshold
      if (absEdge < minEdge) continue;

      // Get correlation and tail dependence
      const correlation = copulaResult.params.correlationMatrix[i][j];
      const tailDep = copulaResult.tailDependence[assetA]?.[assetB] ?? { upper: 0, lower: 0 };

      // Compute confidence
      const confidence = computeConfidence(
        n,
        absEdge,
        tailDep.upper,
        tailDep.lower,
        correlation
      );

      opportunities.push({
        pair: `${assetA},${assetB}`,
        assetA,
        assetB,
        marketProbA: probA,
        marketProbB: probB,
        marketImpliedJoint: Math.round(marketImplied * 1e6) / 1e6,
        predictedJointUp: Math.round(predicted.jointUp * 1e6) / 1e6,
        predictedJointDown: Math.round(predicted.jointDown * 1e6) / 1e6,
        predictedEitherUp: Math.round(predicted.eitherUp * 1e6) / 1e6,
        edge: Math.round(edge * 1e6) / 1e6,
        absEdge: Math.round(absEdge * 1e6) / 1e6,
        direction: edge > 0 ? 'buy_yes' : 'buy_no',
        correlation: Math.round(correlation * 1e6) / 1e6,
        tailDependenceUpper: tailDep.upper,
        tailDependenceLower: tailDep.lower,
        copulaDF: copulaResult.params.df,
        dccAlpha: dccResult.dccAlpha,
        dccBeta: dccResult.dccBeta,
        confidence,
        sampleSize: n,
        nSimulations,
      });
    }
  }

  // Sort by absolute edge descending
  opportunities.sort((a, b) => b.absEdge - a.absEdge);

  return {
    opportunities,
    scanTimestamp: new Date().toISOString(),
    nAssets: assetNames.length,
    dataSource: 'binance',
    modelParams: {
      copulaDF: copulaResult.params.df,
      dccAlpha: dccResult.dccAlpha,
      dccBeta: dccResult.dccBeta,
    },
  };
}

/**
 * Quick edge estimate for a single pair without full model fitting.
 * Uses simple correlation to approximate the copula joint probability.
 *
 * For a bivariate normal with correlation rho:
 *   P(A up AND B up) = C(phi^{-1}(pA), phi^{-1}(pB); rho)
 *
 * Approximation: P(joint up) ≈ pA × pB + rho × sqrt(pA × (1-pA) × pB × (1-pB))
 *
 * This is the "quick and dirty" version for real-time use.
 */
export function quickEdgeEstimate(
  probA: number,
  probB: number,
  correlation: number
): { predictedJoint: number; marketImplied: number; edge: number } {
  const marketImplied = probA * probB;

  // Approximate copula-adjusted joint probability
  // The covariance correction accounts for the dependency
  const covariance = correlation * Math.sqrt(probA * (1 - probA) * probB * (1 - probB));
  const predictedJoint = Math.max(0, Math.min(1, marketImplied + covariance));

  const edge = predictedJoint - marketImplied;

  return {
    predictedJoint: Math.round(predictedJoint * 1e6) / 1e6,
    marketImplied: Math.round(marketImplied * 1e6) / 1e6,
    edge: Math.round(edge * 1e6) / 1e6,
  };
}
