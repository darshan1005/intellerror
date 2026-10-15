import { formatErrorBrowser } from './formatter/browser.js';
import { sendWebhookNotification } from './integrations/webhook.js';

type EventTargetLike = {
  addEventListener: (type: string, listener: (event: any) => void) => void;
  removeEventListener?: (type: string, listener: (event: any) => void) => void;
};

let uninstall: (() => void) | undefined;

export function installBrowser(): () => void {
  if (uninstall) return uninstall;
  const target = globalThis as unknown as EventTargetLike;
  if (typeof target.addEventListener !== 'function') return () => undefined;

  const onError = (event: any) => {
    const error = event?.error || event?.message;
    if (!error) return;
    event?.preventDefault?.();
    console.error('%c 🛑 UNHANDLED RUNTIME ERROR:', 'background: #ff4d4f; color: white; font-weight: bold; padding: 2px 5px;');
    console.log(...formatErrorBrowser(error));
    void sendWebhookNotification(error);
  };

  const onRejection = (event: any) => {
    const reason = event?.reason;
    const error = reason === undefined ? new Error('Unhandled promise rejection') : reason;
    event?.preventDefault?.();
    console.error('%c 🛑 UNHANDLED PROMISE REJECTION:', 'background: #ff4d4f; color: white; font-weight: bold; padding: 2px 5px;');
    console.log(...formatErrorBrowser(error));
    void sendWebhookNotification(error);
  };

  target.addEventListener('error', onError);
  target.addEventListener('unhandledrejection', onRejection);
  console.log('%c ✅ IntellError Browser listener active.', 'color: #52c41a; font-weight: bold;');

  uninstall = () => {
    target.removeEventListener?.('error', onError);
    target.removeEventListener?.('unhandledrejection', onRejection);
    uninstall = undefined;
  };
  return uninstall;
}

export function uninstallBrowserRegistration(): void {
  uninstall?.();
}

installBrowser();
