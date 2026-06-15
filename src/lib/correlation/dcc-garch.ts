/**
 * CorrFarm — DCC-GARCH (Dynamic Conditional Correlation GARCH) Implementation
 *
 * Step 1: Fit univariate GARCH(1,1) for each asset
 * Step 2: Compute standardized residuals
 * Step 3: Estimate DCC parameters (alpha, beta) via QMLE
 * Step 4: Generate dynamic conditional correlation series
 *
 * All statistical functions implemented from scratch in TypeScript.
 */

import type { MultiAssetReturns } from '../binance/client';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface GARCHParams {
  omega: number;
  alpha: number;
  beta: number;
  longRunVariance: number;
}

export interface GARCHResult {
  params: GARCHParams;
  conditionalVariances: number[];
  standardizedResiduals: number[];
}

export interface DCCGARCHResult {
  garchResults: Record<string, GARCHResult>;
  dccAlpha: number;
  dccBeta: number;
  dynamicCorrelations: { date: string; matrix: number[][] }[];
  assets: string[];
  converged: boolean;
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

// ---------------------------------------------------------------------------
// Univariate GARCH(1,1)
// ---------------------------------------------------------------------------

/**
 * Fit a GARCH(1,1) model to a single return series using maximum likelihood.
 *
 * GARCH(1,1): sigma_t^2 = omega + alpha * r_{t-1}^2 + beta * sigma_{t-1}^2
 *
 * Constraints:
 *   omega > 0, alpha >= 0, beta >= 0, alpha + beta < 1
 *
 * Long-run variance: sigma^2 = omega / (1 - alpha - beta)
 *
 * Uses iterative MLE with constrained optimisation (grid search + refinement).
 */
export function fitUnivariateGARCH(returns: number[]): GARCHResult {
  const n = returns.length;
  if (n < 10) {
    // Not enough data; return simple variance estimate
    const v = variance(returns);
    return {
      params: { omega: v * 0.01, alpha: 0.05, beta: 0.9, longRunVariance: v },
      conditionalVariances: new Array(n).fill(v),
      standardizedResiduals: returns.map((r) => (v > 0 ? r / Math.sqrt(v) : 0)),
    };
  }

  const sampleVar = variance(returns);
  const m = mean(returns);
  const deMeaned = returns.map((r) => r - m);

  // Grid search over (alpha, beta) pairs
  let bestLogL = -Infinity;
  let bestAlpha = 0.1;
  let bestBeta = 0.85;
  let bestOmega = sampleVar * (1 - bestAlpha - bestBeta);

  // Coarse grid search
  for (let alpha = 0.01; alpha <= 0.4; alpha += 0.05) {
    for (let beta = 0.5; beta <= 0.95; beta += 0.05) {
      if (alpha + beta >= 0.99) continue;

      const omega = sampleVar * (1 - alpha - beta);
      if (omega <= 0) continue;

      const { logL, condVars } = garchLogLikelihood(deMeaned, omega, alpha, beta, sampleVar);

      if (logL > bestLogL) {
        bestLogL = logL;
        bestAlpha = alpha;
        bestBeta = beta;
        bestOmega = omega;
      }
    }
  }

  // Refine around best values
  const refineStep = 0.01;
  for (let alpha = bestAlpha - 0.05; alpha <= bestAlpha + 0.05; alpha += refineStep) {
    for (let beta = bestBeta - 0.05; beta <= bestBeta + 0.05; beta += refineStep) {
      if (alpha < 0.001 || beta < 0.01) continue;
      if (alpha + beta >= 0.999) continue;

      const omega = sampleVar * (1 - alpha - beta);
      if (omega <= 0) continue;

      const { logL } = garchLogLikelihood(deMeaned, omega, alpha, beta, sampleVar);

      if (logL > bestLogL) {
        bestLogL = logL;
        bestAlpha = Math.round(alpha * 1e4) / 1e4;
        bestBeta = Math.round(beta * 1e4) / 1e4;
        bestOmega = Math.round(omega * 1e8) / 1e8;
      }
    }
  }

  // Ensure constraints
  bestAlpha = Math.max(0.001, bestAlpha);
  bestBeta = Math.max(0.01, bestBeta);
  if (bestAlpha + bestBeta >= 0.999) {
    bestBeta = 0.999 - bestAlpha;
  }
  bestOmega = Math.max(1e-10, sampleVar * (1 - bestAlpha - bestBeta));

  // Compute final conditional variances and standardized residuals
  const { condVars } = garchLogLikelihood(deMeaned, bestOmega, bestAlpha, bestBeta, sampleVar);
  const stdResids = deMeaned.map((r, i) => {
    const v = condVars[i] || sampleVar;
    return v > 0 ? r / Math.sqrt(v) : 0;
  });

  return {
    params: {
      omega: bestOmega,
      alpha: bestAlpha,
      beta: bestBeta,
      longRunVariance: bestOmega / (1 - bestAlpha - bestBeta),
    },
    conditionalVariances: condVars,
    standardizedResiduals: stdResids,
  };
}

/**
 * Compute GARCH(1,1) log-likelihood and conditional variances.
 * Assumes Gaussian innovations.
 */
function garchLogLikelihood(
  returns: number[],
  omega: number,
  alpha: number,
  beta: number,
  initVariance: number
): { logL: number; condVars: number[] } {
  const n = returns.length;
  const condVars = new Array<number>(n);
  condVars[0] = initVariance;

  let logL = 0;

  for (let t = 1; t < n; t++) {
    condVars[t] = omega + alpha * returns[t - 1] ** 2 + beta * condVars[t - 1];

    // Numerical safety
    if (condVars[t] <= 0) condVars[t] = 1e-10;

    // Gaussian log-likelihood contribution
    logL += -0.5 * (Math.log(2 * Math.PI) + Math.log(condVars[t]) + (returns[t] ** 2) / condVars[t]);
  }

  return { logL, condVars };
}

// ---------------------------------------------------------------------------
// DCC-GARCH
// ---------------------------------------------------------------------------

/**
 * Fit DCC-GARCH(1,1) model to multi-asset returns.
 *
 * DCC Model:
 *   Q_t = (1 - alpha - beta) * Q_bar + alpha * z_{t-1} * z_{t-1}' + beta * Q_{t-1}
 *   R_t = diag(Q_t)^{-1/2} * Q_t * diag(Q_t)^{-1/2}
 *
 * where z_t are standardized residuals and Q_bar is the sample correlation of z.
 */
export function fitDCCGARCH(returnsData: MultiAssetReturns): DCCGARCHResult {
  const assetNames = Object.keys(returnsData.assets);
  const k = assetNames.length;
  const n = returnsData.dates.length;

  if (k < 2) {
    throw new Error('At least 2 assets required for DCC-GARCH');
  }

  // Step 1 & 2: Fit univariate GARCH and get standardized residuals
  const garchResults: Record<string, GARCHResult> = {};
  const stdResiduals: Record<string, number[]> = {};

  for (const asset of assetNames) {
    const result = fitUnivariateGARCH(returnsData.assets[asset]);
    garchResults[asset] = result;
    stdResiduals[asset] = result.standardizedResiduals;
  }

  // Build matrix of standardized residuals: z[t][k]
  const z: number[][] = [];
  for (let t = 0; t < n; t++) {
    const row: number[] = [];
    for (const asset of assetNames) {
      row.push(stdResiduals[asset][t] || 0);
    }
    z.push(row);
  }

  // Step 3: Estimate DCC parameters (alpha, beta) via QMLE
  const { dccAlpha, dccBeta } = estimateDCCParams(z, k, n);

  // Step 4: Generate dynamic conditional correlation series
  const dynamicCorrelations = computeDynamicCorrelations(z, dccAlpha, dccBeta, k, n, returnsData.dates);

  return {
    garchResults,
    dccAlpha: Math.round(dccAlpha * 1e6) / 1e6,
    dccBeta: Math.round(dccBeta * 1e6) / 1e6,
    dynamicCorrelations,
    assets: assetNames,
    converged: true,
  };
}

/**
 * Estimate DCC parameters alpha and beta via quasi-maximum likelihood.
 * Uses grid search with log-likelihood optimisation.
 */
function estimateDCCParams(
  z: number[][],
  k: number,
  n: number
): { dccAlpha: number; dccBeta: number } {
  // Compute Q_bar (sample correlation of standardized residuals)
  const qBar = computeSampleCorrelation(z, k, n);

  let bestAlpha = 0.01;
  let bestBeta = 0.94;
  let bestLogL = -Infinity;

  // Grid search
  for (let alpha = 0.001; alpha <= 0.15; alpha += 0.01) {
    for (let beta = 0.8; beta <= 0.98; beta += 0.02) {
      if (alpha + beta >= 0.999) continue;

      const logL = dccLogLikelihood(z, qBar, alpha, beta, k, n);

      if (logL > bestLogL) {
        bestLogL = logL;
        bestAlpha = alpha;
        bestBeta = beta;
      }
    }
  }

  // Refine
  const step = 0.005;
  for (let alpha = bestAlpha - 0.02; alpha <= bestAlpha + 0.02; alpha += step) {
    for (let beta = bestBeta - 0.04; beta <= bestBeta + 0.04; beta += step) {
      if (alpha < 0.001 || beta < 0.5) continue;
      if (alpha + beta >= 0.999) continue;

      const logL = dccLogLikelihood(z, qBar, alpha, beta, k, n);

      if (logL > bestLogL) {
        bestLogL = logL;
        bestAlpha = alpha;
        bestBeta = beta;
      }
    }
  }

  return { dccAlpha: bestAlpha, dccBeta: bestBeta };
}

/**
 * Compute sample correlation matrix of standardized residuals.
 */
function computeSampleCorrelation(z: number[][], k: number, n: number): number[][] {
  const qBar: number[][] = Array.from({ length: k }, () => new Array(k).fill(0));

  // Compute means
  const means = new Array(k).fill(0);
  for (let t = 0; t < n; t++) {
    for (let j = 0; j < k; j++) {
      means[j] += z[t][j];
    }
  }
  for (let j = 0; j < k; j++) means[j] /= n;

  // Compute covariances
  for (let i = 0; i < k; i++) {
    for (let j = 0; j < k; j++) {
      let cov = 0;
      for (let t = 0; t < n; t++) {
        cov += (z[t][i] - means[i]) * (z[t][j] - means[j]);
      }
      cov /= n;
      qBar[i][j] = cov;
    }
  }

  // Normalise to correlation
  for (let i = 0; i < k; i++) {
    for (let j = 0; j < k; j++) {
      const denom = Math.sqrt(Math.max(1e-10, qBar[i][i] * qBar[j][j]));
      qBar[i][j] = qBar[i][j] / denom;
    }
  }

  return qBar;
}

/**
 * Compute DCC log-likelihood for given alpha, beta.
 */
function dccLogLikelihood(
  z: number[][],
  qBar: number[][],
  alpha: number,
  beta: number,
  k: number,
  n: number
): number {
  // Q_1 = Q_bar
  let Qt = qBar.map((row) => [...row]);

  let logL = 0;

  for (let t = 1; t < n; t++) {
    // Update Q_t
    const zPrevOuter = outerProduct(z[t - 1], z[t - 1]);

    for (let i = 0; i < k; i++) {
      for (let j = 0; j < k; j++) {
        Qt[i][j] =
          (1 - alpha - beta) * qBar[i][j] +
          alpha * zPrevOuter[i][j] +
          beta * Qt[i][j];
      }
    }

    // Normalise to correlation R_t
    const Rt = normaliseToCorrelation(Qt, k);

    // Log-likelihood contribution: -0.5 * (z_t' R_t^{-1} z_t - z_t' z_t + log|R_t|)
    // Simplified DCC likelihood
    try {
      const logDetR = logDetMatrix(Rt, k);
      const ztRinvZ = computeZtRinvZ(z[t], Rt, k);
      const ztZt = z[t].reduce((s, v) => s + v * v, 0);

      logL += -0.5 * (ztRinvZ - ztZt + logDetR);
    } catch {
      // Numerical issues — skip this observation
      logL += -1e10;
    }
  }

  return logL;
}

/**
 * Compute dynamic conditional correlation series.
 */
function computeDynamicCorrelations(
  z: number[][],
  alpha: number,
  beta: number,
  k: number,
  n: number,
  dates: string[]
): { date: string; matrix: number[][] }[] {
  const qBar = computeSampleCorrelation(z, k, n);
  let Qt = qBar.map((row) => [...row]);

  const result: { date: string; matrix: number[][] }[] = [];

  for (let t = 0; t < n; t++) {
    if (t > 0) {
      const zPrevOuter = outerProduct(z[t - 1], z[t - 1]);
      for (let i = 0; i < k; i++) {
        for (let j = 0; j < k; j++) {
          Qt[i][j] =
            (1 - alpha - beta) * qBar[i][j] +
            alpha * zPrevOuter[i][j] +
            beta * Qt[i][j];
        }
      }
    }

    const Rt = normaliseToCorrelation(Qt, k);

    result.push({
      date: dates[t] || String(t),
      matrix: Rt.map((row) => row.map((v) => Math.round(v * 1e6) / 1e6)),
    });
  }

  return result;
}

// ---------------------------------------------------------------------------
// Linear algebra helpers
// ---------------------------------------------------------------------------

function outerProduct(a: number[], b: number[]): number[][] {
  const m = a.length;
  const n = b.length;
  const C: number[][] = Array.from({ length: m }, () => new Array(n).fill(0));
  for (let i = 0; i < m; i++) {
    for (let j = 0; j < n; j++) {
      C[i][j] = a[i] * b[j];
    }
  }
  return C;
}

function normaliseToCorrelation(Q: number[][], k: number): number[][] {
  const R: number[][] = Array.from({ length: k }, () => new Array(k).fill(0));
  for (let i = 0; i < k; i++) {
    for (let j = 0; j < k; j++) {
      const denom = Math.sqrt(Math.max(1e-10, Q[i][i] * Q[j][j]));
      R[i][j] = Q[i][j] / denom;
      // Clamp to valid range
      R[i][j] = Math.max(-1, Math.min(1, R[i][j]));
    }
  }
  return R;
}

function logDetMatrix(R: number[][], k: number): number {
  // Cholesky decomposition
  const L: number[][] = Array.from({ length: k }, () => new Array(k).fill(0));

  for (let i = 0; i < k; i++) {
    for (let j = 0; j <= i; j++) {
      let s = 0;
      for (let p = 0; p < j; p++) s += L[i][p] * L[j][p];

      if (i === j) {
        const diag = R[i][i] - s;
        if (diag <= 0) return Math.log(1e-10);
        L[i][j] = Math.sqrt(diag);
      } else {
        L[i][j] = (R[i][j] - s) / (L[j][j] || 1e-10);
      }
    }
  }

  let ld = 0;
  for (let i = 0; i < k; i++) ld += Math.log(Math.max(1e-10, L[i][i]));
  return 2 * ld;
}

function computeZtRinvZ(zt: number[], R: number[][], k: number): number {
  // Solve R x = zt using simple Gaussian elimination
  // For small k this is fine
  const A = R.map((row) => [...row]);
  const b = [...zt];

  // Forward elimination
  for (let i = 0; i < k; i++) {
    // Find pivot
    let maxVal = Math.abs(A[i][i]);
    let maxRow = i;
    for (let j = i + 1; j < k; j++) {
      if (Math.abs(A[j][i]) > maxVal) {
        maxVal = Math.abs(A[j][i]);
        maxRow = j;
      }
    }
    // Swap
    [A[i], A[maxRow]] = [A[maxRow], A[i]];
    [b[i], b[maxRow]] = [b[maxRow], b[i]];

    if (Math.abs(A[i][i]) < 1e-10) continue;

    for (let j = i + 1; j < k; j++) {
      const factor = A[j][i] / A[i][i];
      for (let p = i; p < k; p++) A[j][p] -= factor * A[i][p];
      b[j] -= factor * b[i];
    }
  }

  // Back substitution
  const x = new Array(k).fill(0);
  for (let i = k - 1; i >= 0; i--) {
    if (Math.abs(A[i][i]) < 1e-10) { x[i] = 0; continue; }
    let s = b[i];
    for (let j = i + 1; j < k; j++) s -= A[i][j] * x[j];
    x[i] = s / A[i][i];
  }

  // z' R^{-1} z = z' x
  return zt.reduce((s, v, i) => s + v * x[i], 0);
}

// ---------------------------------------------------------------------------
// Forecasting
// ---------------------------------------------------------------------------

/**
 * Forecast future correlations from a fitted DCC-GARCH model.
 *
 * For a DCC-GARCH(1,1) model, the forecast for h steps ahead is:
 *   E[Q_{t+h}] = (1 - (alpha + beta)^h) * Q_bar + (alpha + beta)^h * Q_t
 *   E[R_{t+h}] = normalise(E[Q_{t+h}])
 *
 * As h -> infinity, the forecast converges to the unconditional correlation Q_bar.
 */
export function forecastCorrelation(
  dccResult: DCCGARCHResult,
  horizon: number = 10
): { step: number; matrix: number[][] }[] {
  const { dccAlpha, dccBeta, dynamicCorrelations, assets } = dccResult;
  const k = assets.length;
  const lastCorr = dynamicCorrelations[dynamicCorrelations.length - 1];
  const lastQt = lastCorr ? lastCorr.matrix : identityMatrix(k);

  // Compute Q_bar as the average of all historical Q matrices
  // For simplicity, use the average of the dynamic correlation matrices
  const qBar: number[][] = Array.from({ length: k }, () => new Array(k).fill(0));
  const nObs = dynamicCorrelations.length;

  for (const dc of dynamicCorrelations) {
    for (let i = 0; i < k; i++) {
      for (let j = 0; j < k; j++) {
        qBar[i][j] += dc.matrix[i][j] / nObs;
      }
    }
  }

  const forecasts: { step: number; matrix: number[][] }[] = [];
  const abSum = dccAlpha + dccBeta;

  for (let h = 1; h <= horizon; h++) {
    const decay = Math.pow(abSum, h);
    const qForecast: number[][] = Array.from({ length: k }, () => new Array(k).fill(0));

    for (let i = 0; i < k; i++) {
      for (let j = 0; j < k; j++) {
        qForecast[i][j] = (1 - decay) * qBar[i][j] + decay * lastQt[i][j];
      }
    }

    const rForecast = normaliseToCorrelation(qForecast, k);

    forecasts.push({
      step: h,
      matrix: rForecast.map((row) => row.map((v) => Math.round(v * 1e6) / 1e6)),
    });
  }

  return forecasts;
}

function identityMatrix(k: number): number[][] {
  return Array.from({ length: k }, (_, i) =>
    Array.from({ length: k }, (_, j) => (i === j ? 1 : 0))
  );
}
