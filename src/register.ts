import { formatError, formatErrorJSON, formatWarning } from './formatter/index.js';
import { getConfig } from './config.js';
import { sendWebhookNotification } from './integrations/webhook.js';

type NodeProcess = {
  on: (event: 'uncaughtException' | 'unhandledRejection', listener: (...args: any[]) => void) => void;
  off?: (event: 'uncaughtException' | 'unhandledRejection', listener: (...args: any[]) => void) => void;
  exit?: (code?: number) => never;
  exitCode?: number;
};

const processValue = (globalThis as { process?: NodeProcess }).process;
let uninstall: (() => void) | undefined;
let originalWarn: typeof console.warn | undefined;

function printError(label: string, error: unknown): void {
  const config = getConfig();
  try {
    console.error(`\n 🔥 ${label}:`);
    console.error(config.useJsonMode ? formatErrorJSON(error) : formatError(error));
  } catch {
    console.error(`\n 🔥 ${label}:`, error);
  }
}

/** Install process listeners once. Returns a safe uninstall function for tests/CLIs. */
export function install(): () => void {
  if (uninstall) return uninstall;
  if (!processValue || typeof processValue.on !== 'function') return () => undefined;

  const onUncaughtException = (error: unknown) => {
    printError('UNCAUGHT EXCEPTION DETECTED', error);
    void sendWebhookNotification(error).finally(() => {
      if (getConfig().exitOnUncaughtException && processValue) {
        if (processValue.exit) processValue.exit(1);
        else processValue.exitCode = 1;
      }
    });
  };

  const onUnhandledRejection = (reason: unknown) => {
    printError('UNHANDLED REJECTION DETECTED', reason);
    void sendWebhookNotification(reason).finally(() => {
      if (getConfig().exitOnUnhandledRejection && processValue) {
        if (processValue.exit) processValue.exit(1);
        else processValue.exitCode = 1;
      }
    });
  };

  processValue.on('uncaughtException', onUncaughtException);
  processValue.on('unhandledRejection', onUnhandledRejection);

  originalWarn = console.warn;
  const wrappedWarn = (...args: unknown[]) => {
    const config = getConfig();
    if (config.interceptWarnings && args.length > 0 && typeof args[0] === 'string') {
      const warning = formatWarning(args[0]);
      originalWarn?.(warning, ...args.slice(1));
      return;
    }
    originalWarn?.(...args);
  };
  console.warn = wrappedWarn;

  uninstall = () => {
    if (processValue.off) {
      processValue.off('uncaughtException', onUncaughtException);
      processValue.off('unhandledRejection', onUnhandledRejection);
    }
    if (originalWarn && console.warn === wrappedWarn) console.warn = originalWarn;
    originalWarn = undefined;
    uninstall = undefined;
  };

  console.log('✅ IntellError Node.js listener active.');
  return uninstall;
}

export function uninstallRegistration(): void {
  uninstall?.();
}

// Preserve the convenient `node --import intellerror/register` workflow.
install();
