import * as stackTraceParser from 'stacktrace-parser';
import { getConfig } from '../config.js';
import { getErrorCause, isErrorLike, normalizeError, readProperty } from '../error.js';

export interface ParsedStackFrame {
  file: string | null;
  methodName: string;
  lineNumber: number | null;
  column: number | null;
  isNodeInternal: boolean;
  isNodeModule: boolean;
  originalFile?: string | null;
  originalLineNumber?: number | null;
  originalColumn?: number | null;
}

export interface ErrorChain {
  error: Error;
  frames: ParsedStackFrame[];
}

function getStack(error: unknown): string | undefined {
  const stack = readProperty(error, 'stack');
  return typeof stack === 'string' ? stack : undefined;
}

function isNodeInternalFile(file: string): boolean {
  const normalized = file.replace(/\\/g, '/');
  return normalized.startsWith('node:') || normalized.startsWith('internal/') || normalized.includes('/node:internal/');
}

function isNodeModuleFile(file: string): boolean {
  return /(^|[\\/])node_modules([\\/]|$)/.test(file);
}

/** Parse only standard stack text. This module intentionally has no Node imports. */
export function parseStack(error: unknown): ParsedStackFrame[] {
  const stack = getStack(error);
  if (!stack) return [];

  try {
    const parsed = stackTraceParser.parse(stack);
    return parsed.map((frame) => {
      const file = frame.file || '';
      return {
        file: frame.file || null,
        methodName: frame.methodName || '<unknown>',
        lineNumber: typeof frame.lineNumber === 'number' ? frame.lineNumber : null,
        column: typeof frame.column === 'number' ? frame.column : null,
        isNodeInternal: isNodeInternalFile(file),
        isNodeModule: isNodeModuleFile(file),
      };
    });
  } catch {
    return [];
  }
}

export function getErrorChain(error: unknown, parser: (value: unknown) => ParsedStackFrame[] = parseStack): ErrorChain[] {
  const chain: ErrorChain[] = [];
  const seen = new WeakSet<object>();
  let current: unknown = error;
  const maxDepth = getConfig().maxCauseDepth;

  for (let depth = 0; current !== undefined && depth < maxDepth; depth += 1) {
    const identity = (typeof current === 'object' && current !== null) || typeof current === 'function'
      ? current as object
      : undefined;
    if (identity && seen.has(identity)) break;
    if (identity) seen.add(identity);

    const normalized = normalizeError(current);
    chain.push({ error: normalized, frames: parser(normalized) });

    const cause = getErrorCause(current);
    if (!isErrorLike(cause)) break;
    current = cause;
  }

  return chain;
}
