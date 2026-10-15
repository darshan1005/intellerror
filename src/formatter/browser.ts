import { getErrorMessage, getErrorName, normalizeError } from '../error.js';
import { getConfig } from '../config.js';
import { getErrorChain, parseStack } from '../parser/index.js';
import { getSearchLinks } from '../suggestions/links.js';
import { getSuggestions } from '../suggestions/index.js';
import { redactFilePath, redactSensitiveData } from '../redaction.js';

export type BrowserConsoleArgs = [message: string, ...styles: string[]];

function messageFor(error: unknown): string {
  const config = getConfig();
  const message = getErrorMessage(error);
  return config.redactSensitiveData ? redactSensitiveData(message, config.maxMessageLength) : message;
}

/** Formats an error without importing Node built-ins; safe for Vite, workers and SSR bundles. */
export function formatErrorBrowser(error: unknown): BrowserConsoleArgs {
  const normalized = normalizeError(error);
  const config = getConfig();
  const chain = getErrorChain(normalized);
  const top = chain[0];
  const userFrame = top.frames.find((frame) => !frame.isNodeInternal && !frame.isNodeModule);
  const styles: string[] = [
    'background: #ff4d4f; color: white; padding: 2px 4px; border-radius: 3px; font-weight: bold;',
    'color: #ff4d4f; font-weight: bold;',
  ];
  let text = `\n%c ${getErrorName(normalized)} %c ${messageFor(normalized)}\n\n`;

  if (userFrame?.file) {
    const file = redactFilePath(userFrame.originalFile || userFrame.file, config.redactSensitiveData);
    const line = userFrame.originalLineNumber ?? userFrame.lineNumber;
    const column = userFrame.originalColumn ?? userFrame.column;
    text += `%c📍 Location:%c\n`;
    styles.push('font-weight: bold;', '');
    text += `%c${file}:${line}:${column}%c${userFrame.originalFile ? ' [mapped]' : ''}   (YOUR CODE)\n\n`;
    styles.push('color: #1890ff; text-decoration: underline;', 'color: grey; font-style: italic;');
  }

  const suggestions = config.suggestionsEnabled ? getSuggestions(normalized) : [];
  if (suggestions.length > 0) {
    text += `%c💡 Suggestions:%c\n`;
    styles.push('font-weight: bold;', '');
    for (const suggestion of suggestions) {
      text += `%c• ${suggestion.message}%c\n`;
      styles.push('color: #52c41a; font-weight: bold;', '');
      if (suggestion.description) {
        text += `  %c${suggestion.description}%c\n`;
        styles.push('color: grey;', '');
      }
      if (suggestion.fix) {
        text += `  %cFix: ${suggestion.fix}%c\n`;
        styles.push('color: #1890ff;', '');
      }
    }
    text += '\n';
  }

  if (config.showSearchLinks) {
    const [google, stackOverflow, github] = getSearchLinks(normalized);
    text += `%c🔍 Troubleshoot:%c\n`;
    styles.push('font-weight: bold;', '');
    for (const [label, link] of [['Google', google], ['StackOverflow', stackOverflow], ['GitHub', github]]) {
      text += `${label}: %c${link}%c\n`;
      styles.push('color: #1890ff; text-decoration: underline;', '');
    }
    text += '\n';
  }

  text += `%c📦 Stack:%c\n`;
  styles.push('font-weight: bold;', '');
  let hiddenInternals = 0;
  let hiddenModules = 0;
  for (const frame of top.frames) {
    if (frame.isNodeInternal && !config.showNodeInternals) { hiddenInternals += 1; continue; }
    if (frame.isNodeModule && !config.showNodeModules) { hiddenModules += 1; continue; }
    const file = redactFilePath(frame.originalFile || frame.file, config.redactSensitiveData) || '<unknown>';
    const line = frame.originalLineNumber ?? frame.lineNumber;
    const column = frame.originalColumn ?? frame.column;
    text += `→ %c${file}:${line}:${column}%c\n`;
    styles.push('color: #1890ff;', '');
  }
  if (hiddenInternals || hiddenModules) {
    const hidden = [hiddenModules ? `${hiddenModules} node_modules` : '', hiddenInternals ? `${hiddenInternals} node internals` : ''].filter(Boolean).join(' and ');
    text += `%c(${hidden} hidden)%c\n`;
    styles.push('color: grey; font-style: italic;', '');
  }

  if (chain.length > 1) {
    text += `\n%c🔗 Causes:%c\n`;
    styles.push('font-weight: bold;', '');
    for (const cause of chain.slice(1)) {
      text += `caused by: ${getErrorName(cause.error)}: ${messageFor(cause.error)}\n`;
    }
  }

  return [text, ...styles];
}

export function formatWarningBrowser(message: string, error?: unknown): BrowserConsoleArgs {
  const actualError = error === undefined ? new Error(message) : normalizeError(error);
  const config = getConfig();
  const safeMessage = config.redactSensitiveData ? redactSensitiveData(message, config.maxMessageLength) : message;
  const frames = parseStack(actualError);
  const userFrame = frames.find((frame) => !frame.isNodeInternal && !frame.isNodeModule);
  let text = `\n%c WARNING %c ${safeMessage}\n\n`;
  const styles = [
    'background: #ffec3d; color: black; padding: 2px 4px; border-radius: 3px; font-weight: bold;',
    'color: #d4b106; font-weight: bold;',
  ];
  if (userFrame?.file) {
    text += `%c📍 Location:%c\n%c${redactFilePath(userFrame.file, config.redactSensitiveData)}:${userFrame.lineNumber}:${userFrame.column}%c   (YOUR CODE)\n\n`;
    styles.push('font-weight: bold;', '', 'color: #1890ff; text-decoration: underline;', 'color: grey; font-style: italic;');
  }

  const suggestions = config.suggestionsEnabled ? getSuggestions(actualError) : [];
  if (suggestions.length > 0) {
    text += `%c💡 Suggestions:%c\n`;
    styles.push('font-weight: bold;', '');
    for (const suggestion of suggestions) {
      text += `• ${suggestion.message}\n`;
      if (suggestion.fix) text += `  Fix: ${suggestion.fix}\n`;
    }
  }

  if (config.showSearchLinks) {
    const [google, stackOverflow, github] = getSearchLinks(actualError);
    text += `%c🔍 Troubleshoot:%c\nGoogle: ${google}\nStackOverflow: ${stackOverflow}\nGitHub: ${github}\n`;
    styles.push('font-weight: bold;', '');
  }
  return [text, ...styles];
}
