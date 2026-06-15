/**
 * CorrFarm — x402 Webhook Relay
 * Lets agents pay to register a callback that triggers on specific events.
 * Events: correlation threshold breach, market regime change, opportunity detected
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type WebhookEventType = 'correlation_threshold' | 'regime_change' | 'opportunity_detected';

export interface WebhookConfig {
  eventType: WebhookEventType;
  threshold: number;
  callbackUrl: string;
  assetFilter?: string; // e.g. "BTC-ETH" for correlation_threshold
}

export interface RegisteredWebhook {
  id: string;
  eventType: WebhookEventType;
  threshold: number;
  callbackUrl: string;
  assetFilter?: string;
  createdAt: string;
  firedCount: number;
  lastFiredAt?: string;
  active: boolean;
}

export interface WebhookTriggerResult {
  webhookId: string;
  fired: boolean;
  callbackUrl: string;
  statusCode?: number;
  error?: string;
  latencyMs?: number;
}

// ---------------------------------------------------------------------------
// In-memory store
// ---------------------------------------------------------------------------

const webhookStore = new Map<string, RegisteredWebhook>();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function generateWebhookId(): string {
  return `wh-${Date.now()}-${Math.random().toString(36).substring(2, 10)}`;
}

function getWebhookSecret(): string {
  return process.env.WEBHOOK_SECRET || '';
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Register a new webhook.
 * Each registration costs a small x402 fee (handled at the API route level).
 */
export function registerWebhook(config: WebhookConfig): RegisteredWebhook {
  const id = generateWebhookId();

  // Validate callbackUrl
  try {
    new URL(config.callbackUrl);
  } catch {
    throw new Error(`Invalid callbackUrl: ${config.callbackUrl}`);
  }

  // Validate threshold range
  if (config.threshold < -1 || config.threshold > 1) {
    // For correlation_threshold, threshold is -1 to 1
    // For regime_change and opportunity_detected, threshold is 0 to 1 (probability)
    if (config.eventType === 'correlation_threshold' && (config.threshold < -1 || config.threshold > 1)) {
      throw new Error('Threshold for correlation_threshold must be between -1 and 1');
    }
    if ((config.eventType === 'regime_change' || config.eventType === 'opportunity_detected') && (config.threshold < 0 || config.threshold > 1)) {
      throw new Error('Threshold for regime_change/opportunity_detected must be between 0 and 1');
    }
  }

  const webhook: RegisteredWebhook = {
    id,
    eventType: config.eventType,
    threshold: config.threshold,
    callbackUrl: config.callbackUrl,
    assetFilter: config.assetFilter,
    createdAt: new Date().toISOString(),
    firedCount: 0,
    active: true,
  };

  webhookStore.set(id, webhook);
  return webhook;
}

/**
 * Unregister (remove) a webhook.
 */
export function unregisterWebhook(webhookId: string): boolean {
  return webhookStore.delete(webhookId);
}

/**
 * Get all registered webhooks.
 */
export function getWebhooks(): RegisteredWebhook[] {
  return Array.from(webhookStore.values());
}

/**
 * Get a single webhook by ID.
 */
export function getWebhookById(webhookId: string): RegisteredWebhook | undefined {
  return webhookStore.get(webhookId);
}

/**
 * Check all registered webhooks for matching conditions and fire callbacks.
 *
 * @param eventType - The event that occurred
 * @param data - Event data containing:
 *   - For correlation_threshold: { pair: string, correlation: number, method: string }
 *   - For regime_change: { fromRegime: string, toRegime: string, confidence: number }
 *   - For opportunity_detected: { pair: string, edge: number, confidence: number }
 */
export async function checkAndTriggerWebhooks(
  eventType: WebhookEventType,
  data: Record<string, unknown>
): Promise<WebhookTriggerResult[]> {
  const results: WebhookTriggerResult[] = [];

  const webhooks = Array.from(webhookStore.values()).filter(
    (wh) => wh.eventType === eventType && wh.active
  );

  for (const webhook of webhooks) {
    const shouldFire = evaluateCondition(webhook, data);

    if (!shouldFire) {
      results.push({
        webhookId: webhook.id,
        fired: false,
        callbackUrl: webhook.callbackUrl,
      });
      continue;
    }

    // Fire the callback
    const result = await fireCallback(webhook, data);
    results.push(result);

    // Update webhook stats
    const stored = webhookStore.get(webhook.id);
    if (stored) {
      stored.firedCount += 1;
      stored.lastFiredAt = new Date().toISOString();
    }
  }

  return results;
}

// ---------------------------------------------------------------------------
// Condition evaluation
// ---------------------------------------------------------------------------

function evaluateCondition(
  webhook: RegisteredWebhook,
  data: Record<string, unknown>
): boolean {
  switch (webhook.eventType) {
    case 'correlation_threshold': {
      const correlation = data.correlation as number | undefined;
      if (correlation === undefined) return false;

      // Check asset filter if specified
      if (webhook.assetFilter) {
        const pair = data.pair as string | undefined;
        if (pair && !pairMatchesFilter(pair, webhook.assetFilter)) {
          return false;
        }
      }

      // Fire when |correlation| >= |threshold|
      return Math.abs(correlation) >= Math.abs(webhook.threshold);
    }

    case 'regime_change': {
      const confidence = data.confidence as number | undefined;
      if (confidence === undefined) return false;

      // Fire when confidence >= threshold
      return confidence >= webhook.threshold;
    }

    case 'opportunity_detected': {
      const edge = data.edge as number | undefined;
      if (edge === undefined) return false;

      // Check asset filter if specified
      if (webhook.assetFilter) {
        const pair = data.pair as string | undefined;
        if (pair && !pairMatchesFilter(pair, webhook.assetFilter)) {
          return false;
        }
      }

      // Fire when edge >= threshold
      return edge >= webhook.threshold;
    }

    default:
      return false;
  }
}

/**
 * Check if a pair string (e.g. "BTC-ETH") matches a filter (e.g. "BTC-ETH" or "BTC").
 */
function pairMatchesFilter(pair: string, filter: string): boolean {
  const normalizedPair = pair.toUpperCase();
  const normalizedFilter = filter.toUpperCase();

  // Exact match
  if (normalizedPair === normalizedFilter) return true;

  // Single asset match — check if either side of the pair matches
  if (!filter.includes('-')) {
    const [a, b] = normalizedPair.split('-');
    return a === normalizedFilter || b === normalizedFilter;
  }

  // Reversed pair match (BTC-ETH matches ETH-BTC)
  const [fa, fb] = normalizedFilter.split('-');
  const reversedFilter = `${fb}-${fa}`;
  return normalizedPair === reversedFilter;
}

// ---------------------------------------------------------------------------
// Callback firing
// ---------------------------------------------------------------------------

async function fireCallback(
  webhook: RegisteredWebhook,
  data: Record<string, unknown>
): Promise<WebhookTriggerResult> {
  const startTime = Date.now();

  const payload = {
    webhookId: webhook.id,
    eventType: webhook.eventType,
    threshold: webhook.threshold,
    data,
    timestamp: new Date().toISOString(),
  };

  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-CorrFarm-Event': webhook.eventType,
      'X-CorrFarm-Webhook-ID': webhook.id,
    };

    // Add HMAC signature if webhook secret is configured
    const secret = getWebhookSecret();
    if (secret) {
      const bodyStr = JSON.stringify(payload);
      // Simple HMAC-like signature using SubtleCrypto (available in Node 18+)
      const encoder = new TextEncoder();
      const key = await crypto.subtle.importKey(
        'raw',
        encoder.encode(secret),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign']
      );
      const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(bodyStr));
      const sigHex = Array.from(new Uint8Array(signature))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
      headers['X-CorrFarm-Signature'] = `sha256=${sigHex}`;
    }

    const response = await fetch(webhook.callbackUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10_000), // 10s timeout
    });

    const latencyMs = Date.now() - startTime;

    return {
      webhookId: webhook.id,
      fired: true,
      callbackUrl: webhook.callbackUrl,
      statusCode: response.status,
      latencyMs,
    };
  } catch (error) {
    const latencyMs = Date.now() - startTime;

    return {
      webhookId: webhook.id,
      fired: true,
      callbackUrl: webhook.callbackUrl,
      error: error instanceof Error ? error.message : 'Unknown error',
      latencyMs,
    };
  }
}

// ---------------------------------------------------------------------------
// Convenience: trigger helpers (for use in other backend modules)
// ---------------------------------------------------------------------------

/**
 * Trigger webhooks for a correlation threshold breach.
 */
export async function triggerCorrelationWebhooks(
  pair: string,
  correlation: number,
  method: string
): Promise<WebhookTriggerResult[]> {
  return checkAndTriggerWebhooks('correlation_threshold', {
    pair,
    correlation,
    method,
  });
}

/**
 * Trigger webhooks for a market regime change.
 */
export async function triggerRegimeChangeWebhooks(
  fromRegime: string,
  toRegime: string,
  confidence: number
): Promise<WebhookTriggerResult[]> {
  return checkAndTriggerWebhooks('regime_change', {
    fromRegime,
    toRegime,
    confidence,
  });
}

/**
 * Trigger webhooks for a detected opportunity.
 */
export async function triggerOpportunityWebhooks(
  pair: string,
  edge: number,
  confidence: number
): Promise<WebhookTriggerResult[]> {
  return checkAndTriggerWebhooks('opportunity_detected', {
    pair,
    edge,
    confidence,
  });
}
