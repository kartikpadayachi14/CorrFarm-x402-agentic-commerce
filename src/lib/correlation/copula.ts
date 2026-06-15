/**
 * CorrFarm — Student-t Copula Implementation
 *
 * Fits a Student-t copula to multi-asset returns using method of moments
 * for degrees of freedom estimation. Computes tail dependence and
 * provides simulation capability.
 *
 * All statistical functions implemented from scratch in TypeScript.
 */

import type { MultiAssetReturns } from '../binance/client';
import { kendallCorrelation } from './engine';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CopulaParams {
  df: number; // degrees of freedom
  correlationMatrix: number[][];
  assets: string[];
}

export interface TailDependence {
  upper: number;
  lower: number;
}

export interface CopulaResult {
  params: CopulaParams;
  tailDependence: Record<string, Record<string, TailDependence>>;
  logLikelihood: number;
  aic: number;
}

// ---------------------------------------------------------------------------
// Math helpers
// ---------------------------------------------------------------------------

/** Log-gamma via Lanczos approximation */
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

/** Gamma function from log-gamma */
function gamma(z: number): number {
  return Math.exp(lgamma(z));
}

/** Regularised incomplete beta function */
function betaIncomplete(x: number, a: number, b: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const lnBeta = lgamma(a) + lgamma(b) - lgamma(a + b);
  const front = Math.exp(Math.log(x) * a + Math.log(1 - x) * b - lnBeta);
  if (x < (a + 1) / (a + b + 2)) {
    return front * betaCF(x, a, b) / a;
  }
  return 1 - front * betaCF(1 - x, b, a) / b;
}

/** Continued fraction for I_x(a,b) */
function betaCF(x: number, a: number, b: number): number {
  const maxIter = 200;
  const eps = 3e-12;
  const qab = a + b;
  const qap = a + 1;
  const qam = a - 1;
  let c = 1;
  let d = 1 - (qab * x) / qap;
  if (Math.abs(d) < 1e-30) d = 1e-30;
  d = 1 / d;
  let h = d;

  for (let m = 1; m <= maxIter; m++) {
    const m2 = 2 * m;
    let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
    d = 1 + aa * d; if (Math.abs(d) < 1e-30) d = 1e-30;
    c = 1 + aa / c; if (Math.abs(c) < 1e-30) c = 1e-30;
    d = 1 / d; h *= d * c;

    aa = -((a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
    d = 1 + aa * d; if (Math.abs(d) < 1e-30) d = 1e-30;
    c = 1 + aa / c; if (Math.abs(c) < 1e-30) c = 1e-30;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < eps) break;
  }
  return h;
}

/**
 * Standard normal CDF using rational approximation (Abramowitz & Stegun 26.2.17).
 */
function normCDF(x: number): number {
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;

  const sign = x < 0 ? -1 : 1;
  const absX = Math.abs(x);
  const t = 1 / (1 + p * absX);
  const y = 1 - ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-absX * absX / 2);
  return 0.5 * (1 + sign * y);
}

/**
 * Inverse normal CDF (quantile function) using rational approximation.
 * Peter Acklam's algorithm.
 */
function normInv(p: number): number {
  if (p <= 0) return -Infinity;
  if (p >= 1) return Infinity;
  if (p === 0.5) return 0;

  const a: number[] = [
    -3.969683028665376e+01, 2.209460984245205e+02,
    -2.759285104469687e+02, 1.383577518672690e+02,
    -3.066479806614716e+01, 2.506628277459239e+00,
  ];
  const b: number[] = [
    -5.447609879822406e+01, 1.615858368580409e+02,
    -1.556989798598866e+02, 6.680131188771972e+01,
    -1.328068155288572e+01,
  ];
  const c: number[] = [
    -7.784894002430293e-03, -3.223964580411365e-01,
    -2.400758277161838e+00, -2.549732539343734e+00,
    4.374664141464968e+00, 2.938163982698783e+00,
  ];
  const d: number[] = [
    7.784695709041462e-03, 3.224671290700398e-01,
    2.445134137142996e+00, 3.754408661907416e+00,
  ];

  const pLow = 0.02425;
  const pHigh = 1 - pLow;
  let q: number, r: number;

  if (p < pLow) {
    q = Math.sqrt(-2 * Math.log(p));
    return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
      ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  } else if (p <= pHigh) {
    q = p - 0.5;
    r = q * q;
    return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q /
      (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
  } else {
    q = Math.sqrt(-2 * Math.log(1 - p));
    return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
      ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
}

/**
 * Student-t CDF using the regularised incomplete beta function.
 */
function studentTCDF(t: number, df: number): number {
  if (df <= 0) return normCDF(t);
  const x = df / (df + t * t);
  const p = betaIncomplete(x, df / 2, 0.5);
  if (t >= 0) return 1 - 0.5 * p;
  return 0.5 * p;
}

/**
 * Inverse Student-t CDF using bisection.
 */
function studentTInv(p: number, df: number): number {
  if (df > 30) return normInv(p); // Approximate with normal for large df

  let lo = -100;
  let hi = 100;
  for (let i = 0; i < 100; i++) {
    const mid = (lo + hi) / 2;
    if (studentTCDF(mid, df) < p) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

// ---------------------------------------------------------------------------
// Empirical CDF and pseudo-observations
// ---------------------------------------------------------------------------

/**
 * Compute pseudo-observations (uniform marginals) via empirical CDF.
 * Uses the rank transform: u_i = rank(x_i) / (n + 1)
 * The (n+1) denominator avoids boundary issues at 0 and 1.
 */
function empiricalCDF(arr: number[]): number[] {
  const n = arr.length;
  const indexed = arr.map((v, i) => ({ v, i }));
  indexed.sort((a, b) => a.v - b.v);

  const ranks = new Array<number>(n);
  let idx = 0;
  while (idx < n) {
    let j = idx;
    while (j < n && indexed[j].v === indexed[idx].v) j++;
    const avgRank = (idx + j - 1) / 2 + 1; // 1-based average rank
    for (let k = idx; k < j; k++) {
      ranks[indexed[k].i] = avgRank;
    }
    idx = j;
  }

  return ranks.map((r) => r / (n + 1));
}

// ---------------------------------------------------------------------------
// Matrix operations
// ---------------------------------------------------------------------------

/** Cholesky decomposition of a positive-definite matrix */
function cholesky(A: number[][]): number[][] {
  const n = A.length;
  const L: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));

  for (let i = 0; i < n; i++) {
    for (let j = 0; j <= i; j++) {
      let s = 0;
      for (let k = 0; k < j; k++) s += L[i][k] * L[j][k];

      if (i === j) {
        const diag = A[i][i] - s;
        if (diag <= 0) {
          // Regularise: add small epsilon to diagonal
          L[i][j] = Math.sqrt(Math.max(1e-10, diag));
        } else {
          L[i][j] = Math.sqrt(diag);
        }
      } else {
        L[i][j] = (A[i][j] - s) / (L[j][j] || 1e-10);
      }
    }
  }
  return L;
}

/** Matrix transpose */
function transpose(A: number[][]): number[][] {
  const m = A.length;
  const n = A[0]?.length || 0;
  const T: number[][] = Array.from({ length: n }, () => new Array(m).fill(0));
  for (let i = 0; i < m; i++) {
    for (let j = 0; j < n; j++) {
      T[j][i] = A[i][j];
    }
  }
  return T;
}

/** Matrix multiplication */
function matMul(A: number[][], B: number[][]): number[][] {
  const m = A.length;
  const p = B[0]?.length || 0;
  const n = B.length;
  const C: number[][] = Array.from({ length: m }, () => new Array(p).fill(0));
  for (let i = 0; i < m; i++) {
    for (let j = 0; j < p; j++) {
      let s = 0;
      for (let k = 0; k < n; k++) s += A[i][k] * B[k][j];
      C[i][j] = s;
    }
  }
  return C;
}

/** Matrix determinant via Cholesky (for positive-definite only) */
function logDet(A: number[][]): number {
  const L = cholesky(A);
  let ld = 0;
  for (let i = 0; i < L.length; i++) ld += Math.log(L[i][i]);
  return 2 * ld;
}

/** Compute inverse of diagonal matrix */
function diagInvSqrt(M: number[][]): number[][] {
  const n = M.length;
  const D: number[][] = Array.from({ length: n }, (_, i) =>
    Array.from({ length: n }, (_, j) => (i === j ? 1 / Math.sqrt(Math.max(1e-10, M[i][i])) : 0))
  );
  return D;
}

/** Make a correlation matrix from a raw covariance-like matrix */
function normaliseToCorrelation(Q: number[][]): number[][] {
  const n = Q.length;
  const R: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const denom = Math.sqrt(Math.max(1e-10, Q[i][i] * Q[j][j]));
      R[i][j] = Q[i][j] / denom;
    }
  }
  return R;
}

// ---------------------------------------------------------------------------
// Random number generation (simple)
// ---------------------------------------------------------------------------

/** Box-Muller standard normal */
function randn(): number {
  const u1 = Math.random();
  const u2 = Math.random();
  return Math.sqrt(-2 * Math.log(u1 || 1e-30)) * Math.cos(2 * Math.PI * u2);
}

/** Generate a chi-squared random variable with df degrees of freedom */
function randChiSq(df: number): number {
  let s = 0;
  for (let i = 0; i < df; i++) {
    const z = randn();
    s += z * z;
  }
  return s;
}

/** Generate a Student-t random variable */
function randStudentT(df: number): number {
  const z = randn();
  const v = randChiSq(df);
  return z * Math.sqrt(df / v);
}

// ---------------------------------------------------------------------------
// Degrees of freedom estimation via method of moments
// ---------------------------------------------------------------------------

/**
 * Estimate degrees of freedom for Student-t copula using method of moments.
 * Uses the relationship: E[|X|^4] = 3*df^2 / ((df-2)*(df-4)) for df > 4
 * And kurtosis: kappa = 3*(df-2)/(df-4)
 *
 * We solve: empirical_kurtosis = 3*(df-2)/(df-4)
 * => df = (4*kappa - 6)/(kappa - 3) for kappa > 3
 */
function estimateDF(standardizedData: number[][]): number {
  const allResiduals: number[] = [];
  for (const row of standardizedData) {
    allResiduals.push(...row);
  }

  if (allResiduals.length < 10) return 5; // default

  const m = allResiduals.reduce((s, v) => s + v, 0) / allResiduals.length;
  const v2 = allResiduals.reduce((s, v) => s + (v - m) ** 2, 0) / allResiduals.length;
  const v4 = allResiduals.reduce((s, v) => s + (v - m) ** 4, 0) / allResiduals.length;

  if (v2 === 0) return 5;

  const kurtosis = v4 / (v2 * v2);

  // Excess kurtosis for Student-t: gamma2 = 6/(df-4) for df > 4
  // kurtosis = 3 + 6/(df-4)
  // => df = 4 + 6/(kurtosis - 3)
  if (kurtosis <= 3) return 30; // Approximately normal
  const df = 4 + 6 / (kurtosis - 3);

  // Clamp to reasonable range
  return Math.max(2.1, Math.min(100, df));
}

// ---------------------------------------------------------------------------
// Tail dependence computation
// ---------------------------------------------------------------------------

/**
 * Compute upper and lower tail dependence coefficients for a bivariate
 * Student-t copula with given correlation rho and degrees of freedom df.
 *
 * Upper tail dependence: lambda_U = 2 * t_{df+1}(-sqrt((df+1)*(1-rho)/(1+rho)))
 * Lower tail dependence is the same by symmetry of the Student-t copula.
 */
function computeBivariateTailDependence(rho: number, df: number): TailDependence {
  if (rho <= -1) return { upper: 0, lower: 0 };
  if (rho >= 1) return { upper: 1, lower: 1 };

  const rhoClamped = Math.max(-0.9999, Math.min(0.9999, rho));
  const arg = Math.sqrt((df + 1) * (1 - rhoClamped) / (1 + rhoClamped));
  const lambda = 2 * (1 - studentTCDF(arg, df + 1));

  return {
    upper: Math.max(0, Math.min(1, lambda)),
    lower: Math.max(0, Math.min(1, lambda)), // Student-t copula is symmetric
  };
}

// ---------------------------------------------------------------------------
// Log-likelihood computation
// ---------------------------------------------------------------------------

/**
 * Compute log-likelihood of the Student-t copula.
 * log L = sum_i log c(u_i1, ..., u_iK | df, R)
 * where c is the Student-t copula density.
 */
function computeLogLikelihood(
  pseudoObs: number[][],   // NxK matrix of uniform pseudo-observations
  corrMatrix: number[][],
  df: number
): number {
  const n = pseudoObs.length;
  const k = pseudoObs[0].length;
  const logDetR = logDet(corrMatrix);

  const halfK = k / 2;
  const logNorm = lgamma((df + k) / 2) - lgamma(df / 2) - halfK * Math.log(df * Math.PI) - 0.5 * logDetR;

  let ll = 0;

  for (let i = 0; i < n; i++) {
    // Transform uniform -> Student-t quantiles
    const z: number[] = [];
    for (let j = 0; j < k; j++) {
      const u = Math.max(1e-10, Math.min(1 - 1e-10, pseudoObs[i][j]));
      z.push(studentTInv(u, df));
    }

    // z' R^{-1} z — simplified using diagonal solve
    // For numerical stability, use the fact that for correlation matrices
    // we can compute z' * R^{-1} * z via Cholesky solve
    const L = cholesky(corrMatrix);
    // Solve L y = z
    const y = new Array<number>(k).fill(0);
    for (let ii = 0; ii < k; ii++) {
      let s = z[ii];
      for (let jj = 0; jj < ii; jj++) s -= L[ii][jj] * y[jj];
      y[ii] = s / L[ii][ii];
    }

    let zRinvZ = 0;
    for (let ii = 0; ii < k; ii++) zRinvZ += y[ii] * y[ii];

    // Sum of log-marginal densities
    let sumLogMarg = 0;
    for (let j = 0; j < k; j++) {
      sumLogMarg += lgamma((df + 1) / 2) - lgamma(df / 2) -
        0.5 * Math.log(df * Math.PI) -
        ((df + 1) / 2) * Math.log(1 + (z[j] * z[j]) / df);
    }

    // Copula density = joint / (marginal_1 * ... * marginal_K)
    // log joint density
    const logJoint = lgamma((df + k) / 2) - lgamma(df / 2) -
      halfK * Math.log(df * Math.PI) - 0.5 * logDetR -
      ((df + k) / 2) * Math.log(1 + zRinvZ / df);

    ll += logJoint - sumLogMarg;
  }

  return ll;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Fit a Student-t copula to multi-asset returns data.
 *
 * Steps:
 * 1. Transform returns to uniform via empirical CDF (rank transform)
 * 2. Estimate correlation matrix from Kendall's tau
 * 3. Estimate degrees of freedom using method of moments
 * 4. Compute tail dependence analytically
 * 5. Compute log-likelihood and AIC
 */
export function estimateStudentTCopula(returnsData: MultiAssetReturns): CopulaResult {
  const assetNames = Object.keys(returnsData.assets);
  const k = assetNames.length;
  const n = returnsData.dates.length;

  if (k < 2) {
    throw new Error('At least 2 assets required for copula estimation');
  }

  // Step 1: Compute pseudo-observations via empirical CDF
  const pseudoObs: number[][] = [];
  const uniformData: Record<string, number[]> = {};

  for (const asset of assetNames) {
    uniformData[asset] = empiricalCDF(returnsData.assets[asset]);
  }

  for (let i = 0; i < n; i++) {
    const row: number[] = [];
    for (const asset of assetNames) {
      row.push(uniformData[asset][i]);
    }
    pseudoObs.push(row);
  }

  // Step 2: Estimate correlation matrix from Kendall's tau
  // tau = (2/pi) * arcsin(rho) => rho = sin(pi * tau / 2)
  const corrMatrix: number[][] = Array.from({ length: k }, () => new Array(k).fill(0));

  for (let i = 0; i < k; i++) {
    corrMatrix[i][i] = 1;
    for (let j = i + 1; j < k; j++) {
      const tau = kendallCorrelation(
        returnsData.assets[assetNames[i]],
        returnsData.assets[assetNames[j]]
      );
      // Convert Kendall's tau to Pearson correlation via sin formula
      const rho = Math.sin((Math.PI * tau) / 2);
      corrMatrix[i][j] = rho;
      corrMatrix[j][i] = rho;
    }
  }

  // Step 3: Transform to normal for DF estimation
  const normalData: number[][] = [];
  for (let i = 0; i < n; i++) {
    const row: number[] = [];
    for (let j = 0; j < k; j++) {
      const u = Math.max(1e-10, Math.min(1 - 1e-10, pseudoObs[i][j]));
      row.push(normInv(u));
    }
    normalData.push(row);
  }

  // Estimate degrees of freedom
  const df = estimateDF(normalData);

  // Step 4: Compute tail dependence for all pairs
  const tailDependence: Record<string, Record<string, TailDependence>> = {};
  for (let i = 0; i < k; i++) {
    tailDependence[assetNames[i]] = {};
    for (let j = 0; j < k; j++) {
      if (i === j) {
        tailDependence[assetNames[i]][assetNames[j]] = { upper: 1, lower: 1 };
      } else {
        const td = computeBivariateTailDependence(corrMatrix[i][j], df);
        tailDependence[assetNames[i]][assetNames[j]] = td;
      }
    }
  }

  // Step 5: Compute log-likelihood and AIC
  const logLikelihood = computeLogLikelihood(pseudoObs, corrMatrix, df);
  // AIC = -2 * logL + 2p, where p = number of free parameters
  // Parameters: k*(k-1)/2 correlation params + 1 df = k*(k-1)/2 + 1
  const nParams = (k * (k - 1)) / 2 + 1;
  const aic = -2 * logLikelihood + 2 * nParams;

  return {
    params: {
      df: Math.round(df * 100) / 100,
      correlationMatrix: corrMatrix.map((row) => row.map((v) => Math.round(v * 1e6) / 1e6)),
      assets: assetNames,
    },
    tailDependence,
    logLikelihood: Math.round(logLikelihood * 100) / 100,
    aic: Math.round(aic * 100) / 100,
  };
}

/**
 * Compute upper and lower tail dependence coefficients for two return series.
 * Uses empirical estimation: counts co-exceedances in the tails.
 */
export function computeTailDependence(
  returnsA: number[],
  returnsB: number[]
): TailDependence {
  const n = Math.min(returnsA.length, returnsB.length);
  if (n < 20) return { upper: 0, lower: 0 };

  const a = returnsA.slice(0, n);
  const b = returnsB.slice(0, n);

  // Sort to find thresholds (10th and 90th percentiles)
  const sortedA = [...a].sort((x, y) => x - y);
  const sortedB = [...b].sort((x, y) => x - y);

  const q10Idx = Math.floor(n * 0.1);
  const q90Idx = Math.floor(n * 0.9);
  const q10A = sortedA[q10Idx];
  const q10B = sortedB[q10Idx];
  const q90A = sortedA[q90Idx];
  const q90B = sortedB[q90Idx];

  // Lower tail: P(X < q10 & Y < q10) / P(X < q10) = count / (n*0.1)
  const nLowA = a.filter((v) => v <= q10A).length || 1;
  let lowJoint = 0;
  for (let i = 0; i < n; i++) {
    if (a[i] <= q10A && b[i] <= q10B) lowJoint++;
  }
  const lowerTD = lowJoint / nLowA;

  // Upper tail: P(X > q90 & Y > q90) / P(X > q90)
  const nHighA = a.filter((v) => v >= q90A).length || 1;
  let highJoint = 0;
  for (let i = 0; i < n; i++) {
    if (a[i] >= q90A && b[i] >= q90B) highJoint++;
  }
  const upperTD = highJoint / nHighA;

  return {
    upper: Math.max(0, Math.min(1, Math.round(upperTD * 1e4) / 1e4)),
    lower: Math.max(0, Math.min(1, Math.round(lowerTD * 1e4) / 1e4)),
  };
}

/**
 * Simulate from a fitted Student-t copula.
 *
 * Algorithm:
 * 1. Generate Z ~ N(0, R) using Cholesky decomposition
 * 2. Generate W ~ chi2(df) / df
 * 3. X = Z / sqrt(W) — multivariate Student-t
 * 4. Transform marginals to uniform via Student-t CDF
 * 5. Optionally transform to any marginal distribution
 */
export function simulateFromCopula(
  copulaParams: CopulaParams,
  nSimulations: number = 1000
): number[][] {
  const { df, correlationMatrix, assets } = copulaParams;
  const k = assets.length;
  const L = cholesky(correlationMatrix);

  const simulations: number[][] = [];

  for (let s = 0; s < nSimulations; s++) {
    // Step 1: Generate independent standard normals
    const z: number[] = [];
    for (let j = 0; j < k; j++) z.push(randn());

    // Apply Cholesky: Y = L * Z
    const y: number[] = new Array(k).fill(0);
    for (let i = 0; i < k; i++) {
      for (let j = 0; j <= i; j++) {
        y[i] += L[i][j] * z[j];
      }
    }

    // Step 2: Generate chi-squared / df
    const w = randChiSq(Math.max(2.1, Math.round(df))) / df;

    // Step 3: Multivariate Student-t
    const x = y.map((yi) => yi / Math.sqrt(w));

    // Step 4: Transform to uniform via Student-t CDF
    const u = x.map((xi) => studentTCDF(xi, df));

    simulations.push(u);
  }

  return simulations;
}
