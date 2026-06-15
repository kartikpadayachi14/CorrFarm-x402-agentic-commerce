/**
 * CorrFarm — x402 Webhooks API Route
 * POST: Register a new webhook (with x402 payment check)
 * GET:  List registered webhooks
 * DELETE: Remove a webhook
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  registerWebhook,
  unregisterWebhook,
  getWebhooks,
  type WebhookConfig,
  type WebhookEventType,
} from '@/lib/x402/webhook';
import { checkAccess, createDemoPayment } from '@/lib/x402/gateway';

// ---------------------------------------------------------------------------
// POST — Register a new webhook
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  try {
    // Check x402 payment for webhook_registration
    const paymentHeader = request.headers.get('x-payment') || undefined;
    const bypassHeader = request.headers.get('x-bypass-payment');

    const access = checkAccess('webhook_registration', paymentHeader);

    if (!access.granted && bypassHeader !== 'true') {
      // Return 402 payment required
      return NextResponse.json(
        {
          success: false,
          error: 'Payment required',
          payment: access.paymentRequired,
        },
        { status: 402 }
      );
    }

    // If bypass is set via header, create a demo payment for access
    if (!access.granted && bypassHeader === 'true') {
      createDemoPayment('webhook_registration');
    }

    // Parse request body
    const body = await request.json();
    const { eventType, threshold, callbackUrl, assetFilter } = body;

    // Validate required fields
    if (!eventType || !callbackUrl || threshold === undefined) {
      return NextResponse.json(
        {
          success: false,
          error: 'Missing required fields: eventType, threshold, callbackUrl',
          validEventTypes: ['correlation_threshold', 'regime_change', 'opportunity_detected'],
        },
        { status: 400 }
      );
    }

    // Validate eventType
    const validEventTypes: WebhookEventType[] = ['correlation_threshold', 'regime_change', 'opportunity_detected'];
    if (!validEventTypes.includes(eventType)) {
      return NextResponse.json(
        {
          success: false,
          error: `Invalid eventType: ${eventType}`,
          validEventTypes,
        },
        { status: 400 }
      );
    }

    // Validate threshold is a number
    if (typeof threshold !== 'number') {
      return NextResponse.json(
        { success: false, error: 'Threshold must be a number' },
        { status: 400 }
      );
    }

    // Register the webhook
    const config: WebhookConfig = {
      eventType,
      threshold,
      callbackUrl,
      assetFilter: assetFilter || undefined,
    };

    const webhook = registerWebhook(config);

    return NextResponse.json(
      {
        success: true,
        data: {
          webhook,
          message: `Webhook registered for ${eventType} events. Cost: $0.05 (x402).`,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { success: false, error: message },
      { status: 400 }
    );
  }
}

// ---------------------------------------------------------------------------
// GET — List registered webhooks
// ---------------------------------------------------------------------------

export async function GET() {
  const webhooks = getWebhooks();
  return NextResponse.json({
    success: true,
    data: {
      webhooks,
      count: webhooks.length,
    },
  });
}

// ---------------------------------------------------------------------------
// DELETE — Remove a webhook
// ---------------------------------------------------------------------------

export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json();
    const { webhookId } = body;

    if (!webhookId) {
      return NextResponse.json(
        { success: false, error: 'Missing required field: webhookId' },
        { status: 400 }
      );
    }

    const removed = unregisterWebhook(webhookId);

    if (!removed) {
      return NextResponse.json(
        { success: false, error: `Webhook not found: ${webhookId}` },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        message: `Webhook ${webhookId} removed`,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { success: false, error: message },
      { status: 400 }
    );
  }
}
