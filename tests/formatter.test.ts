import { afterEach, describe, it, expect } from 'vitest';
import { formatError, formatErrorJSON } from '../src/formatter/index.js';
import { resetConfig, setupConfig } from '../src/config.js';

describe('Formatter', () => {
  afterEach(() => resetConfig());

  it('should format errors with severity levels', () => {
    const error = new Error('Fatal failure');
    (error as any).severity = 'FATAL';
    
    const output = formatError(error);
    expect(output).toContain('FATAL');
    expect(output).toContain('Fatal failure');
  });

  it('should include fingerprint and timestamp in ANSI output', () => {
    const error = new Error('Fingerprint test');
    const output = formatError(error);
    
    expect(output).toMatch(/ID: [a-f0-9]{8}/);
    expect(output).toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z/);
  });

  it('should output valid JSON in formatErrorJSON', () => {
    const error = new Error('JSON test');
    const jsonStr = formatErrorJSON(error);
    const json = JSON.parse(jsonStr);
    
    expect(json.error.type).toBe('Error');
    expect(json.error.message).toBe('JSON test');
    expect(json.fingerprint).toBeDefined();
    expect(json.timestamp).toBeDefined();
    expect(json.uptime).toBeDefined();
  });

  it('should handle causes in JSON output', () => {
    const cause = new Error('Root cause');
    const error = new Error('Wrapper', { cause });
    
    const jsonStr = formatErrorJSON(error);
    const json = JSON.parse(jsonStr);
    
    expect(json.error.causes).toHaveLength(1);
    expect(json.error.causes[0].message).toBe('Root cause');
  });

  it('redacts secrets from human and JSON output', () => {
    const error = new Error('request failed Bearer production-secret-token for jane@example.com {"password":"json-secret"}');
    error.stack = `Error: Bearer production-secret-token\n    at handler (/srv/company/private-service.ts:1:1)`;

    expect(formatError(error)).not.toContain('production-secret-token');
    expect(formatError(error)).not.toContain('jane@example.com');
    expect(formatErrorJSON(error)).not.toContain('production-secret-token');
    expect(formatErrorJSON(error)).not.toContain('json-secret');
    expect(formatError(error)).not.toContain('/srv/company/private-service.ts');
  });

  it('applies frame visibility to JSON and supports non-Error values', () => {
    setupConfig({ showNodeModules: false, showNodeInternals: false });
    const error = new Error('visibility');
    error.stack = `Error: visibility\n    at user (/workspace/app.ts:1:1)\n    at dep (/workspace/node_modules/pkg/index.js:2:1)\n    at core (node:internal/timers:3:1)`;
    const json = JSON.parse(formatErrorJSON(error));
    expect(json.error.stack).toHaveLength(1);
    expect(JSON.parse(formatErrorJSON('plain failure')).error.message).toBe('plain failure');
  });
});
