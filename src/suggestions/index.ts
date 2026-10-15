import { rules, type SuggestionRule } from './rules.js';
import { parseStack } from '../parser/index.js';
import { normalizeError } from '../error.js';

export type { SuggestionRule } from './rules.js';

/**
 * Gets intelligent suggestions for a given error.
 * Now supports context-aware matching and confidence-based sorting.
 */
export function getSuggestions(error: unknown): SuggestionRule[] {
    const normalized = normalizeError(error);
    const stack = parseStack(normalized);
    const matches: SuggestionRule[] = [];

    for (const rule of rules) {
        try {
            if (rule.match(normalized, stack)) matches.push(rule);
        } catch {
            // A custom rule is untrusted extension code; it must not break logging.
        }
    }

    return matches.sort((a, b) => b.confidence - a.confidence);
}

/**
 * Registers a new custom suggestion rule.
 */
export function registerRule(rule: SuggestionRule): () => void {
    if (!rule || typeof rule.match !== 'function' || typeof rule.message !== 'string' ||
        !Number.isFinite(rule.confidence) || rule.confidence < 0 || rule.confidence > 1) {
        throw new TypeError('Invalid IntellError suggestion rule');
    }
    rules.push(rule);
    return () => {
        const index = rules.indexOf(rule);
        if (index >= 0) rules.splice(index, 1);
    };
}
