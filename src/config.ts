export interface IntellErrorConfig {
  showNodeModules: boolean;
  showNodeInternals: boolean;
  suggestionsEnabled: boolean;
  interceptWarnings: boolean;
  showSearchLinks: boolean;
  sourceMapsEnabled: boolean;
  useJsonMode: boolean;
  /** Source snapshots are opt-in because stack paths may point at sensitive files. */
  snapshotsEnabled: boolean;
  sourceRoots: string[];
  maxSnapshotBytes: number;
  maxSnapshotLineLength: number;
  maxCauseDepth: number;
  maxMessageLength: number;
  redactSensitiveData: boolean;
  webhookUrl?: string;
  webhookTimeoutMs: number;
  exitOnUncaughtException: boolean;
  exitOnUnhandledRejection: boolean;
}

type Environment = Record<string, string | undefined>;

function getEnvironment(): Environment {
  const processValue = (globalThis as { process?: { env?: Environment } }).process;
  return processValue?.env || {};
}

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) return fallback;
  return ['true', '1', 'yes', 'on'].includes(value.toLowerCase());
}

function parsePositiveInteger(value: string | undefined, fallback: number, max: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? Math.min(parsed, max) : fallback;
}

function defaultSourceRoots(): string[] {
  const processValue = (globalThis as { process?: { cwd?: () => string } }).process;
  try {
    return typeof processValue?.cwd === 'function' ? [processValue.cwd()] : [];
  } catch {
    return [];
  }
}

function createDefaultConfig(env: Environment = getEnvironment()): IntellErrorConfig {
  const roots = env.INTELLERROR_SOURCE_ROOTS
    ? env.INTELLERROR_SOURCE_ROOTS.split(',').map((root) => root.trim()).filter(Boolean)
    : defaultSourceRoots();

  return {
    showNodeModules: parseBoolean(env.INTELLERROR_SHOW_MODULES, false),
    showNodeInternals: parseBoolean(env.INTELLERROR_SHOW_INTERNALS, false),
    suggestionsEnabled: !['false', '0', 'no', 'off'].includes((env.INTELLERROR_SUGGESTIONS || '').toLowerCase()),
    interceptWarnings: parseBoolean(env.INTELLERROR_INTERCEPT_WARNINGS, false),
    showSearchLinks: !['false', '0', 'no', 'off'].includes((env.INTELLERROR_SEARCH_LINKS || '').toLowerCase()),
    sourceMapsEnabled: !['false', '0', 'no', 'off'].includes((env.INTELLERROR_SOURCE_MAPS || '').toLowerCase()),
    useJsonMode: parseBoolean(env.INTELLERROR_JSON, false),
    snapshotsEnabled: parseBoolean(env.INTELLERROR_SNAPSHOTS, false),
    sourceRoots: roots,
    maxSnapshotBytes: parsePositiveInteger(env.INTELLERROR_MAX_SNAPSHOT_BYTES, 128 * 1024, 2 * 1024 * 1024),
    maxSnapshotLineLength: parsePositiveInteger(env.INTELLERROR_MAX_SNAPSHOT_LINE_LENGTH, 400, 4_000),
    maxCauseDepth: parsePositiveInteger(env.INTELLERROR_MAX_CAUSE_DEPTH, 16, 100),
    maxMessageLength: parsePositiveInteger(env.INTELLERROR_MAX_MESSAGE_LENGTH, 8_000, 100_000),
    redactSensitiveData: !['false', '0', 'no', 'off'].includes((env.INTELLERROR_REDACTION || '').toLowerCase()),
    webhookUrl: env.INTELLERROR_WEBHOOK_URL || undefined,
    webhookTimeoutMs: parsePositiveInteger(env.INTELLERROR_WEBHOOK_TIMEOUT_MS, 3_000, 30_000),
    exitOnUncaughtException: !['false', '0', 'no', 'off'].includes((env.INTELLERROR_EXIT_ON_UNCAUGHT || '').toLowerCase()),
    exitOnUnhandledRejection: parseBoolean(env.INTELLERROR_EXIT_ON_REJECTION, false),
  };
}

const defaultConfig = createDefaultConfig();
let config: IntellErrorConfig = { ...defaultConfig, sourceRoots: [...defaultConfig.sourceRoots] };

function validateConfigValue(key: keyof IntellErrorConfig, value: unknown): unknown {
  if (!(key in defaultConfig)) {
    throw new TypeError(`Unknown IntellError configuration option: ${String(key)}`);
  }

  if (key === 'sourceRoots') {
    if (!Array.isArray(value) || value.some((root) => typeof root !== 'string')) {
      throw new TypeError('IntellError sourceRoots must be an array of strings');
    }
    return [...value];
  }

  if (typeof defaultConfig[key] === 'boolean' && typeof value !== 'boolean') {
    throw new TypeError(`IntellError ${key} must be a boolean`);
  }

  if (['maxSnapshotBytes', 'maxSnapshotLineLength', 'maxCauseDepth', 'maxMessageLength', 'webhookTimeoutMs'].includes(key)) {
    const limits: Record<string, number> = {
      maxSnapshotBytes: 2 * 1024 * 1024,
      maxSnapshotLineLength: 4_000,
      maxCauseDepth: 100,
      maxMessageLength: 100_000,
      webhookTimeoutMs: 30_000,
    };
    if (!Number.isInteger(value) || (value as number) <= 0 || (value as number) > limits[key]) {
      throw new TypeError(`IntellError ${key} must be a positive integer`);
    }
  }

  if (key === 'webhookUrl' && value !== undefined && typeof value !== 'string') {
    throw new TypeError('IntellError webhookUrl must be a string or undefined');
  }

  return value;
}

/** Update global defaults. The returned snapshot cannot mutate live config. */
export function setupConfig(newConfig: Partial<IntellErrorConfig>): IntellErrorConfig {
  const validated: Partial<IntellErrorConfig> = {};
  for (const [key, value] of Object.entries(newConfig) as [keyof IntellErrorConfig, unknown][]) {
    if (value === undefined) continue;
    validated[key] = validateConfigValue(key, value) as never;
  }

  config = { ...config, ...validated, sourceRoots: [...(validated.sourceRoots || config.sourceRoots)] };
  return getConfig();
}

export function getConfig(): IntellErrorConfig {
  return { ...config, sourceRoots: [...config.sourceRoots] };
}

/** Restore environment-derived defaults; useful for isolated test suites and workers. */
export function resetConfig(): IntellErrorConfig {
  config = { ...defaultConfig, sourceRoots: [...defaultConfig.sourceRoots] };
  return getConfig();
}
