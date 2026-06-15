'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Settings, Key, Wallet, Zap, BarChart3, Save, RotateCcw,
  CheckCircle2, Eye, EyeOff, Bell, Plus, Trash2, ExternalLink, RefreshCw
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';

// ---------------------------------------------------------------------------
// Settings type
// ---------------------------------------------------------------------------

interface AppSettings {
  openrouterApiKey: string;
  walletAddress: string;
  network: 'testnet' | 'mainnet';
  bypassX402: boolean;
  demoMode: boolean;
  defaultTimeRange: string;
  defaultMethod: string;
  defaultAssets: string[];
}

const DEFAULT_SETTINGS: AppSettings = {
  openrouterApiKey: '',
  walletAddress: '',
  network: 'testnet',
  bypassX402: false,
  demoMode: true,
  defaultTimeRange: '30',
  defaultMethod: 'pearson',
  defaultAssets: ['bitcoin', 'ethereum', 'solana', 'bnb', 'ripple'],
};

const STORAGE_KEY = 'corrfarm_settings';

function loadSettings(): AppSettings {
  if (typeof window === 'undefined') return DEFAULT_SETTINGS;
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return DEFAULT_SETTINGS;
    return { ...DEFAULT_SETTINGS, ...JSON.parse(stored) };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function saveSettings(settings: AppSettings) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

// ---------------------------------------------------------------------------
// Webhook types
// ---------------------------------------------------------------------------

type WebhookEventType = 'correlation_threshold' | 'regime_change' | 'opportunity_detected';

interface RegisteredWebhook {
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

const EVENT_TYPE_LABELS: Record<WebhookEventType, string> = {
  correlation_threshold: 'Correlation Threshold',
  regime_change: 'Regime Change',
  opportunity_detected: 'Opportunity Detected',
};

const EVENT_TYPE_DESCRIPTIONS: Record<WebhookEventType, string> = {
  correlation_threshold: 'Fires when |correlation| ≥ threshold between two assets',
  regime_change: 'Fires when market regime changes (e.g. normal → risk-on)',
  opportunity_detected: 'Fires when a correlation-vs-market opportunity appears',
};

const EVENT_TYPE_COLORS: Record<WebhookEventType, string> = {
  correlation_threshold: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  regime_change: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  opportunity_detected: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function SettingsPage() {
  const [settings, setSettings] = useState<AppSettings>(() => {
    if (typeof window === 'undefined') return DEFAULT_SETTINGS;
    return loadSettings();
  });
  const [showApiKey, setShowApiKey] = useState(false);
  const [saved, setSaved] = useState(false);

  // Webhook state
  const [webhooks, setWebhooks] = useState<RegisteredWebhook[]>([]);
  const [webhooksLoading, setWebhooksLoading] = useState(false);
  const [showWebhookForm, setShowWebhookForm] = useState(false);
  const [webhookForm, setWebhookForm] = useState<{
    eventType: WebhookEventType;
    threshold: string;
    callbackUrl: string;
    assetFilter: string;
  }>({
    eventType: 'correlation_threshold',
    threshold: '0.8',
    callbackUrl: '',
    assetFilter: '',
  });
  const [webhookSubmitting, setWebhookSubmitting] = useState(false);
  const [webhookError, setWebhookError] = useState<string | null>(null);

  const updateSetting = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
    setSaved(false);
  };

  const handleSave = () => {
    saveSettings(settings);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  const handleReset = () => {
    setSettings(DEFAULT_SETTINGS);
    saveSettings(DEFAULT_SETTINGS);
    setSaved(false);
  };

  // ----- Webhook operations -----

  const fetchWebhooks = useCallback(async () => {
    setWebhooksLoading(true);
    try {
      const res = await fetch('/api/x402/webhooks', {
        headers: { 'X-Bypass-Payment': 'true' },
      });
      if (res.ok) {
        const data = await res.json();
        setWebhooks(data.webhooks || []);
      }
    } catch (err) {
      console.error('Failed to fetch webhooks:', err);
    } finally {
      setWebhooksLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchWebhooks();
  }, [fetchWebhooks]);

  const handleRegisterWebhook = async () => {
    setWebhookSubmitting(true);
    setWebhookError(null);

    try {
      const threshold = parseFloat(webhookForm.threshold);
      if (isNaN(threshold)) {
        setWebhookError('Threshold must be a valid number');
        return;
      }

      if (!webhookForm.callbackUrl.trim()) {
        setWebhookError('Callback URL is required');
        return;
      }

      const res = await fetch('/api/x402/webhooks', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Bypass-Payment': 'true',
        },
        body: JSON.stringify({
          eventType: webhookForm.eventType,
          threshold,
          callbackUrl: webhookForm.callbackUrl.trim(),
          assetFilter: webhookForm.assetFilter.trim() || undefined,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setWebhookError(data.error || 'Failed to register webhook');
        return;
      }

      // Reset form and refresh list
      setWebhookForm({
        eventType: 'correlation_threshold',
        threshold: '0.8',
        callbackUrl: '',
        assetFilter: '',
      });
      setShowWebhookForm(false);
      await fetchWebhooks();
    } catch (err) {
      setWebhookError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setWebhookSubmitting(false);
    }
  };

  const handleDeleteWebhook = async (webhookId: string) => {
    try {
      const res = await fetch('/api/x402/webhooks', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'X-Bypass-Payment': 'true',
        },
        body: JSON.stringify({ webhookId }),
      });

      if (res.ok) {
        await fetchWebhooks();
      }
    } catch (err) {
      console.error('Failed to delete webhook:', err);
    }
  };

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Settings className="h-6 w-6 text-amber-400" />
          Settings
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Configure API keys, wallet, payment, and data preferences
        </p>
      </div>

      {/* API Configuration */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Key className="h-5 w-5 text-amber-400" />
            API Configuration
          </CardTitle>
          <CardDescription>Keys are stored locally in your browser only</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="openrouter-key" className="text-sm">OpenRouter API Key</Label>
            <p className="text-xs text-muted-foreground mb-1.5">
              Used for LLM-powered fake news analysis via OpenRouter. Supports Gemini, Claude, Llama and more. Get your key at openrouter.ai/keys. Leave empty to use heuristic fallback.
            </p>
            <div className="flex gap-2">
              <div className="flex-1 relative">
                <Input
                  id="openrouter-key"
                  type={showApiKey ? 'text' : 'password'}
                  placeholder="sk-or-..."
                  value={settings.openrouterApiKey}
                  onChange={(e) => updateSetting('openrouterApiKey', e.target.value)}
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowApiKey(!showApiKey)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Algorand Wallet */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Wallet className="h-5 w-5 text-amber-400" />
            Algorand Wallet
          </CardTitle>
          <CardDescription>Wallet configuration for x402 payments</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="wallet-address" className="text-sm">Wallet Address</Label>
            <Input
              id="wallet-address"
              placeholder="ALGORAND_WALLET_ADDRESS..."
              value={settings.walletAddress}
              onChange={(e) => updateSetting('walletAddress', e.target.value)}
              className="mt-1.5 font-mono text-xs"
            />
          </div>
          <div>
            <Label className="text-sm">Network</Label>
            <Select
              value={settings.network}
              onValueChange={(v) => updateSetting('network', v as 'testnet' | 'mainnet')}
            >
              <SelectTrigger className="mt-1.5">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="testnet">Testnet</SelectItem>
                <SelectItem value="mainnet">Mainnet</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground mt-1">
              Hackathon uses testnet. Switch to mainnet for production.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* x402 Configuration */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Zap className="h-5 w-5 text-amber-400" />
            x402 Configuration
          </CardTitle>
          <CardDescription>Payment protocol settings</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-sm">Bypass Mode</Label>
              <p className="text-xs text-muted-foreground">Skip payment checks (development only)</p>
            </div>
            <Switch
              checked={settings.bypassX402}
              onCheckedChange={(v) => updateSetting('bypassX402', v)}
            />
          </div>
          <Separator />
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-sm">Demo Mode</Label>
              <p className="text-xs text-muted-foreground">Auto-approve demo payments without real transactions</p>
            </div>
            <Switch
              checked={settings.demoMode}
              onCheckedChange={(v) => updateSetting('demoMode', v)}
            />
          </div>
          {settings.demoMode && (
            <div className="rounded-md bg-amber-500/10 border border-amber-500/20 p-3 text-xs text-amber-400">
              Demo mode is active. All paywalls will show a &quot;Try Demo&quot; button that grants free access.
            </div>
          )}
        </CardContent>
      </Card>

      {/* Webhooks */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg flex items-center gap-2">
                <Bell className="h-5 w-5 text-amber-400" />
                Webhooks
              </CardTitle>
              <CardDescription className="mt-1">
                Register callback URLs that fire on specific events ($0.05 per registration via x402)
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="icon"
                onClick={fetchWebhooks}
                disabled={webhooksLoading}
                className="h-8 w-8"
              >
                <RefreshCw className={`h-4 w-4 ${webhooksLoading ? 'animate-spin' : ''}`} />
              </Button>
              <Button
                size="sm"
                onClick={() => setShowWebhookForm(!showWebhookForm)}
                className="gap-1.5 bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 text-white"
              >
                <Plus className="h-3.5 w-3.5" />
                Add
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Register Webhook Form */}
          {showWebhookForm && (
            <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-4 space-y-4">
              <h4 className="text-sm font-semibold">Register New Webhook</h4>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label className="text-sm">Event Type</Label>
                  <Select
                    value={webhookForm.eventType}
                    onValueChange={(v) => {
                      setWebhookForm((prev) => ({
                        ...prev,
                        eventType: v as WebhookEventType,
                        threshold: v === 'correlation_threshold' ? '0.8' : v === 'regime_change' ? '0.7' : '0.05',
                      }));
                    }}
                  >
                    <SelectTrigger className="mt-1.5">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="correlation_threshold">Correlation Threshold</SelectItem>
                      <SelectItem value="regime_change">Regime Change</SelectItem>
                      <SelectItem value="opportunity_detected">Opportunity Detected</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground mt-1">
                    {EVENT_TYPE_DESCRIPTIONS[webhookForm.eventType]}
                  </p>
                </div>

                <div>
                  <Label className="text-sm">Threshold</Label>
                  <Input
                    type="number"
                    step="0.01"
                    min={webhookForm.eventType === 'correlation_threshold' ? -1 : 0}
                    max={webhookForm.eventType === 'correlation_threshold' ? 1 : 1}
                    value={webhookForm.threshold}
                    onChange={(e) => setWebhookForm((prev) => ({ ...prev, threshold: e.target.value }))}
                    className="mt-1.5"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    {webhookForm.eventType === 'correlation_threshold'
                      ? 'Fires when |correlation| ≥ threshold (-1 to 1)'
                      : webhookForm.eventType === 'regime_change'
                        ? 'Fires when confidence ≥ threshold (0 to 1)'
                        : 'Fires when edge ≥ threshold (0 to 1)'}
                  </p>
                </div>
              </div>

              <div>
                <Label className="text-sm">Callback URL</Label>
                <Input
                  type="url"
                  placeholder="https://your-server.com/webhook"
                  value={webhookForm.callbackUrl}
                  onChange={(e) => setWebhookForm((prev) => ({ ...prev, callbackUrl: e.target.value }))}
                  className="mt-1.5 font-mono text-xs"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Your endpoint will receive POST requests with event data and HMAC signature
                </p>
              </div>

              <div>
                <Label className="text-sm">Asset Filter (optional)</Label>
                <Input
                  placeholder="e.g. BTC-ETH or just BTC"
                  value={webhookForm.assetFilter}
                  onChange={(e) => setWebhookForm((prev) => ({ ...prev, assetFilter: e.target.value }))}
                  className="mt-1.5"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Only trigger for specific asset pairs. Leave empty for all assets.
                </p>
              </div>

              {webhookError && (
                <div className="rounded-md bg-red-500/10 border border-red-500/20 p-3 text-xs text-red-400">
                  {webhookError}
                </div>
              )}

              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  onClick={handleRegisterWebhook}
                  disabled={webhookSubmitting}
                  className="gap-1.5 bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 text-white"
                >
                  {webhookSubmitting ? (
                    <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Plus className="h-3.5 w-3.5" />
                  )}
                  Register Webhook
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setShowWebhookForm(false);
                    setWebhookError(null);
                  }}
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}

          {/* Webhook List */}
          {webhooksLoading && webhooks.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-sm">
              <RefreshCw className="h-5 w-5 animate-spin mx-auto mb-2" />
              Loading webhooks...
            </div>
          ) : webhooks.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-sm">
              <Bell className="h-8 w-8 mx-auto mb-2 opacity-30" />
              <p>No webhooks registered yet.</p>
              <p className="text-xs mt-1">Click &quot;Add&quot; to register a callback for correlation events.</p>
            </div>
          ) : (
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {webhooks.map((wh) => (
                <div
                  key={wh.id}
                  className="rounded-lg border p-4 space-y-2 hover:bg-muted/30 transition-colors"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge
                        variant="outline"
                        className={`text-xs ${EVENT_TYPE_COLORS[wh.eventType]}`}
                      >
                        {EVENT_TYPE_LABELS[wh.eventType]}
                      </Badge>
                      {wh.assetFilter && (
                        <Badge variant="outline" className="text-xs">
                          {wh.assetFilter}
                        </Badge>
                      )}
                      <Badge variant="outline" className="text-xs">
                        Threshold: {wh.threshold}
                      </Badge>
                      <Badge variant="outline" className="text-xs">
                        {wh.active ? 'Active' : 'Inactive'}
                      </Badge>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDeleteWebhook(wh.id)}
                      className="h-7 w-7 text-muted-foreground hover:text-red-400 shrink-0"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>

                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <ExternalLink className="h-3 w-3 shrink-0" />
                    <span className="font-mono truncate">{wh.callbackUrl}</span>
                  </div>

                  <div className="flex items-center gap-4 text-xs text-muted-foreground">
                    <span>Fired: {wh.firedCount}×</span>
                    {wh.lastFiredAt && (
                      <span>Last: {new Date(wh.lastFiredAt).toLocaleString()}</span>
                    )}
                    <span className="ml-auto">
                      Created: {new Date(wh.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Data Preferences */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-amber-400" />
            Data Preferences
          </CardTitle>
          <CardDescription>Default settings for correlation analysis</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label className="text-sm">Default Time Range</Label>
              <Select
                value={settings.defaultTimeRange}
                onValueChange={(v) => updateSetting('defaultTimeRange', v)}
              >
                <SelectTrigger className="mt-1.5">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="7">7 Days</SelectItem>
                  <SelectItem value="30">30 Days</SelectItem>
                  <SelectItem value="90">90 Days</SelectItem>
                  <SelectItem value="180">180 Days</SelectItem>
                  <SelectItem value="365">365 Days</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-sm">Default Correlation Method</Label>
              <Select
                value={settings.defaultMethod}
                onValueChange={(v) => updateSetting('defaultMethod', v)}
              >
                <SelectTrigger className="mt-1.5">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pearson">Pearson</SelectItem>
                  <SelectItem value="spearman">Spearman</SelectItem>
                  <SelectItem value="kendall">Kendall</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label className="text-sm">Default Assets to Track</Label>
            <p className="text-xs text-muted-foreground mb-2">
              Currently: {settings.defaultAssets.join(', ')}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {['bitcoin', 'ethereum', 'solana', 'bnb', 'ripple', 'cardano', 'dogecoin', 'avalanche', 'polkadot', 'chainlink'].map((asset) => (
                <Badge
                  key={asset}
                  variant={settings.defaultAssets.includes(asset) ? 'default' : 'outline'}
                  className="cursor-pointer text-xs capitalize"
                  onClick={() => {
                    const updated = settings.defaultAssets.includes(asset)
                      ? settings.defaultAssets.filter((a) => a !== asset)
                      : [...settings.defaultAssets, asset];
                    updateSetting('defaultAssets', updated);
                  }}
                >
                  {asset}
                </Badge>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Action Buttons */}
      <div className="flex items-center gap-3">
        <Button
          onClick={handleSave}
          className="gap-2 bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 text-white"
        >
          <Save className="h-4 w-4" />
          Save Settings
        </Button>
        <Button variant="outline" onClick={handleReset} className="gap-2">
          <RotateCcw className="h-4 w-4" />
          Reset
        </Button>
        {saved && (
          <span className="text-sm text-green-400 flex items-center gap-1">
            <CheckCircle2 className="h-4 w-4" />
            Saved
          </span>
        )}
      </div>
    </div>
  );
}
