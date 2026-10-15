export { formatErrorBrowser, formatWarningBrowser, type BrowserConsoleArgs } from './formatter/browser.js';
export { setupConfig, getConfig, resetConfig, type IntellErrorConfig } from './config.js';
export { getSuggestions, registerRule, type SuggestionRule } from './suggestions/index.js';
export { parseStack, getErrorChain, type ParsedStackFrame, type ErrorChain } from './parser/index.js';
export { redactSensitiveData } from './redaction.js';
