import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { getCodeSnapshot } from '../src/formatter/snapshot.js';

describe('bounded source snapshots', () => {
  it('returns a five-line excerpt only for an allowed source root', () => {
    const file = fileURLToPath(import.meta.url);
    const snapshot = getCodeSnapshot(file, 4, {
      sourceRoots: [dirname(file)],
      maxBytes: 128 * 1024,
      maxLineLength: 200,
    });
    expect(snapshot.split('\n').filter(Boolean)).toHaveLength(5);
    expect(snapshot).toContain('getCodeSnapshot');
  });

  it('does not read paths outside the configured root', () => {
    const file = fileURLToPath(import.meta.url);
    expect(getCodeSnapshot(file, 1, {
      sourceRoots: [join(dirname(file), 'not-allowed')],
      maxBytes: 128 * 1024,
      maxLineLength: 200,
    })).toBe('');
  });
});
