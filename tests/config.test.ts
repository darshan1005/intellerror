import { afterEach, describe, it, expect } from 'vitest';
import { setupConfig, getConfig, resetConfig } from '../src/config.js';

describe('Config System', () => {
  afterEach(() => resetConfig());

  it('should have default values', () => {
    const config = getConfig();
    expect(config.showNodeModules).toBe(false);
    expect(config.showNodeInternals).toBe(false);
    expect(config.suggestionsEnabled).toBe(true);
  });

  it('should update specific values', () => {
    setupConfig({ showNodeModules: true });
    const config = getConfig();
    expect(config.showNodeModules).toBe(true);
    expect(config.showNodeInternals).toBe(false); // remains same
  });

  it('should preserve existing values', () => {
    setupConfig({ showNodeModules: true });
    setupConfig({ suggestionsEnabled: false });
    const config = getConfig();
    expect(config.showNodeModules).toBe(true);
    expect(config.suggestionsEnabled).toBe(false);
  });

  it('returns defensive snapshots and rejects invalid values', () => {
    const config = getConfig();
    config.sourceRoots.push('not-live-config');
    expect(getConfig().sourceRoots).not.toContain('not-live-config');
    expect(() => setupConfig({ maxCauseDepth: 0 })).toThrow(TypeError);
    expect(() => setupConfig({ sourceRoots: ['/workspace'] as unknown as string[] })).not.toThrow();
  });
});
