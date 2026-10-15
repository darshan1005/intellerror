import { getErrorMessage, getErrorName } from '../error.js';
import { redactSensitiveData } from '../redaction.js';

/** Generate useful troubleshooting links without sending raw credentials or PII. */
export function getSearchLinks(error: unknown): [string, string, string] {
  const queryText = redactSensitiveData(`${getErrorName(error)}: ${getErrorMessage(error)}`, 240)
    .replace(/\s+/g, ' ')
    .trim();
  const query = encodeURIComponent(queryText);
  
  return [
    `https://www.google.com/search?q=${query}`,
    `https://stackoverflow.com/search?q=${query}`,
    `https://github.com/issues?q=${query}`
  ];
}
