import { afterEach, describe, expect, it, vi } from 'vitest';
import { formatErrorBrowser } from '../src/formatter/browser.js';
import { errorFormatter } from '../src/middleware/index.js';
import { sendWebhookNotification } from '../src/integrations/webhook.js';
import { getSearchLinks } from '../src/suggestions/links.js';
import { getSuggestions, registerRule } from '../src/suggestions/index.js';
import { resetConfig, setupConfig } from '../src/config.js';

describe('enterprise safety boundaries', () => {
  afterEach(() => {
    resetConfig();
    vi.restoreAllMocks();
  });

  it('keeps secrets out of search links and browser console output', () => {
    const error = new Error('failed with Bearer secret-token and alice@example.com');
    const links = getSearchLinks(error);
    expect(links.join('\n')).not.toContain('secret-token');
    expect(links.join('\n')).not.toContain('alice@example.com');
    expect(formatErrorBrowser(error).join('\n')).not.toContain('secret-token');
    expect(formatErrorBrowser(error).join('\n')).not.toContain('alice@example.com');
  });

  it('isolates throwing custom rules from the formatter', () => {
    const unregister = registerRule({
      match: () => { throw new Error('rule bug'); },
      message: 'never shown',
      confidence: 1,
    });
    expect(() => getSuggestions(new Error('ordinary failure'))).not.toThrow();
    unregister();
  });

  it('delegates headers-sent errors to Express and hides messages by default', () => {
    const next = vi.fn();
    const sentResponse = { headersSent: true } as any;
    errorFormatter()(new Error('secret database password=abc'), {} as any, sentResponse, next);
    expect(next).toHaveBeenCalledWith(expect.any(Error));

    const response = {
      headersSent: false,
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    } as any;
    const error: any = new Error('do not expose this');
    error.statusCode = 422;
    errorFormatter()(error, {} as any, response, vi.fn());
    expect(response.status).toHaveBeenCalledWith(422);
    expect(response.json).toHaveBeenCalledWith({ error: { name: 'Error', message: 'Internal Server Error' } });
  });

  it('uses provider-compatible webhook payloads and reports HTTP failures', async () => {
    const fetch = vi.fn().mockResolvedValue({ ok: true, status: 204 });
    const sent = await sendWebhookNotification(new Error('webhook secret=abc'), {
      url: 'https://discord.com/api/webhooks/test',
      fetch,
    });
    expect(sent.sent).toBe(true);
    expect(JSON.parse(fetch.mock.calls[0][1].body as string)).toHaveProperty('content');
    expect(fetch.mock.calls[0][1].body).not.toContain('secret=abc');

    const failed = await sendWebhookNotification(new Error('failure'), {
      url: 'https://hooks.slack.com/services/test',
      fetch: vi.fn().mockResolvedValue({ ok: false, status: 500 }),
    });
    expect(failed.sent).toBe(false);
    expect(failed.status).toBe(500);
  });

  it('times out webhook delivery', async () => {
    const fetch = vi.fn((_url: URL, init: RequestInit) => new Promise((_resolve, reject) => {
      init.signal?.addEventListener('abort', () => reject(new Error('aborted')));
    }));
    const result = await sendWebhookNotification(new Error('slow endpoint'), {
      url: 'https://example.com/hook',
      timeoutMs: 10,
      fetch,
    });
    expect(result.sent).toBe(false);
  });

  it('supports explicit redaction configuration', () => {
    setupConfig({ redactSensitiveData: false });
    expect(formatErrorBrowser(new Error('token=visible'))[0]).toContain('token=visible');
  });
});
