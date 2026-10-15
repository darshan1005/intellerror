import { formatError } from '../formatter/index.js';
import { getErrorCode, getErrorMessage, getErrorName, getErrorStatus } from '../error.js';

type ResponseLike = {
  headersSent: boolean;
  status: (statusCode: number) => { json: (body: unknown) => unknown };
};
type NextFunctionLike = (error?: unknown) => void;

export interface ErrorFormatterOptions {
  /** Never expose internal messages by default; enable only for trusted APIs. */
  exposeMessage?: boolean;
  defaultStatus?: number;
  logger?: (formatted: string, error: unknown) => void;
}

function validStatus(value: unknown, fallback: number): number {
  try {
    const status = typeof value === 'number' ? value : Number(value);
    return Number.isInteger(status) && status >= 400 && status <= 599 ? status : fallback;
  } catch {
    return fallback;
  }
}

export function errorFormatter(options: ErrorFormatterOptions = {}) {
  const defaultStatus = validStatus(options.defaultStatus, 500);
  const logger = options.logger || ((formatted: string) => console.error(formatted));

  return (err: unknown, _req: unknown, res: ResponseLike, next: NextFunctionLike): void => {
    if (res.headersSent) {
      next(err);
      return;
    }

    try {
      logger(formatError(err), err);
    } catch {
      // Observability must never prevent the application from receiving an error response.
    }

    const exposeMessage = options.exposeMessage === true;
    const response: { error: { name: string; message: string; code?: string } } = {
      error: {
        name: getErrorName(err),
        message: exposeMessage ? getErrorMessage(err) : 'Internal Server Error',
      },
    };
    const code = getErrorCode(err);
    if (code) response.error.code = code;

    try {
      res.status(validStatus(getErrorStatus(err), defaultStatus)).json(response);
    } catch {
      next(err);
    }
  };
}
