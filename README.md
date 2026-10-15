# IntellError

Production-grade error intelligence for enterprise JavaScript applications. IntellError turns thrown values into useful, structured diagnostics while protecting credentials and keeping the error path safe.

[![npm version](https://img.shields.io/npm/v/intellerror.svg)](https://www.npmjs.com/package/intellerror)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

## What it provides

- **Actionable diagnostics**: confidence-ranked suggestions for common JavaScript, Node.js, React, DOM, network and filesystem failures.
- **Production-safe output**: bounded cause traversal, secret/PII redaction, stable fingerprints, status/code fields and JSON schema versioning.
- **Useful stack traces**: hides Node internals and dependencies by default, supports bounded source-map enrichment in Node, and has opt-in source snapshots.
- **Runtime-specific bundles**: a Node package entry, a browser/worker entry with no Node built-ins, and separate Node/browser registration adapters.
- **Operational integrations**: Express error middleware, Slack/Discord-compatible webhooks with timeouts and HTTP status handling, and idempotent global registration.
- **Enterprise controls**: immutable configuration snapshots, validation, cause-depth and payload limits, custom rules with safe unregister handles, and a single offline test command.

## Requirements

- Node.js 20 or newer for the root package, source maps, snapshots and the Node registration adapter.
- Browser, worker and Edge-like environments should use the `intellerror/browser` entry. Browser registration uses `intellerror/register/browser`.

## Install

```bash
npm install intellerror
```

## Node usage

```ts
import { formatError, formatErrorJSON } from 'intellerror';

try {
  await runJob();
} catch (error) {
  console.error(formatError(error));
  // Send structured output to your logger or collector.
  logger.error(JSON.parse(formatErrorJSON(error)));
}
```

For automatic Node process listeners:

```bash
node --import intellerror/register dist/server.js
```

Registration is idempotent, preserves warning arguments, never lets webhook failure replace the original error, and exposes `install()`/`uninstallRegistration()` for CLIs and tests. Unhandled rejections are logged but do not terminate the process unless configured.

## Browser, worker and Edge usage

The browser entry is intentionally separate so bundlers do not pull in `fs`, `path`, source-map file I/O or Node crypto:

```ts
import { formatErrorBrowser } from 'intellerror/browser';

try {
  renderApp();
} catch (error) {
  console.log(...formatErrorBrowser(error));
}
```

To install browser `error` and `unhandledrejection` listeners:

```ts
import 'intellerror/register/browser';
```

The browser adapter calls `preventDefault()` to avoid duplicate default reporting and works with `window`, workers and other `EventTarget`-compatible runtimes. Framework-specific Edge runtimes should connect their framework error hook to `formatErrorBrowser` or `formatErrorJSON` rather than installing Node process listeners.

## Structured output and fingerprints

`formatErrorJSON()` returns schema version `1` and includes:

- `fingerprint`, severity, timestamp and uptime;
- error type, code, HTTP status, redacted message and filtered frames;
- bounded cause chains with their own filtered stacks;
- location and ranked suggestions.

Frame visibility settings apply consistently to text and JSON output. Fingerprints include the error category, code, normalized message and first user frame, while volatile numbers and long identifiers are normalized to reduce alert-cardinality noise.

## Configuration

```ts
import { setupConfig } from 'intellerror';

setupConfig({
  sourceMapsEnabled: true,
  sourceRoots: [process.cwd()],
  snapshotsEnabled: false, // opt in only for trusted local source roots
  showNodeModules: false,
  showNodeInternals: false,
  redactSensitiveData: true,
  maxCauseDepth: 16,
  webhookUrl: process.env.INTELLERROR_WEBHOOK_URL,
  webhookTimeoutMs: 3000,
});
```

`getConfig()` returns a defensive snapshot. Invalid values throw a `TypeError`; `resetConfig()` restores environment-derived defaults. Redaction is enabled by default and covers bearer tokens, JWTs, credential query parameters, common secret key/value pairs, emails and common local paths.

### Environment variables

| Variable | Default | Purpose |
| --- | --- | --- |
| `INTELLERROR_JSON` | `false` | Use JSON mode for Node registration. |
| `INTELLERROR_SOURCE_MAPS` | `true` | Enable bounded adjacent `.map` lookup in Node. |
| `INTELLERROR_SOURCE_ROOTS` | current directory | Comma-separated roots allowed for maps/snapshots. |
| `INTELLERROR_SNAPSHOTS` | `false` | Enable bounded source snippets. |
| `INTELLERROR_MAX_SNAPSHOT_BYTES` | `131072` | Maximum source file size read. |
| `INTELLERROR_MAX_SNAPSHOT_LINE_LENGTH` | `400` | Maximum displayed source-line length. |
| `INTELLERROR_MAX_CAUSE_DEPTH` | `16` | Maximum traversed `Error.cause` depth. |
| `INTELLERROR_MAX_MESSAGE_LENGTH` | `8000` | Maximum logged message length. |
| `INTELLERROR_REDACTION` | `true` | Set to `false` only when a separate data policy exists. |
| `INTELLERROR_SHOW_MODULES` | `false` | Include `node_modules` frames. |
| `INTELLERROR_SHOW_INTERNALS` | `false` | Include Node internal frames. |
| `INTELLERROR_SUGGESTIONS` | `true` | Enable intelligent suggestions. |
| `INTELLERROR_SEARCH_LINKS` | `true` | Add redacted troubleshooting links. |
| `INTELLERROR_INTERCEPT_WARNINGS` | `false` | Format string warnings in Node registration. |
| `INTELLERROR_WEBHOOK_URL` | unset | Deliver a redacted alert to Slack, Discord or a generic webhook. |
| `INTELLERROR_WEBHOOK_TIMEOUT_MS` | `3000` | Abort webhook delivery after this limit. |
| `INTELLERROR_EXIT_ON_UNCAUGHT` | `true` | Set `process.exitCode` after an uncaught exception. |
| `INTELLERROR_EXIT_ON_REJECTION` | `false` | Set `process.exitCode` for unhandled rejections. |

## Express

Messages are not exposed to clients by default, and errors after headers are sent are delegated to Express:

```ts
import { errorFormatter } from 'intellerror';

app.use(errorFormatter());
// Only enable this for an intentionally trusted/internal API:
// app.use(errorFormatter({ exposeMessage: true }));
```

The middleware validates status codes, includes a safe error code when present, and accepts a logger callback for structured application logging.

## Webhooks

```ts
import { sendWebhookNotification } from 'intellerror';

const result = await sendWebhookNotification(error, {
  url: process.env.INTELLERROR_WEBHOOK_URL,
  timeoutMs: 2000,
});
if (!result.sent) console.warn('Alert delivery failed:', result.error);
```

Discord receives `content`; Slack and generic endpoints receive `text`. Invalid URLs, non-2xx responses, unavailable `fetch`, network failures and timeouts are represented in the result and never thrown from an exception handler.

## Custom intelligence

```ts
import { registerRule } from 'intellerror';

const unregister = registerRule({
  match: (error) => error.message.includes('tenant quota'),
  message: 'Tenant quota exceeded.',
  confidence: 0.95,
  fix: 'Review quota usage or request a capacity increase.',
});

// unregister(); when the rule is scoped to a plugin or test
```

Custom rules are validated, sorted by confidence and isolated when a rule throws.

## Development and release checks

This repository pins Node in `.nvmrc`, keeps a lockfile, builds every published entry, and runs the same checks in CI and locally:

```bash
npm ci
npm test             # complete Vitest suite; works offline after npm ci
npm run build        # ESM/CJS bundles and declarations
npm run check        # build, test and npm pack --dry-run
```

`npm pack` runs the build automatically through `prepack`, and the package `files` allowlist ensures the published tarball contains every declared export target. A reproducible Docker build is also provided:

```bash
docker build -t intellerror .
docker run --rm intellerror
```

## License

MIT © Darshan Battula
