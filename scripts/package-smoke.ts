import { access, readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';

const require = createRequire(import.meta.url);

for (const target of [
  'dist/index.js', 'dist/index.cjs',
  'dist/browser.js', 'dist/browser.cjs',
  'dist/register.js', 'dist/register.cjs',
  'dist/register-browser.js', 'dist/register-browser.cjs',
]) {
  await access(target);
}

const esm = await import('../dist/index.js');
const cjs = require('../dist/index.cjs');
const browser = await import('../dist/browser.js');
const browserCjs = require('../dist/browser.cjs');

assert.equal(typeof esm.formatError, 'function');
assert.equal(typeof cjs.formatError, 'function');
assert.equal(typeof browser.formatErrorBrowser, 'function');
assert.equal(typeof browserCjs.formatErrorBrowser, 'function');

for (const browserTarget of ['dist/browser.js', 'dist/register-browser.js']) {
  const browserBundle = await readFile(browserTarget, 'utf8');
  for (const nodeBuiltin of ['node:fs', 'node:path', 'node:crypto']) {
    assert.equal(browserBundle.includes(nodeBuiltin), false, `${browserTarget} imports ${nodeBuiltin}`);
  }
}

console.log('package smoke checks passed');
