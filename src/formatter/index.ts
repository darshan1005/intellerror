import chalk from 'chalk';
import { getErrorCode, getErrorMessage, getErrorName, getErrorStatus, normalizeError, readProperty } from '../error.js';
import { getFingerprint } from '../fingerprint.js';
import { getConfig } from '../config.js';
import { getErrorChainNode, parseStackNode } from '../parser/node.js';
import type { ErrorChain, ParsedStackFrame } from '../parser/index.js';
import { redactFilePath, redactSensitiveData } from '../redaction.js';
import { getRuntimeUptime } from '../runtime.js';
import { getSuggestions } from '../suggestions/index.js';
import { getSearchLinks } from '../suggestions/links.js';
import { getCodeSnapshot } from './snapshot.js';

function severityOf(error: unknown): string {
  const severity = readProperty(error, 'severity');
  return typeof severity === 'string' && ['FATAL', 'ERROR', 'WARN', 'INFO'].includes(severity.toUpperCase())
    ? severity.toUpperCase()
    : 'ERROR';
}

function visibleFrames(frames: ParsedStackFrame[], showNodeModules: boolean, showNodeInternals: boolean): ParsedStackFrame[] {
  return frames.filter((frame) => (showNodeInternals || !frame.isNodeInternal) && (showNodeModules || !frame.isNodeModule));
}

function renderFrame(frame: ParsedStackFrame, redactPaths = true): string {
  const fileName = redactFilePath(frame.originalFile || frame.file, redactPaths);
  const line = frame.originalLineNumber ?? frame.lineNumber;
  const column = frame.originalColumn ?? frame.column;
  const isMapped = frame.originalFile ? chalk.magenta('*') : '';
  return fileName
    ? `${chalk.cyan(fileName)}:${chalk.yellow(line)}:${chalk.yellow(column)}${isMapped}`
    : chalk.gray('<unknown>');
}

function safeMessage(error: unknown): string {
  const config = getConfig();
  const message = getErrorMessage(error);
  return config.redactSensitiveData
    ? redactSensitiveData(message, config.maxMessageLength)
    : message.slice(0, config.maxMessageLength);
}

function serializeFrame(frame: ParsedStackFrame, redact: boolean): ParsedStackFrame {
  if (!redact) return frame;
  return {
    ...frame,
    file: redactFilePath(frame.file, true) ?? null,
    originalFile: redactFilePath(frame.originalFile, true),
  };
}

function chainFor(error: unknown): ErrorChain[] {
  try {
    return getErrorChainNode(error);
  } catch {
    const normalized = normalizeError(error);
    return [{ error: normalized, frames: parseStackNode(normalized) }];
  }
}

export function formatError(error: unknown): string {
  const config = getConfig();
  const normalized = normalizeError(error);
  const errorChain = chainFor(normalized);
  const topError = errorChain[0];
  const stackFrames = topError?.frames || [];
  const userFrame = stackFrames.find((frame) => !frame.isNodeInternal && !frame.isNodeModule);
  const errorType = getErrorName(normalized);
  const severity = severityOf(normalized);
  const severityColors: Record<string, (value: string) => string> = {
    FATAL: chalk.bgRed.white.bold,
    ERROR: chalk.bgRed.white,
    WARN: chalk.bgYellow.black,
    INFO: chalk.bgBlue.white,
  };
  const typeLabel = severityColors[severity](` ${severity} `);
  const fingerprint = getFingerprint(errorType, userFrame, normalized);

  let output = `\n${typeLabel} ${chalk.red(`${errorType}: ${safeMessage(normalized)}`)}\n`;
  output += chalk.dim(`${new Date().toISOString()} | uptime: ${getRuntimeUptime().toFixed(1)}s | ID: ${fingerprint}\n\n`);

  if (userFrame?.file) {
    output += `${chalk.bold('📍 Location:')}\n`;
    const sourceFileName = userFrame.originalFile || userFrame.file;
    const fileName = redactFilePath(sourceFileName, config.redactSensitiveData);
    const line = userFrame.originalLineNumber ?? userFrame.lineNumber;
    const column = userFrame.originalColumn ?? userFrame.column;
    const isMapped = userFrame.originalFile ? chalk.magenta(' [mapped]') : '';
    output += `${chalk.cyan(fileName)}:${chalk.yellow(line)}:${chalk.yellow(column)}${isMapped}   ${chalk.gray('← YOUR CODE')}\n\n`;

    if (config.snapshotsEnabled && line && sourceFileName && !userFrame.originalFile) {
      output += getCodeSnapshot(sourceFileName, line, {
        sourceRoots: config.sourceRoots,
        maxBytes: config.maxSnapshotBytes,
        maxLineLength: config.maxSnapshotLineLength,
      });
    }
  }

  const suggestions = config.suggestionsEnabled ? getSuggestions(normalized) : [];
  if (suggestions.length > 0) {
    output += `${chalk.bold('💡 Suggestions:')}\n`;
    for (const suggestion of suggestions) {
      output += `• ${chalk.green(suggestion.message)}\n`;
      if (suggestion.description) output += `  ${chalk.dim(suggestion.description)}\n`;
      if (suggestion.fix) output += `  ${chalk.blue(`Fix: ${suggestion.fix}`)}\n`;
    }
    output += '\n';
  }

  if (config.showSearchLinks) {
    const [google, stackOverflow, github] = getSearchLinks(normalized);
    output += `${chalk.bold('🔍 Troubleshoot:')}\n`;
    output += `• ${chalk.dim('Google:')} ${chalk.blue(google)}\n`;
    output += `• ${chalk.dim('StackOverflow:')} ${chalk.blue(stackOverflow)}\n`;
    output += `• ${chalk.dim('GitHub:')} ${chalk.blue(github)}\n\n`;
  }

  if (errorChain.length > 1) {
    output += `${chalk.bold('🔗 Causes:')}\n`;
    for (let index = 1; index < errorChain.length; index += 1) {
      output += `${'  '.repeat(index)}caused by: ${chalk.red(getErrorName(errorChain[index].error))}: ${safeMessage(errorChain[index].error)}\n`;
    }
    output += '\n';
  }

  output += `${chalk.bold('📦 Stack:')}\n`;
  const visible = visibleFrames(stackFrames, config.showNodeModules, config.showNodeInternals);
  for (const frame of visible) output += `→ ${renderFrame(frame, config.redactSensitiveData)}\n`;

  const hiddenModulesCount = stackFrames.filter((frame) => frame.isNodeModule && !config.showNodeModules).length;
  const hiddenInternalsCount = stackFrames.filter((frame) => frame.isNodeInternal && !config.showNodeInternals).length;
  if (hiddenModulesCount || hiddenInternalsCount) {
    const hidden: string[] = [];
    if (hiddenModulesCount) hidden.push(`${hiddenModulesCount} node_modules`);
    if (hiddenInternalsCount) hidden.push(`${hiddenInternalsCount} node internals`);
    output += chalk.dim(`(${hidden.join(' and ')} hidden)\n`);
  }

  return output;
}

export function formatErrorJSON(error: unknown): string {
  const config = getConfig();
  const normalized = normalizeError(error);
  const errorChain = chainFor(normalized);
  const topError = errorChain[0];
  const frames = visibleFrames(topError?.frames || [], config.showNodeModules, config.showNodeInternals)
    .map((frame) => serializeFrame(frame, config.redactSensitiveData));
  const userFrame = topError?.frames.find((frame) => !frame.isNodeInternal && !frame.isNodeModule);
  const type = getErrorName(normalized);
  const message = safeMessage(normalized);

  return JSON.stringify({
    schemaVersion: 1,
    timestamp: new Date().toISOString(),
    uptime: getRuntimeUptime(),
    severity: severityOf(normalized),
    fingerprint: getFingerprint(type, userFrame, normalized),
    error: {
      type,
      code: getErrorCode(normalized),
      status: getErrorStatus(normalized),
      message,
      stack: frames,
      causes: errorChain.slice(1).map((cause) => ({
        type: getErrorName(cause.error),
        message: safeMessage(cause.error),
        stack: visibleFrames(cause.frames, config.showNodeModules, config.showNodeInternals)
          .map((frame) => serializeFrame(frame, config.redactSensitiveData)),
      })),
    },
    suggestions: config.suggestionsEnabled ? getSuggestions(normalized) : [],
    location: userFrame ? {
      file: redactFilePath(userFrame.originalFile || userFrame.file, config.redactSensitiveData),
      line: userFrame.originalLineNumber ?? userFrame.lineNumber,
      column: userFrame.originalColumn ?? userFrame.column,
      isMapped: !!userFrame.originalFile,
    } : null,
  }, null, 2);
}

export function formatWarning(message: string, error?: unknown): string {
  const config = getConfig();
  const actualError = error === undefined ? new Error(message) : normalizeError(error);
  const safeWarning = config.redactSensitiveData ? redactSensitiveData(message, config.maxMessageLength) : message;
  const userFrame = parseStackNode(actualError).find((frame) => !frame.isNodeInternal && !frame.isNodeModule);
  let output = `\n${chalk.bgYellow.black(' WARNING ')} ${chalk.yellow(safeWarning)}\n\n`;

  if (userFrame?.file) {
    output += `${chalk.bold('📍 Location:')}\n${renderFrame(userFrame, config.redactSensitiveData)}   ${chalk.gray('← YOUR CODE')}\n\n`;
  }

  const suggestions = config.suggestionsEnabled ? getSuggestions(actualError) : [];
  if (suggestions.length > 0) {
    output += `${chalk.bold('💡 Suggestions:')}\n`;
    for (const suggestion of suggestions) {
      output += `• ${chalk.green(suggestion.message)}\n`;
      if (suggestion.fix) output += `  ${chalk.blue(`Fix: ${suggestion.fix}`)}\n`;
    }
  }

  return output;
}
