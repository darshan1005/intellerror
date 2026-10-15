/**
 * Small, defensive helpers used by every formatter.
 *
 * Error values cross process, worker and iframe boundaries surprisingly often.
 * Relying on `instanceof Error` in an observability library means losing the
 * useful parts of those errors, so IntellError normalizes them at the edge.
 */
export type UnknownError = unknown;

export function readProperty(value: unknown, key: string): unknown {
  if ((typeof value !== 'object' && typeof value !== 'function') || value === null) {
    return undefined;
  }

  try {
    return (value as Record<string, unknown>)[key];
  } catch {
    return undefined;
  }
}

export function safeString(value: unknown, fallback = ''): string {
  if (typeof value === 'string') return value;
  if (value === null) return 'null';
  if (value === undefined) return fallback;

  try {
    return String(value);
  } catch {
    return fallback;
  }
}

export function isErrorLike(value: unknown): value is Record<string, unknown> {
  if (value instanceof Error) return true;
  if ((typeof value !== 'object' && typeof value !== 'function') || value === null) {
    return false;
  }

  return ['name', 'message', 'stack', 'cause'].some((key) => readProperty(value, key) !== undefined);
}

function copyErrorField(target: Error, source: unknown, key: string): void {
  const value = readProperty(source, key);
  if (value === undefined) return;

  try {
    Object.defineProperty(target, key, {
      configurable: true,
      enumerable: false,
      value,
      writable: true,
    });
  } catch {
    // A hostile or frozen error must never break error formatting.
  }
}

/** Convert any thrown value into a local Error without discarding useful data. */
export function normalizeError(value: UnknownError): Error {
  if (value instanceof Error) return value;

  const message = isErrorLike(value)
    ? safeString(readProperty(value, 'message'), safeString(value))
    : safeString(value, 'Unknown error');
  const normalized = new Error(message);

  if (isErrorLike(value)) {
    const name = safeString(readProperty(value, 'name'), 'Error');
    if (name) copyErrorField(normalized, { name }, 'name');

    const stack = readProperty(value, 'stack');
    if (typeof stack === 'string') copyErrorField(normalized, { stack }, 'stack');

    for (const key of ['cause', 'code', 'severity', 'status', 'statusCode']) {
      copyErrorField(normalized, value, key);
    }
  }

  return normalized;
}

export function getErrorName(value: unknown): string {
  const explicitName = readProperty(value, 'name');
  if (typeof explicitName === 'string' && explicitName.trim()) return explicitName;

  try {
    const constructor = readProperty(value, 'constructor');
    const constructorName = readProperty(constructor, 'name');
    if (typeof constructorName === 'string' && constructorName.trim()) return constructorName;
  } catch {
    // Fall through to the stable default.
  }

  return 'Error';
}

export function getErrorMessage(value: unknown): string {
  return safeString(readProperty(value, 'message'), safeString(value, 'Unknown error'));
}

export function getErrorCause(value: unknown): unknown {
  return readProperty(value, 'cause');
}

export function getErrorCode(value: unknown): string | undefined {
  const code = readProperty(value, 'code');
  return typeof code === 'string' || typeof code === 'number' ? String(code) : undefined;
}

export function getErrorStatus(value: unknown): number | undefined {
  for (const key of ['statusCode', 'status']) {
    const candidate = readProperty(value, key);
    try {
      const status = typeof candidate === 'number' ? candidate : Number(candidate);
      if (Number.isInteger(status) && status >= 400 && status <= 599) return status;
    } catch {
      // A hostile status getter/value must not break error serialization.
    }
  }
  return undefined;
}
