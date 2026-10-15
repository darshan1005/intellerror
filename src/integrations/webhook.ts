import { getConfig } from '../config.js';
import { getErrorCode, getErrorMessage, getErrorName, readProperty } from '../error.js';
import { redactSensitiveData } from '../redaction.js';

export interface WebhookResult {
  sent: boolean;
  status?: number;
  provider?: 'slack' | 'discord' | 'generic';
  error?: string;
}

export interface WebhookOptions {
  url?: string;
  timeoutMs?: number;
  fetch?: typeof globalThis.fetch;
}

function providerFor(url: URL): WebhookResult['provider'] {
  if (url.hostname.includes('discord')) return 'discord';
  if (url.hostname.includes('slack')) return 'slack';
  return 'generic';
}

function safeUrl(value: string): URL | undefined {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Deliver a bounded, redacted notification. Delivery failures are returned to
 * the caller rather than thrown from an exception handler.
 */
export async function sendWebhookNotification(error: unknown, options: WebhookOptions = {}): Promise<WebhookResult> {
  const config = getConfig();
  const rawUrl = options.url ?? config.webhookUrl;
  if (!rawUrl) return { sent: false };

  const url = safeUrl(rawUrl);
  if (!url) return { sent: false, error: 'Webhook URL must use http or https' };

  const provider = providerFor(url);
  const message = redactSensitiveData(getErrorMessage(error), config.maxMessageLength);
  const stack = redactSensitiveData(readProperty(error, 'stack') || '', 3_500);
  const content = `🔥 IntellError Alert\nError: ${getErrorName(error)}${getErrorCode(error) ? ` (${getErrorCode(error)})` : ''}\nMessage: ${message}\n\nStack:\n${stack}`;
  const payload = provider === 'discord' ? { content: content.slice(0, 7_500) } : { text: content.slice(0, 7_500) };
  const fetchImpl = options.fetch || globalThis.fetch;
  if (typeof fetchImpl !== 'function') return { sent: false, provider, error: 'fetch is unavailable in this runtime' };

  const timeoutMs = options.timeoutMs ?? config.webhookTimeoutMs;
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : undefined;
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : undefined;

  try {
    const response = await fetchImpl(url, {
      method: 'POST',
      body: JSON.stringify(payload),
      headers: { 'Content-Type': 'application/json' },
      signal: controller?.signal,
    });
    if (!response.ok) {
      return { sent: false, provider, status: response.status, error: `Webhook returned HTTP ${response.status}` };
    }
    return { sent: true, provider, status: response.status };
  } catch (cause) {
    return { sent: false, provider, error: cause instanceof Error ? cause.message : 'Webhook delivery failed' };
  } finally {
    if (timer) clearTimeout(timer);
  }
}
