const DEFAULT_MAX_LENGTH = 8_000;

function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, Math.max(0, maxLength - 15))}…[truncated]`;
}

/**
 * Redacts common credentials and PII before an error is printed or transmitted.
 * This is intentionally conservative: it protects observability output without
 * pretending to be a substitute for a data-classification policy.
 */
export function redactSensitiveData(value: unknown, maxLength = DEFAULT_MAX_LENGTH): string {
  let text: string;
  try {
    text = typeof value === 'string' ? value : String(value ?? '');
  } catch {
    text = '[unprintable]';
  }

  text = text
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [REDACTED]')
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, '[REDACTED_JWT]')
    .replace(/(["']?(?:token|api[_-]?key|secret|password|passwd|authorization|access[_-]?token|client[_-]?secret)["']?\s*:\s*")([^"\\]*(?:\\.[^"\\]*)*)(")/gi, '$1[REDACTED]$3')
    .replace(/(["']?(?:token|api[_-]?key|secret|password|passwd|authorization|access[_-]?token|client[_-]?secret)["']?\s*:\s*')([^'\\]*(?:\\.[^'\\]*)*)(')/gi, '$1[REDACTED]$3')
    .replace(/([?&](?:token|api[_-]?key|secret|password|passwd|authorization|access[_-]?token|client[_-]?secret)=)[^&#\s]+/gi, '$1[REDACTED]')
    .replace(/(\b(?:token|api[_-]?key|secret|password|passwd|authorization|access[_-]?token|client[_-]?secret)\s*[:=]\s*)[^\s,;]+/gi, '$1[REDACTED]')
    .replace(/(https?:\/\/)([^\s/@:]+):([^\s/@]+)@/gi, '$1[REDACTED]@')
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[REDACTED_EMAIL]')
    .replace(/(?:[A-Za-z]:[\\/]|\/(?:Users|home|root|workspace|app)\/)[^\s)\]]+/g, '[REDACTED_PATH]')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '');

  return truncate(text, Math.max(64, maxLength));
}

export function redactStack(stack: unknown, maxLength = DEFAULT_MAX_LENGTH): string | undefined {
  if (typeof stack !== 'string') return undefined;
  return redactSensitiveData(stack, maxLength);
}

/** Keep a useful basename while preventing deployment paths from leaking. */
export function redactFilePath(value: string | null | undefined, enabled = true): string | null | undefined {
  if (value === null || value === undefined || !enabled) return value;
  const normalized = value.replace(/\\/g, '/');
  if (/^(?:[A-Za-z]:\/|\/|file:|data:|webpack:|vite:|rollup:)/i.test(normalized)) {
    const basename = normalized.split('/').filter(Boolean).pop() || '[unknown]';
    return `[PATH]/${redactSensitiveData(basename, 300)}`;
  }
  return redactSensitiveData(normalized, 1_000);
}
