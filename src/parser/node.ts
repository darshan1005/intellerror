import fs from 'node:fs';
import path from 'node:path';
import { SourceMapConsumer } from 'source-map-js';
import { getConfig } from '../config.js';
import { getErrorChain, parseStack, type ErrorChain, type ParsedStackFrame } from './index.js';

const sourceMapCache = new Map<string, SourceMapConsumer | null>();

function isWithinSourceRoot(filePath: string, roots: string[]): boolean {
  if (roots.length === 0) return false;
  try {
    const resolved = fs.realpathSync(path.resolve(filePath));
    return roots.some((root) => {
      const realRoot = fs.realpathSync(path.resolve(root));
      const relative = path.relative(realRoot, resolved);
      return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
    });
  } catch {
    return false;
  }
}

function toLocalPath(file: string): string | undefined {
  if (/^(?:webpack|vite|rollup):\/\//i.test(file) || file.startsWith('data:')) return undefined;
  if (file.startsWith('file://')) {
    try {
      const pathname = decodeURIComponent(new URL(file).pathname);
      return process.platform === 'win32' && /^\/[A-Za-z]:\//.test(pathname) ? pathname.slice(1) : pathname;
    } catch {
      return undefined;
    }
  }
  return path.resolve(file);
}

function loadSourceMap(mapPath: string, sourceRoots: string[]): SourceMapConsumer | null {
  if (sourceMapCache.has(mapPath)) return sourceMapCache.get(mapPath) || null;
  if (!isWithinSourceRoot(mapPath, sourceRoots)) return null;

  try {
    const stat = fs.statSync(mapPath);
    if (!stat.isFile() || stat.size > 2 * 1024 * 1024) {
      sourceMapCache.set(mapPath, null);
      return null;
    }
    const map = new SourceMapConsumer(JSON.parse(fs.readFileSync(mapPath, 'utf8')));
    sourceMapCache.set(mapPath, map);
    if (sourceMapCache.size > 100) sourceMapCache.delete(sourceMapCache.keys().next().value as string);
    return map;
  } catch {
    sourceMapCache.set(mapPath, null);
    return null;
  }
}

/** Node adapter: enriches safe stack parsing with bounded, root-constrained maps. */
export function parseStackNode(error: unknown): ParsedStackFrame[] {
  const frames = parseStack(error);
  const config = getConfig();
  if (!config.sourceMapsEnabled) return frames;

  return frames.map((frame) => {
    if (!frame.file || frame.isNodeInternal || frame.isNodeModule || !frame.lineNumber || frame.column === null || frame.column < 0) {
      return frame;
    }

    const localFile = toLocalPath(frame.file);
    if (!localFile || !isWithinSourceRoot(localFile, config.sourceRoots)) return frame;
    const consumer = loadSourceMap(`${localFile}.map`, config.sourceRoots);
    if (!consumer) return frame;

    try {
      const original = consumer.originalPositionFor({ line: frame.lineNumber, column: frame.column });
      if (!original.source) return frame;
      return {
        ...frame,
        originalFile: original.source,
        originalLineNumber: original.line,
        originalColumn: original.column,
      };
    } catch {
      return frame;
    }
  });
}

export function getErrorChainNode(error: unknown): ErrorChain[] {
  return getErrorChain(error, parseStackNode);
}
