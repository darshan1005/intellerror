import type { ParsedStackFrame } from './parser/index.js';
import { getErrorCode, getErrorMessage } from './error.js';
import { redactSensitiveData } from './redaction.js';

function stableMessage(message: string): string {
  return redactSensitiveData(message, 240)
    .toLowerCase()
    .replace(/\b[0-9a-f]{8,}\b/gi, '#')
    .replace(/\b\d+\b/g, '#')
    .replace(/\s+/g, ' ')
    .trim();
}

/** A portable, deterministic fingerprint that works in browsers and workers. */
export function getFingerprint(
  type: string,
  frame: ParsedStackFrame | undefined,
  error?: unknown,
): string {
  const frameId = frame ? `${frame.originalFile || frame.file}:${frame.originalLineNumber || frame.lineNumber}:${frame.originalColumn || frame.column}` : 'no-frame';
  const code = getErrorCode(error) || '';
  const message = error ? stableMessage(getErrorMessage(error)) : '';
  const input = `${type}:${code}:${frameId}:${message}`;

  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return (hash >>> 0).toString(16).padStart(8, '0');
}
