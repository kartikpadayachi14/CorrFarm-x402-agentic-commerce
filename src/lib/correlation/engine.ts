/**
 * CorrFarm — Correlation Computation Engine
 * Implements Pearson, Spearman (rank-based), and Kendall tau-b
 * from scratch — no external stats libraries.
 *
 * P-values use t-distribution approximation.
 */

import type { MultiAssetReturns } from '../binance/client';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CorrelationResult {
  correlation: number;
  pValue: number;
  method: string;
  nObservations: number;
  interpretation: string;
}

export interface BestCorrelationResult {
  correlation: number;        // the chosen "best" estimate
  pValue: number;
  method: 'pearson' | 'spearman' | 'kendall';
  methodLabel: string;        // human label, e.g. "Rank (Spearman)"
  reason: string;             // why this method was chosen
  agreement: number;          // 0-1, how closely the 3 methods agree
  nObservations: number;
  interpretation: string;
  strength: string;           // Very Strong / Strong / Moderate / Weak / Negligible
  direction: 'positive' | 'negative' | 'none';
}

export interface CorrelationMatrix {
  assets: string[];
  matrix: number[][];
  method: string;
}

export interface CorrelationSummary {
  averageCorrelation: number;
  medianCorrelation: number;
  maxCorrelation: number;
  minCorrelation: number;
  stdCorrelation: number;
  nAssets: number;
  highCorrelationPairs: { assetA: string; assetB: string; correlation: number }[];
  marketRegime: string;
  regimeDescription: string;
}

export interface RollingCorrelation {
  dates: string[];
  correlations: number[];
}

// ---------------------------------------------------------------------------
// Math helpers
// ---------------------------------------------------------------------------

function mean(arr: number[]): number {
  if (arr.length === 0) return 0;
  return arr.reduce((s, v) => s + v, 0) / arr.length;
}

function variance(arr: number[]): number {
  const m = mean(arr);
  return arr.reduce((s, v) => s + (v - m) ** 2, 0) / arr.length;
}

function stddev(arr: number[]): number {
  return Math.sqrt(variance(arr));
}

function covariance(a: number[], b: number[]): number {
  const ma = mean(a);
  const mb = mean(b);
  const n = Math.min(a.length, b.length);
  let s = 0;
  for (let i = 0; i < n; i++) s += (a[i] - ma) * (b[i] - mb);
  return s / n;
}

// ---------------------------------------------------------------------------
// Rank computation (for Spearman / Kendall)
// ---------------------------------------------------------------------------

function rank(arr: number[]): number[] {
  const indexed = arr.map((v, i) => ({ v, i }));
  indexed.sort((a, b) => a.v - b.v);

  const ranks = new Array<number>(arr.length);
  let i = 0;
  while (i < indexed.length) {
    let j = i;
    // Find ties
    while (j < indexed.length && indexed[j].v === indexed[i].v) j++;
    // Average rank for ties
    const avgRank = (i + j - 1) / 2 + 1; // 1-based
    for (let k = i; k < j; k++) {
      ranks[indexed[k].i] = avgRank;
    }
    i = j;
  }
  return ranks;
}

// ---------------------------------------------------------------------------
// Correlation implementations
// ---------------------------------------------------------------------------

/**
 * Pearson correlation coefficient.
 */
export function pearsonCorrelation(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  if (n < 2) return 0;

  const sa = a.slice(0, n);
  const sb = b.slice(0, n);
  const da = stddev(sa);
  const db = stddev(sb);

  if (da === 0 || db === 0) return 0;
  return covariance(sa, sb) / (da * db);
}

/**
 * Spearman rank correlation coefficient.
 */
export function spearmanCorrelation(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  if (n < 2) return 0;

  const ra = rank(a.slice(0, n));
  const rb = rank(b.slice(0, n));
  return pearsonCorrelation(ra, rb);
}

/**
 * Kendall tau-b correlation coefficient (accounts for ties).
 */
export function kendallCorrelation(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  if (n < 2) return 0;

  let concordant = 0;
  let discordant = 0;
  let tiesA = 0;
  let tiesB = 0;

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const diffA = a[i] - a[j];
      const diffB = b[i] - b[j];
      const product = diffA * diffB;

      if (product > 0) {
        concordant++;
      } else if (product < 0) {
        discordant++;
      } else {
        // Tie handling
        if (diffA === 0 && diffB !== 0) tiesA++;
        else if (diffA !== 0 && diffB === 0) tiesB++;
        else {
          tiesA++;
          tiesB++;
        }
      }
    }
  }

  const denom = Math.sqrt((concordant + discordant + tiesA) * (concordant + discordant + tiesB));
  if (denom === 0) return 0;
  return (concordant - discordant) / denom;
}

// ---------------------------------------------------------------------------
// t-distribution helpers (for p-value approximation)
// ---------------------------------------------------------------------------

/**
 * Approximation of the regularised incomplete beta function I_x(a,b)
 * using the continued-fraction expansion (Lentz's algorithm).
 */
function betaIncomplete(x: number, a: number, b: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;

  // Use log-gamma to compute the normalisation constant
  const lnBeta = lgamma(a) + lgamma(b) - lgamma(a + b);
  const front = Math.exp(Math.log(x) * a + Math.log(1 - x) * b - lnBeta);

  // Choose series direction for faster convergence
  if (x < (a + 1) / (a + b + 2)) {
    return front * betaCF(x, a, b) / a;
  }
  return 1 - front * betaCF(1 - x, b, a) / b;
}

/** Continued fraction for I_x(a,b) */
function betaCF(x: number, a: number, b: number): number {
  const maxIter = 200;
  const eps = 3e-12;
  let qab = a + b;
  let qap = a + 1;
  let qam = a - 1;
  let c = 1;
  let d = 1 - (qab * x) / qap;
  if (Math.abs(d) < 1e-30) d = 1e-30;
  d = 1 / d;
  let h = d;

  for (let m = 1; m <= maxIter; m++) {
    const m2 = 2 * m;
    // Even step
    let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < 1e-30) d = 1e-30;
    c = 1 + aa / c;
    if (Math.abs(c) < 1e-30) c = 1e-30;
    d = 1 / d;
    h *= d * c;

    // Odd step
    aa = -((a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < 1e-30) d = 1e-30;
    c = 1 + aa / c;
    if (Math.abs(c) < 1e-30) c = 1e-30;
    d = 1 / d;
    const del = d * c;
    h *= del;

    if (Math.abs(del - 1) < eps) break;
  }
  return h;
}

/** Log-gamma via Stirling + Lanczos approximation. */
function lgamma(z: number): number {
  if (z < 0.5) {
    return Math.log(Math.PI / Math.sin(Math.PI * z)) - lgamma(1 - z);
  }
  z -= 1;
  const g = 7;
  const coef = [
    0.99999999999980993, 676.5203681218851, -1259.1392167224028,
    771.32342877765313, -176.61502916214059, 12.507343278686905,
    -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
  ];
  let x = coef[0];
  for (let i = 1; i < g + 2; i++) x += coef[i] / (z + i);
  const t = z + g + 0.5;
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x);
}

/**
 * Two-tailed p-value for a correlation coefficient under H0: rho=0.
 * Uses t-distribution: t = r * sqrt((n-2)/(1-r^2)), df = n-2
 */
function correlationPValue(r: number, n: number): number {
  if (n <= 2) return 1;
  const denom = 1 - r * r;
  if (denom <= 0) return r === 1 || r === -1 ? 0 : 1;
  const t = r * Math.sqrt((n - 2) / denom);
  const df = n - 2;
  const x = df / (df + t * t);
  const p = betaIncomplete(x, df / 2, 0.5);
  return Math.min(1, Math.max(0, p));
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Compute full NxN correlation matrix for a set of assets.
 */
export function computeCorrelationMatrix(
  returnsData: MultiAssetReturns,
  method: 'pearson' | 'spearman' | 'kendall' = 'pearson'
): CorrelationMatrix {
  const assetNames = Object.keys(returnsData.assets);
  const n = assetNames.length;

  const corrFn =
    method === 'spearman' ? spearmanCorrelation : method === 'kendall' ? kendallCorrelation : pearsonCorrelation;

  const matrix: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));

  for (let i = 0; i < n; i++) {
    matrix[i][i] = 1;
    for (let j = i + 1; j < n; j++) {
      const r = corrFn(returnsData.assets[assetNames[i]], returnsData.assets[assetNames[j]]);
      matrix[i][j] = r;
      matrix[j][i] = r;
    }
  }

  return { assets: assetNames, matrix, method };
}

/**
 * Pairwise correlation with p-value and interpretation.
 */
export function computePairCorrelation(
  returnsA: number[],
  returnsB: number[],
  method: 'pearson' | 'spearman' | 'kendall' = 'pearson'
): CorrelationResult {
  const n = Math.min(returnsA.length, returnsB.length);
  const a = returnsA.slice(0, n);
  const b = returnsB.slice(0, n);

  let correlation: number;
  switch (method) {
    case 'spearman':
      correlation = spearmanCorrelation(a, b);
      break;
    case 'kendall':
      correlation = kendallCorrelation(a, b);
      break;
    default:
      correlation = pearsonCorrelation(a, b);
  }

  // Clamp to [-1, 1] for floating-point safety
  correlation = Math.max(-1, Math.min(1, correlation));

  const pValue = correlationPValue(correlation, n);

  return {
    correlation,
    pValue,
    method,
    nObservations: n,
    interpretation: interpretCorrelation(correlation),
  };
}

/**
 * "Best correlation" — computes all three methods, then auto-selects the most
 * trustworthy estimate so the UI can present a single number without exposing
 * method choice to the user.
 *
 * Selection logic:
 *  - Crypto returns have fat tails and outliers, so rank-based methods
 *    (Spearman/Kendall) are generally more robust than Pearson.
 *  - We measure "agreement" across the three methods. High agreement => the
 *    relationship is stable and we report the rank-based consensus.
 *  - When Pearson diverges sharply from the rank methods, outliers are likely
 *    inflating/deflating it, so we trust Spearman.
 */
export function computeBestCorrelation(
  returnsA: number[],
  returnsB: number[]
): BestCorrelationResult {
  const n = Math.min(returnsA.length, returnsB.length);
  const a = returnsA.slice(0, n);
  const b = returnsB.slice(0, n);

  const clamp = (x: number) => Math.max(-1, Math.min(1, x));
  const pearson = clamp(pearsonCorrelation(a, b));
  const spearman = clamp(spearmanCorrelation(a, b));
  const kendall = clamp(kendallCorrelation(a, b));

  // Agreement: 1 - normalized spread across the three estimates (0..1).
  const vals = [pearson, spearman, kendall];
  const spread = Math.max(...vals) - Math.min(...vals);
  const agreement = Math.max(0, 1 - spread / 2);

  const pearsonRankGap = Math.abs(pearson - spearman);

  let method: 'pearson' | 'spearman' | 'kendall';
  let correlation: number;
  let reason: string;

  if (n < 10) {
    // Tiny samples: Kendall is least sensitive to individual points.
    method = 'kendall';
    correlation = kendall;
    reason = 'Small sample — Kendall tau is the most robust for limited data.';
  } else if (pearsonRankGap > 0.25) {
    // Outliers distorting Pearson — trust the rank-based estimate.
    method = 'spearman';
    correlation = spearman;
    reason =
      'Outliers detected (linear vs. rank estimates diverge) — using rank-based Spearman for a robust estimate.';
  } else {
    // Stable relationship — report rank consensus (Spearman).
    method = 'spearman';
    correlation = spearman;
    reason =
      agreement >= 0.85
        ? 'All methods agree — high-confidence robust estimate.'
        : 'Rank-based Spearman estimate, resistant to crypto fat tails.';
  }

  const pValue = correlationPValue(correlation, n);
  const abs = Math.abs(correlation);
  let strength: string;
  if (abs >= 0.9) strength = 'very strong';
  else if (abs >= 0.7) strength = 'strong';
  else if (abs >= 0.5) strength = 'moderate';
  else if (abs >= 0.3) strength = 'weak';
  else if (abs >= 0.1) strength = 'very weak';
  else strength = 'negligible';

  const direction: 'positive' | 'negative' | 'none' =
    abs < 0.1 ? 'none' : correlation >= 0 ? 'positive' : 'negative';

  const methodLabel =
    method === 'spearman'
      ? 'Rank-Robust'
      : method === 'kendall'
        ? 'Tau-Robust'
        : 'Linear';

  return {
    correlation,
    pValue,
    method,
    methodLabel,
    reason,
    agreement,
    nObservations: n,
    interpretation: interpretCorrelation(correlation),
    strength,
    direction,
  };
}

/**
 * Rolling correlation time series.
 */
export function computeRollingCorrelation(
  returnsA: number[],
  returnsB: number[],
  window: number = 30
): RollingCorrelation {
  const n = Math.min(returnsA.length, returnsB.length);
  const correlations: number[] = [];
  const indices: number[] = [];

  for (let i = window - 1; i < n; i++) {
    const sliceA = returnsA.slice(i - window + 1, i + 1);
    const sliceB = returnsB.slice(i - window + 1, i + 1);
    const r = pearsonCorrelation(sliceA, sliceB);
    correlations.push(Math.max(-1, Math.min(1, r)));
    indices.push(i);
  }

  return { dates: indices.map(String), correlations };
}

/**
 * Summary statistics for the correlation landscape of a set of assets.
 */
export function computeCorrelationSummary(
  returnsData: MultiAssetReturns,
  method: 'pearson' | 'spearman' | 'kendall' = 'pearson'
): CorrelationSummary {
  const mat = computeCorrelationMatrix(returnsData, method);
  const n = mat.assets.length;

  // Collect upper-triangle values
  const vals: number[] = [];
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      vals.push(mat.matrix[i][j]);
    }
  }

  if (vals.length === 0) {
    return {
      averageCorrelation: 0,
      medianCorrelation: 0,
      maxCorrelation: 0,
      minCorrelation: 0,
      stdCorrelation: 0,
      nAssets: n,
      highCorrelationPairs: [],
      marketRegime: 'unknown',
      regimeDescription: 'Insufficient data',
    };
  }

  const avg = mean(vals);
  const sorted = [...vals].sort((a, b) => a - b);
  const median = sorted.length % 2 === 0
    ? (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
    : sorted[Math.floor(sorted.length / 2)];
  const maxCorr = sorted[sorted.length - 1];
  const minCorr = sorted[0];
  const std = stddev(vals);

  // High correlation pairs (|r| > 0.7)
  const highCorrelationPairs: { assetA: string; assetB: string; correlation: number }[] = [];
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (Math.abs(mat.matrix[i][j]) > 0.7) {
        highCorrelationPairs.push({
          assetA: mat.assets[i],
          assetB: mat.assets[j],
          correlation: mat.matrix[i][j],
        });
      }
    }
  }
  highCorrelationPairs.sort((a, b) => Math.abs(b.correlation) - Math.abs(a.correlation));

  // Market regime classification based on average correlation
  let marketRegime: string;
  let regimeDescription: string;
  if (avg > 0.6) {
    marketRegime = 'risk-on';
    regimeDescription = 'High average correlation — assets move together (risk-on / crisis mode). Diversification benefit is low.';
  } else if (avg > 0.3) {
    marketRegime = 'moderate';
    regimeDescription = 'Moderate correlation — some co-movement with differentiation. Partial diversification available.';
  } else if (avg > 0) {
    marketRegime = 'normal';
    regimeDescription = 'Low-to-moderate correlation — healthy diversification environment.';
  } else {
    marketRegime = 'risk-off';
    regimeDescription = 'Negative or near-zero average correlation — strong diversification, possible flight-to-quality.';
  }

  return {
    averageCorrelation: Math.round(avg * 1e6) / 1e6,
    medianCorrelation: Math.round(median * 1e6) / 1e6,
    maxCorrelation: Math.round(maxCorr * 1e6) / 1e6,
    minCorrelation: Math.round(minCorr * 1e6) / 1e6,
    stdCorrelation: Math.round(std * 1e6) / 1e6,
    nAssets: n,
    highCorrelationPairs,
    marketRegime,
    regimeDescription,
  };
}

/**
 * Human-readable interpretation of a correlation coefficient.
 */
export function interpretCorrelation(r: number): string {
  const abs = Math.abs(r);
  const sign = r >= 0 ? 'positive' : 'negative';

  let strength: string;
  if (abs >= 0.9) strength = 'very strong';
  else if (abs >= 0.7) strength = 'strong';
  else if (abs >= 0.5) strength = 'moderate';
  else if (abs >= 0.3) strength = 'weak';
  else if (abs >= 0.1) strength = 'very weak';
  else strength = 'negligible';

  return `${strength} ${sign} correlation (r=${r.toFixed(4)})`;
}
