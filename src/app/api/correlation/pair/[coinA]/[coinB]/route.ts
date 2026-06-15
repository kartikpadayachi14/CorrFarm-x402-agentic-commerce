import { NextRequest, NextResponse } from 'next/server';
import { getMultiPriceHistory } from '@/lib/binance/client';
import {
  computePairCorrelation,
  computeRollingCorrelation,
  computeBestCorrelation,
  interpretCorrelation,
} from '@/lib/correlation/engine';
import { computeTailDependence } from '@/lib/correlation/copula';
import { checkAccess } from '@/lib/x402/gateway';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ coinA: string; coinB: string }> }
) {
  // x402 payment check
  const paymentHeader = request.headers.get('x-payment') || undefined;
  const access = checkAccess('pair_correlation', paymentHeader);
  if (!access.granted) {
    return NextResponse.json(
      {
        success: false,
        error: 'Payment required',
        payment: access.paymentRequired,
      },
      { status: 402 }
    );
  }

  try {
    const { coinA, coinB } = await params;
    const { searchParams } = new URL(request.url);
    const days = parseInt(searchParams.get('days') || '90', 10);

    // Fetch aligned price/return history for the pair
    const multiReturns = await getMultiPriceHistory([coinA, coinB], days);
    const returnsA = multiReturns.assets[coinA];
    const returnsB = multiReturns.assets[coinB];

    if (!returnsA || !returnsB) {
      return NextResponse.json(
        { success: false, error: 'Could not fetch data for one or both coins' },
        { status: 400 }
      );
    }

    // Compute correlation with all 3 methods
    const pearson = computePairCorrelation(returnsA, returnsB, 'pearson');
    const spearman = computePairCorrelation(returnsA, returnsB, 'spearman');
    const kendall = computePairCorrelation(returnsA, returnsB, 'kendall');

    // Auto-selected "best" correlation (CEO requirement: single trustworthy number)
    const best = computeBestCorrelation(returnsA, returnsB);

    // Compute rolling correlation (30-day window)
    const rolling = computeRollingCorrelation(returnsA, returnsB, 30);

    // Compute tail dependence via copula
    const tailDependence = computeTailDependence(returnsA, returnsB);

    // Overall interpretation based on Pearson
    const interpretation = interpretCorrelation(pearson.correlation);

    return NextResponse.json({
      success: true,
      data: {
        coinA,
        coinB,
        days,
        nObservations: pearson.nObservations,
        best,
        correlations: {
          pearson,
          spearman,
          kendall,
        },
        rollingCorrelation: rolling,
        tailDependence,
        interpretation,
        dates: multiReturns.dates,
      },
    });
  } catch (error) {
    console.error('[API /correlation/pair] Error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to compute pair correlation' },
      { status: 500 }
    );
  }
}
